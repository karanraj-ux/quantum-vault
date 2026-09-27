/**
 * Standardized Multi-Cloud File Adapter Layer
 * 
 * Provides a single unified TypeScript interface across:
 * 1. Google Drive (REST v3 & Resumable Media Uploads)
 * 2. Microsoft OneDrive (Microsoft Graph v1.0 & Resumable Upload Sessions)
 * 3. Dropbox (Content Endpoints & Chunked Upload Sessions)
 * 
 * Features:
 * - uploadChunk(): Resumable chunked streaming preventing browser memory blowups
 * - downloadChunk(): Authenticated byte array buffer download
 * - downloadChunkStream(): Zero-memory stream piping via ReadableStream<Uint8Array>
 * - listFiles(): Standardized unified drive file listing
 * - deleteFile(): Cloud-native deletion
 * - getQuota(): Storage quota extraction across all three vendors
 */

import { AccountToken, CloudFileItem, CloudProvider, StorageQuotaInfo } from '../types';
import { refreshDropboxAccessToken, refreshOneDriveAccessToken } from './pkceAuthService';
import { get, set, del } from 'idb-keyval';

// ==========================================
// STANDARDIZED TYPES & INTERFACES
// ==========================================

export interface UploadChunkOptions {
  chunkName: string;
  chunkData: Blob | ArrayBuffer | Uint8Array;
  mimeType?: string;
  totalSize?: number;
  isShardedPart?: boolean;
  onProgress?: (bytesUploaded: number, totalBytes: number) => void;
  signal?: AbortSignal;
}

export interface UploadChunkResult {
  fileId: string;
  downloadPath?: string;
  size?: number;
}

export interface DownloadChunkOptions {
  fileId: string;
  downloadPath?: string;
  rangeStart?: number;
  rangeEnd?: number;
  signal?: AbortSignal;
  onProgress?: (loadedBytes: number, totalBytes: number) => void;
}

export interface ListFilesOptions {
  folderId?: string;
  pageSize?: number;
  query?: string;
  signal?: AbortSignal;
}

export interface ICloudFileAdapter {
  readonly provider: CloudProvider;

  uploadChunk(
    account: AccountToken,
    options: UploadChunkOptions
  ): Promise<UploadChunkResult>;

  downloadChunk(
    account: AccountToken,
    options: DownloadChunkOptions
  ): Promise<ArrayBuffer>;

  downloadChunkStream?(
    account: AccountToken,
    options: DownloadChunkOptions
  ): Promise<ReadableStream<Uint8Array>>;

  listFiles(
    account: AccountToken,
    options?: ListFilesOptions
  ): Promise<CloudFileItem[]>;

  deleteFile(
    account: AccountToken,
    fileId: string,
    downloadPath?: string
  ): Promise<void>;

  getQuota(
    account: AccountToken
  ): Promise<StorageQuotaInfo>;
}

// ==========================================
// TOKEN VALIDATION & AUTO-REFRESH
// ==========================================

export const ensureValidToken = async (account: AccountToken): Promise<string> => {
  const now = Date.now();
  if (account.expiresAt && account.expiresAt - now < 120000 && account.refreshToken && account.clientId) {
    try {
      if (account.provider === 'dropbox') {
        const refreshed = await refreshDropboxAccessToken(account.refreshToken, account.clientId);
        account.accessToken = refreshed.accessToken;
        account.expiresAt = refreshed.expiresIn ? Date.now() + refreshed.expiresIn * 1000 : undefined;
      } else if (account.provider === 'onedrive') {
        const refreshed = await refreshOneDriveAccessToken(account.refreshToken, account.clientId);
        account.accessToken = refreshed.accessToken;
        if (refreshed.refreshToken) account.refreshToken = refreshed.refreshToken;
        account.expiresAt = refreshed.expiresIn ? Date.now() + refreshed.expiresIn * 1000 : undefined;
      }
    } catch (e) {
      console.warn(`Could not refresh token for ${account.email}:`, e);
    }
  }
  return account.accessToken;
};

// ==========================================
// 1. GOOGLE DRIVE ADAPTER
// ==========================================

class GoogleDriveAdapter implements ICloudFileAdapter {
  readonly provider: CloudProvider = 'google';

