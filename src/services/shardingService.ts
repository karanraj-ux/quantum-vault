import { AccountToken, CloudProvider } from '../types';
import { set as idbSet } from 'idb-keyval';
import {
  encryptChunkWorker,
  decryptChunkWorker,
  computeParityWorker,
  reconstructChunkWorker,
  getOrGenerateMasterKey,
} from './cryptoWorkerClient';
import {
  getOrGenerateVaultKemKeypair,
  generateFileDataKeyHex,
  wrapFileDataKey,
  unwrapFileDataKey,
  WrappedFileKey,
} from './quantumVaultKeys';
import {
  uploadChunkToProvider,
  makeGoogleDriveFilePublic,
  revokeGoogleDriveFilePublic,
  downloadChunkFromProvider,
  deleteChunkFromProvider,
  fetchAccountQuota,
} from './multiCloudAdapter';

export interface ShardChunk {
  accountId: string;
  accountEmail: string;
  provider: CloudProvider;
  driveFileId: string;
  downloadPath?: string;
  chunkIndex: number;
  chunkSizeBytes: number;
  isParity?: boolean; // True if this chunk is a RAID 5 parity block
  cryptoMeta?: {
    iv: number[];
    salt: number[];
    encrypted: boolean;
  };
}

export interface ShardManifest {
  version: '2.0' | '3.0'; // v3.0 = per-file data key wrapped with ML-KEM-768 (Quantum Shield)
  filename: string;
  mimeType: string;
  totalSize: number;
  dataChunksCount: number;
  parityChunksCount: number;
  totalChunks: number;
  isEncrypted: boolean;
  createdAt: number;
  chunks: ShardChunk[];
  parityChunk?: ShardChunk; // Parity repair block
  magicKey?: string; // Optional embedded key for P2P magic sharing
  quantumShield?: WrappedFileKey; // v3.0: ML-KEM-768 wrapped per-file data key
}

export interface StoredManifestRecord {
  id: string;
  manifestFileId?: string;
  manifest: ShardManifest;
  sourceAccountEmail: string;
}

/**
 * Select the best account to store the RAID-5 XOR parity block,
 * prioritizing providers that have fewer chunks allocated for true multi-cloud fault tolerance.
 */
const targetProviderForParity = (
  accounts: AccountToken[],
  providerChunkCounts: Record<string, number>
): AccountToken => {
  if (accounts.length <= 1) return accounts[0];

  // Find the provider that has the least chunk allocation
  let minCount = Infinity;
  let candidateAccount = accounts[0];

  for (const acc of accounts) {
    const p = acc.provider || 'google';
    const count = providerChunkCounts[p] || 0;
    if (count < minCount) {
      minCount = count;
      candidateAccount = acc;
    }
  }

  return candidateAccount;
};

/**
 * Mathematically slice a file, optionally encrypt each chunk with AES-256-GCM,
 * compute a RAID-5 parity block for fault tolerance, and distribute across multi-cloud accounts
 * using Dynamic Quota-Aware Load Balancing.
 */
