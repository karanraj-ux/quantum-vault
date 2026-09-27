import React, { useEffect, useState, useRef } from 'react';
import {
  Search,
  HardDrive,
  LayoutDashboard,
  Shield,
  Cloud,
  ArrowRight,
  X,
  FileText,
  Lock,
  Radio,
  Command,
} from 'lucide-react';
import { DriveFile } from '../types';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  files: DriveFile[];
  onNavigate: (view: 'dashboard' | 'drive' | 'settings') => void;
  onTriggerUpload: () => void;
  onOpenConnect: (provider?: 'onedrive' | 'dropbox') => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  files,
  onNavigate,
  onTriggerUpload,
  onOpenConnect,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Global key listener for Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
        else setQuery('');
      } else if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const cleanQuery = query.toLowerCase().trim();

  // Navigation Items
  const navigationItems = [
    { id: 'nav-dash', type: 'nav', title: 'Go to Command Deck', subtitle: 'Workspace overview & metrics', icon: LayoutDashboard, action: () => onNavigate('dashboard') },
    { id: 'nav-drive', type: 'nav', title: 'Go to Virtual Drive', subtitle: 'RAID-5 sharded files & transfers', icon: HardDrive, action: () => onNavigate('drive') },
    { id: 'nav-sett', type: 'nav', title: 'Go to Security & Keys', subtitle: 'BYOK, multi-cloud tokens & privacy', icon: Shield, action: () => onNavigate('settings') },
  ].filter(item => !cleanQuery || item.title.toLowerCase().includes(cleanQuery) || item.subtitle.toLowerCase().includes(cleanQuery));

  // Quick Action Items
  const actionItems = [
    { id: 'act-upload', type: 'action', title: 'Upload File to RAID-5 Vault', subtitle: 'Encrypt with AES-256 and stripe', icon: Lock, action: onTriggerUpload },
    { id: 'act-p2p', type: 'action', title: 'WebRTC P2P Direct Tunnel', subtitle: 'Direct browser-to-browser encrypted streaming', icon: Radio, action: () => onNavigate('drive') },
    { id: 'act-onedrive', type: 'action', title: 'Connect Microsoft OneDrive', subtitle: 'Pool 5 GB free storage', icon: Cloud, action: () => onOpenConnect('onedrive') },
    { id: 'act-dropbox', type: 'action', title: 'Connect Dropbox', subtitle: 'Pool 2 GB free storage', icon: Cloud, action: () => onOpenConnect('dropbox') },
  ].filter(item => !cleanQuery || item.title.toLowerCase().includes(cleanQuery) || item.subtitle.toLowerCase().includes(cleanQuery));

  // File Matches
  const matchedFiles = cleanQuery
    ? files.filter(f => f.name.toLowerCase().includes(cleanQuery) || (f.accountEmail && f.accountEmail.toLowerCase().includes(cleanQuery))).slice(0, 4)
    : [];

  const totalResults = [
    ...navigationItems.map(i => ({ ...i, category: 'Navigation' })),
    ...actionItems.map(i => ({ ...i, category: 'Actions' })),
    ...matchedFiles.map(f => ({
      id: `file-${f.id}`,
      type: 'file',
      title: f.name,
      subtitle: `${(f.size ? (f.size / (1024 * 1024)).toFixed(1) + ' MB' : 'Drive File')} · ${f.accountEmail}`,
      icon: FileText,
      category: 'Files',
      action: () => { onNavigate('drive'); },
    })),
  ];

  const handleKeyDownList = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % Math.max(1, totalResults.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + totalResults.length) % Math.max(1, totalResults.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const current = totalResults[selectedIndex];
      if (current) {
        current.action();
        onClose();
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-[150] bg-slate-900/60 backdrop-blur-xs flex items-start justify-center pt-16 md:pt-24 p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[75vh]"
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDownList}
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-100">
          <Search className="w-5 h-5 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Type a command or search files, settings..."
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            className="flex-1 bg-transparent border-none outline-none text-sm text-slate-900 placeholder:text-slate-400 font-medium"
          />
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 border border-slate-200">
              ESC
            </span>
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {totalResults.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              No matching commands or resources found for &quot;{query}&quot;
            </div>
          ) : (
            totalResults.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              const Icon = item.icon;

              return (
                <div
                  key={item.id}
                  onClick={() => {
                    item.action();
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-colors ${
                    isSelected ? 'bg-slate-100/90 text-slate-900' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                        isSelected ? 'bg-white shadow-2xs text-blue-600' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      <Icon size={14} />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-xs text-slate-900 truncate">{item.title}</div>
                      <div className="text-[11px] text-slate-400 truncate">{item.subtitle}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-medium text-slate-400">{item.category}</span>
                    {isSelected && <ArrowRight size={13} className="text-slate-500" />}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer shortcuts strip */}
        <div className="px-4 py-2 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-3">
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
            <span>ESC Close</span>
          </div>
          <span className="font-medium text-slate-500">Quantum Vault</span>
        </div>
      </div>
    </div>
  );
};
