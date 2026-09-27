/**
 * Full Quantum Shield lifecycle test (Node, fake-indexeddb shims the browser store):
 *  1. Vault keypair get-or-generate persists across calls
 *  2. Owner path: v3 manifest -> resolveFileDecryptionKey unwraps the data key via ML-KEM-768
 *  3. Recipient path: magic-link encode/decode -> embedded per-file key decrypts chunks
 *  4. Legacy path: v2 manifest (no shield) -> shared master key still resolves
 *  5. Negative: tampered KEM ciphertext must fail to unwrap
 */
import { webcrypto } from 'node:crypto';
// @ts-ignore - test-only browser shim
import { indexedDB } from 'fake-indexeddb';
// @ts-ignore
(globalThis as any).indexedDB = indexedDB;

const { getOrGenerateVaultKemKeypair, generateFileDataKeyHex, wrapFileDataKey } =
  await import('./src/services/quantumVaultKeys.ts');
const { resolveFileDecryptionKey } = await import('./src/services/shardingService.ts');
const { encodeCompactManifest, decodeCompactOrLegacyManifest } =
  await import('./src/services/compactMagicCodec.ts');
const { getOrGenerateMasterKey } = await import('./src/services/cryptoWorkerClient.ts');

const subtle = webcrypto.subtle;
const enc = new TextEncoder();
let failures = 0;
const check = (name: string, ok: boolean) => {
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name);
  if (!ok) failures++;
};

// --- 1. Vault keypair persistence ---
const kp1 = await getOrGenerateVaultKemKeypair();
const kp2 = await getOrGenerateVaultKemKeypair();
check('vault keypair persists (same public key)', kp1.publicKeyHex === kp2.publicKeyHex);
check('vault keypair is ML-KEM-768', kp1.algorithm === 'ML-KEM-768');

// --- 2. Build a synthetic v3 manifest ---
const dataKeyHex = generateFileDataKeyHex();
const shield = await wrapFileDataKey(dataKeyHex, kp1.publicKeyHex);
check('wrapped key uses ML-KEM-768', shield.algorithm === 'ML-KEM-768');

// Simulate one encrypted chunk exactly like matrixWorker (PBKDF2-SHA256 100k -> AES-GCM)
const salt = webcrypto.getRandomValues(new Uint8Array(16));
const iv = webcrypto.getRandomValues(new Uint8Array(12));
const km = await subtle.importKey('raw', enc.encode(dataKeyHex), { name: 'PBKDF2' }, false, ['deriveKey']);
const aesKey = await subtle.deriveKey(
  { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
  km, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
);
const plaintext = enc.encode('lifecycle payload');
const ctBuf = await subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, plaintext);

const v3manifest: any = {
  version: '3.0',
  filename: 'demo.bin',
  mimeType: 'application/octet-stream',
  totalSize: plaintext.length,
  dataChunksCount: 1,
  parityChunksCount: 0,
  totalChunks: 1,
  isEncrypted: true,
  createdAt: Date.now(),
  chunks: [{
    accountId: 'a1', accountEmail: 'u@x.com', provider: 'google',
    driveFileId: 'fid1', chunkIndex: 0, chunkSizeBytes: plaintext.length,
    cryptoMeta: { iv: Array.from(iv), salt: Array.from(salt), encrypted: true },
  }],
  quantumShield: shield,
};

// --- 3. Owner download path: KEM unwrap ---
const ownerKey = await resolveFileDecryptionKey(v3manifest);
check('owner unwrap recovers data key', ownerKey === dataKeyHex);

// Decrypt the chunk with the resolved key
const km2 = await subtle.importKey('raw', enc.encode(ownerKey), { name: 'PBKDF2' }, false, ['deriveKey']);
const aesKey2 = await subtle.deriveKey(
  { name: 'PBKDF2', salt: new Uint8Array(v3manifest.chunks[0].cryptoMeta.salt), iterations: 100000, hash: 'SHA-256' },
  km2, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
);
const pt = new Uint8Array(await subtle.decrypt(
  { name: 'AES-GCM', iv: new Uint8Array(v3manifest.chunks[0].cryptoMeta.iv) }, aesKey2, ctBuf
));
check('chunk decrypts with unwrapped key', Buffer.from(pt).toString() === 'lifecycle payload');

// --- 4. Magic-link recipient path ---
const token = encodeCompactManifest(v3manifest, dataKeyHex);
const decoded = decodeCompactOrLegacyManifest('#m=' + token);
check('magic link decodes', !!decoded && decoded.filename === 'demo.bin');
const recipientKey = await resolveFileDecryptionKey(decoded!, (decoded as any).magicKey);
check('recipient key = per-file data key (not master)', recipientKey === dataKeyHex);
const masterKey = await getOrGenerateMasterKey();
check('magic link does NOT leak master key', recipientKey !== masterKey);

// --- 5. Legacy v2 path ---
const v2manifest: any = { ...v3manifest, version: '2.0', quantumShield: undefined };
const legacyKey = await resolveFileDecryptionKey(v2manifest);
check('legacy v2 manifest resolves to master key', legacyKey === masterKey);

// --- 6. Negative: tampered KEM ciphertext ---
const tampered: any = JSON.parse(JSON.stringify(v3manifest));
const raw = Buffer.from(tampered.quantumShield.encapsulatedKeyB64, 'base64');
raw[0] ^= 0xff;
tampered.quantumShield.encapsulatedKeyB64 = raw.toString('base64');
let tamperFailed = false;
try { await resolveFileDecryptionKey(tampered); } catch { tamperFailed = true; }
check('tampered KEM ciphertext fails closed', tamperFailed);

console.log(failures === 0 ? '\nALL LIFECYCLE CHECKS PASSED' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