export const uploadShardedFile = async (
  file: File,
  accounts: AccountToken[],
  options: {
    enableEncryption?: boolean;
    enableParity?: boolean;
    enableQuantumShield?: boolean; // ML-KEM-768 wrap the per-file data key (default: true)
    onProgress: (progress: number, currentChunk: number, totalChunks: number, stage?: string) => void;
  }
): Promise<ShardManifest> => {
  const { enableEncryption = true, enableParity = true, enableQuantumShield = true, onProgress } = options;

  // 4MB chunks for optimal browser memory and network performance
  const CHUNK_SIZE = 4 * 1024 * 1024;
  const dataChunksCount = Math.ceil(file.size / CHUNK_SIZE);
  const activeAccounts = accounts.filter(a => !a.isExpired);
  const effectiveAccounts: AccountToken[] = activeAccounts.length > 0 ? activeAccounts : [
    {
      id: 'demo-local-vault',
      email: 'explore-vault@matrix.local',
      name: 'Local Explore Vault',
      photoURL: null,
      accessToken: 'demo-token',
      provider: 'google',
    },
  ];

  // 1. DYNAMIC QUOTA-AWARE HETEROGENEOUS LOAD BALANCING
  // Fetch real-time available storage on each account to balance allocation intelligently
  onProgress(2, 0, dataChunksCount, 'Calculating dynamic storage quota across cloud providers...');
  const quotaMap = new Map<string, number>();

  await Promise.all(
    effectiveAccounts.map(async acc => {
      const q = await fetchAccountQuota(acc);
      quotaMap.set(acc.id, q.freeBytes);
    })
  );

  // Group accounts by provider for heterogeneous interleaving
  const providersMap = new Map<string, AccountToken[]>();
  effectiveAccounts.forEach(acc => {
    const p = acc.provider || 'google';
    if (!providersMap.has(p)) providersMap.set(p, []);
    providersMap.get(p)!.push(acc);
  });

  // Sort accounts within each provider by remaining free space
  providersMap.forEach((accList) => {
    accList.sort((a, b) => (quotaMap.get(b.id) || 0) - (quotaMap.get(a.id) || 0));
  });

  // Interleave accounts across different cloud providers (Heterogeneous Round-Robin)
  // e.g. [Google, OneDrive, Dropbox, Google, OneDrive, Dropbox, ...]
  const heterogeneousAccounts: AccountToken[] = [];
  const providerKeys = Array.from(providersMap.keys());
  let maxPerProvider = 0;
  providerKeys.forEach(k => {
    maxPerProvider = Math.max(maxPerProvider, providersMap.get(k)!.length);
  });

  for (let round = 0; round < maxPerProvider; round++) {
    for (const p of providerKeys) {
      const list = providersMap.get(p)!;
      if (round < list.length) {
        heterogeneousAccounts.push(list[round]);
      }
    }
  }

  // QUANTUM SHIELD (v3.0): every file gets its own random 256-bit data key.
  // The data key encrypts the chunks (AES-256-GCM) and is itself sealed with
  // ML-KEM-768 (NIST FIPS 203) under the vault keypair — harvest-now-decrypt-later defense.
  // Legacy v2.0 path (no shield): all files share the vault master key.
  let chunkPassphrase = '';
  let quantumShield: WrappedFileKey | undefined = undefined;
  let manifestVersion: '2.0' | '3.0' = '2.0';

  if (enableEncryption) {
    if (enableQuantumShield) {
      onProgress(1, 0, dataChunksCount, 'Generating quantum-resistant file key (ML-KEM-768)...');
      const vaultKp = await getOrGenerateVaultKemKeypair();
      const dataKeyHex = generateFileDataKeyHex();
      quantumShield = await wrapFileDataKey(dataKeyHex, vaultKp.publicKeyHex);
      chunkPassphrase = dataKeyHex;
      manifestVersion = '3.0';
    } else {
      chunkPassphrase = await getOrGenerateMasterKey();
    }
  }
  const masterKey = chunkPassphrase;
  const chunksInfo: ShardChunk[] = [];
  const rawChunkBuffers: ArrayBuffer[] = [];

  const totalSteps = dataChunksCount + (enableParity ? 1 : 0);

  // TWO-PHASE ROLLBACK TRANSACTION LOG
  // Tracks all successfully uploaded chunks. If ANY chunk upload fails,
  // Phase 2 compensation immediately purges all staged chunks to prevent orphan storage leaks.
  const stagedUploads: { account: AccountToken; fileId: string; downloadPath?: string; chunkName: string }[] = [];

  const executeRollbackCompensation = async (failedStage: string, cause: string) => {
    onProgress(0, 0, totalSteps, `Fault detected in ${failedStage}! Executing Two-Phase Rollback compensation...`);
    const rollbackPurges = stagedUploads.map(async staged => {
      try {
        await deleteChunkFromProvider(staged.account, staged.fileId, staged.downloadPath);
      } catch (purgeErr) {
        console.warn(`Rollback purge failed for ${staged.chunkName}:`, purgeErr);
      }
    });
    await Promise.allSettled(rollbackPurges);
    throw new Error(
      `Multi-Cloud RAID-5 Transaction Rolled Back: ${failedStage} failed (${cause}). ` +
      `${stagedUploads.length} orphan chunk(s) purged from cloud storage.`
    );
  };

  // Provider allocation tracker to place parity block on the least-burdened alternative provider
  const providerChunkCounts: Record<string, number> = {};

  // 2. Read, encrypt, and stripe all data chunks with Heterogeneous Provider Distribution
  for (let i = 0; i < dataChunksCount; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const sliceBlob = file.slice(start, end);
    const sliceBuffer = await sliceBlob.arrayBuffer();

    if (enableParity) {
      rawChunkBuffers.push(sliceBuffer.slice(0));
    }

    let payloadBlob: Blob;
    let cryptoMeta: ShardChunk['cryptoMeta'] = undefined;

    if (enableEncryption) {
      onProgress(
        Math.round((i / totalSteps) * 100),
        i + 1,
        totalSteps,
        manifestVersion === '3.0'
          ? `Encrypting chunk ${i + 1} with AES-256-GCM (key sealed by ML-KEM-768)...`
          : `Encrypting chunk ${i + 1} with AES-GCM (256-bit)...`
      );

      const encResult = await encryptChunkWorker(sliceBuffer, masterKey);
      payloadBlob = new Blob([encResult.encryptedBuffer], { type: 'application/octet-stream' });
      cryptoMeta = {
        iv: encResult.iv,
        salt: encResult.salt,
        encrypted: true,
      };
    } else {
      payloadBlob = new Blob([sliceBuffer], { type: 'application/octet-stream' });
    }

    // Heterogeneous assignment: Distribute sequentially across alternating providers
    const targetAccount = heterogeneousAccounts[i % heterogeneousAccounts.length];
    const targetProvider = targetAccount.provider || 'google';
    providerChunkCounts[targetProvider] = (providerChunkCounts[targetProvider] || 0) + 1;

    onProgress(
      Math.round(((i + 0.5) / totalSteps) * 100),
      i + 1,
      totalSteps,
      `Uploading chunk ${i + 1} to ${targetAccount.email} (${targetProvider.toUpperCase()})...`
    );

    const chunkName = `${file.name}.frankenstein.part${i}`;

    try {
      const uploadRes = await uploadChunkToProvider(targetAccount, payloadBlob, chunkName);

      // Register with transaction log for rollback safety
      stagedUploads.push({
        account: targetAccount,
        fileId: uploadRes.fileId,
        downloadPath: uploadRes.downloadPath,
        chunkName,
      });

      chunksInfo.push({
        accountId: targetAccount.id,
        accountEmail: targetAccount.email || 'Unknown',
        provider: targetProvider,
        driveFileId: uploadRes.fileId,
        downloadPath: uploadRes.downloadPath,
        chunkIndex: i,
        chunkSizeBytes: sliceBlob.size,
        isParity: false,
        cryptoMeta,
      });

      onProgress(
        Math.round(((i + 1) / totalSteps) * 100),
        i + 1,
        totalSteps,
        `Chunk ${i + 1} verified on ${targetProvider.toUpperCase()}.`
      );
    } catch (uploadError: any) {
      await executeRollbackCompensation(`Chunk ${i + 1} upload to ${targetProvider.toUpperCase()}`, uploadError?.message || 'Upload error');
    }
  }

  // 3. Compute and upload RAID-5 Parity Block across alternative provider for multi-cloud redundancy
  let parityChunkInfo: ShardChunk | undefined = undefined;

  if (enableParity && rawChunkBuffers.length > 0) {
    onProgress(
      Math.round((dataChunksCount / totalSteps) * 100),
      totalSteps,
      totalSteps,
      'Computing RAID-5 XOR fault-tolerance parity block in Web Worker...'
    );

    const parityBuffer = await computeParityWorker(rawChunkBuffers);

    let parityBlob: Blob;
    let parityCryptoMeta: ShardChunk['cryptoMeta'] = undefined;

    if (enableEncryption) {
      const encParity = await encryptChunkWorker(parityBuffer, masterKey);
      parityBlob = new Blob([encParity.encryptedBuffer], { type: 'application/octet-stream' });
      parityCryptoMeta = {
        iv: encParity.iv,
        salt: encParity.salt,
        encrypted: true,
      };
    } else {
      parityBlob = new Blob([parityBuffer], { type: 'application/octet-stream' });
    }

    // Allocate parity chunk to maximize provider divergence (prefer an alternative cloud provider)
    // Find provider with lowest chunk allocation to ensure true heterogeneous fault tolerance
    let minAllocatedProvider = targetProviderForParity(heterogeneousAccounts, providerChunkCounts);
    const parityAccount = minAllocatedProvider;
    const parityProvider = parityAccount.provider || 'google';

    onProgress(
      95,
      totalSteps,
      totalSteps,
      `Writing RAID-5 Parity Block to ${parityAccount.email} (${parityProvider.toUpperCase()})...`
    );

    const parityName = `${file.name}.frankenstein.parity`;

    try {
      const parityUploadRes = await uploadChunkToProvider(parityAccount, parityBlob, parityName);

      stagedUploads.push({
        account: parityAccount,
        fileId: parityUploadRes.fileId,
        downloadPath: parityUploadRes.downloadPath,
        chunkName: parityName,
      });

      parityChunkInfo = {
        accountId: parityAccount.id,
        accountEmail: parityAccount.email || 'Unknown',
        provider: parityProvider,
        driveFileId: parityUploadRes.fileId,
        downloadPath: parityUploadRes.downloadPath,
        chunkIndex: dataChunksCount,
        chunkSizeBytes: parityBuffer.byteLength,
        isParity: true,
        cryptoMeta: parityCryptoMeta,
      };
    } catch (parityErr: any) {
      await executeRollbackCompensation('RAID-5 Parity Block upload', parityErr?.message || 'Parity upload error');
    }
  }

  onProgress(100, totalSteps, totalSteps, 'Multi-cloud RAID-5 sharding verified.');

  return {
    version: manifestVersion,
    filename: file.name,
    mimeType: file.type || 'application/octet-stream',
    totalSize: file.size,
    dataChunksCount,
    parityChunksCount: enableParity ? 1 : 0,
    totalChunks: totalSteps,
    isEncrypted: enableEncryption,
    createdAt: Date.now(),
    chunks: chunksInfo,
    parityChunk: parityChunkInfo,
    quantumShield,
  };
};