  async uploadChunk(account: AccountToken, options: UploadChunkOptions): Promise<UploadChunkResult> {
    await ensureValidToken(account);
    const { chunkName, chunkData, isShardedPart = true, onProgress, signal } = options;

    const blob = chunkData instanceof Blob
      ? chunkData
      : new Blob([chunkData], { type: options.mimeType || 'application/octet-stream' });
    const totalSize = blob.size;

    // Resumable upload initialization
    const initRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': options.mimeType || 'application/octet-stream',
        'X-Upload-Content-Length': `${totalSize}`,
      },
      body: JSON.stringify({
        name: chunkName,
        properties: {
          isFrankensteinShard: isShardedPart ? 'true' : 'false',
        },
      }),
      signal,
    });

    const uploadLocation = initRes.headers.get('Location');

    // Streaming resumable chunked upload in 1 MiB slices (multiples of 256 KiB)
    if (initRes.ok && uploadLocation) {
      const SUB_CHUNK_SIZE = 1024 * 1024; // 1 MB slice
      let offset = 0;

      while (offset < totalSize) {
        const nextOffset = Math.min(offset + SUB_CHUNK_SIZE, totalSize);
        const subSlice = blob.slice(offset, nextOffset);

        const uploadRes = await fetch(uploadLocation, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Range': `bytes ${offset}-${nextOffset - 1}/${totalSize}`,
          },
          body: subSlice,
          signal,
        });

        if (uploadRes.status === 308) {
          // Resume Incomplete - Slice received successfully
          offset = nextOffset;
          if (onProgress) onProgress(offset, totalSize);
        } else if (uploadRes.ok) {
          // Completed
          const data = await uploadRes.json();
          if (onProgress) onProgress(totalSize, totalSize);
          return { fileId: data.id, size: totalSize };
        } else {
          throw new Error(`Google Drive resumable slice failed (HTTP ${uploadRes.status}): ${uploadRes.statusText}`);
        }
      }
    }

    // Direct upload fallback
    const directRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=media', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        'Content-Type': 'application/octet-stream',
      },
      body: blob,
      signal,
    });

    if (!directRes.ok) throw new Error(`Google direct upload failed: ${directRes.statusText}`);
    const directData = await directRes.json();
    await fetch(`https://www.googleapis.com/drive/v3/files/${directData.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: chunkName }),
    });

    if (onProgress) onProgress(totalSize, totalSize);
    return { fileId: directData.id, size: totalSize };
  }

  async downloadChunk(account: AccountToken, options: DownloadChunkOptions): Promise<ArrayBuffer> {
    await ensureValidToken(account);
    const headers: Record<string, string> = { Authorization: `Bearer ${account.accessToken}` };
    if (options.rangeStart !== undefined) {
      headers['Range'] = `bytes=${options.rangeStart}-${options.rangeEnd !== undefined ? options.rangeEnd : ''}`;
    }

    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${options.fileId}?alt=media&supportsAllDrives=true`, {
      headers,
      signal: options.signal,
    });

    if (!res.ok) throw new Error(`Google Drive download failed: ${res.statusText}`);
    return await res.arrayBuffer();
  }

  async downloadChunkStream(account: AccountToken, options: DownloadChunkOptions): Promise<ReadableStream<Uint8Array>> {
    await ensureValidToken(account);
    const headers: Record<string, string> = { Authorization: `Bearer ${account.accessToken}` };
    if (options.rangeStart !== undefined) {
      headers['Range'] = `bytes=${options.rangeStart}-${options.rangeEnd !== undefined ? options.rangeEnd : ''}`;
    }

    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${options.fileId}?alt=media&supportsAllDrives=true`, {
      headers,
      signal: options.signal,
    });

    if (!res.ok || !res.body) throw new Error(`Google Drive stream failed: ${res.statusText}`);
    return res.body;
  }

  async listFiles(account: AccountToken, options?: ListFilesOptions): Promise<CloudFileItem[]> {
    await ensureValidToken(account);
    const pageSize = options?.pageSize || 100;
    const url = `https://www.googleapis.com/drive/v3/files?pageSize=${pageSize}&fields=files(id,name,mimeType,size,modifiedTime,webViewLink,webContentLink,iconLink)&q=trashed=false&orderBy=modifiedTime%20desc`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${account.accessToken}` },
      signal: options?.signal,
    });

    if (!res.ok) throw new Error(`Google Drive file list failed: ${res.statusText}`);
    const data = await res.json();
    return (data.files || []).map((f: any) => ({
      ...f,
      size: f.size ? parseInt(f.size, 10) : undefined,
      accountId: account.id,
      accountEmail: account.email,
      accountPhoto: account.photoURL,
      timestamp: new Date(f.modifiedTime).getTime(),
      provider: 'google' as CloudProvider,
    }));
  }

  async deleteFile(account: AccountToken, fileId: string): Promise<void> {
    await ensureValidToken(account);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${account.accessToken}` },
    });
    if (!res.ok && res.status !== 404) {
      throw new Error(`Google Drive delete failed: ${res.statusText}`);
    }
  }

  async getQuota(account: AccountToken): Promise<StorageQuotaInfo> {
    const res = await fetch('https://www.googleapis.com/drive/v3/about?fields=storageQuota', {
      headers: { Authorization: `Bearer ${account.accessToken}` },
    });
    if (!res.ok) throw new Error(`Google quota fetch failed: ${res.statusText}`);
    const data = await res.json();
    const limitRaw = data.storageQuota?.limit;
    const usage = parseInt(data.storageQuota?.usage || '0', 10);
    const limit = limitRaw ? parseInt(limitRaw, 10) : Math.max(usage * 2, 5 * 1024 * 1024 * 1024 * 1024);
    return {
      totalBytes: limit,
      usedBytes: usage,
      freeBytes: Math.max(0, limit - usage),
      provider: 'google',
    };
  }
}

// ==========================================
// 2. MICROSOFT ONEDRIVE ADAPTER
// ==========================================

class OneDriveAdapter implements ICloudFileAdapter {
  readonly provider: CloudProvider = 'onedrive';

  async uploadChunk(account: AccountToken, options: UploadChunkOptions): Promise<UploadChunkResult> {
    await ensureValidToken(account);
    const { chunkName, chunkData, onProgress, signal } = options;

    const blob = chunkData instanceof Blob
      ? chunkData
      : new Blob([chunkData], { type: options.mimeType || 'application/octet-stream' });
    const totalSize = blob.size;

    // Small file threshold: 4 MiB
    if (totalSize < 4 * 1024 * 1024) {
      const endpoint = `https://graph.microsoft.com/v1.0/me/drive/root:/Frankenstein/${encodeURIComponent(
        chunkName
      )}:/content`;

      const res = await fetch(endpoint, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${account.accessToken}`,
          'Content-Type': 'application/octet-stream',
        },
        body: blob,
        signal,
      });

      if (!res.ok) throw new Error(`OneDrive upload failed (${res.status}): ${res.statusText}`);
      const data = await res.json();
      if (onProgress) onProgress(totalSize, totalSize);
      return { fileId: data.id, downloadPath: data['@microsoft.graph.downloadUrl'], size: totalSize };
    }

    // Large files: Microsoft Graph Resumable Upload Session
    // Fragment sizes MUST be multiples of 320 KiB (327,680 bytes)
    const sessionRes = await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/root:/Frankenstein/${encodeURIComponent(chunkName)}:/createUploadSession`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${account.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          item: {
            '@microsoft.graph.conflictBehavior': 'replace',
            name: chunkName,
          },
        }),
        signal,
      }
    );

    if (!sessionRes.ok) {
      throw new Error(`Failed to create OneDrive upload session: ${sessionRes.statusText}`);
    }

    const sessionData = await sessionRes.json();
    const uploadUrl = sessionData.uploadUrl;
    const FRAGMENT_SIZE = 327680 * 4; // 1,310,720 bytes (~1.25 MiB)
    let offset = 0;

    while (offset < totalSize) {
      const nextOffset = Math.min(offset + FRAGMENT_SIZE, totalSize);
      const fragment = blob.slice(offset, nextOffset);

      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Length': `${fragment.size}`,
          'Content-Range': `bytes ${offset}-${nextOffset - 1}/${totalSize}`,
        },
        body: fragment,
        signal,
      });

      if (putRes.status === 202) {
        // Intermediate fragment accepted
        offset = nextOffset;
        if (onProgress) onProgress(offset, totalSize);
      } else if (putRes.ok || putRes.status === 201 || putRes.status === 200) {
        // Last fragment committed
        const finishedItem = await putRes.json();
        if (onProgress) onProgress(totalSize, totalSize);
        return {
          fileId: finishedItem.id,
          downloadPath: finishedItem['@microsoft.graph.downloadUrl'],
          size: totalSize,
        };
      } else {
        throw new Error(`OneDrive upload session chunk failed (${putRes.status}): ${putRes.statusText}`);
      }
    }

    throw new Error('OneDrive upload terminated unexpectedly');
  }

  async downloadChunk(account: AccountToken, options: DownloadChunkOptions): Promise<ArrayBuffer> {
    await ensureValidToken(account);
    const headers: Record<string, string> = { Authorization: `Bearer ${account.accessToken}` };
    if (options.rangeStart !== undefined) {
      headers['Range'] = `bytes=${options.rangeStart}-${options.rangeEnd !== undefined ? options.rangeEnd : ''}`;
    }

    const endpoint = `https://graph.microsoft.com/v1.0/me/drive/items/${options.fileId}/content`;
    const res = await fetch(endpoint, { headers, signal: options.signal });
    if (!res.ok) throw new Error(`OneDrive chunk download failed: ${res.statusText}`);
    return await res.arrayBuffer();
  }

  async downloadChunkStream(account: AccountToken, options: DownloadChunkOptions): Promise<ReadableStream<Uint8Array>> {
    await ensureValidToken(account);
    const headers: Record<string, string> = { Authorization: `Bearer ${account.accessToken}` };
    if (options.rangeStart !== undefined) {
      headers['Range'] = `bytes=${options.rangeStart}-${options.rangeEnd !== undefined ? options.rangeEnd : ''}`;
    }

    const endpoint = `https://graph.microsoft.com/v1.0/me/drive/items/${options.fileId}/content`;
    const res = await fetch(endpoint, { headers, signal: options.signal });
    if (!res.ok || !res.body) throw new Error(`OneDrive chunk stream failed: ${res.statusText}`);
    return res.body;
  }

  async listFiles(account: AccountToken, options?: ListFilesOptions): Promise<CloudFileItem[]> {
    await ensureValidToken(account);
    const pageSize = options?.pageSize || 100;
    const url = `https://graph.microsoft.com/v1.0/me/drive/root/children?$top=${pageSize}&$orderby=lastModifiedDateTime%20desc`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${account.accessToken}` },
      signal: options?.signal,
    });

    if (!res.ok) throw new Error(`OneDrive file list failed: ${res.statusText}`);
    const data = await res.json();
    return (data.value || []).map((item: any) => ({
      id: item.id,
      name: item.name,
      mimeType: item.file?.mimeType || 'application/octet-stream',
      size: item.size,
      modifiedTime: item.lastModifiedDateTime,
      timestamp: new Date(item.lastModifiedDateTime).getTime(),
      webViewLink: item.webUrl || `https://onedrive.live.com`,
      webContentLink: item['@microsoft.graph.downloadUrl'],
      accountId: account.id,
      accountEmail: account.email,
      accountPhoto: account.photoURL,
      provider: 'onedrive' as CloudProvider,
    }));
  }

  async deleteFile(account: AccountToken, fileId: string): Promise<void> {
    await ensureValidToken(account);
    const res = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${fileId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${account.accessToken}` },
    });
    if (!res.ok && res.status !== 404) {
      throw new Error(`OneDrive delete failed: ${res.statusText}`);
    }
  }

  async getQuota(account: AccountToken): Promise<StorageQuotaInfo> {
    const res = await fetch('https://graph.microsoft.com/v1.0/me/drive', {
      headers: { Authorization: `Bearer ${account.accessToken}` },
    });
    if (!res.ok) throw new Error(`OneDrive quota fetch failed: ${res.statusText}`);
    const data = await res.json();
    const quota = data.quota || {};
    const total = quota.total || 5368709120; // 5 GB default
    const used = quota.used || 0;
    return {
      totalBytes: total,
      usedBytes: used,
      freeBytes: quota.remaining || Math.max(0, total - used),
      provider: 'onedrive',
    };
  }
}

// ==========================================
// 3. DROPBOX ADAPTER
// ==========================================

class DropboxAdapter implements ICloudFileAdapter {
  readonly provider: CloudProvider = 'dropbox';

  async uploadChunk(account: AccountToken, options: UploadChunkOptions): Promise<UploadChunkResult> {
    await ensureValidToken(account);
    const { chunkName, chunkData, onProgress, signal } = options;

    const blob = chunkData instanceof Blob
      ? chunkData
      : new Blob([chunkData], { type: options.mimeType || 'application/octet-stream' });
    const totalSize = blob.size;

    // Small file upload threshold: 4 MiB
    if (totalSize < 4 * 1024 * 1024) {
      const res = await fetch('https://content.dropboxapi.com/2/files/upload', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${account.accessToken}`,
          'Dropbox-API-Arg': JSON.stringify({
            path: `/Frankenstein/${chunkName}`,
            mode: 'overwrite',
            autorename: false,
            mute: true,
          }),
          'Content-Type': 'application/octet-stream',
        },
        body: blob,
        signal,
      });

      if (!res.ok) throw new Error(`Dropbox upload failed (${res.status}): ${res.statusText}`);
      const data = await res.json();
      if (onProgress) onProgress(totalSize, totalSize);
      return { fileId: data.id, downloadPath: data.path_lower, size: totalSize };
    }

    // Large files: Dropbox Chunked Upload Session
    const SUB_CHUNK_SIZE = 2 * 1024 * 1024; // 2 MiB chunks
    
    // Step 1: Start upload session
    const firstSlice = blob.slice(0, SUB_CHUNK_SIZE);
    const startRes = await fetch('https://content.dropboxapi.com/2/files/upload_session/start', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        'Dropbox-API-Arg': JSON.stringify({ close: false }),
        'Content-Type': 'application/octet-stream',
      },
      body: firstSlice,
      signal,
    });

    if (!startRes.ok) throw new Error(`Failed to start Dropbox upload session: ${startRes.statusText}`);
    const startData = await startRes.json();
    const sessionId = startData.session_id;
    let offset = firstSlice.size;
    if (onProgress) onProgress(offset, totalSize);

    // Step 2: Append intermediate slices
    while (offset < totalSize - SUB_CHUNK_SIZE) {
      const nextOffset = offset + SUB_CHUNK_SIZE;
      const intermediateSlice = blob.slice(offset, nextOffset);

      const appendRes = await fetch('https://content.dropboxapi.com/2/files/upload_session/append_v2', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${account.accessToken}`,
          'Dropbox-API-Arg': JSON.stringify({
            cursor: { session_id: sessionId, offset },
            close: false,
          }),
          'Content-Type': 'application/octet-stream',
        },
        body: intermediateSlice,
        signal,
      });

      if (!appendRes.ok) throw new Error(`Dropbox append chunk failed: ${appendRes.statusText}`);
      offset = nextOffset;
      if (onProgress) onProgress(offset, totalSize);
    }

    // Step 3: Finish upload session with final slice
    const finalSlice = blob.slice(offset, totalSize);
    const finishRes = await fetch('https://content.dropboxapi.com/2/files/upload_session/finish', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        'Dropbox-API-Arg': JSON.stringify({
          cursor: { session_id: sessionId, offset },
          commit: {
            path: `/Frankenstein/${chunkName}`,
            mode: 'overwrite',
            autorename: false,
            mute: true,
          },
        }),
        'Content-Type': 'application/octet-stream',
      },
      body: finalSlice,
      signal,
    });

    if (!finishRes.ok) throw new Error(`Dropbox finish upload failed: ${finishRes.statusText}`);
    const finishData = await finishRes.json();
    if (onProgress) onProgress(totalSize, totalSize);
    return { fileId: finishData.id, downloadPath: finishData.path_lower, size: totalSize };
  }

  async downloadChunk(account: AccountToken, options: DownloadChunkOptions): Promise<ArrayBuffer> {
    await ensureValidToken(account);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${account.accessToken}`,
      'Dropbox-API-Arg': JSON.stringify({ path: options.downloadPath || options.fileId }),
    };

    if (options.rangeStart !== undefined) {
      headers['Range'] = `bytes=${options.rangeStart}-${options.rangeEnd !== undefined ? options.rangeEnd : ''}`;
    }

    const res = await fetch('https://content.dropboxapi.com/2/files/download', {
      method: 'POST',
      headers,
      signal: options.signal,
    });

    if (!res.ok) throw new Error(`Dropbox chunk download failed: ${res.statusText}`);
    return await res.arrayBuffer();
  }

  async downloadChunkStream(account: AccountToken, options: DownloadChunkOptions): Promise<ReadableStream<Uint8Array>> {
    await ensureValidToken(account);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${account.accessToken}`,
      'Dropbox-API-Arg': JSON.stringify({ path: options.downloadPath || options.fileId }),
    };

    if (options.rangeStart !== undefined) {
      headers['Range'] = `bytes=${options.rangeStart}-${options.rangeEnd !== undefined ? options.rangeEnd : ''}`;
    }

    const res = await fetch('https://content.dropboxapi.com/2/files/download', {
      method: 'POST',
      headers,
      signal: options.signal,
    });

    if (!res.ok || !res.body) throw new Error(`Dropbox chunk stream failed: ${res.statusText}`);
    return res.body;
  }

  async listFiles(account: AccountToken, options?: ListFilesOptions): Promise<CloudFileItem[]> {
    await ensureValidToken(account);
    const res = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        path: options?.folderId || '',
        recursive: false,
        include_media_info: true,
        limit: options?.pageSize || 100,
      }),
      signal: options?.signal,
    });

    if (!res.ok) throw new Error(`Dropbox list_folder failed: ${res.statusText}`);
    const data = await res.json();
    return (data.entries || [])
      .filter((entry: any) => entry['.tag'] === 'file')
      .map((entry: any) => ({
        id: entry.id,
        name: entry.name,
        size: entry.size,
        mimeType: 'application/octet-stream',
        modifiedTime: entry.server_modified || entry.client_modified,
        timestamp: new Date(entry.server_modified || Date.now()).getTime(),
        downloadPath: entry.path_lower,
        webViewLink: `https://www.dropbox.com/home${entry.path_display || ''}`,
        accountId: account.id,
        accountEmail: account.email,
        accountPhoto: account.photoURL,
        provider: 'dropbox' as CloudProvider,
      }));
  }

  async deleteFile(account: AccountToken, fileId: string, downloadPath?: string): Promise<void> {
    await ensureValidToken(account);
    const res = await fetch('https://api.dropboxapi.com/2/files/delete_v2', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path: downloadPath || fileId }),
    });

    if (!res.ok && res.status !== 404) {
      throw new Error(`Dropbox delete failed: ${res.statusText}`);
    }
  }

  async getQuota(account: AccountToken): Promise<StorageQuotaInfo> {
    const res = await fetch('https://api.dropboxapi.com/2/users/get_space_usage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) throw new Error(`Dropbox quota fetch failed: ${res.statusText}`);
    const data = await res.json();
    const used = data.used || 0;
    const total = data.allocation?.allocated || 2147483648; // 2 GB default
    return {
      totalBytes: total,
      usedBytes: used,
      freeBytes: Math.max(0, total - used),
      provider: 'dropbox',
    };
  }
}

