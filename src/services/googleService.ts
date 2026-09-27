import { AccountToken } from '../types';
import { listFiles } from './multiCloudAdapter';

export const fetchDriveFiles = async (acc: AccountToken, handleTokenExpiry: (id: string) => void) => {
  if (acc.isExpired) return [];
  try {
    const files = await listFiles(acc);
    return files;
  } catch (e: any) {
    if (e?.message?.includes('401') || e?.message?.includes('token')) {
      handleTokenExpiry(acc.id);
    }
    console.error(`Drive fetch failed for ${acc.email} (${acc.provider || 'google'})`, e);
    return [];
  }
};

export const fetchGmailMessages = async (acc: AccountToken, handleTokenExpiry: (id: string) => void) => {
  if (acc.isExpired) return [];
  try {
    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=50&q=in:inbox', {
      headers: { Authorization: `Bearer ${acc.accessToken}` }
    });
    if (res.status === 401) { handleTokenExpiry(acc.id); return []; }
    const data = await res.json();
    if (!data.messages) return [];

    const detailPromises = data.messages.map(async (msg: any) => {
      const detailRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=subject&metadataHeaders=From&metadataHeaders=from&metadataHeaders=Message-ID&metadataHeaders=message-id&metadataHeaders=References&metadataHeaders=references`, {
        headers: { Authorization: `Bearer ${acc.accessToken}` }
      });
      if (detailRes.status === 401) return null;
      const detail = await detailRes.json();
      const subject = detail.payload?.headers?.find((h: any) => h.name.toLowerCase() === 'subject')?.value || '(No Subject)';
      const from = detail.payload?.headers?.find((h: any) => h.name.toLowerCase() === 'from')?.value || 'Unknown Sender';
      const messageId = detail.payload?.headers?.find((h: any) => h.name.toLowerCase() === 'message-id')?.value || '';
      const references = detail.payload?.headers?.find((h: any) => h.name.toLowerCase() === 'references')?.value || messageId;
      
      return {
        id: msg.id,
        subject,
        from,
        snippet: detail.snippet,
        timestamp: parseInt(detail.internalDate, 10) || Date.now(),
        accountId: acc.id,
        accountEmail: acc.email,
        accountPhoto: acc.photoURL,
        threadId: msg.threadId,
        messageId,
        references
      };
    });
    
    const results = await Promise.all(detailPromises);
    return results.filter((r: any) => r !== null);
  } catch (e) {
    console.error(`Gmail fetch failed for ${acc.email}`, e);
    return [];
  }
};

export const sendEmail = async (
  accessToken: string,
  rawBase64Url: string,
  threadId?: string
) => {
  const body: any = { raw: rawBase64Url };
  if (threadId) {
    body.threadId = threadId;
  }

  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error('Failed to send email');
  }
  return res.json();
};

export const uploadFileToDriveResumable = async (
  accessToken: string,
  file: File,
  onProgress: (progress: number) => void
): Promise<{ id: string, webViewLink: string, name: string, size: number }> => {
  const initRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Upload-Content-Length': file.size.toString(),
      'X-Upload-Content-Type': file.type || 'application/octet-stream',
    },
    body: JSON.stringify({
      name: file.name
    })
  });

  const uploadUrl = initRes.headers.get('Location');
  if (!uploadUrl) throw new Error('Failed to get upload URL');

  const chunkSize = 5 * 1024 * 1024; // 5MB
  let start = 0;
  
  while (start < file.size) {
    const end = Math.min(start + chunkSize, file.size);
    const chunk = file.slice(start, end);
    
    const chunkRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Range': `bytes ${start}-${end - 1}/${file.size}`,
      },
      body: chunk
    });
    
    start = end;
    onProgress(Math.round((start / file.size) * 100));
    
    if (chunkRes.status === 200 || chunkRes.status === 201) {
      const data = await chunkRes.json();
      
      // Make file public so anyone with link can view
      await fetch(`https://www.googleapis.com/drive/v3/files/${data.id}/permissions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          role: 'reader',
          type: 'anyone'
        })
      });
      
      const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${data.id}?fields=id,webViewLink,name,size`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      const fileData = await fileRes.json();
      return {
        id: fileData.id,
        webViewLink: fileData.webViewLink,
        name: file.name,
        size: file.size
      };
    }
  }
  
  // If file is exactly 0 bytes or something
  if (file.size === 0) {
      throw new Error("Cannot upload 0 byte file");
  }

  throw new Error('Upload failed');
};

export const fetchAttachmentAndUpload = async (
  sourceAccessToken: string,
  targetAccessToken: string,
  messageId: string,
  attachmentId: string,
  filename: string,
  mimeType: string
) => {
  // 1. Fetch attachment from Gmail
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`, {
    headers: { Authorization: `Bearer ${sourceAccessToken}` }
  });
  const data = await res.json();
  if (!data.data) throw new Error('No attachment data');

  // Convert base64url to Blob
  const base64 = data.data.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    array[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([array], { type: mimeType || 'application/octet-stream' });
  const file = new File([blob], filename, { type: mimeType });

  // 2. Stream to Target Drive
  // using our resumable upload function!
  return await uploadFileToDriveResumable(targetAccessToken, file, () => {});
};