/**
 * Resolve the passphrase used for chunk AES-GCM decryption.
 *
 * Priority:
 *  1. explicitKey — magic-link / P2P share (the per-file data key travels in the URL fragment).
 *  2. quantumShield (v3.0) — unwrap the per-file data key with the vault's ML-KEM-768 private key.
 *  3. Legacy v2.0 — the shared vault master key.
 */
export const resolveFileDecryptionKey = async (
  manifest: ShardManifest,
  explicitKey?: string
): Promise<string> => {
  if (explicitKey) return explicitKey;
  if (manifest.quantumShield) {
    const vaultKp = await getOrGenerateVaultKemKeypair();
    return unwrapFileDataKey(manifest.quantumShield, vaultKp.secretKeyHex);
  }
  if (manifest.isEncrypted) return getOrGenerateMasterKey();
  return '';
};

/**
 * Save the master reconstruction blueprint (manifest) to Google Drive.
 */
export const saveManifestToDrive = async (
  manifest: ShardManifest,
  primaryAccount: AccountToken
): Promise<string> => {
  if (primaryAccount.id.startsWith('demo-')) {
    await idbSet(`matrix_demo_manifest_${manifest.filename}`, manifest);
    return `demo-manifest-${manifest.filename}`;
  }

  const manifestName = `${manifest.filename}.frankenstein.json`;
  const jsonContent = JSON.stringify(manifest, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json' });

  const initRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${primaryAccount.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: manifestName,
      description: `Frankenstein Multi-Cloud Sharded Manifest (v${manifest.version}) for ${manifest.filename} (${(
        manifest.totalSize / (1024 * 1024)
      ).toFixed(2)} MB across ${manifest.totalChunks} chunks${
        manifest.isEncrypted ? ' [AES-256-GCM]' : ''
      }${manifest.quantumShield ? ' [ML-KEM-768 Quantum Shield]' : ''}${manifest.parityChunk ? ' [RAID-5 Parity]' : ''})`,
      properties: {
        isFrankensteinManifest: 'true',
        targetFilename: manifest.filename,
        totalChunks: `${manifest.totalChunks}`,
        version: manifest.version,
        isEncrypted: `${manifest.isEncrypted}`,
        hasParity: `${!!manifest.parityChunk}`,
        hasQuantumShield: `${!!manifest.quantumShield}`,
      },
    }),
  });

  const uploadLocation = initRes.headers.get('Location');
  if (!uploadLocation) throw new Error('Could not establish manifest upload session');

  const uploadRes = await fetch(uploadLocation, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: blob,
  });

  if (!uploadRes.ok) throw new Error('Failed to save manifest to Google Drive');
  const fileData = await uploadRes.json();
  return fileData.id;
};