// ==========================================
// REGISTRY & FACTORY DISPATCH
// ==========================================

const adapters: Record<CloudProvider, ICloudFileAdapter> = {
  google: new GoogleDriveAdapter(),
  onedrive: new OneDriveAdapter(),
  dropbox: new DropboxAdapter(),
};

export const getStorageAdapter = (provider: CloudProvider = 'google'): ICloudFileAdapter => {
  const adapter = adapters[provider];
  if (!adapter) {
    throw new Error(`No storage adapter registered for provider: ${provider}`);
  }
  return adapter;
};

// ==========================================
// UNIFIED PUBLIC ADAPTER METHODS
// ==========================================

export const uploadChunk = async (
  account: AccountToken,
  options: UploadChunkOptions
): Promise<UploadChunkResult> => {
  if (account.id.startsWith('demo-')) {
    const blob = options.chunkData instanceof Blob ? options.chunkData : new Blob([options.chunkData]);
    await set('matrix_demo_chunk_' + options.chunkName, blob);
    if (options.onProgress) options.onProgress(blob.size, blob.size);
    return { fileId: 'demo-chunk-' + options.chunkName, size: blob.size };
  }
  const adapter = getStorageAdapter(account.provider || 'google');
  return await adapter.uploadChunk(account, options);
};

