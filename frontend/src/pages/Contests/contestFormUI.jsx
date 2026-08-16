import { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Plus, X, Trash2, ChevronDown, ChevronLeft, ChevronRight, Calendar, Clock, Copy, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { copyToClipboard } from '@/utils/clipboard';

/* ────────────────────────────────────────────────────────────────────────────
   Shared UI primitives for the admin contest forms (ContestForm + details).
   Matches the admin dashboard design system: Tailwind v4, dark mode, neutrals,
   tiny uppercase tracking labels, rounded-xl cards.
──────────────────────────────────────────────────────────────────────────── */

export const inputCls =
  'w-full bg-white dark:bg-[#151518] border border-neutral-200/60 dark:border-white/5 rounded-lg px-3 py-2 text-xs text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:border-neutral-400 dark:focus:border-neutral-700 transition-all shadow-[0_1px_2px_rgba(0,0,0,0.01)]';

export const Field = ({ label, required, hint, className, children, counter }) => (
  <div className={className}>
    <div className="flex items-center justify-between mb-1.5 gap-2">
      <label className="block text-[10px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {counter}
    </div>
    {children}
    {hint && <p className="text-[10px] text-neutral-400 dark:text-neutral-500 mt-1 leading-relaxed">{hint}</p>}
  </div>
);

export const TextInput = ({ value, onChange, placeholder, type = 'text', className }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const text = value ?? '';
    if (!text) return;
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } else {
      toast.error('Failed to copy');
    }
  };

  return (
    <div className="relative">
      <input
        type={type}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${inputCls} ${className || ''} pr-10`}
      />
      {value && (
        <button
          type="button"
          onClick={handleCopy}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
          aria-label="Copy to clipboard"
        >
          {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
        </button>
      )}
    </div>
  );
};

const pad2 = (n) => String(n).padStart(2, '0');
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

/**
 * Friendly date + time picker. A button field opens a full calendar popover
 * (month grid, prev/next month nav, today/selected highlighting) with hour +
 * minute selects — replacing native date/time inputs, which have NO calendar
 * UI in Firefox and silently reject typed input in Chrome's segmented editor.
 *
 * The popover is portaled to <body> so it escapes the SectionCard's
 * overflow-hidden clip. Value keeps the exact `YYYY-MM-DDTHH:mm` shape, so the
 * existing UTC conversion helpers round-trip unchanged.
 */
export const DateTimePicker = ({ value, onChange, className }) => {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [pos, setPos] = useState({ top: 0, left: 0, width: 280 });
  const triggerRef = useRef(null);
  const popRef = useRef(null);

  const full = String(value || '');
  const datePart = full.slice(0, 10);
  const timePart = full.slice(11, 16);
  const hasDate = /^\d{4}-\d{2}-\d{2}$/.test(datePart);
  const [hour, minute] = timePart ? timePart.split(':') : ['00', '00'];

  // Jump the calendar to the value's month (or today) whenever it opens
  useEffect(() => {
    if (!open) return;
    const base = hasDate ? new Date(`${datePart}T00:00:00`) : new Date();
    setView(new Date(base.getFullYear(), base.getMonth(), 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const reposition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const popH = popRef.current?.offsetHeight || 340;
    const width = Math.max(280, Math.min(r.width, 320));
    const flip = window.innerHeight - r.bottom < popH + 8 && r.top > popH + 8;
    setPos({
      top: flip ? Math.max(8, r.top - popH - 6) : r.bottom + 6,
      left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)),
      width,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
    const onScroll = () => reposition();
    const onResize = () => reposition();
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    const onDown = (e) => {
      if (!popRef.current?.contains(e.target) && !triggerRef.current?.contains(e.target)) setOpen(false);
    };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open, reposition]);

  const year = view.getFullYear();
  const month = view.getMonth();
  const monthLabel = view.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${year}-${pad2(month + 1)}-${pad2(d)}`);
  const today = todayStr();

  const displayLabel = () => {
    if (!hasDate) return 'Pick date & time';
    const d = new Date(`${datePart}T00:00:00`);
    const dateLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    if (!timePart) return dateLabel;
    const t = new Date(`2000-01-01T${timePart}:00`);
    const timeLabel = t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return `${dateLabel} · ${timeLabel}`;
  };

  const dayCls = (dayStr) => {
    const base = 'h-8 w-8 rounded-lg text-[11px] font-medium transition-all flex items-center justify-center mx-auto';
    if (dayStr === datePart) return `${base} bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 shadow-sm font-bold`;
    if (dayStr === today) return `${base} text-blue-600 dark:text-blue-400 font-semibold`;
    return `${base} text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/10`;
  };

  const pickDay = (dayStr) => onChange(`${dayStr}T${timePart || '00:00'}`);
  const pickHour = (h) => onChange(`${datePart}T${h}:${minute || '00'}`);
  const pickMinute = (m) => onChange(`${datePart}T${hour || '00'}:${m}`);
  const setToday = () => {
    const d = new Date();
    const t = timePart || `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    onChange(`${todayStr()}T${t}`);
  };

  return (
    <div className={className}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`${inputCls} flex items-center justify-between gap-2 text-left cursor-pointer ${
          hasDate ? 'text-neutral-900 dark:text-neutral-100' : 'text-neutral-400 dark:text-neutral-500'
        }`}
      >
        <span className="truncate">{displayLabel()}</span>
        <Calendar size={13} className="shrink-0 text-neutral-400" />
      </button>

      {open &&
        createPortal(
          <div
            ref={popRef}
            className="fixed z-50 bg-white dark:bg-[#18181b] border border-neutral-200/60 dark:border-white/10 rounded-xl shadow-xl shadow-neutral-900/10 dark:shadow-black/40 p-3 space-y-3"
            style={{ top: pos.top, left: pos.left, width: pos.width }}
          >
            {/* Month navigation */}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setView(new Date(year, month - 1, 1))}
                className="p-1 rounded-md hover:bg-neutral-100 dark:hover:bg-white/10 text-neutral-500 dark:text-neutral-400 transition-colors"
                title="Previous month"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="text-[11px] font-semibold text-neutral-800 dark:text-neutral-100">{monthLabel}</span>
              <button
                type="button"
                onClick={() => setView(new Date(year, month + 1, 1))}
                className="p-1 rounded-md hover:bg-neutral-100 dark:hover:bg-white/10 text-neutral-500 dark:text-neutral-400 transition-colors"
                title="Next month"
              >
                <ChevronRight size={14} />
              </button>
            </div>

            {/* Weekday header */}
            <div className="grid grid-cols-7 text-center">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((w, i) => (
                <span key={i} className="text-[9px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase">
                  {w}
                </span>
              ))}
            </div>

            {/* Day grid */}
            <div className="grid grid-cols-7 gap-y-0.5">
              {cells.map((c, i) =>
                c ? (
                  <button key={i} type="button" onClick={() => pickDay(c)} className={dayCls(c)}>
                    {Number(c.slice(8))}
                  </button>
                ) : (
                  <div key={i} />
                )
              )}
            </div>

            {/* Time */}
            <div
              className={`flex items-center gap-1.5 pt-2 border-t border-neutral-200/40 dark:border-white/5 ${
                hasDate ? '' : 'opacity-50'
              }`}
            >
              <Clock size={12} className="text-neutral-400 shrink-0" />
              <select
                value={hour}
                disabled={!hasDate}
                onChange={(e) => pickHour(e.target.value)}
                className="flex-1 min-w-0 bg-white dark:bg-[#151518] border border-neutral-200/60 dark:border-white/10 rounded-md px-1.5 py-1 text-[11px] text-neutral-700 dark:text-neutral-200 focus:outline-none focus:border-neutral-400 dark:focus:border-neutral-700 transition-all"
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={pad2(h)}>
                    {pad2(h)}
                  </option>
                ))}
              </select>
              <span className="text-neutral-400 text-[11px]">:</span>
              <select
                value={minute}
                disabled={!hasDate}
                onChange={(e) => pickMinute(e.target.value)}
                className="flex-1 min-w-0 bg-white dark:bg-[#151518] border border-neutral-200/60 dark:border-white/10 rounded-md px-1.5 py-1 text-[11px] text-neutral-700 dark:text-neutral-200 focus:outline-none focus:border-neutral-400 dark:focus:border-neutral-700 transition-all"
              >
                {Array.from({ length: 60 }, (_, m) => (
                  <option key={m} value={pad2(m)}>
                    {pad2(m)}
                  </option>
                ))}
              </select>
              <span className="text-[9px] text-neutral-400 dark:text-neutral-500 ml-1 shrink-0">UTC</span>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={setToday}
                  className="px-2 py-1 rounded-md text-[10px] font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 transition-colors"
                >
                  Today
                </button>
                {hasDate && (
                  <button
                    type="button"
                    onClick={() => {
                      onChange('');
                      setOpen(false);
                    }}
                    className="px-2 py-1 rounded-md text-[10px] font-semibold text-red-500 hover:bg-red-500/10 transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-2.5 py-1 rounded-md bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-[10px] font-semibold hover:opacity-90 transition-all"
              >
                Done
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export const TextArea = ({ value, onChange, placeholder, rows = 3, className }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const text = value ?? '';
    if (!text) return;
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } else {
      toast.error('Failed to copy');
    }
  };

  return (
    <div className="relative">
      <textarea
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className={`${inputCls} resize-y leading-relaxed ${className || ''} pr-10`}
      />
      {value && (
        <button
          type="button"
          onClick={handleCopy}
          className="absolute right-3 top-3 p-1 rounded text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
          aria-label="Copy to clipboard"
        >
          {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
        </button>
      )}
    </div>
  );
};

export const Select = ({ value, onChange, options, placeholder, className }) => (
  <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={`${inputCls} ${className || ''}`}>
    {placeholder && <option value="">{placeholder}</option>}
    {options.map((opt) =>
      typeof opt === 'string' ? (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ) : (
        <option key={String(opt.value)} value={opt.value}>
          {opt.label}
        </option>
      )
    )}
  </select>
);

export const Segmented = ({ value, options, onChange }) => (
  <div className="inline-flex p-0.5 rounded-lg bg-neutral-100 dark:bg-neutral-900/60 border border-neutral-200/40 dark:border-white/5 gap-0.5 shadow-inner">
    {options.map((opt) => {
      const active = value === opt.value;
      return (
        <button
          key={String(opt.value)}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1 text-[11px] font-medium rounded-md transition-all ${
            active
              ? 'bg-white dark:bg-[#1b1b1e] text-neutral-900 dark:text-white shadow-sm'
              : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-300'
          }`}
        >
          {opt.label}
        </button>
      );
    })}
  </div>
);

