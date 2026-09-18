import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Loader2, Trash2, Ban, Clock, LogOut, ShieldAlert } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * ConfirmDialog — app-native replacement for window.confirm / window.prompt.
 *
 * Native dialogs can't be styled, block the JS thread, and inherit the
 * browser's look instead of the product's. This renders a portaled modal
 * matching the dashboard's design language, with:
 *
 *  - intent: 'danger' (delete/ban) | 'warn' (suspend) | 'neutral' (sign out)
 *  - requireText: typed-confirmation for destructive actions (e.g. "DELETE")
 *  - optional text input for collecting a reason (replaces window.prompt)
 *  - Escape cancels, Enter confirms, focus lands on the primary button
 *
 * Usage:
 *   <ConfirmDialog
 *     open={..} onClose={..} onConfirm={(inputValue) => ..}
 *     title="Delete account?" intent="danger" requireText="DELETE"
 *     inputLabel="Reason (optional)" confirmLabel="Delete forever"
 *   >
 *     Body copy explaining consequences.
 *   </ConfirmDialog>
 */

const INTENTS = {
  danger:  { icon: AlertTriangle, btn: 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/20', ring: 'text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/20' },
  warn:    { icon: Clock,         btn: 'bg-amber-500 hover:bg-amber-400 text-neutral-950 shadow-lg shadow-amber-500/20', ring: 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20' },
  neutral: { icon: LogOut,        btn: 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 shadow-lg', ring: 'text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/20' },
};

const ACTION_ICONS = { delete: Trash2, ban: Ban, suspend: Clock, logout: LogOut };

export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  intent = 'neutral',
  actionIcon,
  requireText = null,
  inputLabel = null,
  inputPlaceholder = '',
  busy = false,
}) {
  const [text, setText] = useState('');
  const [reason, setReason] = useState('');
  const confirmRef = useRef(null);
  const inputRef = useRef(null);

  // Reset local state each time the dialog opens
  useEffect(() => {
    if (open) { setText(''); setReason(''); }
  }, [open]);

  // Focus management + scroll lock while open
  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(() => {
      (requireText ? inputRef : confirmRef).current?.focus();
    }, 30);
    document.body.style.overflow = 'hidden';
    return () => {
      clearTimeout(t);
      document.body.style.overflow = '';
    };
  }, [open, requireText]);

  const matches = !requireText || text.trim() === requireText;
  const cfg = INTENTS[intent] || INTENTS.neutral;
  const Icon = actionIcon && ACTION_ICONS[actionIcon] ? ACTION_ICONS[actionIcon] : cfg.icon;

  const handleConfirm = () => {
    if (!matches || busy) return;
    onConfirm(reason.trim(), text.trim());
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => { if (!busy) onClose(); }}
            className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-[3px]"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            className="fixed left-1/2 top-1/2 z-[91] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white dark:bg-[#1b1b1e] border border-neutral-200/70 dark:border-white/10 shadow-2xl outline-none"
            role="alertdialog"
            aria-modal="true"
            aria-label={title}
            onKeyDown={(e) => { if (e.key === 'Escape' && !busy) onClose(); }}
          >
            <div className="p-5">
              <div className="flex items-start gap-3.5">
                <div className={`shrink-0 w-10 h-10 rounded-xl border flex items-center justify-center ${cfg.ring}`}>
                  <Icon size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-[15px] font-bold text-neutral-900 dark:text-white leading-snug">
                    {title}
                  </h2>
                  <div className="mt-1.5 text-[12.5px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
                    {children}
                  </div>
                </div>
              </div>

              {inputLabel !== null && (
                <div className="mt-4">
                  <label className="block text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-1.5">
                    {inputLabel}
                  </label>
                  <input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={inputPlaceholder}
                    maxLength={300}
                    className="w-full bg-neutral-50 dark:bg-[#151518] border border-neutral-200/70 dark:border-white/10 rounded-lg px-3 py-2 text-[12.5px] text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:border-neutral-400 dark:focus:border-neutral-600 transition-colors"
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmRef.current?.focus(); } }}
                  />
                </div>
              )}

              {requireText && (
                <div className="mt-4">
                  <label className="block text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-1.5">
                    Type <span className="text-neutral-800 dark:text-neutral-200 font-bold">{requireText}</span> to confirm
                  </label>
                  <input
                    ref={inputRef}
                    type="text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={requireText}
                    autoComplete="off"
                    className={`w-full bg-neutral-50 dark:bg-[#151518] border rounded-lg px-3 py-2 text-[12.5px] text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none transition-colors ${
                      text.length === 0
                        ? 'border-neutral-200/70 dark:border-white/10'
                        : matches
                          ? 'border-emerald-500/50 dark:border-emerald-500/40'
                          : 'border-red-500/50 dark:border-red-500/40'
                    }`}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleConfirm(); } }}
                  />
                </div>
              )}
            </div>

            <div className="px-5 py-3.5 bg-neutral-50/70 dark:bg-black/20 border-t border-neutral-200/60 dark:border-white/[0.06] rounded-b-2xl flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="px-3.5 py-2 rounded-lg text-[12px] font-semibold text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200/60 dark:hover:bg-white/5 disabled:opacity-40 transition-colors"
              >
                {cancelLabel}
              </button>
              <button
                ref={confirmRef}
                type="button"
                onClick={handleConfirm}
                disabled={!matches || busy}
                className={`px-3.5 py-2 rounded-lg text-[12px] font-bold inline-flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed transition-all ${cfg.btn}`}
              >
                {busy ? <Loader2 size={13} className="animate-spin" /> : null}
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