export const syncConfigToShadowDb = async (accessToken: string, config: any) => {
  try {
    // 1. Find if config file exists
    const searchRes = await fetch('https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name="matrix_shadow_db.json"', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const searchData = await searchRes.json();
    const existingFile = searchData.files && searchData.files.length > 0 ? searchData.files[0] : null;

    const fileMetadata = {
      name: 'matrix_shadow_db.json',
      parents: ['appDataFolder']
    };

    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const close_delim = `\r\n--${boundary}--`;

    const multipartRequestBody =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(fileMetadata) +
      delimiter +
      'Content-Type: application/json\r\n\r\n' +
      JSON.stringify(config) +
      close_delim;

    let url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
    let method = 'POST';

    if (existingFile) {
      url = `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=multipart`;
      method = 'PATCH';
    }

    await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body: multipartRequestBody
    });
  } catch (e) {
    console.error('Failed to sync to Shadow DB', e);
  }
};

export const fetchConfigFromShadowDb = async (accessToken: string) => {
  try {
    const searchRes = await fetch('https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name="matrix_shadow_db.json"', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const searchData = await searchRes.json();
    
    if (searchData.files && searchData.files.length > 0) {
      const fileId = searchData.files[0].id;
      const contentRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const content = await contentRes.json();
      return content;
    }
    return null;
  } catch (e) {
    console.error('Failed to fetch from Shadow DB', e);
    return null;
  }
};


export const executeFederatedSearchStream = (
  query: string, 
  accounts: AccountToken[], 
  handleTokenExpiry: (id: string) => void,
  onResultChunk: (type: 'mail' | 'drive', account: AccountToken, results: any[]) => void
) => {
  if (!query || query.trim() === '') return;
  const q = encodeURIComponent(query);
  
  accounts.forEach(acc => {
    if (acc.isExpired) return;
    
    // Drive Search
    fetch(`https://www.googleapis.com/drive/v3/files?pageSize=15&fields=files(id,name,mimeType,modifiedTime,webViewLink,webContentLink,iconLink)&q=trashed=false and name contains '${query.replace(/'/g, "\'")}'`, {
      headers: { Authorization: `Bearer ${acc.accessToken}` }
    }).then(res => {
      if (res.status === 401) { handleTokenExpiry(acc.id); throw new Error('Unauthorized'); }
      return res.json();
    }).then(data => {
      const files = (data.files || []).map((f: any) => ({
        ...f, accountId: acc.id, accountEmail: acc.email, accountPhoto: acc.photoURL, timestamp: new Date(f.modifiedTime).getTime()
      }));
      onResultChunk('drive', acc, files);
    }).catch(e => console.error('Drive search failed', e));
  });
};

export const makeFilePublic = async (fileId: string, accessToken: string) => {
  await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      role: 'reader',
      type: 'anyone',
    })
  });
};
