import React, { useState } from 'react';
import { X, Check, Copy, ExternalLink, Globe, HardDrive, QrCode } from 'lucide-react';
import { QRCodeCard } from './QRCodeCard';

interface StandardShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  url: string;
  filename: string;
  accountEmail: string;
  title?: string;
}

export const StandardShareModal: React.FC<StandardShareModalProps> = ({
  isOpen,
  onClose,
  url,
  filename,
  accountEmail,
  title = 'Public Link & QR Code',
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      console.warn('Clipboard write failed, selecting text instead', e);
    }
  };

  return (
    <div className="fixed inset-0 z-[130] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 border border-slate-200">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-start justify-between bg-gradient-to-r from-emerald-50/50 to-white">
          <div>
            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 mb-1.5 border border-emerald-200">
              <Globe size={11} /> Universal Public Link Ready
            </div>
            <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
              {title}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[340px]">
              File: <span className="font-semibold text-slate-700">{filename}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-500 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
            <span className="flex items-center gap-1.5 font-medium text-slate-700">
              <HardDrive size={13} className="text-emerald-600" /> Stored in:
            </span>
            <span className="font-mono text-slate-900 truncate max-w-[240px] font-semibold">
              {accountEmail}
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Public Shareable Google Drive Link
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={url}
                onClick={e => (e.target as HTMLInputElement).select()}
                className="flex-1 bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 select-all focus:outline-hidden focus:border-emerald-500 focus:bg-white transition-all shadow-xs"
              />
              <button
                onClick={handleCopy}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 shadow-xs cursor-pointer ${
                  copied
                    ? 'bg-emerald-600 text-white'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white active:scale-95'
                }`}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                <span>{copied ? 'Copied!' : 'Copy Link'}</span>
              </button>
            </div>
          </div>

          {/* QR Code Quick Scan for Mobile */}
          <QRCodeCard
            url={url}
            title="Scan with Phone to Open"
            subtitle="Instantly open this Google Drive file on your smartphone camera"
          />

          <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-xl p-3 text-xs text-emerald-900 space-y-1">
            <div className="font-semibold flex items-center gap-1.5 text-emerald-950">
              <Globe size={13} className="text-emerald-600" /> Instant Zero-Setup Sharing
            </div>
            <p className="text-[11px] leading-relaxed text-emerald-800">
              Anyone with this link or QR code can view or download this file directly in their web browser via Google Drive. No Quantum Vault account, zero-knowledge keys, or authentication required for the recipient.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 py-1.5 transition-colors"
            >
              <ExternalLink size={13} /> Open in Google Drive
            </a>

            <button
              onClick={onClose}
              className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
