/**
 * Client-Side PKCE OAuth 2.0 Service for Dropbox and Microsoft OneDrive
 * 100% Zero-Server: No client secrets or backend proxy required.
 * Compliant with RFC 7636 (Proof Key for Code Exchange by OAuth Public Clients).
 */

import { AccountToken, CloudProvider } from '../types';
import { fetchAccountQuota } from './multiCloudAdapter';

const PKCE_STATE_KEY = 'matrix_pkce_session';

export interface PkcePendingSession {
  provider: 'onedrive' | 'dropbox';
  clientId: string;
  codeVerifier: string;
  state: string;
  redirectUri: string;
  timestamp: number;
}

// ==========================================
// CRYPTOGRAPHIC PKCE HELPERS (Web Crypto)
// ==========================================

function base64UrlEncode(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function generateRandomString(byteLength: number = 32): string {
  const randomBytes = new Uint8Array(byteLength);
  window.crypto.getRandomValues(randomBytes);
  return base64UrlEncode(randomBytes);
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await window.crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(digest);
}

export function getAppRedirectUri(): string {
  if (typeof window === 'undefined') return '';
  // Strip a trailing index.html so the URI is stable no matter which
  // canonical URL served the app (e.g. /quantum-vault/ vs /quantum-vault/index.html).
  const path = window.location.pathname.replace(/index\.html$/, '');
  return `${window.location.origin}${path}`;
}

// ==========================================
// DROPBOX PKCE FLOW
// ==========================================

export async function createDropboxAuthUrl(clientId: string, redirectUri: string): Promise<{ url: string; session: PkcePendingSession }> {
  const codeVerifier = generateRandomString(32);
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = generateRandomString(16);

  const params = new URLSearchParams({
    client_id: clientId.trim(),
    response_type: 'code',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    redirect_uri: redirectUri,
    token_access_type: 'offline', // Requests refresh_token
    state,
  });

  const session: PkcePendingSession = {
    provider: 'dropbox',
    clientId: clientId.trim(),
    codeVerifier,
    state,
    redirectUri,
    timestamp: Date.now(),
  };

  return {
    url: `https://www.dropbox.com/oauth2/authorize?${params.toString()}`,
    session,
  };
}

export async function exchangeDropboxCode(
  code: string,
  verifier: string,
  clientId: string,
  redirectUri: string
): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number }> {
  const body = new URLSearchParams({
    code,
    grant_type: 'authorization_code',
    client_id: clientId.trim(),
    code_verifier: verifier,
    redirect_uri: redirectUri,
  });

  const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Dropbox token exchange failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}

export async function fetchDropboxProfile(accessToken: string): Promise<{ id: string; email: string; name: string; photoURL: string | null }> {
  const res = await fetch('https://api.dropboxapi.com/2/users/get_current_account', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Dropbox profile fetch failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return {
    id: `dropbox_${data.account_id || data.account_id_hashed || Date.now()}`,
    email: data.email || 'dropbox_user@matrix.local',
    name: data.name?.display_name || 'Dropbox User',
    photoURL: data.profile_photo_url || null,
  };
}

export async function refreshDropboxAccessToken(
  refreshToken: string,
  clientId: string
): Promise<{ accessToken: string; expiresIn?: number }> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId.trim(),
  });

  const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    throw new Error(`Failed to refresh Dropbox token: ${res.statusText}`);
  }

  const data = await res.json();
  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in,
  };
}

// ==========================================
// MICROSOFT ONEDRIVE (GRAPH) PKCE FLOW
// ==========================================

export async function createOneDriveAuthUrl(clientId: string, redirectUri: string): Promise<{ url: string; session: PkcePendingSession }> {
  const codeVerifier = generateRandomString(32);
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = generateRandomString(16);

  const params = new URLSearchParams({
    client_id: clientId.trim(),
    response_type: 'code',
    redirect_uri: redirectUri,
    response_mode: 'query',
    scope: 'Files.ReadWrite User.Read offline_access',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
  });

  const session: PkcePendingSession = {
    provider: 'onedrive',
    clientId: clientId.trim(),
    codeVerifier,
    state,
    redirectUri,
    timestamp: Date.now(),
  };

  return {
    url: `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`,
    session,
  };
}

export async function exchangeOneDriveCode(
  code: string,
  verifier: string,
  clientId: string,
  redirectUri: string
): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number }> {
  const body = new URLSearchParams({
    client_id: clientId.trim(),
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });

  const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Microsoft OneDrive token exchange failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}

export async function fetchOneDriveProfile(accessToken: string): Promise<{ id: string; email: string; name: string; photoURL: string | null }> {
  const res = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Microsoft profile fetch failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const email = data.mail || data.userPrincipalName || 'onedrive_user@outlook.com';

  return {
    id: `onedrive_${data.id || Date.now()}`,
    email,
    name: data.displayName || 'OneDrive User',
    photoURL: null,
  };
}

