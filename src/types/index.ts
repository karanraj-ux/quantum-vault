export type CloudProvider = 'google' | 'onedrive' | 'dropbox';

export interface StorageQuotaInfo {
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  provider: CloudProvider;
}

export interface AccountToken {
  id: string;
  email: string | null;
  name: string | null;
  photoURL: string | null;
  accessToken: string;
  provider?: CloudProvider; // Default: 'google'
  isExpired?: boolean;
  quota?: StorageQuotaInfo;
  refreshToken?: string;
  expiresAt?: number;
  clientId?: string;
}

export interface GmailMessage {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  snippet: string;
  date: string;
  accountId: string;
  accountEmail: string;
  accountPhoto?: string | null;
  timestamp: number;
  messageId?: string;
  references?: string;
  provider?: CloudProvider;
  attachments?: { attachmentId: string; filename: string; mimeType: string; size: number }[];
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  webViewLink: string;
  webContentLink?: string;
  iconLink?: string;
  accountId: string;
  accountEmail: string;
  accountPhoto?: string | null;
  timestamp: number;
  size?: number;
  provider?: CloudProvider;
  downloadPath?: string;
}

export type CloudFileItem = DriveFile;
