/**
 * Round-trip validation of the Quantum Shield hybrid construction:
 *  ML-KEM-768 encapsulate -> AES-GCM wrap data key -> decapsulate -> unwrap
 *  + the exact matrixWorker chunk KDF (PBKDF2-SHA256 100k -> AES-GCM) using the data key.
 */
import { webcrypto } from 'node:crypto';
import {
  generatePostQuantumKeyPair,
  encapsulatePostQuantumSecret,
  decapsulatePostQuantumSecret,
  uint8ToHex,
  hexToUint8,
} from './src/services/postQuantumCrypto.ts';

const subtle = webcrypto.subtle;
const enc = new TextEncoder();

async function main() {
  // 1. Vault keypair
  const kp = generatePostQuantumKeyPair('768');
  console.log('keygen ok | pk bytes:', kp.publicKeyLengthBytes, '| sk bytes:', kp.secretKeyLengthBytes);

  // 2. Per-file data key
  const dataKey = new Uint8Array(32);
  webcrypto.getRandomValues(dataKey);
  const dataKeyHex = uint8ToHex(dataKey);

  // 3. WRAP (KEM-DEM)
  const kemEnc = encapsulatePostQuantumSecret(kp.publicKeyHex, '768');
  const kekEnc = await subtle.importKey('raw', kemEnc.sharedSecretBytes, { name: 'AES-GCM' }, false, ['encrypt']);
  const wrapIv = webcrypto.getRandomValues(new Uint8Array(12));
  const wrappedBuf = await subtle.encrypt({ name: 'AES-GCM', iv: wrapIv }, kekEnc, dataKey);
  console.log('wrap ok | kem ct bytes:', kemEnc.cipherTextBytes.length, '| wrapped key bytes:', wrappedBuf.byteLength);

  // 4. UNWRAP
  const { sharedSecretBytes } = decapsulatePostQuantumSecret(kemEnc.cipherTextBytes, kp.privateKeyHex, '768');
  const ssMatch = uint8ToHex(sharedSecretBytes) === kemEnc.sharedSecretHex;
  const kekDec = await subtle.importKey('raw', sharedSecretBytes, { name: 'AES-GCM' }, false, ['decrypt']);
  const unwrapped = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: wrapIv }, kekDec, wrappedBuf));
  const keyMatch = uint8ToHex(unwrapped) === dataKeyHex;
  console.log('shared secret match:', ssMatch, '| data key match:', keyMatch);

  // 5. Chunk path: mirror matrixWorker.deriveKey exactly (PBKDF2-SHA256, 100k, 16-byte salt)
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await subtle.importKey('raw', enc.encode(dataKeyHex), { name: 'PBKDF2' }, false, ['deriveKey']);
  const aesKey = await subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
  const chunkIv = webcrypto.getRandomValues(new Uint8Array(12));
  const plaintext = enc.encode('Quantum Vault round-trip payload: harvest now, decrypt NEVER.');
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv: chunkIv }, aesKey, plaintext);
  const pt = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: chunkIv }, aesKey, ct));
  const chunkMatch = Buffer.from(pt).toString() === Buffer.from(plaintext).toString();
  console.log('chunk encrypt/decrypt via data key:', chunkMatch);

  // 6. Negative: wrong private key must NOT recover the data key
  const kp2 = generatePostQuantumKeyPair('768');
  let negativeOk = false;
  try {
    const bad = decapsulatePostQuantumSecret(kemEnc.cipherTextBytes, kp2.privateKeyHex, '768');
    const kekBad = await subtle.importKey('raw', bad.sharedSecretBytes, { name: 'AES-GCM' }, false, ['decrypt']);
    await subtle.decrypt({ name: 'AES-GCM', iv: wrapIv }, kekBad, wrappedBuf);
  } catch { negativeOk = true; }
  console.log('wrong-key unwrap correctly fails:', negativeOk);

  if (ssMatch && keyMatch && chunkMatch && negativeOk) {
    console.log('\nALL ROUND-TRIP CHECKS PASSED');
  } else {
    console.log('\nFAILURE'); process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
