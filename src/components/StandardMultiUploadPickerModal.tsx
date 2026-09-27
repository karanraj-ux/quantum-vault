import React, { useState } from 'react';
import { X, UploadCloud, HardDrive, CheckCircle2, Split } from 'lucide-react';
import { AccountToken } from '../types';

interface StandardMultiUploadPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  files: File[];
  accounts: AccountToken[];
  onConfirm: (allocation: 'single' | 'round-robin', selectedAccountId?: string) => void;
}

export const StandardMultiUploadPickerModal: React.FC<StandardMultiUploadPickerModalProps> = ({
  isOpen,
  onClose,
  files,
  accounts,
  onConfirm,
}) => {
  const [selectedAccountId, setSelectedAccountId] = useState<string>(accounts[0]?.id || '');
  const [strategy, setStrategy] = useState<'single' | 'round-robin'>('round-robin');

  if (!isOpen || files.length === 0) return null;

  const totalBytes = files.reduce((acc, f) => acc + f.size, 0);
  const formattedTotalSize = (totalBytes / (1024 * 1024)).toFixed(1);

  return (
    <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 border border-slate-200">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-start justify-between">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 mb-1 border border-emerald-200">
              <UploadCloud size={11} /> Batch Upload ({files.length} files)
            </div>
            <h3 className="font-bold text-base text-slate-900">
              Choose Multi-File Upload Destination
            </h3>
            <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[340px]">
              Total size: <span className="font-semibold text-slate-700">{formattedTotalSize} MB</span> across {files.length} selected files
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Strategy Selection */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Distribution Strategy
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setStrategy('round-robin')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  strategy === 'round-robin'
                    ? 'border-emerald-500 bg-emerald-50/50 ring-1 ring-emerald-500'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-xs text-slate-900">
                  <Split size={14} className="text-emerald-600 shrink-0" />
                  <span>Distribute Across Accounts</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1 leading-normal">
                  Evenly distributes the {files.length} files across all active drives to balance quota.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setStrategy('single')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  strategy === 'single'
                    ? 'border-emerald-500 bg-emerald-50/50 ring-1 ring-emerald-500'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-xs text-slate-900">
                  <HardDrive size={14} className="text-emerald-600 shrink-0" />
                  <span>Store in One Account</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1 leading-normal">
                  Puts all {files.length} files into a single selected Google Drive account.
                </p>
              </button>
            </div>
          </div>

          {/* If Single: Account list */}
          {strategy === 'single' && (
            <div className="space-y-2 pt-1 animate-in fade-in duration-100">
              <label className="text-xs font-semibold text-slate-600">
                Select Destination Account:
              </label>
              <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                {accounts.map(acc => (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => setSelectedAccountId(acc.id)}
                    className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all text-left cursor-pointer ${
                      selectedAccountId === acc.id
                        ? 'border-emerald-500 bg-emerald-50/60 ring-1 ring-emerald-500'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {acc.photoURL ? (
                        <img src={acc.photoURL} alt={acc.email || ''} className="w-7 h-7 rounded-full shrink-0 border border-slate-200" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center shrink-0 text-slate-600 font-bold text-xs">
                          {acc.email?.charAt(0).toUpperCase() || 'G'}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="font-semibold text-xs text-slate-900 truncate">
                          {acc.name || acc.email}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate">{acc.email}</div>
                      </div>
                    </div>
                    {selectedAccountId === acc.id && (
                      <CheckCircle2 size={16} className="text-emerald-600 shrink-0 ml-2" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Files Summary Preview */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs">
            <span className="font-semibold text-slate-700">Files to upload ({files.length}): </span>
            <span className="text-slate-500">
              {files.slice(0, 3).map(f => f.name).join(', ')}
              {files.length > 3 ? ` and ${files.length - 3} more` : ''}
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onConfirm(strategy, selectedAccountId)}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
            >
              <UploadCloud size={14} />
              <span>Start Uploading {files.length} Files</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
