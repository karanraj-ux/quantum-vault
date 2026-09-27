import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, FileText, X, Loader2 } from 'lucide-react';
import { executeFederatedSearchStream } from '../services/googleService';
import { AccountToken, DriveFile } from '../types';

interface GlobalSearchViewProps {
  query: string;
  accounts: AccountToken[];
  onClose: () => void;
  onClearQuery: () => void;
}

export const GlobalSearchView: React.FC<GlobalSearchViewProps> = ({
  query,
  accounts,
  onClose,
  onClearQuery,
}) => {
  const [results, setResults] = useState<{ type: string; data: any }[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeout = useRef<any>(null);

  useEffect(() => {
    setResults([]);
    if (!query.trim()) {
      setIsSearching(false);
      return;
    }

    setIsSearching(true);

    if (searchTimeout.current) clearTimeout(searchTimeout.current);

    searchTimeout.current = setTimeout(() => {
      executeFederatedSearchStream(
        query,
        accounts,
        () => {},
        (type, acc, chunk) => {
          setIsSearching(false);
          if (chunk.length > 0) {
            const chunkMapped = chunk.map(item => ({ type, data: item }));
            setResults(prev => {
              const combined = [...prev, ...chunkMapped];
              return combined.sort((a, b) => (b.data.timestamp || 0) - (a.data.timestamp || 0));
            });
          }
        }
      );
    }, 400);

    return () => clearTimeout(searchTimeout.current);
  }, [query, accounts]);

  return (
    <AnimatePresence>
      {query && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          className="absolute inset-0 z-40 bg-slate-900/20 backdrop-blur-md flex flex-col p-6 font-sans"
        >
          <div className="max-w-3xl w-full mx-auto flex flex-col h-full bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-blue-600" />
                <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Cross-Account Search
                </h2>
                <span className="text-[11px] text-slate-400">"{query}"</span>
              </div>
              <div className="flex items-center gap-2">
                {isSearching && <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />}
                <button
                  onClick={() => {
                    onClearQuery();
                    onClose();
                  }}
                  className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-900 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {results.length === 0 && !isSearching && query.trim() !== '' && (
                <div className="text-center py-16 text-slate-400">
                  <Search className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                  <div className="text-sm font-semibold text-slate-700">No results found</div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    No matching items across {accounts.length} linked account{accounts.length !== 1 ? 's' : ''}.
                  </p>
                </div>
              )}

              {results.map((res, i) => {
                const { type, data } = res;
                if (type === 'drive') {
                  const f = data as DriveFile;
                  return (
                    <div
                      key={`drive-${f.id}`}
                      onClick={() => window.open(f.webViewLink, '_blank')}
                      className="p-3.5 bg-slate-50 hover:bg-emerald-50/50 border border-slate-200/80 rounded-xl cursor-pointer transition-colors flex items-center gap-3"
                    >
                      <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                        {f.iconLink ? (
                          <img src={f.iconLink} className="w-4 h-4" alt="" />
                        ) : (
                          <FileText className="w-4 h-4" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start mb-0.5">
                          <span className="font-bold text-xs text-slate-900 truncate pr-3">
                            {f.name}
                          </span>
                          <span className="text-[10px] text-slate-400 shrink-0">
                            {new Date(f.timestamp).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">{f.accountEmail}</div>
                      </div>
                      <span className="text-[10px] font-medium text-slate-400 px-2 py-0.5 rounded bg-white border border-slate-200 shrink-0">
                        Drive
                      </span>
                    </div>
                  );
                }
                return null;
              })}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
