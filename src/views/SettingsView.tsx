import React, { useState } from 'react';
import { Shield, Key, Lock, Cloud, Plus, Trash2 } from 'lucide-react';
import { AccountToken } from '../types';
import { ConnectMultiCloudModal } from '../components/ConnectMultiCloudModal';

interface SettingsViewProps {
  isByokMode: boolean;
  setIsByokMode: (val: boolean) => void;
  customClientId: string;
  setCustomClientId: (val: string) => void;
  handleLogin?: (forceSelect?: boolean) => void;
  accounts: AccountToken[];
  onAddMultiCloudAccount: (account: AccountToken) => void;
  onRemoveAccount: (id: string) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  isByokMode,
  setIsByokMode,
  customClientId,
  setCustomClientId,
  handleLogin,
  accounts,
  onAddMultiCloudAccount,
  onRemoveAccount,
}) => {
  // Real PKCE Connect Modal state
  const [connectModalProvider, setConnectModalProvider] = useState<'onedrive' | 'dropbox' | null>(null);

  // Multi-Cloud BYOK Keys in localStorage
  const [onedriveClientId, setOnedriveClientId] = useState(() => localStorage.getItem('matrix_onedrive_client_id') || '');
  const [dropboxClientId, setDropboxClientId] = useState(() => localStorage.getItem('matrix_dropbox_client_id') || '');

  return (
    <div className="flex-1 h-full bg-[#F8FAFC] text-slate-800 flex flex-col font-sans overflow-y-auto">
      <div className="p-6 md:p-8 max-w-3xl mx-auto w-full space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-slate-100 text-slate-700 border border-slate-200/80 flex items-center justify-center shrink-0 shadow-xs">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight leading-tight">
              Multi-Cloud & BYOK Security
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Manage Google Drive, Microsoft OneDrive, Dropbox accounts, client-side encryption keys, and OAuth.
            </p>
          </div>
        </div>

        {/* Multi-Cloud Provider Accounts Manager */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cloud className="w-4 h-4 text-blue-600" />
              <h2 className="text-sm font-bold text-slate-900">Multi-Cloud Provider Array</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setConnectModalProvider('onedrive')}
                className="px-2.5 py-1 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Plus size={12} /> Connect OneDrive
              </button>
              <button
                onClick={() => setConnectModalProvider('dropbox')}
                className="px-2.5 py-1 rounded-lg border border-sky-200 bg-sky-50 hover:bg-sky-100 text-sky-700 text-xs font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Plus size={12} /> Connect Dropbox
              </button>
            </div>
          </div>

          <p className="text-xs text-slate-500 leading-relaxed">
            By connecting Microsoft OneDrive (5 GB free) and Dropbox (2 GB free) alongside Google Drive (15 GB free),
            your virtual RAID-5 hard drive achieves <strong>multi-cloud vendor immunity</strong>. Even if Google bans
            an account, files can be recovered via erasure coding.
          </p>

          <div className="space-y-2 pt-2">
            {accounts.length === 0 ? (
              <div className="text-center py-4 text-xs text-slate-400">No accounts linked yet.</div>
            ) : (
              accounts.map(acc => {
                const provider = acc.provider || 'google';
                return (
                  <div
                    key={acc.id}
                    className="flex items-center justify-between p-3 rounded-xl border border-slate-200/80 bg-slate-50/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center font-bold text-xs">
                        {provider === 'onedrive' ? 'MS' : provider === 'dropbox' ? 'DB' : 'GD'}
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                          <span>{acc.email}</span>
                          <span
                            className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                              provider === 'onedrive'
                                ? 'bg-blue-100 text-blue-800'
                                : provider === 'dropbox'
                                ? 'bg-sky-100 text-sky-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {provider}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {acc.quota
                            ? `Storage: ${(acc.quota.usedBytes / 1024 / 1024 / 1024).toFixed(1)} GB / ${(
                                acc.quota.totalBytes /
                                1024 /
                                1024 /
                                1024
                              ).toFixed(1)} GB`
                            : 'Storage active'}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => onRemoveAccount(acc.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-white transition-colors cursor-pointer"
                      title="Remove Account"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* BYOK Card */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="p-6 border-b border-slate-100">
            <div className="flex items-center gap-2 mb-1">
              <Key className="w-4 h-4 text-blue-600" />
              <h2 className="text-sm font-bold text-slate-900">Optional: Bring Your Own Key (BYOK)</h2>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed mb-3">
              Matrix operates purely in your browser runtime without backend database servers. You can explore and use the app with default credentials or dev tokens anytime.
            </p>
            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-800 leading-relaxed">
              ✨ <strong>100% Optional & Flexible:</strong> You do <em>not</em> need to configure all 3 providers or keys. If you only want Google Drive, it works 100%. If you only want OneDrive or Dropbox, it works 100%. The app will never block or stop working if you don't add all keys.
            </div>
          </div>

          <div className="p-6 bg-slate-50/60 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-slate-900 text-xs">Custom Multi-Cloud Client IDs</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Bypass shared origin quotas with your custom Cloud Console projects
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={isByokMode}
                  onChange={e => setIsByokMode(e.target.checked)}
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            {isByokMode && (
              <div className="pt-4 border-t border-slate-200 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Google OAuth Client ID</label>
                  <input
                    type="text"
                    value={customClientId}
                    onChange={e => setCustomClientId(e.target.value)}
                    placeholder="e.g. 123456789-abcde.apps.googleusercontent.com"
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none font-mono"
                  />
                  <div className="text-[11px] text-slate-500 flex items-center flex-wrap gap-1.5 mt-1.5">
                    <span>Google Scopes:</span>
                    <code className="bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded text-[10px]">drive</code>
                    <code className="bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded text-[10px]">drive.appdata</code>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Microsoft Azure Application (Client) ID</label>
                  <input
                    type="text"
                    value={onedriveClientId}
                    onChange={e => {
                      setOnedriveClientId(e.target.value);
                      localStorage.setItem('matrix_onedrive_client_id', e.target.value.trim());
                    }}
                    placeholder="e.g. 1a2b3c4d-5678-90ab-cdef-1234567890ab"
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none font-mono"
                  />
                  <div className="text-[11px] text-slate-500 flex items-center flex-wrap gap-1.5 mt-1.5">
                    <span>OneDrive Scopes:</span>
                    <code className="bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded text-[10px]">Files.ReadWrite</code>
                    <code className="bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded text-[10px]">User.Read</code>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Dropbox App Key</label>
                  <input
                    type="text"
                    value={dropboxClientId}
                    onChange={e => {
                      setDropboxClientId(e.target.value);
                      localStorage.setItem('matrix_dropbox_client_id', e.target.value.trim());
                    }}
                    placeholder="e.g. k7m9pq3nx8y5abc"
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none font-mono"
                  />
                  <div className="text-[11px] text-slate-500 flex items-center flex-wrap gap-1.5 mt-1.5">
                    <span>Dropbox Scopes:</span>
                    <code className="bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded text-[10px]">files.content.write</code>
                    <code className="bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded text-[10px]">files.content.read</code>
                  </div>
                </div>

                {handleLogin && customClientId && customClientId.trim() !== '' && (
                  <button
                    onClick={() => handleLogin(true)}
                    className="mt-2 w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                  >
                    Save & Authenticate Custom Profile
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Zero Server Guarantee */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex items-start gap-3.5">
          <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600 shrink-0">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-900 mb-0.5">Zero-Server Architecture Guarantee</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Tokens and encryption keys are stored exclusively in your browser's local IndexedDB container (
              <code className="text-slate-700">idb-keyval</code>). No telemetry, chunk manifests, or email bodies are
              ever transmitted to third-party databases.
            </p>
          </div>
        </div>
      </div>

      {/* CONNECT ONEDRIVE / DROPBOX PKCE MODAL */}
      {connectModalProvider && (
        <ConnectMultiCloudModal
          isOpen={true}
          initialProvider={connectModalProvider}
          onClose={() => setConnectModalProvider(null)}
          onAccountAdded={(newAcc) => {
            onAddMultiCloudAccount(newAcc);
            setConnectModalProvider(null);
          }}
        />
      )}
    </div>
  );
};
