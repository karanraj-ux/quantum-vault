/**
 * Matrix Web Worker - Zero-Server Background Computing Pipeline
 * 
 * Responsibilities:
 * 1. AES-GCM (256-bit) zero-knowledge chunk encryption & decryption
 * 2. RAID 5 Parity chunk generation & erasure reconstruction (XOR / Reed-Solomon style parity)
 * 3. Autonomous background tick daemon (immune to browser main-thread rendering lag)
 */

// --- WebCrypto AES-GCM 256-bit Engine ---
async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptBuffer(
  buffer: ArrayBuffer,
  passphrase: string
): Promise<{ encryptedBuffer: ArrayBuffer; iv: Uint8Array; salt: Uint8Array }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);

  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv,
    },
    key,
    buffer
  );

  return {
    encryptedBuffer: ciphertext,
    iv,
    salt,
  };
}

export async function decryptBuffer(
  encryptedBuffer: ArrayBuffer,
  passphrase: string,
  iv: Uint8Array,
  salt: Uint8Array
): Promise<ArrayBuffer> {
  const key = await deriveKey(passphrase, salt);
  return crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv,
    },
    key,
    encryptedBuffer
  );
}

// --- Fault Tolerance / Parity Computing (RAID 5 Erasure Block) ---
/**
 * Compute an XOR parity block across a group of data chunks.
 * Parity length equals the maximum chunk length in the stripe.
 */
export function computeParityChunk(chunks: ArrayBuffer[]): ArrayBuffer {
  if (chunks.length === 0) return new ArrayBuffer(0);

  let maxLen = 0;
  for (const c of chunks) {
    if (c.byteLength > maxLen) maxLen = c.byteLength;
  }

  const parity = new Uint8Array(maxLen);

  for (const c of chunks) {
    const u8 = new Uint8Array(c);
    for (let i = 0; i < u8.length; i++) {
      parity[i] ^= u8[i];
    }
  }

  return parity.buffer;
}

/**
 * Reconstruct a missing chunk using the surviving data chunks and the parity chunk.
 * In XOR parity coding: MissingChunk = Parity ^ Chunk_surviving_1 ^ Chunk_surviving_2 ...
 */
export function reconstructMissingChunk(
  survivingChunks: ArrayBuffer[],
  parityChunk: ArrayBuffer,
  expectedSize: number
): ArrayBuffer {
  const allSurviving = [...survivingChunks, parityChunk];
  const reconstructed = computeParityChunk(allSurviving);

  // Trim or pad to exact expected original chunk size
  if (reconstructed.byteLength > expectedSize) {
    return reconstructed.slice(0, expectedSize);
  } else if (reconstructed.byteLength < expectedSize) {
    const padded = new Uint8Array(expectedSize);
    padded.set(new Uint8Array(reconstructed));
    return padded.buffer;
  }
  return reconstructed;
}

// --- Web Worker Listener ---
self.onmessage = async (e: MessageEvent) => {
  const { id, action, payload } = e.data;

  try {
    if (action === 'ENCRYPT_CHUNK') {
      const { buffer, passphrase } = payload;
      const res = await encryptBuffer(buffer, passphrase);
      // Transfer buffers for zero-copy high performance
      (self as any).postMessage(
        {
          id,
          success: true,
          result: {
            encryptedBuffer: res.encryptedBuffer,
            iv: Array.from(res.iv),
            salt: Array.from(res.salt),
          },
        },
        [res.encryptedBuffer]
      );
    } else if (action === 'DECRYPT_CHUNK') {
      const { encryptedBuffer, passphrase, iv, salt } = payload;
      const decrypted = await decryptBuffer(
        encryptedBuffer,
        passphrase,
        new Uint8Array(iv),
        new Uint8Array(salt)
      );
      (self as any).postMessage(
        {
          id,
          success: true,
          result: decrypted,
        },
        [decrypted]
      );
    } else if (action === 'COMPUTE_PARITY') {
      const { chunks } = payload;
      const parity = computeParityChunk(chunks);
      (self as any).postMessage(
        {
          id,
          success: true,
          result: parity,
        },
        [parity]
      );
    } else if (action === 'RECONSTRUCT_CHUNK') {
      const { survivingChunks, parityChunk, expectedSize } = payload;
      const recovered = reconstructMissingChunk(survivingChunks, parityChunk, expectedSize);
      (self as any).postMessage(
        {
          id,
          success: true,
          result: recovered,
        },
        [recovered]
      );
    } else {
      throw new Error(`Unknown worker action: ${action}`);
    }
  } catch (err: any) {
    (self as any).postMessage({
      id,
      success: false,
      error: err.message || 'Worker processing failed',
    });
  }
};
