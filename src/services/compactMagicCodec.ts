/**
 * High-Efficiency Base64URL and JSON Minifier for P2P Magic Share Links
 * 
 * Slashes Magic Link length by >60%:
 * 1. Strips internal account emails, long provider ids, and redundant property names
 * 2. Compresses cryptoMeta IV and salt number arrays into compact hex strings
 * 3. Uses base64url (no bulky %XX uri encoding)
 * 4. Maintains backward compatibility with legacy full-JSON magic links
 */

import { ShardManifest, ShardChunk } from './shardingService';

// Compact representation
interface CompactChunk {
  /** Provider: 0 = google, 1 = onedrive, 2 = dropbox */
  p: number;
  /** Drive file id or path */
  id: string;
  /** Download path (for onedrive/dropbox) */
  dp?: string;
  /** Chunk index */
  i: number;
  /** Chunk size in bytes */
  s: number;
  /** Is parity chunk */
  par?: 1;
  /** IV hex */
  iv?: string;
  /** Salt hex */
  salt?: string;
  /** Is encrypted */
  e?: 1;
}

interface CompactManifestPayload {
  v: 3; // version 3 compact
  f: string; // filename
  t: string; // mimeType
  s: number; // total size
  dc: number; // data chunks count
  pc: number; // parity count
  e: 1 | 0; // isEncrypted
  ca: number; // createdAt timestamp
  c: CompactChunk[]; // chunks
  par?: CompactChunk; // parity chunk
  k?: string; // magic decryption key
  cid?: string; // optional clientId
}

function bytesToHex(bytes: number[]): string {
  return bytes.map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substring(i, i + 2), 16));
  }
  return bytes;
}

function providerToNumber(provider?: string): number {
  if (provider === 'onedrive') return 1;
  if (provider === 'dropbox') return 2;
  return 0; // google default
}

function numberToProvider(n?: number): 'google' | 'onedrive' | 'dropbox' {
  if (n === 1) return 'onedrive';
  if (n === 2) return 'dropbox';
  return 'google';
}

function toCompactChunk(chunk: ShardChunk): CompactChunk {
  const comp: CompactChunk = {
    p: providerToNumber(chunk.provider),
    id: chunk.driveFileId,
    i: chunk.chunkIndex,
    s: chunk.chunkSizeBytes,
  };
  if (chunk.downloadPath) comp.dp = chunk.downloadPath;
  if (chunk.isParity) comp.par = 1;
  if (chunk.cryptoMeta) {
    if (chunk.cryptoMeta.encrypted) comp.e = 1;
    if (chunk.cryptoMeta.iv && chunk.cryptoMeta.iv.length) comp.iv = bytesToHex(chunk.cryptoMeta.iv);
    if (chunk.cryptoMeta.salt && chunk.cryptoMeta.salt.length) comp.salt = bytesToHex(chunk.cryptoMeta.salt);
  }
  return comp;
}

function fromCompactChunk(comp: CompactChunk): ShardChunk {
  const provider = numberToProvider(comp.p);
  const chunk: ShardChunk = {
    accountId: comp.id, // fallback identity
    accountEmail: 'Public Cloud Shard',
    provider,
    driveFileId: comp.id,
    downloadPath: comp.dp,
    chunkIndex: comp.i,
    chunkSizeBytes: comp.s,
    isParity: comp.par === 1,
  };

  if (comp.e === 1 || comp.iv || comp.salt) {
    chunk.cryptoMeta = {
      encrypted: comp.e === 1,
      iv: comp.iv ? hexToBytes(comp.iv) : [],
      salt: comp.salt ? hexToBytes(comp.salt) : [],
    };
  }

  return chunk;
}

// Convert string to URL-safe Base64 without padding
function base64UrlEncode(str: string): string {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Convert URL-safe Base64 back to string
function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return decodeURIComponent(escape(atob(base64)));
}

/**
 * Encodes a manifest and optional decryption key into an ultra-compact Base64URL string.
 */
export function encodeCompactManifest(
  manifest: ShardManifest,
  masterKey?: string,
  clientId?: string
): string {
  const compactPayload: CompactManifestPayload = {
    v: 3,
    f: manifest.filename,
    t: manifest.mimeType || 'application/octet-stream',
    s: manifest.totalSize,
    dc: manifest.dataChunksCount,
    pc: manifest.parityChunksCount,
    e: manifest.isEncrypted ? 1 : 0,
    ca: manifest.createdAt,
    c: manifest.chunks.map(toCompactChunk),
  };

  if (manifest.parityChunk) {
    compactPayload.par = toCompactChunk(manifest.parityChunk);
  }
  if (masterKey) {
    compactPayload.k = masterKey;
  }
  if (clientId) {
    compactPayload.cid = clientId;
  }

  const json = JSON.stringify(compactPayload);
  return base64UrlEncode(json);
}

/**
 * Decodes any Magic Link hash (supporting both legacy v2 and compact v3 formats).
 */
export function decodeCompactOrLegacyManifest(hash: string): ShardManifest | null {
  try {
    // 1. Look for #magic= or #m=
    let token = '';
    const mMatch = hash.match(/#(?:magic|m)=([A-Za-z0-9\-_+=]+)/);
    if (mMatch && mMatch[1]) {
      token = mMatch[1];
    } else {
      return null;
    }

    let jsonStr = '';
    // Try Base64URL decode first
    try {
      jsonStr = base64UrlDecode(token);
    } catch {
      // Fallback to standard URL-decode + atob
      jsonStr = decodeURIComponent(atob(token));
    }

    const payload = JSON.parse(jsonStr);

    // Check if it's compact v3
    if (payload.v === 3) {
      const p = payload as CompactManifestPayload;
      const manifest: ShardManifest = {
        version: '2.0',
        filename: p.f,
        mimeType: p.t,
        totalSize: p.s,
        dataChunksCount: p.dc,
        parityChunksCount: p.pc,
        totalChunks: p.c.length + (p.par ? 1 : 0),
        isEncrypted: p.e === 1,
        createdAt: p.ca,
        chunks: p.c.map(fromCompactChunk),
        magicKey: p.k,
      };

      if (p.par) {
        manifest.parityChunk = fromCompactChunk(p.par);
      }

      if (p.cid) {
        (manifest as any).magicClientId = p.cid;
      }

      return manifest;
    }

    // Otherwise, handle legacy v2 full-object payload
    if (payload.filename && Array.isArray(payload.chunks)) {
      return payload as ShardManifest;
    }

    return null;
  } catch (err) {
    console.error('Failed to decode magic link manifest:', err);
    return null;
  }
}
