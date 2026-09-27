/**
 * Client-Side Cryptographic & Erasure Coding Bridge
 * Coordinates WebCrypto AES-GCM and Web Worker processing for the Frankenstein Drive
 */

export interface CryptoChunkResult {
  encryptedBuffer: ArrayBuffer;
  iv: number[];
  salt: number[];
}

// Master passkey storage key in IndexedDB
export const MASTER_KEY_STORAGE_ID = 'matrix_master_encryption_key';

/**
 * Get or generate a cryptographic master seed for zero-knowledge encryption.
 * Stored exclusively in the user's browser IndexedDB.
 */
export const getOrGenerateMasterKey = async (): Promise<string> => {
  const { get, set } = await import('idb-keyval');
  let key = await get<string>(MASTER_KEY_STORAGE_ID);
  if (!key) {
    // Generate a 256-bit cryptographically random hex seed
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    key = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    await set(MASTER_KEY_STORAGE_ID, key);
  }
  return key;
};

let workerInstance: Worker | null = null;
let reqCounter = 0;
const pendingRequests = new Map<number, { resolve: (val: any) => void; reject: (err: any) => void }>();

function getWorker(): Worker {
  if (!workerInstance && typeof window !== 'undefined') {
    // Vite Web Worker syntax
    workerInstance = new Worker(new URL('./matrixWorker.ts', import.meta.url), { type: 'module' });
    workerInstance.onmessage = (e: MessageEvent) => {
      const { id, success, result, error } = e.data;
      const handler = pendingRequests.get(id);
      if (handler) {
        pendingRequests.delete(id);
        if (success) handler.resolve(result);
        else handler.reject(new Error(error));
      }
    };
  }
  return workerInstance!;
}

function callWorker<T>(action: string, payload: any, transfer: Transferable[] = []): Promise<T> {
  const worker = getWorker();
  const id = ++reqCounter;
  return new Promise<T>((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });
    worker.postMessage({ id, action, payload }, transfer);
  });
}

/**
 * Encrypt a binary chunk using AES-GCM (256-bit) via Web Worker
 */
export async function encryptChunkWorker(
  buffer: ArrayBuffer,
  passphrase: string
): Promise<CryptoChunkResult> {
  return callWorker<CryptoChunkResult>('ENCRYPT_CHUNK', { buffer, passphrase }, [buffer]);
}

/**
 * Decrypt a binary chunk using AES-GCM (256-bit) via Web Worker
 */
export async function decryptChunkWorker(
  encryptedBuffer: ArrayBuffer,
  passphrase: string,
  iv: number[],
  salt: number[]
): Promise<ArrayBuffer> {
  return callWorker<ArrayBuffer>(
    'DECRYPT_CHUNK',
    { encryptedBuffer, passphrase, iv, salt },
    [encryptedBuffer]
  );
}

/**
 * Compute an XOR parity chunk across an array of data chunk ArrayBuffers
 */
export async function computeParityWorker(chunks: ArrayBuffer[]): Promise<ArrayBuffer> {
  // Transfer all buffers
  return callWorker<ArrayBuffer>('COMPUTE_PARITY', { chunks }, chunks);
}

/**
 * Reconstruct a missing chunk using surviving chunks and the parity chunk
 */
export async function reconstructChunkWorker(
  survivingChunks: ArrayBuffer[],
  parityChunk: ArrayBuffer,
  expectedSize: number
): Promise<ArrayBuffer> {
  // CRITICAL FIX: Transferring buffers detaches them in the caller thread (setting byteLength = 0).
  // We must clone survivingChunks and parityChunk before transferring to the worker,
  // so that chunkBuffers in downloadShardedFile remain intact and valid!
  const survivingClones = survivingChunks.map(c => c.slice(0));
  const parityClone = parityChunk.slice(0);
  const transfers = [...survivingClones, parityClone];
  return callWorker<ArrayBuffer>(
    'RECONSTRUCT_CHUNK',
    { survivingChunks: survivingClones, parityChunk: parityClone, expectedSize },
    transfers
  );
}
