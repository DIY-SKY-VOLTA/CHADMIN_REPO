import { useState } from 'react';
import { Plus, X, Trash2, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';

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

export const TextInput = ({ value, onChange, placeholder, type = 'text', className }) => (
  <input
    type={type}
    value={value ?? ''}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    className={`${inputCls} ${className || ''}`}
  />
);

export const TextArea = ({ value, onChange, placeholder, rows = 3, className }) => (
  <textarea
    value={value ?? ''}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    rows={rows}
    className={`${inputCls} resize-y leading-relaxed ${className || ''}`}
  />
);

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
                  <textarea
                    value={item[f.key] ?? ''}
                    onChange={(e) => updateItem(idx, f.key, e.target.value)}
                    rows={f.rows || 2}
                    placeholder={f.placeholder}
                    className={`${inputCls} resize-none`}
                  />
                ) : (
                  <input
                    type={f.type || 'text'}
                    value={item[f.key] ?? ''}
                    onChange={(e) => updateItem(idx, f.key, e.target.value)}
                    placeholder={f.placeholder}
                    className={inputCls}
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
