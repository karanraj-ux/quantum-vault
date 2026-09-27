/**
 * Quantum Vault Key Management — ML-KEM-768 hybrid file-key protection
 *
 * Each vault holds ONE ML-KEM-768 keypair (NIST FIPS 203), generated once and
 * stored in the browser's IndexedDB. It never leaves the device.
 *
 * Every uploaded file gets its own fresh 256-bit data key:
 *   1. File bytes are encrypted with AES-256-GCM under the per-file data key.
 *   2. The data key is wrapped with a KEM-DEM hybrid construction:
 *        ML-KEM-768 encapsulate → 32-byte shared secret → AES-256-GCM wraps the data key.
 *   3. The KEM ciphertext + wrapped data key travel inside the file manifest
 *      (ciphertext is public by design — only the vault private key can decapsulate).
 *
 * Harvest-now-decrypt-later defense: an adversary capturing cloud shards and
 * manifests obtains AES-GCM ciphertext whose keys are sealed under ML-KEM-768.
 * No quantum computer can recover them without the vault private key.
 */

import { get, set } from 'idb-keyval';
import {
  generatePostQuantumKeyPair,
  encapsulatePostQuantumSecret,
  decapsulatePostQuantumSecret,
  uint8ToHex,
  hexToUint8,
} from './postQuantumCrypto';

const VAULT_KEM_STORAGE_ID = 'quantum_vault_kem_768_keypair';

export interface VaultKemKeypair {
  publicKeyHex: string;
  secretKeyHex: string;
  algorithm: 'ML-KEM-768';
  createdAt: number;
}

/**
 * Sealed per-file data key as stored in the shard manifest (v3.0).
 */
export interface WrappedFileKey {
  algorithm: 'ML-KEM-768';
  /** ML-KEM-768 ciphertext (1088 bytes), base64 */
  encapsulatedKeyB64: string;
  /** AES-GCM IV used for the DEM wrap, base64 */
  wrappedKeyIvB64: string;
  /** AES-256-GCM(sharedSecret, dataKey), base64 */
  wrappedKeyB64: string;
  wrappedAt: number;
}

function u8ToB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function b64ToU8(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/**
 * Get the vault's ML-KEM-768 keypair, generating it on first use.
 * The private key is stored only in this browser's IndexedDB.
 */
export async function getOrGenerateVaultKemKeypair(): Promise<VaultKemKeypair> {
  const existing = await get<VaultKemKeypair>(VAULT_KEM_STORAGE_ID);
  if (existing?.publicKeyHex && existing?.secretKeyHex) return existing;

  const gen = generatePostQuantumKeyPair('768');
  const kp: VaultKemKeypair = {
    publicKeyHex: gen.publicKeyHex,
    secretKeyHex: gen.privateKeyHex,
    algorithm: 'ML-KEM-768',
    createdAt: Date.now(),
  };
  await set(VAULT_KEM_STORAGE_ID, kp);
  return kp;
}

/**
 * Generate a fresh 256-bit per-file data key (hex-encoded).
 * One key per file: sharing a magic link exposes only that file's key.
 */
export function generateFileDataKeyHex(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return uint8ToHex(bytes);
}

/**
 * Wrap a per-file data key under the vault's ML-KEM-768 public key.
 * KEM-DEM hybrid: encapsulate → shared secret → AES-256-GCM key-wrap.
 */
export async function wrapFileDataKey(
  dataKeyHex: string,
  vaultPublicKeyHex: string
): Promise<WrappedFileKey> {
  const enc = encapsulatePostQuantumSecret(vaultPublicKeyHex, '768');
  const kek = await crypto.subtle.importKey(
    'raw',
    enc.sharedSecretBytes,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapped = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    kek,
    hexToUint8(dataKeyHex)
  );
  return {
    algorithm: 'ML-KEM-768',
    encapsulatedKeyB64: u8ToB64(enc.cipherTextBytes),
    wrappedKeyIvB64: u8ToB64(iv),
    wrappedKeyB64: u8ToB64(new Uint8Array(wrapped)),
    wrappedAt: Date.now(),
  };
}

/**
 * Unwrap a per-file data key using the vault's ML-KEM-768 private key.
 * Returns the data key hex for the chunk decryption path.
 */
export async function unwrapFileDataKey(
  wrapped: WrappedFileKey,
  vaultSecretKeyHex: string
): Promise<string> {
  const { sharedSecretBytes } = decapsulatePostQuantumSecret(
    b64ToU8(wrapped.encapsulatedKeyB64),
    vaultSecretKeyHex,
    '768'
  );
  const kek = await crypto.subtle.importKey(
    'raw',
    sharedSecretBytes,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
  const dataKeyBytes = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToU8(wrapped.wrappedKeyIvB64) },
    kek,
    b64ToU8(wrapped.wrappedKeyB64)
  );
  return uint8ToHex(new Uint8Array(dataKeyBytes));
}
