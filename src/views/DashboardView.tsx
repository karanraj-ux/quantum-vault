import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  AlertCircle,
  RefreshCw,
  FileText,
  ArrowRight,
  HardDrive,
  ShieldCheck,
  Sparkles,
  Cpu,
} from 'lucide-react';
import { fetchAccountQuota } from '../services/multiCloudAdapter';
import { AccountToken, DriveFile } from '../types';

import { StorageQuotaInfo } from '../types';
import { UnifiedStoragePoolBar } from '../components/UnifiedStoragePoolBar';

interface DashboardViewProps {
  accounts: AccountToken[];
  filteredFiles: DriveFile[];
  handleLogin: (forceSelect?: boolean) => void;
  setCurrentView: (view: 'dashboard' | 'drive' | 'settings') => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  accounts,
  filteredFiles,
  handleLogin,
  setCurrentView,
}) => {
  const expiredAccounts = accounts.filter(acc => acc.isExpired);
  const activeAccounts = accounts.filter(acc => !acc.isExpired);

  const latestFiles = filteredFiles.slice(0, 3);

  
  const [accountQuotas, setAccountQuotas] = useState<{ [id: string]: StorageQuotaInfo }>({});
  const [isLoadingQuota, setIsLoadingQuota] = useState(false);

  useEffect(() => {
    const activeAccounts = accounts.filter(a => !a.isExpired);
    if (activeAccounts.length === 0) return;

    const loadQuotas = async () => {
      setIsLoadingQuota(true);
      const newQuotas: { [id: string]: StorageQuotaInfo } = {};
      await Promise.all(
        activeAccounts.map(async (acc) => {
          try {
            const q = await fetchAccountQuota(acc);
            newQuotas[acc.id] = q;
          } catch (e) {
            console.warn(`Failed to fetch quota for ${acc.email}`, e);
          }
        })
      );
      setAccountQuotas(newQuotas);
      setIsLoadingQuota(false);
    };
    loadQuotas();
  }, [accounts]);

  const quotaList = Object.values(accountQuotas) as StorageQuotaInfo[];
  const totalPooledBytes = quotaList.reduce((acc, q) => acc + (q.totalBytes || 0), 0);
  const totalVirtualStorageGb = totalPooledBytes > 0 
    ? Math.round(totalPooledBytes / (1024 * 1024 * 1024)) 
    : 0;


  return (
    <div className="flex-1 h-full bg-[#F8FAFC] text-slate-800 flex flex-col font-sans overflow-y-auto">
      <div className="p-6 md:p-8 max-w-7xl mx-auto w-full space-y-6 md:space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-blue-50 text-blue-600 border border-blue-200/70 flex items-center justify-center shrink-0 shadow-xs">
              <LayoutDashboard className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight leading-tight">
                Workspace Command Deck
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                {accounts.length > 0
                  ? `Quantum-safe vault across ${accounts.length} connected cloud account${accounts.length !== 1 ? 's' : ''} with client-side zero-server privacy.`
                  : 'Connect your Google Drive, OneDrive, or Dropbox accounts to pool storage.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentView('drive')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold border border-emerald-200 transition-colors shadow-xs cursor-pointer"
            >
              <HardDrive className="w-3.5 h-3.5 text-emerald-600" />
              <span>Quantum Vault</span>
            </button>
          </div>
        </div>

        {/* Quick Executive Stats Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Connected Profiles
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-2xl font-black text-slate-900">{accounts.length}</span>
              <span className="text-[11px] font-medium text-emerald-600">
                {activeAccounts.length} Active
              </span>
            </div>
          </div>

          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Pooled Storage
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-2xl font-black text-slate-900">{totalVirtualStorageGb} GB</span>
              <span className="text-[11px] font-medium text-emerald-600">RAID Array</span>
            </div>
          </div>

          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Vault Files
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-2xl font-black text-slate-900">{filteredFiles.length}</span>
              <span className="text-[11px] font-medium text-blue-600">Sharded</span>
            </div>
          </div>

          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Quantum Security
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-2xl font-black text-slate-900">ML-KEM</span>
              <span className="text-[11px] font-medium text-violet-600">Post-Quantum</span>
            </div>
          </div>
        </div>

        {/* Unified Storage Pool Bar (Aggregated Multi-Cloud Quotas) */}
        {accounts.length > 0 && (
          <UnifiedStoragePoolBar
            accounts={accounts}
            quotas={accountQuotas}
            onOpenRebalance={() => setCurrentView('drive')}
          />
        )}

        {/* Expired Accounts Warning */}
        {expiredAccounts.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-start md:items-center gap-3.5">
              <div className="w-10 h-10 bg-red-100 text-red-600 rounded-xl flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-red-900">Action Required: Session Expired</h3>
                <p className="text-xs text-red-700 mt-0.5">
                  OAuth tokens expired for the following profiles. Reconnect to resume synchronization:
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {expiredAccounts.map(acc => (
                    <span
                      key={acc.id}
                      className="text-[11px] font-medium text-red-800 bg-white/70 px-2.5 py-1 rounded-md border border-red-200"
                    >
                      {acc.email}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <button
              onClick={() => handleLogin(true)}
              className="w-full md:w-auto px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Reconnect
            </button>
          </div>
        )}

        {/* Explore Mode Quick Connect Bar (Shown when 0 accounts connected) */}
        {accounts.length === 0 && (
          <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-emerald-50 border border-blue-200/80 rounded-2xl p-6 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white text-blue-600 border border-blue-200 flex items-center justify-center shrink-0 shadow-xs">
                <Sparkles className="w-6 h-6 text-amber-500" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Explore Mode: Full Access Unlocked</h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  You are exploring Quantum Vault with interactive sample data. Connect Google, OneDrive, or Dropbox anytime. None of the keys or providers are mandatory!
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 w-full md:w-auto shrink-0 justify-end">
              <button
                onClick={() => handleLogin(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                + Google (15 GB)
              </button>
              <button
                onClick={() => setCurrentView('settings')}
                className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                + More Clouds
              </button>
            </div>
          </div>
        )}

        {/* Bento Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Virtual Drive Bento Widget */}
            <div className="bg-white border border-slate-200/90 rounded-2xl flex flex-col shadow-xs hover:shadow-sm transition-shadow h-[380px]">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
                    <HardDrive className="w-4 h-4" />
                  </span>
                  <h3 className="font-bold text-xs text-slate-900 uppercase tracking-wider">
                    Quantum Vault & Files
                  </h3>
                </div>
                <button
                  onClick={() => setCurrentView('drive')}
                  className="text-xs font-semibold text-emerald-600 hover:text-emerald-800 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  View All <ArrowRight className="w-3 h-3" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {latestFiles.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center p-6 text-center text-xs text-slate-400">
                    <HardDrive className="w-8 h-8 text-slate-300 mb-2 stroke-1" />
                    <p className="font-semibold text-slate-700">No vault files synced yet</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Drop files to shard or connect cloud accounts</p>
                  </div>
                ) : (
                  latestFiles.map(file => (
                    <div
                      key={file.id}
                      className="p-3 bg-slate-50/70 hover:bg-slate-100/80 rounded-xl border border-slate-200/70 flex items-start gap-2.5 transition-colors"
                    >
                      {file.iconLink ? (
                        <img src={file.iconLink} alt="" className="w-4 h-4 shrink-0 mt-0.5" />
                      ) : (
                        <FileText className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-xs text-slate-900 line-clamp-1 mb-0.5">
                          {file.name}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate">{file.accountEmail}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Quantum Security Bento Widget */}
            <div className="bg-white border border-slate-200/90 rounded-2xl flex flex-col shadow-xs hover:shadow-sm transition-shadow h-[380px]">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-violet-50 text-violet-600">
                    <Cpu className="w-4 h-4" />
                  </span>
                  <h3 className="font-bold text-xs text-slate-900 uppercase tracking-wider">
                    Quantum Security
                  </h3>
                </div>
                <button
                  onClick={() => setCurrentView('drive')}
                  className="text-xs font-semibold text-violet-600 hover:text-violet-800 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  Open Audit <ArrowRight className="w-3 h-3" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 flex flex-col justify-center gap-3">
                <div className="flex items-center gap-3 p-3 bg-violet-50/60 rounded-xl border border-violet-100">
                  <ShieldCheck className="w-5 h-5 text-violet-600 shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-slate-900">Harvest-Now-Decrypt-Later Defense</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">NIST ML-KEM-768 key exchange · ML-DSA signatures</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200/70">
                  <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-slate-900">No Single Provider Holds Your Data</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">Files sharded across your clouds with XOR parity</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200/70">
                  <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-slate-900">Quantum-Safe P2P Tunnel</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">Browser-to-browser transfer, no server in the middle</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
      </div>
    </div>
  );
};
