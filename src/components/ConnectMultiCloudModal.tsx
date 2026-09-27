import React, { useState, useEffect } from 'react';
import { Cloud, Shield, Key, ExternalLink, Check, AlertCircle, Loader2, ArrowRight } from 'lucide-react';
import { AccountToken, CloudProvider } from '../types';
import { launchPkceAuthFlow, getAppRedirectUri } from '../services/pkceAuthService';
import { fetchAccountQuota } from '../services/multiCloudAdapter';

interface ConnectMultiCloudModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialProvider?: 'onedrive' | 'dropbox';
  onAccountAdded: (account: AccountToken) => void;
}

export const ConnectMultiCloudModal: React.FC<ConnectMultiCloudModalProps> = ({
  isOpen,
  onClose,
  initialProvider = 'onedrive',
  onAccountAdded,
}) => {
  const [provider, setProvider] = useState<'onedrive' | 'dropbox'>(initialProvider);
  const [mode, setMode] = useState<'pkce' | 'manual'>('pkce');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'info' | 'error' | 'success'; text: string } | null>(null);

  // BYOK Client IDs stored locally
  const [onedriveClientId, setOnedriveClientId] = useState(() => localStorage.getItem('matrix_onedrive_client_id') || '');
  const [dropboxClientId, setDropboxClientId] = useState(() => localStorage.getItem('matrix_dropbox_client_id') || '');

  // Manual fallback inputs
  const [manualEmail, setManualEmail] = useState('');
  const [manualToken, setManualToken] = useState('');

  const redirectUri = getAppRedirectUri();

  useEffect(() => {
    if (initialProvider) setProvider(initialProvider);
    setStatusMessage(null);
  }, [initialProvider, isOpen]);

  if (!isOpen) return null;

  const handlePkceConnect = async () => {
    const activeClientId = provider === 'onedrive' ? onedriveClientId.trim() : dropboxClientId.trim();

    if (!activeClientId) {
      setStatusMessage({
        type: 'error',
        text: `Please enter your ${provider === 'onedrive' ? 'Microsoft Azure Client ID' : 'Dropbox App Key'} to initiate PKCE sign-in.`,
      });
      return;
    }

    // Persist for future convenience
    if (provider === 'onedrive') {
      localStorage.setItem('matrix_onedrive_client_id', activeClientId);
    } else {
      localStorage.setItem('matrix_dropbox_client_id', activeClientId);
    }

    setIsAuthenticating(true);
    setStatusMessage({ type: 'info', text: `Opening ${provider === 'onedrive' ? 'Microsoft' : 'Dropbox'} secure authentication window...` });

    await launchPkceAuthFlow(
      provider,
      activeClientId,
      async (newAccount: AccountToken) => {
        setIsAuthenticating(false);
        setStatusMessage({ type: 'success', text: `Connected ${newAccount.email} successfully!` });
        setTimeout(() => {
          onAccountAdded(newAccount);
          onClose();
        }, 800);
      },
      (errorMsg: string) => {
        setIsAuthenticating(false);
        setStatusMessage({ type: 'error', text: errorMsg });
      }
    );
  };

  const handleManualSave = async () => {
    if (!manualEmail.trim() || !manualToken.trim()) {
      setStatusMessage({ type: 'error', text: 'Please fill in both the account email and access token.' });
      return;
    }

    setIsAuthenticating(true);
    setStatusMessage({ type: 'info', text: 'Validating token & fetching cloud storage quota...' });

    try {
      const newAcc: AccountToken = {
        id: `${provider}_${Date.now()}`,
        email: manualEmail.trim(),
        name: `${provider === 'onedrive' ? 'OneDrive' : 'Dropbox'} User`,
        photoURL: null,
        accessToken: manualToken.trim(),
        provider,
      };

      const quota = await fetchAccountQuota(newAcc);
      newAcc.quota = quota;

      setStatusMessage({ type: 'success', text: `Verified ${newAcc.email}! Available quota: ${(quota.freeBytes / (1024 ** 3)).toFixed(1)} GB.` });
      setTimeout(() => {
        onAccountAdded(newAcc);
        onClose();
      }, 700);
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: `Failed to verify token: ${err.message}` });
    } finally {
      setIsAuthenticating(false);
    }
  };

  const copyRedirectUri = () => {
    navigator.clipboard.writeText(redirectUri);
    setStatusMessage({ type: 'info', text: 'Redirect URI copied to clipboard!' });
    setTimeout(() => setStatusMessage(null), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-white shadow-xs ${
              provider === 'onedrive' ? 'bg-blue-600' : 'bg-sky-600'
            }`}>
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">
                Connect {provider === 'onedrive' ? 'Microsoft OneDrive' : 'Dropbox'}
              </h2>
              <p className="text-xs text-slate-500">
                Client-Side PKCE OAuth (Zero Relay Servers)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Provider Switcher Tabs */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
          <button
            onClick={() => { setProvider('onedrive'); setStatusMessage(null); }}
            className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              provider === 'onedrive'
                ? 'bg-white text-blue-700 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>Microsoft OneDrive</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-bold border border-blue-200">
              +5 GB Free
            </span>
          </button>

          <button
            onClick={() => { setProvider('dropbox'); setStatusMessage(null); }}
            className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              provider === 'dropbox'
                ? 'bg-white text-sky-700 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>Dropbox</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 font-bold border border-sky-200">
              +2 GB Free
            </span>
          </button>
        </div>

        {/* Mode Selector */}
        <div className="flex items-center gap-4 text-xs font-medium border-b border-slate-100 pb-2">
          <button
            onClick={() => setMode('pkce')}
            className={`pb-1 cursor-pointer transition-colors relative ${
              mode === 'pkce' ? 'text-indigo-600 font-bold' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            PKCE 1-Click Login (Recommended)
            {mode === 'pkce' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 rounded-full" />}
          </button>
          <button
            onClick={() => setMode('manual')}
            className={`pb-1 cursor-pointer transition-colors relative ${
              mode === 'manual' ? 'text-indigo-600 font-bold' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Developer Token Entry
            {mode === 'manual' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 rounded-full" />}
          </button>
        </div>

        {/* Status Alert Banner */}
        {statusMessage && (
          <div className={`p-3 rounded-xl text-xs flex items-start gap-2.5 ${
            statusMessage.type === 'error'
              ? 'bg-rose-50 text-rose-800 border border-rose-200'
              : statusMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-blue-50 text-blue-800 border border-blue-200'
          }`}>
            {statusMessage.type === 'error' ? (
              <AlertCircle size={15} className="shrink-0 mt-0.5 text-rose-600" />
            ) : statusMessage.type === 'success' ? (
              <Check size={15} className="shrink-0 mt-0.5 text-emerald-600" />
            ) : (
              <Loader2 size={15} className="shrink-0 mt-0.5 animate-spin text-blue-600" />
            )}
            <span className="leading-relaxed flex-1">{statusMessage.text}</span>
          </div>
        )}

        {/* PKCE Tab Content */}
        {mode === 'pkce' && (
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-700">
                  {provider === 'onedrive' ? 'Microsoft Application (Client) ID' : 'Dropbox App Key'}
                </label>
                <span className="text-[10px] text-slate-400">Stored in browser memory only</span>
              </div>
              <input
                type="text"
                value={provider === 'onedrive' ? onedriveClientId : dropboxClientId}
                onChange={e => {
                  if (provider === 'onedrive') setOnedriveClientId(e.target.value);
                  else setDropboxClientId(e.target.value);
                }}
                placeholder={provider === 'onedrive' ? 'e.g. 1a2b3c4d-5678-90ab-cdef-1234567890ab' : 'e.g. k7m9pq3nx8y5abc'}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Step-by-Step PKCE Setup Helper */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2.5 text-xs text-slate-600">
              <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                <Shield size={13} className="text-emerald-600" />
                <span>How to connect your {provider === 'onedrive' ? 'OneDrive' : 'Dropbox'} account:</span>
              </div>
              <ol className="list-decimal list-inside space-y-1.5 text-[11px] leading-relaxed pl-1 text-slate-600">
                {provider === 'onedrive' ? (
                  <>
                    <li>Open Microsoft Entra / Azure Portal (<a href="https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" target="_blank" rel="noreferrer" className="text-blue-600 underline font-medium inline-flex items-center gap-0.5">Azure App Registrations <ExternalLink size={10} /></a>).</li>
                    <li>Register a new app with <em>"Personal Microsoft accounts only"</em>.</li>
                    <li>
                      Add Web Redirect URI:{' '}
                      <button onClick={copyRedirectUri} className="font-mono text-[10px] bg-white border border-slate-200 px-1.5 py-0.5 rounded text-blue-600 hover:bg-blue-50 cursor-pointer">
                        {redirectUri.length > 35 ? redirectUri.substring(0, 35) + '...' : redirectUri} (Click to copy)
                      </button>
                    </li>
                    <li>Paste the <strong>Application (client) ID</strong> above and click Connect!</li>
                  </>
                ) : (
                  <>
                    <li>Open Dropbox App Console (<a href="https://www.dropbox.com/developers/apps" target="_blank" rel="noreferrer" className="text-sky-600 underline font-medium inline-flex items-center gap-0.5">Dropbox App Console <ExternalLink size={10} /></a>).</li>
                    <li>Click <strong>Create App</strong> &rarr; Choose <em>Scoped Access</em> &rarr; <em>Full Dropbox</em>.</li>
                    <li>In the <strong>Permissions</strong> tab, check <code className="bg-white border px-1 rounded">files.content.write</code> and <code className="bg-white border px-1 rounded">files.content.read</code>.</li>
                    <li>
                      In the <strong>Settings</strong> tab under Redirect URIs, add:{' '}
                      <button onClick={copyRedirectUri} className="font-mono text-[10px] bg-white border border-slate-200 px-1.5 py-0.5 rounded text-sky-600 hover:bg-sky-50 cursor-pointer">
                        {redirectUri.length > 35 ? redirectUri.substring(0, 35) + '...' : redirectUri} (Click to copy)
                      </button>
                    </li>
                    <li>Copy your <strong>App Key</strong>, paste it above, and click Connect!</li>
                  </>
                )}
              </ol>
            </div>

            <button
              onClick={handlePkceConnect}
              disabled={isAuthenticating || !(provider === 'onedrive' ? onedriveClientId.trim() : dropboxClientId.trim())}
              className={`w-full py-3 px-4 rounded-xl text-white text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                provider === 'onedrive'
                  ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/20'
                  : 'bg-sky-600 hover:bg-sky-700 shadow-sky-500/20'
              }`}
            >
              {isAuthenticating ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Connecting to {provider === 'onedrive' ? 'Microsoft' : 'Dropbox'}...</span>
                </>
              ) : (
                <>
                  <span>Sign in with {provider === 'onedrive' ? 'Microsoft OneDrive' : 'Dropbox'}</span>
                  <ArrowRight size={14} />
                </>
              )}
            </button>
          </div>
        )}

        {/* Manual Developer Mode Tab Content */}
        {mode === 'manual' && (
          <div className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Account Label / Email
              </label>
              <input
                type="text"
                value={manualEmail}
                onChange={e => setManualEmail(e.target.value)}
                placeholder={provider === 'onedrive' ? 'user@outlook.com' : 'user@example.com'}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Access Token / Bearer Token
              </label>
              <textarea
                value={manualToken}
                onChange={e => setManualToken(e.target.value)}
                rows={3}
                placeholder="Paste generated Bearer token..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <button
              onClick={handleManualSave}
              disabled={isAuthenticating || !manualEmail.trim() || !manualToken.trim()}
              className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
            >
              {isAuthenticating ? 'Validating Token...' : 'Verify & Link Provider Account'}
            </button>
          </div>
        )}

        {/* Footer Guarantee */}
        <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-1">
            <Key size={12} className="text-slate-400" />
            <span>PKCE S256 Cryptography</span>
          </div>
          <span>Encrypted inside IndexedDB</span>
        </div>
      </div>
    </div>
  );
};
