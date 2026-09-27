import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Download, Sparkles, Shield, CheckCircle2, AlertCircle, Loader2, X, HardDrive, LogIn, RotateCcw } from 'lucide-react';
import { ShardManifest, downloadShardedFile } from '../services/shardingService';
import { AccountToken } from '../types';

interface PublicMagicDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  manifest: ShardManifest | null;
  accounts: AccountToken[];
  onImportSuccess?: () => void;
  onConnectAccount?: () => void;
}

export const PublicMagicDownloadModal: React.FC<PublicMagicDownloadModalProps> = ({
  isOpen,
  onClose,
  manifest,
  accounts,
  onImportSuccess,
  onConnectAccount,
}) => {
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('');
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen || !manifest) return null;

  const fileSizeMb = (manifest.totalSize / (1024 * 1024)).toFixed(2);
  const hasParity = !!manifest.parityChunk;
  const hasConnectedAccount = accounts.some(a => !a.isExpired);

  const handleStartDownload = async () => {
    try {
      setDownloading(true);
      setErrorMessage('');
      setProgress(0);
      setStage('Connecting to multi-cloud chunk mirrors...');

      // Download and decrypt client-side
      const blob = await downloadShardedFile(
        manifest,
        accounts,
        (prog, completed, total, currentStage) => {
          setProgress(prog);
          if (currentStage) setStage(currentStage);
        },
        manifest.magicKey
      );

      // Trigger browser download
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = manifest.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);

      setDownloadSuccess(true);
      if (onImportSuccess) onImportSuccess();
    } catch (err: any) {
      console.error('Magic download failed:', err);
      setErrorMessage(
        err.message || 'Download failed. One or more chunk hosts could not be reached.'
      );
    } finally {
      setDownloading(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-5 relative overflow-hidden"
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-5 right-5 p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>

          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center shrink-0 shadow-xs">
              <Sparkles size={22} />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-bold">
                <Shield size={11} /> Zero-Knowledge Sovereign Link
              </div>
              <h3 className="text-lg font-bold text-slate-900 leading-snug mt-0.5">
                Vault Reconstitution & Download
              </h3>
            </div>
          </div>

          {/* File summary card */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/90 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
                  Filename
                </div>
                <div className="text-sm font-bold text-slate-800 truncate" title={manifest.filename}>
                  {manifest.filename}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
                  Size
                </div>
                <div className="text-sm font-bold text-slate-800 font-mono">
                  {fileSizeMb} MB
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/60 text-xs">
              <div>
                <span className="text-slate-400 font-medium">Architecture:</span>{' '}
                <span className="font-semibold text-slate-700">
                  {manifest.dataChunksCount} Shards + {hasParity ? 'RAID-5 Parity' : 'No Parity'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 font-medium">Encryption:</span>{' '}
                <span className="font-semibold text-emerald-700">
                  {manifest.isEncrypted ? 'AES-256-GCM' : 'None'}
                </span>
              </div>
            </div>
          </div>

          {/* Download progress or status */}
          {downloading && (
            <div className="space-y-2 py-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                <div className="flex items-center gap-2">
                  <Loader2 size={13} className="animate-spin text-indigo-600" />
                  <span className="truncate max-w-[280px]">{stage || 'Downloading shards...'}</span>
                </div>
                <span className="font-mono text-indigo-600">{progress}%</span>
              </div>
              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {downloadSuccess && (
            <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2.5 font-medium">
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              <span>
                File reassembled and decrypted successfully! Check your browser's download folder.
              </span>
            </div>
          )}

          {errorMessage && (
            <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-xs space-y-2">
              <div className="flex items-start gap-2.5 font-medium">
                <AlertCircle size={16} className="text-red-600 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">{errorMessage}</div>
              </div>

              {onConnectAccount && !hasConnectedAccount && (
                <div className="pt-1.5 border-t border-red-200/70 flex flex-col gap-1.5">
                  <p className="text-[11px] text-red-700">
                    If this file is striped across your private accounts, sign into Google to authenticate private shard retrieval:
                  </p>
                  <button
                    onClick={() => {
                      onClose();
                      onConnectAccount();
                    }}
                    className="w-full py-2 px-3 rounded-xl bg-white hover:bg-red-50 border border-red-300 text-red-900 font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <LogIn size={13} className="text-red-600" />
                    <span>Sign In with Google to Download</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
            <button
              onClick={handleStartDownload}
              disabled={downloading}
              className="flex-1 py-3 px-5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold transition-all shadow-md hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
            >
              {downloading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Reassembling in Browser...</span>
                </>
              ) : downloadSuccess ? (
                <>
                  <Download size={16} />
                  <span>Download Again</span>
                </>
              ) : errorMessage ? (
                <>
                  <RotateCcw size={16} />
                  <span>Retry Download</span>
                </>
              ) : (
                <>
                  <Download size={16} />
                  <span>Download & Decrypt ({fileSizeMb} MB)</span>
                </>
              )}
            </button>

            <button
              onClick={onClose}
              className="py-3 px-5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold transition-colors cursor-pointer"
            >
              {downloadSuccess ? 'Done' : 'Cancel'}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
