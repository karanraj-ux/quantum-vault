import React, { useState } from 'react';
import { X, Check, Copy, ExternalLink, Globe, HardDrive, Share2, Layers, QrCode } from 'lucide-react';
import { QRCodeCard } from './QRCodeCard';

export interface MultiShareItem {
  id: string;
  name: string;
  url: string;
  accountEmail?: string;
  isVault?: boolean;
}

interface MultiShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  items: MultiShareItem[];
}

export const MultiShareModal: React.FC<MultiShareModalProps> = ({
  isOpen,
  onClose,
  title = 'Share Selected Files',
  items,
}) => {
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedItemIndex, setCopiedItemIndex] = useState<number | null>(null);
  const [activeQrIndex, setActiveQrIndex] = useState<number | null>(items.length === 1 ? 0 : null);

  if (!isOpen || items.length === 0) return null;

  const handleCopyAll = async () => {
    try {
      const text = items
        .map((item, idx) => `${idx + 1}. ${item.name}:\n${item.url}`)
        .join('\n\n');
      await navigator.clipboard.writeText(text);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2500);
    } catch (e) {
      console.warn('Failed to copy all links', e);
    }
  };

  const handleCopySingle = async (url: string, index: number) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedItemIndex(index);
      setTimeout(() => setCopiedItemIndex(null), 2000);
    } catch (e) {
      console.warn('Failed to copy link', e);
    }
  };

  return (
    <div className="fixed inset-0 z-[130] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 border border-slate-200 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-start justify-between bg-gradient-to-r from-emerald-50/60 via-slate-50 to-white shrink-0">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 mb-1.5 border border-emerald-200">
              <Globe size={11} /> {items.length} Shareable {items.length === 1 ? 'Link' : 'Links'} Ready
            </div>
            <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
              <Share2 className="w-4 h-4 text-emerald-600" />
              {title}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Copy all links together or share individual files with one click.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Action Bar */}
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
          <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
            <Layers size={13} className="text-emerald-600" /> {items.length} {items.length === 1 ? 'Item' : 'Items'} Selected
          </span>
          <button
            onClick={handleCopyAll}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs ${
              copiedAll
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-900 hover:bg-slate-800 text-white active:scale-95'
            }`}
          >
            {copiedAll ? <Check size={13} /> : <Copy size={13} />}
            <span>{copiedAll ? 'All Copied to Clipboard!' : 'Copy All Links'}</span>
          </button>
        </div>

        {/* Scrollable Items List */}
        <div className="p-5 space-y-3 overflow-y-auto flex-1">
          {items.map((item, idx) => {
            const isCopied = copiedItemIndex === idx;
            return (
              <div
                key={item.id || idx}
                className="p-3.5 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-all shadow-xs space-y-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900 truncate">
                        {item.name}
                      </span>
                      {item.isVault ? (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 whitespace-nowrap">
                          P2P Magic
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
                          Public Drive
                        </span>
                      )}
                    </div>
                    {item.accountEmail && (
                      <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5 truncate">
                        <HardDrive size={11} className="shrink-0" /> {item.accountEmail}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => setActiveQrIndex(activeQrIndex === idx ? null : idx)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                        activeQrIndex === idx
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                      title="Show QR code for mobile scanning"
                    >
                      <QrCode size={12} />
                      <span>QR</span>
                    </button>
                    <button
                      onClick={() => handleCopySingle(item.url, idx)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                        isCopied
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                    >
                      {isCopied ? <Check size={12} /> : <Copy size={12} />}
                      <span>{isCopied ? 'Copied' : 'Copy'}</span>
                    </button>
                    {!item.isVault && (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-blue-600 transition-colors"
                        title="Open link"
                      >
                        <ExternalLink size={14} />
                      </a>
                    )}
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200/80 rounded-lg px-2.5 py-1.5">
                  <input
                    type="text"
                    readOnly
                    value={item.url}
                    onClick={e => (e.target as HTMLInputElement).select()}
                    className="w-full bg-transparent text-[11px] font-mono text-slate-600 select-all focus:outline-none truncate"
                  />
                </div>

                {activeQrIndex === idx && (
                  <div className="pt-1 animate-in fade-in zoom-in-95 duration-150">
                    <QRCodeCard
                      url={item.url}
                      title={`Scan to open "${item.name}"`}
                      subtitle="Point smartphone camera to open this link instantly"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-slate-500">
            Recipients can open and download these files directly.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