export const downloadChunk = async (
  account: AccountToken,
  options: DownloadChunkOptions
): Promise<ArrayBuffer> => {
  if (options.fileId.startsWith('demo-chunk-')) {
    const chunkName = options.fileId.replace('demo-chunk-', '');
    const blob = await get<Blob>('matrix_demo_chunk_' + chunkName);
    if (blob) return await blob.arrayBuffer();
    throw new Error(`Demo chunk "${chunkName}" not found in storage (simulated chunk loss).`);
  }
  const adapter = getStorageAdapter(account.provider || 'google');
  return await adapter.downloadChunk(account, options);
};

export const downloadChunkStream = async (
  account: AccountToken,
  options: DownloadChunkOptions
): Promise<ReadableStream<Uint8Array>> => {
  if (options.fileId.startsWith('demo-chunk-')) {
    const buf = await downloadChunk(account, options);
    return new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(buf));
        controller.close();
      },
    });
  }
  const adapter = getStorageAdapter(account.provider || 'google');
  if (adapter.downloadChunkStream) {
    return await adapter.downloadChunkStream(account, options);
  }
  const buf = await adapter.downloadChunk(account, options);
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(buf));
      controller.close();
    },
  });
};

export const listFiles = async (
  account: AccountToken,
  options?: ListFilesOptions
): Promise<CloudFileItem[]> => {
  if (account.id.startsWith('demo-')) {
    return [];
  }
  const adapter = getStorageAdapter(account.provider || 'google');
  return await adapter.listFiles(account, options);
};