export async function refreshOneDriveAccessToken(
  refreshToken: string,
  clientId: string
): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number }> {
  const body = new URLSearchParams({
    client_id: clientId.trim(),
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    throw new Error(`Failed to refresh Microsoft token: ${res.statusText}`);
  }

  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresIn: data.expires_in,
  };
}

// ==========================================
// SESSION STORAGE & OAUTH DISPATCH
// ==========================================

export function savePkceSession(session: PkcePendingSession): void {
  try {
    sessionStorage.setItem(`${PKCE_STATE_KEY}_${session.state}`, JSON.stringify(session));
    // Also save in localStorage as backup in case popup opens in separate context
    localStorage.setItem(`${PKCE_STATE_KEY}_${session.state}`, JSON.stringify(session));
  } catch (e) {
    console.warn('Could not persist PKCE session state', e);
  }
}

export function retrievePkceSession(state: string): PkcePendingSession | null {
  try {
    const stored =
      sessionStorage.getItem(`${PKCE_STATE_KEY}_${state}`) ||
      localStorage.getItem(`${PKCE_STATE_KEY}_${state}`);
    if (stored) {
      sessionStorage.removeItem(`${PKCE_STATE_KEY}_${state}`);
      localStorage.removeItem(`${PKCE_STATE_KEY}_${state}`);
      return JSON.parse(stored);
    }
  } catch (e) {
    console.warn('Could not read PKCE session state', e);
  }
  return null;
}

/**
 * Handle incoming callback query parameters from an OAuth popup or redirect.
 */
export async function completePkceCallback(code: string, state: string): Promise<AccountToken> {
  const session = retrievePkceSession(state);
  if (!session) {
    throw new Error('OAuth state mismatch or session expired. Please retry signing in.');
  }

  const { provider, clientId, codeVerifier, redirectUri } = session;

  if (provider === 'dropbox') {
    const tokens = await exchangeDropboxCode(code, codeVerifier, clientId, redirectUri);
    const profile = await fetchDropboxProfile(tokens.accessToken);
    const account: AccountToken = {
      id: profile.id,
      email: profile.email,
      name: profile.name,
      photoURL: profile.photoURL,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresIn ? Date.now() + tokens.expiresIn * 1000 : undefined,
      clientId,
      provider: 'dropbox',
    };
    const quota = await fetchAccountQuota(account);
    account.quota = quota;
    return account;
  } else if (provider === 'onedrive') {
    const tokens = await exchangeOneDriveCode(code, codeVerifier, clientId, redirectUri);
    const profile = await fetchOneDriveProfile(tokens.accessToken);
    const account: AccountToken = {
      id: profile.id,
      email: profile.email,
      name: profile.name,
      photoURL: profile.photoURL,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresIn ? Date.now() + tokens.expiresIn * 1000 : undefined,
      clientId,
      provider: 'onedrive',
    };
    const quota = await fetchAccountQuota(account);
    account.quota = quota;
    return account;
  }

  throw new Error(`Unsupported PKCE provider: ${provider}`);
}

/**
 * Initiates the PKCE OAuth flow using a popup window or redirect fallback.
 */
export async function launchPkceAuthFlow(
  provider: 'onedrive' | 'dropbox',
  clientId: string,
  onAccountReceived: (account: AccountToken) => void,
  onError: (error: string) => void
): Promise<void> {
  try {
    const redirectUri = getAppRedirectUri();
    const { url, session } =
      provider === 'dropbox'
        ? await createDropboxAuthUrl(clientId, redirectUri)
        : await createOneDriveAuthUrl(clientId, redirectUri);

    savePkceSession(session);

    // Setup listener for popup postMessage
    const messageHandler = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'MATRIX_PKCE_CALLBACK') {
        window.removeEventListener('message', messageHandler);
        try {
          const { code, state } = event.data;
          const account = await completePkceCallback(code, state);
          onAccountReceived(account);
        } catch (err: any) {
          onError(err.message || 'OAuth verification failed');
        }
      }
    };
    window.addEventListener('message', messageHandler);

    // Open popup
    const width = 560;
    const height = 680;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    const popup = window.open(
      url,
      `MatrixOAuth_${provider}`,
      `width=${width},height=${height},left=${left},top=${top},status=no,menubar=no,toolbar=no`
    );

    if (!popup || popup.closed || typeof popup.closed === 'undefined') {
      // Popup blocked, navigate directly
      window.location.href = url;
    }
  } catch (err: any) {
    onError(err.message || `Failed to start ${provider} authentication`);
  }
}