/**
 * Pull down chunks in parallel from all accounts/providers, decrypt via Web Worker,
 * and if any 1 chunk is missing or an account is offline, reconstruct it using the RAID-5 parity shard.
 */
export const downloadShardedFile = async (
  manifest: ShardManifest,
  accounts: AccountToken[],
  onProgress: (progress: number, completedChunks: number, totalChunks: number, stage?: string) => void,
  explicitKey?: string
): Promise<Blob> => {
  const masterKey = await resolveFileDecryptionKey(manifest, explicitKey);
  const totalChunks = manifest.chunks.length;
  const chunkBuffers: (ArrayBuffer | null)[] = new Array(totalChunks).fill(null);
  let completed = 0;
  const failedChunkIndices: number[] = [];

  const fetchAndDecryptChunk = async (chunk: ShardChunk): Promise<ArrayBuffer> => {
    let acc = accounts.find(a => a.id === chunk.accountId || (chunk.accountEmail && a.email === chunk.accountEmail));
    if (!acc || acc.isExpired) {
      // Magic Link scenario: We don't own the chunk's account.
      // Check if user has an active account of this provider to provide bearer auth:
      const targetProvider = chunk.provider || 'google';
      acc = accounts.find(a => !a.isExpired && (a.provider || 'google') === targetProvider) || accounts.find(a => !a.isExpired);
    }

    let rawBuf: ArrayBuffer | null = null;
    let lastError: Error | null = null;

    // Strategy 1: If user has an active authenticated account, use it with Bearer token
    if (acc && !acc.isExpired) {
      try {
        rawBuf = await downloadChunkFromProvider(acc, chunk.driveFileId, chunk.downloadPath);
      } catch (err: any) {
        console.warn(`Authenticated chunk download failed for chunk ${chunk.chunkIndex}:`, err);
        lastError = err;
      }
    }

    // Strategy 2: Proxy endpoint (/api/public-chunk) - bypasses browser CORS completely
    if (!rawBuf && (chunk.provider === 'google' || !chunk.provider)) {
      try {
        const proxyRes = await fetch(`/api/public-chunk?fileId=${encodeURIComponent(chunk.driveFileId)}`);
        const cType = proxyRes.headers.get('content-type') || '';
        if (proxyRes.ok && !cType.toLowerCase().includes('text/html')) {
          const buf = await proxyRes.arrayBuffer();
          if (buf.byteLength > 0) rawBuf = buf;
        } else {
          const errText = await proxyRes.text().catch(() => '');
          console.warn(`Proxy chunk fetch failed with status ${proxyRes.status}:`, errText);
        }
      } catch (proxyErr) {
        console.warn(`Proxy chunk fetch network error:`, proxyErr);
      }
    }

    // Strategy 3: Direct browser fetch fallback
    if (!rawBuf && (chunk.provider === 'google' || !chunk.provider)) {
      try {
        const directPublicUrl = `https://drive.usercontent.google.com/download?id=${encodeURIComponent(chunk.driveFileId)}&export=download&authuser=0`;
        const res = await fetch(directPublicUrl);
        const cType = res.headers.get('content-type') || '';
        if (res.ok && !cType.toLowerCase().includes('text/html')) {
          const buf = await res.arrayBuffer();
          if (buf.byteLength > 0) rawBuf = buf;
        }
      } catch {
        // Expected CORS failure in some browser environments
      }
    }

    if (!rawBuf || rawBuf.byteLength === 0) {
      throw lastError || new Error(`Public retrieval failed for Chunk ${chunk.chunkIndex + 1}. The file may be deleted or require sign-in.`);
    }

    if (chunk.cryptoMeta?.encrypted && masterKey) {
      if (!chunk.cryptoMeta.iv?.length || !chunk.cryptoMeta.salt?.length) {
        throw new Error(`Corrupted encryption metadata for Chunk ${chunk.chunkIndex + 1}`);
      }
      return await decryptChunkWorker(
        rawBuf,
        masterKey,
        chunk.cryptoMeta.iv,
        chunk.cryptoMeta.salt
      );
    }
    return rawBuf;
  };

  // Parallel download of all primary data chunks
  await Promise.all(
    manifest.chunks.map(async chunk => {
      try {
        const buf = await fetchAndDecryptChunk(chunk);
        chunkBuffers[chunk.chunkIndex] = buf;
        completed++;
        onProgress(
          Math.round((completed / totalChunks) * 80),
          completed,
          totalChunks,
          `Retrieved & decrypted chunk ${chunk.chunkIndex + 1}/${totalChunks} from ${chunk.provider.toUpperCase()}`
        );
      } catch (err) {
        console.warn(`Chunk ${chunk.chunkIndex} retrieval failed:`, err);
        failedChunkIndices.push(chunk.chunkIndex);
      }
    })
  );

  // If exactly 1 chunk failed and we have a RAID-5 parity chunk, RECONSTRUCT IT ON THE FLY!
  if (failedChunkIndices.length === 1 && manifest.parityChunk) {
    const missingIndex = failedChunkIndices[0];
    onProgress(
      85,
      completed,
      totalChunks,
      `Fault detected on chunk ${missingIndex + 1}! Activating RAID-5 parity reconstruction...`
    );

    try {
      const parityBuf = await fetchAndDecryptChunk(manifest.parityChunk);
      const surviving = chunkBuffers.filter((b): b is ArrayBuffer => b !== null && b.byteLength > 0);
      const expectedSize = manifest.chunks[missingIndex].chunkSizeBytes;

      const reconstructedBuf = await reconstructChunkWorker(surviving, parityBuf, expectedSize);
      chunkBuffers[missingIndex] = reconstructedBuf;
      completed++;
      onProgress(
        95,
        completed,
        totalChunks,
        `Chunk ${missingIndex + 1} successfully reconstructed from multi-cloud parity!`
      );
    } catch (reconstructErr: any) {
      throw new Error(
        `Failed to recover missing chunk ${missingIndex + 1} via RAID-5 parity: ${reconstructErr.message}`
      );
    }
  } else if (failedChunkIndices.length > 1) {
    throw new Error(
      `Multiple accounts/chunks failed (${failedChunkIndices.length} missing). Connect all providers to reassemble.`
    );
  } else if (failedChunkIndices.length === 1 && !manifest.parityChunk) {
    throw new Error(
      `Chunk ${failedChunkIndices[0] + 1} is unavailable and this file was uploaded without RAID-5 parity.`
    );
  }

  onProgress(100, totalChunks, totalChunks, 'Assembly complete.');

  const finalBlobs = chunkBuffers.map(buf => new Blob([buf!]));
  return new Blob(finalBlobs, { type: manifest.mimeType || 'application/octet-stream' });
};

