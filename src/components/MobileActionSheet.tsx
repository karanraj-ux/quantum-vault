import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ExternalLink } from 'lucide-react';

export interface MobileActionSheetItem {
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

interface MobileActionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  items: MobileActionSheetItem[];
}

export const MobileActionSheet: React.FC<MobileActionSheetProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  items,
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:hidden">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
          />

          {/* Slide-Up Bottom Drawer */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 26, stiffness: 300 }}
            className="relative w-full max-h-[85vh] bg-white rounded-t-3xl shadow-2xl border-t border-slate-200 p-5 flex flex-col z-10 overflow-hidden pb-8"
          >
            {/* Grab Handle */}
            <div className="w-12 h-1.5 bg-slate-300 rounded-full mx-auto mb-4 shrink-0" />

            {/* Header */}
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100 shrink-0">
              <div className="min-w-0">
                <h3 className="text-base font-bold text-slate-900 truncate leading-tight">
                  {title}
                </h3>
                {subtitle && (
                  <p className="text-xs text-slate-500 truncate mt-0.5 font-mono">
                    {subtitle}
                  </p>
                )}
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Action Items List */}
            <div className="divide-y divide-slate-100 overflow-y-auto mt-2">
              {items.map((item, idx) => (
                <button
                  key={idx}
                  disabled={item.disabled}
                  onClick={() => {
                    onClose();
                    item.onClick();
                  }}
                  className={`w-full flex items-center gap-3.5 py-3.5 px-2 text-left transition-colors cursor-pointer rounded-xl active:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none ${
                    item.destructive ? 'text-red-600' : 'text-slate-800'
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      item.destructive
                        ? 'bg-red-50 text-red-600'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {item.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold truncate leading-snug">
                      {item.label}
                    </div>
                    {item.sublabel && (
                      <div className="text-xs text-slate-400 truncate mt-0.5">
                        {item.sublabel}
                      </div>
                    )}
                  </div>
                  <ExternalLink size={14} className="text-slate-300 shrink-0" />
                </button>
              ))}
            </div>

            {/* Cancel Button */}
            <div className="pt-3 mt-2 border-t border-slate-100 shrink-0">
              <button
                onClick={onClose}
                className="w-full py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold transition-colors"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
