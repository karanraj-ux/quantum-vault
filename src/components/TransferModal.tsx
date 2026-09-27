import React from 'react';
import { ArrowRightLeft, X, CheckCircle2, Loader2, Layers } from 'lucide-react';
import { AccountToken, DriveFile } from '../types';

interface TransferModalProps {
  transferFile: DriveFile | null;
  setTransferFile: (file: DriveFile | null) => void;
  isTransferring: boolean;
  transferSuccess: boolean;
  accounts: AccountToken[];
  executeCrossAccountTransfer: (targetAccountId: string) => void;
}

export const TransferModal: React.FC<TransferModalProps> = ({
  transferFile,
  setTransferFile,
  isTransferring,
  transferSuccess,
  accounts,
  executeCrossAccountTransfer
}) => {
  if (!transferFile) return null;

  return (
    <div className="fixed inset-0 z-[110] bg-white/80 backdrop-blur-sm flex justify-center items-center p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-[#0a0a0a] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        <div className="p-5 border-b border-white/5 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-lg text-white flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-emerald-400" /> Direct Account Transfer
              </h3>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/30 font-medium">
                Standard
              </span>
            </div>
            <p className="text-xs text-neutral-400 mt-1 truncate max-w-[280px]">
              Transferring: <b className="text-white">{transferFile.name}</b>
            </p>
          </div>
          <button onClick={() => !isTransferring && setTransferFile(null)} className="p-2 hover:bg-white/5 rounded-full text-neutral-400">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {transferSuccess ? (
            <div className="flex flex-col items-center justify-center py-8 text-green-400">
              <CheckCircle2 size={48} className="mb-4 animate-in zoom-in" />
              <p className="font-bold">Transfer Complete!</p>
            </div>
          ) : isTransferring ? (
            <div className="flex flex-col items-center justify-center py-8 text-neutral-400">
              <Loader2 size={40} className="animate-spin mb-4 text-blue-500" />
              <p className="font-medium">Routing file across accounts...</p>
              <p className="text-xs text-neutral-400 mt-2 text-center px-8">Downloading from source and streaming to destination directly through your browser.</p>
            </div>
          ) : (
            <>
              <div className="text-sm font-semibold text-white mb-2">Select Destination Account:</div>
              <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                {accounts.filter(a => a.id !== transferFile.accountId).map(acc => (
                  <button 
                    key={acc.id}
                    onClick={() => executeCrossAccountTransfer(acc.id)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl border border-white/10 hover:border-black hover:bg-[#111111] transition-all text-left group"
                  >
                    {acc.photoURL ? (
                      <img src={acc.photoURL} alt="" className="w-8 h-8 rounded-full" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-neutral-200 flex items-center justify-center">
                        <Layers className="w-4 h-4 text-neutral-500" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white truncate">{acc.email}</div>
                      <div className="text-[10px] text-neutral-500 font-mono">ID: {acc.id.substring(0, 8)}...</div>
                    </div>
                    <div className="w-6 h-6 rounded-full bg-white text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <ArrowRightLeft size={12} />
                    </div>
                  </button>
                ))}
                {accounts.length <= 1 && (
                  <div className="text-center py-6 text-sm text-neutral-500">
                    You need at least two Google accounts connected to use Magic Transfer.
                  </div>
                )}
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
};