export const deleteFile = async (
  account: AccountToken,
  fileId: string,
  downloadPath?: string
): Promise<void> => {
  if (fileId.startsWith('demo-chunk-')) {
    await del('matrix_demo_chunk_' + fileId.replace('demo-chunk-', ''));
    return;
  }
  const adapter = getStorageAdapter(account.provider || 'google');
  return await adapter.deleteFile(account, fileId, downloadPath);
};

export const fetchAccountQuota = async (account: AccountToken): Promise<StorageQuotaInfo> => {
  const adapter = getStorageAdapter(account.provider || 'google');
  try {
    return await adapter.getQuota(account);
  } catch (err) {
    console.warn(`Could not retrieve quota for ${account.email} (${account.provider}):`, err);
    const p = account.provider || 'google';
    return {
      totalBytes: p === 'dropbox' ? 2147483648 : p === 'onedrive' ? 5368709120 : 16106127360,
      usedBytes: 0,
      freeBytes: p === 'dropbox' ? 2147483648 : p === 'onedrive' ? 5368709120 : 16106127360,
      provider: p,
    };
  }
};

// ==========================================
// BACKWARD-COMPATIBILITY EXPORTS
// ==========================================

export const uploadChunkToProvider = async (
  account: AccountToken,
  chunkBlob: Blob,
  chunkName: string
): Promise<{ fileId: string; downloadPath?: string }> => {
  return await uploadChunk(account, {
    chunkName,
    chunkData: chunkBlob,
    isShardedPart: true,
  });
};

export const downloadChunkFromProvider = async (
  account: AccountToken,
  fileId: string,
  downloadPath?: string
): Promise<ArrayBuffer> => {
  return await downloadChunk(account, { fileId, downloadPath });
};

export const deleteChunkFromProvider = async (
  account: AccountToken,
  fileId: string,
  downloadPath?: string
): Promise<void> => {
  return await deleteFile(account, fileId, downloadPath);
};

export const makeGoogleDriveFilePublic = async (fileId: string, accessToken: string) => {
  try {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions?supportsAllDrives=true`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn(`Could not make file ${fileId} public (HTTP ${res.status}):`, errText);
    }
  } catch (err) {
    console.warn(`Network error making file ${fileId} public:`, err);
  }
};

export const revokeGoogleDriveFilePublic = async (fileId: string, accessToken: string) => {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.ok) {
    const data = await res.json();
    const publicPerm = data.permissions?.find((p: any) => p.type === 'anyone');
    if (publicPerm) {
      await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions/${publicPerm.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    }
  }
};