export const ChipGroup = ({ value = [], options, onChange }) => (
  <div className="flex flex-wrap gap-1.5">
    {options.map((opt) => {
      const active = value.includes(opt.value);
      return (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(active ? value.filter((v) => v !== opt.value) : [...value, opt.value])}
          className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-all ${
            active
              ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 border-neutral-900 dark:border-white shadow-sm'
              : 'bg-white dark:bg-[#151518] text-neutral-500 dark:text-neutral-400 border-neutral-200/60 dark:border-white/10 hover:border-neutral-400 dark:hover:border-neutral-600'
          }`}
        >
          {opt.label}
        </button>
      );
    })}
  </div>
);

/** Free-text chip input — Enter or comma adds a chip (optionally kebab-cased). */
export const ChipInput = ({ value = [], onChange, max, placeholder, hint, kebab = false }) => {
  const [draft, setDraft] = useState('');

  const add = () => {
    let v = draft.trim();
    if (!v) return;
    if (kebab) {
      v = v
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
    }
    if (!v) return;
    if (value.includes(v)) {
      setDraft('');
      return;
    }
    if (max && value.length >= max) {
      toast.error(`Maximum ${max} allowed`);
      return;
    }
    onChange([...value, v]);
    setDraft('');
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className={inputCls}
        />
        <button
          type="button"
          onClick={add}
          className="shrink-0 px-3 py-2 rounded-lg border border-neutral-200/60 dark:border-white/5 bg-white dark:bg-[#18181b] hover:bg-neutral-50 dark:hover:bg-white/5 text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-all shadow-sm flex items-center gap-1 text-[11px] font-medium"
        >
          <Plus size={12} />
          Add
        </button>
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((chip) => (
            <span
              key={chip}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-neutral-100 dark:bg-neutral-800/50 border border-neutral-200/50 dark:border-white/5 text-[11px] text-neutral-600 dark:text-neutral-300"
            >
              {chip}
              <button
                type="button"
                onClick={() => onChange(value.filter((c) => c !== chip))}
                className="text-neutral-400 hover:text-red-500 transition-colors"
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
      {hint && <p className="text-[10px] text-neutral-400 dark:text-neutral-500">{hint}</p>}
    </div>
  );
};

/** List editor for {key: value} rows (e.g. submission steps, FAQ, tracks). */
export const ListItemEditor = ({ items = [], onChange, fields, addLabel = 'Add Item', emptyText = 'No items yet' }) => {
  const updateItem = (idx, key, val) => {
    onChange(items.map((it, i) => (i === idx ? { ...it, [key]: val } : it)));
  };
  const removeItem = (idx) => onChange(items.filter((_, i) => i !== idx));
  const addItem = () => {
    const tpl = {};
    fields.forEach((f) => {
      tpl[f.key] = '';
    });
    onChange([...items, tpl]);
  };
  return (
    <div className="space-y-2">
      {items.length === 0 && <p className="text-[11px] text-neutral-400 italic">{emptyText}</p>}
      {items.map((item, idx) => (
        <div
          key={idx}
          className="border border-neutral-200/40 dark:border-white/5 rounded-lg p-3 bg-neutral-50/40 dark:bg-[#1b1b1e]/30 space-y-2.5"
        >
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider">Item {idx + 1}</span>
            <button
              type="button"
              onClick={() => removeItem(idx)}
              className="p-1 rounded hover:bg-red-500/10 text-neutral-400 hover:text-red-500 transition-colors"
              title="Remove item"
            >
              <Trash2 size={12} />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {fields.map((f) => (
              <div key={f.key} className={f.full ? 'sm:col-span-2' : ''}>
                <label className="block text-[9px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">
                  {f.label}
                </label>
                {f.type === 'textarea' ? (
                  <TextArea
                    value={item[f.key] ?? ''}
                    onChange={(v) => updateItem(idx, f.key, v)}
                    rows={f.rows || 2}
                    placeholder={f.placeholder}
                    className="resize-none"
                  />
                ) : (
                  <TextInput
                    type={f.type || 'text'}
                    value={item[f.key] ?? ''}
                    onChange={(v) => updateItem(idx, f.key, v)}
                    placeholder={f.placeholder}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={addItem}
        className="w-full py-2 rounded-lg border border-dashed border-neutral-300/60 dark:border-white/10 text-[11px] font-medium text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 hover:border-neutral-400 dark:hover:border-neutral-600 transition-all flex items-center justify-center gap-1.5"
      >
        <Plus size={12} />
        {addLabel}
      </button>
    </div>
  );
};

export const SectionCard = ({ title, desc, icon: Icon, open, onToggle, children }) => (
  <div className="bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 rounded-xl overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.01)]">
    <button
      type="button"
      onClick={onToggle}
      className="w-full px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-neutral-50 dark:hover:bg-white/[0.03] transition-colors"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 rounded-lg bg-neutral-100 dark:bg-neutral-800/50 border border-neutral-200/50 dark:border-white/5 flex items-center justify-center text-neutral-500 dark:text-neutral-400 shrink-0">
          <Icon size={15} strokeWidth={1.5} />
        </div>
        <div className="min-w-0 text-left">
          <h3 className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">{title}</h3>
          <p className="text-[10px] text-neutral-400 dark:text-neutral-500 mt-0.5 truncate">{desc}</p>
        </div>
      </div>
      <ChevronDown
        size={15}
        className={`text-neutral-400 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
      />
    </button>
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.22, ease: 'easeInOut' }}
          className="overflow-hidden"
        >
          <div className="px-5 py-4 border-t border-neutral-200/40 dark:border-white/5">{children}</div>
        </motion.div>
      )}
    </AnimatePresence>
  </div>
);
