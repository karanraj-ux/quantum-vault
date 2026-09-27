import React from 'react';
import {
  Layers,
  FileText,
  AlertCircle,
  Plus,
  Loader2,
  LogOut,
  LayoutDashboard,
  Shield,
  HardDrive,
  Check,
  Cloud,
} from 'lucide-react';
import { AccountToken } from '../types';
import { UnifiedStoragePoolBar } from './UnifiedStoragePoolBar';

interface SidebarProps {
  currentView: 'dashboard' | 'drive' | 'settings';
  setCurrentView: (view: 'dashboard' | 'drive' | 'settings') => void;
  accounts: AccountToken[];
  activeAccountIds: Set<string>;
  toggleAccountActive: (id: string) => void;
  handleLogin: (forceSelect?: boolean) => void;
  isAddingAccount: boolean;
  launchDeepWork: (urlTemplate: string, accountId: string) => void;
  handleLogoutAll: () => void;
  isMobileMenuOpen?: boolean;
  closeMobileMenu?: () => void;
  onAddMultiCloudAccount?: (provider: 'onedrive' | 'dropbox') => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  setCurrentView,
  accounts,
  activeAccountIds,
  toggleAccountActive,
  handleLogin,
  isAddingAccount,
  handleLogoutAll,
  isMobileMenuOpen = false,
  closeMobileMenu = () => {},
  onAddMultiCloudAccount,
}) => {
  const getProviderBadge = (provider?: string) => {
    switch (provider) {
      case 'onedrive':
        return <span className="text-[9px] font-bold px-1 rounded bg-blue-100 text-blue-700">OneDrive</span>;
      case 'dropbox':
        return <span className="text-[9px] font-bold px-1 rounded bg-sky-100 text-sky-700">Dropbox</span>;
      default:
        return <span className="text-[9px] font-bold px-1 rounded bg-amber-100 text-amber-700">Google</span>;
    }
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-slate-900/30 backdrop-blur-xs z-40 md:hidden"
          onClick={closeMobileMenu}
        />
      )}

      <div
        className={`${
          isMobileMenuOpen ? 'fixed inset-y-0 left-0 z-50 flex shadow-2xl' : 'hidden'
        } md:relative md:flex w-64 bg-white text-slate-800 border-r border-slate-200/90 flex-col shrink-0 select-none`}
      >
        {/* Workspace Brand Header */}
        <div className="h-16 flex items-center justify-between px-5 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold shadow-xs">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-sm tracking-tight text-slate-900">QUANTUM VAULT</div>
              <div className="text-[10px] text-slate-400 font-medium">Post-Quantum Secure</div>
            </div>
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-100">
            v3.0
          </span>
        </div>

        <div className="flex-1 overflow-y-auto py-5 flex flex-col gap-6 px-3">
          {/* Core Navigation Items */}
          <div className="space-y-1">
            <div className="px-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Modules
            </div>

            <button
              onClick={() => setCurrentView('dashboard')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                currentView === 'dashboard'
                  ? 'bg-slate-100 text-slate-900 font-semibold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <LayoutDashboard
                className={`w-4 h-4 ${
                  currentView === 'dashboard' ? 'text-blue-600' : 'text-slate-400'
                }`}
              />
              <span>Dashboard</span>
            </button>

            <button
              onClick={() => setCurrentView('drive')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                currentView === 'drive'
                  ? 'bg-slate-100 text-slate-900 font-semibold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <HardDrive
                className={`w-4 h-4 ${
                  currentView === 'drive' ? 'text-emerald-600' : 'text-slate-400'
                }`}
              />
              <span className="flex-1 text-left">Virtual Drive</span>
              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                RAID-5
              </span>
            </button>

            <button
              onClick={() => setCurrentView('settings')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                currentView === 'settings'
                  ? 'bg-slate-100 text-slate-900 font-semibold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Shield
                className={`w-4 h-4 ${
                  currentView === 'settings' ? 'text-slate-800' : 'text-slate-400'
                }`}
              />
              <span>Security & Accounts</span>
            </button>
          </div>

          {/* Connected Multi-Cloud Accounts Manager */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Multi-Cloud ({accounts.length})
              </span>
              <span className="text-[10px] font-medium text-slate-400">
                {activeAccountIds.size} Active
              </span>
            </div>

            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {accounts.length === 0 ? (
                <div className="text-[11px] text-slate-400 py-2 text-center">
                  No accounts linked yet.
                </div>
              ) : (
                accounts.map(acc => {
                  const isActive = activeAccountIds.has(acc.id);
                  return (
                    <div
                      key={acc.id}
                      onClick={() => toggleAccountActive(acc.id)}
                      className={`flex items-center gap-2 p-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
                        isActive ? 'bg-white border border-slate-200 shadow-2xs' : 'opacity-60 hover:opacity-100'
                      }`}
                    >
                      <div className="shrink-0">
                        {isActive ? (
                          <div className="w-4 h-4 rounded bg-blue-600 text-white flex items-center justify-center">
                            <Check size={11} strokeWidth={3} />
                          </div>
                        ) : (
                          <div className="w-4 h-4 rounded border border-slate-300" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span
                            className={`truncate font-medium text-[11px] ${
                              isActive ? 'text-slate-900' : 'text-slate-500'
                            }`}
                          >
                            {acc.email}
                          </span>
                          {getProviderBadge(acc.provider)}
                        </div>
                      </div>

                      {acc.isExpired && (
                        <div title="Session Expired" className="shrink-0">
                          <AlertCircle size={13} className="text-amber-500" />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Provider Add Buttons */}
            <div className="pt-2 border-t border-slate-200/60 flex flex-col gap-1.5">
              <button
                onClick={() => handleLogin(true)}
                disabled={isAddingAccount}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-semibold text-slate-700 shadow-2xs transition-all cursor-pointer"
              >
                {isAddingAccount ? (
                  <Loader2 size={12} className="animate-spin text-slate-400" />
                ) : (
                  <Plus size={12} />
                )}
                <span>Add Google Drive</span>
              </button>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => onAddMultiCloudAccount?.('onedrive')}
                  className="flex items-center justify-center gap-1 py-1 rounded-lg border border-blue-200 bg-blue-50/50 hover:bg-blue-100/50 text-[10px] font-semibold text-blue-700 transition-all cursor-pointer"
                  title="Add Microsoft OneDrive access token"
                >
                  <Cloud size={11} /> + OneDrive
                </button>
                <button
                  onClick={() => onAddMultiCloudAccount?.('dropbox')}
                  className="flex items-center justify-center gap-1 py-1 rounded-lg border border-sky-200 bg-sky-50/50 hover:bg-sky-100/50 text-[10px] font-semibold text-sky-700 transition-all cursor-pointer"
                  title="Add Dropbox access token"
                >
                  <Cloud size={11} /> + Dropbox
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Compact Unified Storage Bar & signout */}
        <div className="p-3 border-t border-slate-100 shrink-0 space-y-2.5">
          {accounts.length > 0 && (
            <UnifiedStoragePoolBar accounts={accounts} quotas={{}} compact={true} />
          )}

          <button
            onClick={handleLogoutAll}
            className="w-full flex items-center justify-center gap-2 py-2 text-xs font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all cursor-pointer"
          >
            <LogOut size={13} />
            <span>Sign Out & Purge Tokens</span>
          </button>
        </div>
      </div>
    </>
  );
};