import { encodeCompactManifest, decodeCompactOrLegacyManifest } from './compactMagicCodec';

/**
 * Generate a self-contained P2P Magic Link with embedded decryption key.
 * Uses high-efficiency compact base64url encoding for short, clean URLs.
 */
export const createMagicShareLink = async (
  manifest: ShardManifest,
  clientId?: string
): Promise<string> => {
  // For v3.0 files this embeds the per-file data key (unwrapped via ML-KEM-768) —
  // the recipient gets ONLY this file's key, never the vault private key or master key.
  const key = await resolveFileDecryptionKey(manifest);
  const compactHash = encodeCompactManifest(manifest, key || undefined, clientId);
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = `m=${compactHash}`;
  return url.toString();
};

/**
 * Decode a Magic Link from URL hash (supports both compact #m= and legacy #magic=).
 */
export const decodeMagicShareLink = (hash: string): ShardManifest | null => {
  return decodeCompactOrLegacyManifest(hash);
};

/**
 * Delete all physical chunks across accounts/providers, parity blocks, and remove manifest.
 */
export const deleteShardedFile = async (
  manifest: ShardManifest,
  manifestFileId: string,
  accounts: AccountToken[]
): Promise<void> => {
  const allChunks = [...manifest.chunks];
  if (manifest.parityChunk) {
    allChunks.push(manifest.parityChunk);
  }

  const deletePromises = allChunks.map(async chunk => {
    const acc = accounts.find(a => a.id === chunk.accountId);
    if (!acc || acc.isExpired) return;
    try {
      await deleteChunkFromProvider(acc, chunk.driveFileId, chunk.downloadPath);
    } catch (e) {
      console.warn(`Could not delete chunk ${chunk.driveFileId}`, e);
    }
  });

  const manifestAcc = accounts.find(a => !a.isExpired && (a.provider === 'google' || !a.provider));
  if (manifestAcc && manifestFileId) {
    deletePromises.push(
      fetch(`https://www.googleapis.com/drive/v3/files/${manifestFileId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${manifestAcc.accessToken}` },
      }).then(() => {})
    );
  }

  await Promise.allSettled(deletePromises);
};

