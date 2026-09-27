import React from 'react';
import { HardDrive, Cloud, AlertCircle, Sparkles, CheckCircle2, Scale } from 'lucide-react';
import { AccountToken, StorageQuotaInfo } from '../types';

interface UnifiedStoragePoolBarProps {
  accounts: AccountToken[];
  quotas: { [id: string]: StorageQuotaInfo };
  className?: string;
  compact?: boolean;
  onOpenRebalance?: () => void;
}

export const UnifiedStoragePoolBar: React.FC<UnifiedStoragePoolBarProps> = ({
  accounts,
  quotas,
  className = '',
  compact = false,
  onOpenRebalance,
}) => {
  const activeAccounts = accounts.filter(a => !a.isExpired);

  // Group accounts and quotas by provider
  let googleTotal = 0;
  let googleUsed = 0;
  let onedriveTotal = 0;
  let onedriveUsed = 0;
  let dropboxTotal = 0;
  let dropboxUsed = 0;

  activeAccounts.forEach(acc => {
    const q = quotas[acc.id];
    const provider = acc.provider || 'google';

    if (q) {
      if (provider === 'google') {
        googleTotal += q.totalBytes || 16106127360;
        googleUsed += q.usedBytes || 0;
      } else if (provider === 'onedrive') {
        onedriveTotal += q.totalBytes || 5368709120;
        onedriveUsed += q.usedBytes || 0;
      } else if (provider === 'dropbox') {
        dropboxTotal += q.totalBytes || 2147483648;
        dropboxUsed += q.usedBytes || 0;
      }
    } else {
      // Fallback default quotas
      if (provider === 'google') googleTotal += 16106127360;
      else if (provider === 'onedrive') onedriveTotal += 5368709120;
      else if (provider === 'dropbox') dropboxTotal += 2147483648;
    }
  });

  const totalPooledBytes = googleTotal + onedriveTotal + dropboxTotal;
  const totalUsedBytes = googleUsed + onedriveUsed + dropboxUsed;
  const totalFreeBytes = Math.max(0, totalPooledBytes - totalUsedBytes);

  const totalPooledGb = (totalPooledBytes / (1024 ** 3)).toFixed(1);
  const totalUsedGb = (totalUsedBytes / (1024 ** 3)).toFixed(1);
  const totalFreeGb = (totalFreeBytes / (1024 ** 3)).toFixed(1);

  const googleGb = Math.round(googleTotal / (1024 ** 3));
  const onedriveGb = Math.round(onedriveTotal / (1024 ** 3));
  const dropboxGb = Math.round(dropboxTotal / (1024 ** 3));

  // Build formula parts (e.g. Google (15GB) + OneDrive (5GB) + Dropbox (2GB) = 22GB total pooled)
  const formulaParts: string[] = [];
  if (googleTotal > 0) formulaParts.push(`Google (${googleGb}GB)`);
  if (onedriveTotal > 0) formulaParts.push(`OneDrive (${onedriveGb}GB)`);
  if (dropboxTotal > 0) formulaParts.push(`Dropbox (${dropboxGb}GB)`);

  const formulaText = formulaParts.length > 0
    ? `${formulaParts.join(' + ')} = ${Math.round(totalPooledBytes / (1024 ** 3))}GB total pooled`
    : 'No accounts linked';

  // Percentage calculations for the multi-colored segmented bar
  const totalSafe = Math.max(1, totalPooledBytes);
  const googlePct = Math.min(100, (googleTotal / totalSafe) * 100);
  const onedrivePct = Math.min(100, (onedriveTotal / totalSafe) * 100);
  const dropboxPct = Math.min(100, (dropboxTotal / totalSafe) * 100);

  const usedPct = Math.min(100, Math.round((totalUsedBytes / totalSafe) * 100));

  if (compact) {
    return (
      <div className={`space-y-1.5 ${className}`}>
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-semibold text-slate-700 flex items-center gap-1">
            <HardDrive size={12} className="text-emerald-600" />
            <span>Pooled Storage</span>
          </span>
          <span className="font-bold text-slate-900">{totalPooledGb} GB</span>
        </div>
        <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden flex">
          {googleTotal > 0 && (
            <div
              style={{ width: `${googlePct}%` }}
              className="h-full bg-emerald-500 transition-all duration-500"
              title={`Google: ${googleGb} GB`}
            />
          )}
          {onedriveTotal > 0 && (
            <div
              style={{ width: `${onedrivePct}%` }}
              className="h-full bg-blue-600 transition-all duration-500"
              title={`OneDrive: ${onedriveGb} GB`}
            />
          )}
          {dropboxTotal > 0 && (
            <div
              style={{ width: `${dropboxPct}%` }}
              className="h-full bg-sky-500 transition-all duration-500"
              title={`Dropbox: ${dropboxGb} GB`}
            />
          )}
        </div>
        <p className="text-[10px] text-slate-400 font-mono truncate" title={formulaText}>
          {formulaText}
        </p>
      </div>
    );
  }

  return (
    <div className={`bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs space-y-4 ${className}`}>
      {/* Header and Aggregate Formula */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 via-blue-600 to-sky-500 text-white flex items-center justify-center shadow-xs">
            <HardDrive className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                Unified Multi-Cloud Storage Pool
              </h3>
              <span className="text-xs text-emerald-600 font-semibold">· RAID-5 Ready</span>
            </div>
            <p className="text-xs text-slate-500 font-mono mt-0.5 font-medium">
              {formulaText}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 self-end sm:self-auto">
          {onOpenRebalance && activeAccounts.length > 1 && (
            <button
              onClick={onOpenRebalance}
              className="px-2.5 py-1 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Scale size={12} className="text-blue-600" />
              <span>Rebalance</span>
            </button>
          )}

          <div className="text-right">
            <div className="text-lg font-black text-slate-900 tracking-tight">
              {totalFreeGb} GB <span className="text-xs font-normal text-slate-400">free of {totalPooledGb} GB</span>
            </div>
            <div className="text-[11px] text-slate-400 font-medium">
              {usedPct}% capacity consumed
            </div>
          </div>
        </div>
      </div>

      {/* Segmented Multi-Color Progress Bar */}
      <div className="space-y-1.5">
        <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden flex shadow-inner">
          {googleTotal > 0 && (
            <div
              style={{ width: `${googlePct}%` }}
              className="h-full bg-emerald-500 hover:brightness-110 transition-all duration-500"
              title={`Google Drive: ${googleGb} GB`}
            />
          )}
          {onedriveTotal > 0 && (
            <div
              style={{ width: `${onedrivePct}%` }}
              className="h-full bg-blue-600 hover:brightness-110 transition-all duration-500"
              title={`Microsoft OneDrive: ${onedriveGb} GB`}
            />
          )}
          {dropboxTotal > 0 && (
            <div
              style={{ width: `${dropboxPct}%` }}
              className="h-full bg-sky-500 hover:brightness-110 transition-all duration-500"
              title={`Dropbox: ${dropboxGb} GB`}
            />
          )}
        </div>

        <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
          <span>0 GB</span>
          <span className="font-semibold text-slate-500">{totalPooledGb} GB Pooled Maximum</span>
        </div>
      </div>

      {/* Provider Details Breakdown Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
        {/* Google Card */}
        <div className="p-2.5 rounded-xl border border-slate-200/80 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
            <div>
              <div className="text-xs font-semibold text-slate-800">Google Drive</div>
              <div className="text-[10px] text-slate-400">
                {(googleUsed / (1024 ** 3)).toFixed(1)} / {googleGb} GB
              </div>
            </div>
          </div>
          <span className="text-[11px] font-bold text-slate-700">
            {googleTotal > 0 ? `${Math.round((googleTotal / totalSafe) * 100)}%` : '0%'}
          </span>
        </div>

        {/* OneDrive Card */}
        <div className="p-2.5 rounded-xl border border-slate-200/80 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600 shrink-0" />
            <div>
              <div className="text-xs font-semibold text-slate-800">Microsoft OneDrive</div>
              <div className="text-[10px] text-slate-400">
                {(onedriveUsed / (1024 ** 3)).toFixed(1)} / {onedriveGb} GB
              </div>
            </div>
          </div>
          <span className="text-[11px] font-bold text-slate-700">
            {onedriveTotal > 0 ? `${Math.round((onedriveTotal / totalSafe) * 100)}%` : '0%'}
          </span>
        </div>

        {/* Dropbox Card */}
        <div className="p-2.5 rounded-xl border border-slate-200/80 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-500 shrink-0" />
            <div>
              <div className="text-xs font-semibold text-slate-800">Dropbox</div>
              <div className="text-[10px] text-slate-400">
                {(dropboxUsed / (1024 ** 3)).toFixed(1)} / {dropboxGb} GB
              </div>
            </div>
          </div>
          <span className="text-[11px] font-bold text-slate-700">
            {dropboxTotal > 0 ? `${Math.round((dropboxTotal / totalSafe) * 100)}%` : '0%'}
          </span>
        </div>
      </div>
    </div>
  );
};
