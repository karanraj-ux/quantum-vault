import React from 'react';
import { X, UploadCloud, HardDrive, CheckCircle2 } from 'lucide-react';
import { AccountToken } from '../types';

interface StandardUploadPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  file: File | null;
  accounts: AccountToken[];
  onSelectAccount: (accountId: string) => void;
}

export const StandardUploadPickerModal: React.FC<StandardUploadPickerModalProps> = ({
  isOpen,
  onClose,
  file,
  accounts,
  onSelectAccount,
}) => {
  if (!isOpen || !file) return null;

  return (
    <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 border border-slate-200">
        <div className="p-5 border-b border-slate-100 flex items-start justify-between">
          <div>
            <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
              <UploadCloud className="w-5 h-5 text-emerald-600" /> Choose Destination Account
            </h3>
            <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[280px]">
              Uploading: <span className="font-semibold text-slate-700">{file.name}</span> ({(file.size / (1024 * 1024)).toFixed(2)} MB)
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
            Which Google Drive should store this file?
          </p>

          <div className="space-y-2 max-h-[45vh] overflow-y-auto pr-1">
            {accounts.map(acc => (
              <button
                key={acc.id}
                onClick={() => onSelectAccount(acc.id)}
                className="w-full flex items-center justify-between p-3.5 rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/50 transition-all text-left group cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {acc.photoURL ? (
                    <img src={acc.photoURL} alt={acc.email} className="w-9 h-9 rounded-full shrink-0 border border-slate-200" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center shrink-0 text-slate-600 font-bold text-xs">
                      {acc.email.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="font-semibold text-xs text-slate-900 truncate group-hover:text-emerald-700">
                      {acc.name || acc.email}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate">{acc.email}</div>
                  </div>
                </div>

                <div className="shrink-0 text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity pl-2">
                  <CheckCircle2 size={18} />
                </div>
              </button>
            ))}
          </div>

          <div className="pt-2 text-[11px] text-slate-400 flex items-center gap-1.5">
            <HardDrive size={13} />
            <span>Standard mode uploads directly with native Google Drive web sharing.</span>
          </div>
        </div>
      </div>
    </div>
  );
};