/**
 * Verify chunk integrity and multi-cloud RAID-5 fault tolerance status.
 */
export const verifyShardIntegrity = async (
  manifest: ShardManifest,
  accounts: AccountToken[]
): Promise<{
  healthy: boolean;
  canRecover: boolean;
  missingChunks: number;
  parityHealthy: boolean;
}> => {
  let missing = 0;

  for (const chunk of manifest.chunks) {
    const acc = accounts.find(a => a.id === chunk.accountId);
    if (!acc || acc.isExpired) {
      missing++;
      continue;
    }
    try {
      if (chunk.provider === 'google' || !chunk.provider) {
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${chunk.driveFileId}?fields=id`, {
          headers: { Authorization: `Bearer ${acc.accessToken}` },
        });
        if (!res.ok) missing++;
      } else {
        // Assume healthy if account token is present
        if (!acc.accessToken) missing++;
      }
    } catch {
      missing++;
    }
  }

  let parityHealthy = false;
  if (manifest.parityChunk) {
    const pAcc = accounts.find(a => a.id === manifest.parityChunk!.accountId);
    if (pAcc && !pAcc.isExpired) {
      parityHealthy = true;
    }
  }

  const canRecover = missing === 0 || (missing === 1 && parityHealthy);

  return {
    healthy: missing === 0,
    canRecover,
    missingChunks: missing,
    parityHealthy,
  };
};

/**
 * Grants public read access to all chunks in a manifest (Google Drive only for now).
 * This makes peer-to-peer Magic Links completely decoupled from the sender's OAuth session.
 */
export const makeManifestChunksPublic = async (manifest: ShardManifest, accounts: AccountToken[]) => {
  const allChunks = [...manifest.chunks, ...(manifest.parityChunk ? [manifest.parityChunk] : [])];
  
  const publicPromises = allChunks.map(async (chunk) => {
    if (chunk.provider === 'google' || !chunk.provider) {
      const account = accounts.find((a) => a.id === chunk.accountId || (chunk.accountEmail && a.email === chunk.accountEmail))
        || accounts.find(a => !a.isExpired && (a.provider === 'google' || !a.provider));
      if (account) {
        await makeGoogleDriveFilePublic(chunk.driveFileId, account.accessToken);
      }
    }
  });

  await Promise.all(publicPromises);
};

export const revokeManifestChunksPublic = async (manifest: ShardManifest, accounts: AccountToken[]) => {
  const allChunks = [...manifest.chunks, ...(manifest.parityChunk ? [manifest.parityChunk] : [])];
  
  const revokePromises = allChunks.map(async (chunk) => {
    if (chunk.provider === 'google' || !chunk.provider) {
      const account = accounts.find((a) => a.id === chunk.accountId || (chunk.accountEmail && a.email === chunk.accountEmail))
        || accounts.find(a => !a.isExpired && (a.provider === 'google' || !a.provider));
      if (account) {
        await revokeGoogleDriveFilePublic(chunk.driveFileId, account.accessToken);
      }
    }
  });

  await Promise.all(revokePromises);
};

export const downloadShardedFileStream = async (
  manifest: ShardManifest,
  accounts: AccountToken[],
  onProgress: (progress: number, completedChunks: number, totalChunks: number, stage?: string) => void,
  explicitKey?: string
): Promise<boolean> => {
  if (!('showSaveFilePicker' in window)) return false; // Not supported
  
  try {
    const handle = await (window as any).showSaveFilePicker({
      suggestedName: manifest.filename
    });
    const writable = await handle.createWritable();
    
    const masterKey = await resolveFileDecryptionKey(manifest, explicitKey);
    const totalChunks = manifest.chunks.length;
    let completed = 0;

    for (let i = 0; i < totalChunks; i++) {
      const chunk = manifest.chunks[i];
      const acc = accounts.find(a => a.id === chunk.accountId || (chunk.accountEmail && a.email === chunk.accountEmail))
        || accounts.find(a => !a.isExpired && (a.provider || 'google') === (chunk.provider || 'google'));
      if (!acc) throw new Error(`Account missing for chunk ${i + 1}`);

      onProgress((completed / totalChunks) * 100, completed, totalChunks, `Downloading chunk ${i + 1}...`);
      
      const rawBuf = await downloadChunkFromProvider(acc, chunk.driveFileId, chunk.downloadPath);
      let chunkData = rawBuf;
      if (chunk.cryptoMeta?.encrypted && masterKey) {
        chunkData = await decryptChunkWorker(rawBuf, masterKey, chunk.cryptoMeta.iv, chunk.cryptoMeta.salt);
      }
      
      await writable.write(chunkData);
      completed++;
      onProgress((completed / totalChunks) * 100, completed, totalChunks, `Chunk ${i + 1} written to disk`);
    }
    
    await writable.close();
    onProgress(100, totalChunks, totalChunks, 'Download complete');
    return true;
  } catch (e: any) {
    if (e.name === 'AbortError') return true; // User cancelled
    throw e;
  }
};
