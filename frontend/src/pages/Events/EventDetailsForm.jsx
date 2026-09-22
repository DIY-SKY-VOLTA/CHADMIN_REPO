import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Loader2,
  Save,
  ExternalLink,
  Users,
  Calendar,
  HelpCircle,
  Ticket,
  ClipboardList,
  Plus,
  Trash2,
  CalendarDays,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import adminAPI from '@/api/adminAPI';

// Field shapes mirror what the public event page renders
// (frontend-next /events/[slug]/PageClient.jsx) and Phase2's event model v3.1.
const emptySpeaker = () => ({ name: '', role: '', company: '', bio: '', avatar: '' });
const emptyAgendaItem = () => ({ session: '', title: '', description: '', duration: '', speaker: '', type: '' });
const emptyFaq = () => ({ question: '', answer: '' });
const emptyPrice = () => ({ audience: '', amount: '', currency: 'USD', status: 'available' });
const emptyPrep = () => ({ prerequisites: [], materialsProvided: [], materialsRequired: [] });

const blankForm = () => ({
  speakers: [],
  people: [],
  agenda: [],
  faqs: [],
  pricing: [],
  preparation: emptyPrep(),
});

// Keep only the fields the editor owns — drops pipeline-only extras so a save
// never clobbers data it doesn't understand (Mixed arrays are lossy otherwise).
const cleanSpeaker = (s = {}) => ({
  name: s.name || '', role: s.role || s.title || '', company: s.company || '',
  bio: s.bio || '', avatar: s.avatar || '',
});
const cleanAgenda = (a = {}) => ({
  session: a.session || a.startTime || a.time || '', title: a.title || '',
  description: a.description || '', duration: a.duration || '',
  speaker: a.speaker || '', type: a.type || '',
  modules: Array.isArray(a.modules) ? a.modules : undefined,
});
const cleanFaq = (f = {}) => ({ question: f.question || '', answer: f.answer || '' });
const cleanPrice = (p = {}) => ({
  audience: p.audience || p.tier || '', amount: p.amount ?? p.price ?? '',
  currency: p.currency || 'USD', status: p.status || 'available',
});

const mapDocToForm = (doc = {}) => ({
  speakers: (doc.speakers || []).map(cleanSpeaker),
  people: doc.people || [],
  agenda: (doc.agenda || []).map(cleanAgenda),
  faqs: (doc.faqs || []).map(cleanFaq),
  pricing: (doc.pricing || []).map(cleanPrice),
  preparation: {
    prerequisites: doc.preparation?.prerequisites || [],
    materialsProvided: doc.preparation?.materialsProvided || [],
    materialsRequired: doc.preparation?.materialsRequired || [],
  },
});

const buildPayload = (form) => ({
  speakers: form.speakers.filter((s) => (s.name || '').trim()),
  people: form.people,
  agenda: form.agenda.filter((a) => (a.title || '').trim()),
  faqs: form.faqs.filter((f) => (f.question || '').trim() || (f.answer || '').trim()),
  pricing: form.pricing
    .filter((p) => String(p.amount).trim() !== '' || (p.audience || '').trim())
    .map((p) => ({ ...p, amount: p.amount === '' ? null : Number(p.amount) })),
  preparation: form.preparation,
});

// ─── Reusable small controls ────────────────────────────────────────────────
const inputCls = 'w-full bg-white dark:bg-[#18181b] border border-neutral-200/60 dark:border-white/5 rounded-lg px-2.5 py-1.5 text-xs text-neutral-900 dark:text-white outline-none focus:border-neutral-400 dark:focus:border-neutral-700 transition-colors';

const Section = ({ icon: Icon, title, hint, children, onAdd, addLabel }) => (
  <div className="bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.01)]">
    <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200/40 dark:border-white/5">
      <div className="flex items-center gap-2">
        <span className="w-7 h-7 rounded-lg bg-neutral-100 dark:bg-neutral-800/50 flex items-center justify-center text-neutral-500">
          <Icon size={14} strokeWidth={1.5} />
        </span>
        <div>
          <h3 className="text-[13px] font-semibold text-neutral-900 dark:text-neutral-100">{title}</h3>
          <p className="text-[10px] text-neutral-400 dark:text-neutral-500">{hint}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="px-2.5 py-1.5 rounded-lg border border-neutral-200/50 dark:border-white/5 bg-white dark:bg-[#18181b] hover:bg-neutral-50 dark:hover:bg-white/5 text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-all shadow-sm flex items-center gap-1 text-[11px] font-semibold"
      >
        <Plus size={12} />
        {addLabel}
      </button>
    </div>
    <div className="p-4 space-y-3">{children}</div>
  </div>
);

const ItemCard = ({ children, onRemove, title }) => (
  <div className="relative bg-neutral-50/60 dark:bg-[#0c0c0e]/30 border border-neutral-200/50 dark:border-white/5 rounded-xl p-3.5">
    <div className="flex items-center justify-between mb-2.5">
      <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">{title}</span>
      <button
        type="button"
        onClick={onRemove}
        className="p-1 rounded hover:bg-red-500/10 text-neutral-400 hover:text-red-500 transition-colors"
        title="Remove"
      >
        <Trash2 size={12} />
      </button>
    </div>
    {children}
  </div>
);

const Field = ({ label, children }) => (
  <label className="block space-y-1">
    <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">{label}</span>
    {children}
  </label>
);

// ─── Page ───────────────────────────────────────────────────────────────────
const EventDetailsForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);
  const [form, setForm] = useState(blankForm());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        const res = await adminAPI.get(`/events/${id}/details`);
        if (cancelled) return;
        if (res.success && res.event) {
          setEvent(res.event);
          setForm(mapDocToForm(res.event));
        } else {
          toast.error('Event not found');
          navigate('/events/details', { replace: true });
        }
      } catch (err) {
        if (cancelled) return;
        toast.error(err?.message || 'Failed to load event');
        navigate('/events/details', { replace: true });
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, navigate]);

  const setArr = (key, index, field, value) => {
    setForm((prev) => {
      const arr = [...prev[key]];
      arr[index] = { ...arr[index], [field]: value };
      return { ...prev, [key]: arr };
    });
  };

  const addArr = (key, factory) =>
    setForm((prev) => ({ ...prev, [key]: [...prev[key], factory()] }));

  const removeArr = (key, index) =>
    setForm((prev) => ({ ...prev, [key]: prev[key].filter((_, i) => i !== index) }));

  const setPrep = (field, index, value) =>
    setForm((prev) => {
      const list = [...prev.preparation[field]];
      list[index] = value;
      return { ...prev, preparation: { ...prev.preparation, [field]: list } };
    });

  const addPrep = (field) =>
    setForm((prev) => ({
      ...prev,
      preparation: { ...prev.preparation, [field]: [...prev.preparation[field], ''] },
    }));

  const removePrep = (field, index) =>
    setForm((prev) => ({
      ...prev,
      preparation: {
        ...prev.preparation,
        [field]: prev.preparation[field].filter((_, i) => i !== index),
      },
    }));

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await adminAPI.put(`/events/${id}/details`, buildPayload(form));
      if (res.success) {
        toast.success('Event details saved — live page updated');
        navigate('/events/details');
      }
    } catch (err) {
      toast.error(err?.message || 'Failed to save event details');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-neutral-50/30 dark:bg-[#0d0d0f]/20">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={22} className="animate-spin text-neutral-450 dark:text-neutral-500" />
          <span className="text-xs text-neutral-450 font-mono tracking-widest uppercase">Loading event details...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-neutral-50/30 dark:bg-[#0d0d0f]/20 selection:bg-neutral-200/50 dark:selection:bg-neutral-400/40">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-neutral-200/50 dark:border-white/5 bg-white/40 dark:bg-[#121214]/40 backdrop-blur-sm">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate('/events/details')}
            className="p-2 rounded-lg border border-neutral-200/50 dark:border-white/5 bg-white dark:bg-[#18181b] hover:bg-neutral-50 dark:hover:bg-white/5 text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-all shadow-sm shrink-0"
            title="Back to event details"
          >
            <ArrowLeft size={14} />
          </button>
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-neutral-900 dark:text-neutral-100 truncate">
              {event?.title || 'Event Details'}
            </h1>
            <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5">
              Speakers, agenda, FAQ, pricing & preparation — rendered directly on the public event page
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {event?.slug && (
            <a
              href={`https://www.contesthopper.live/events/${event.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg border border-neutral-200/50 dark:border-white/5 bg-white dark:bg-[#18181b] hover:bg-neutral-50 dark:hover:bg-white/5 text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-all shadow-sm flex items-center gap-1.5 text-xs font-medium"
            >
              <ExternalLink size={13} />
              Live Page
            </a>
          )}
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-3.5 py-2 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:opacity-90 active:scale-[0.98] transition-all shadow-sm flex items-center gap-1.5 text-xs font-semibold disabled:opacity-50"
          >
            {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            Save Details
          </button>
        </div>
      </div>

      {/* Sections */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 max-w-4xl">

        {/* Speakers */}
        <Section
          icon={Users}
          title={`Speakers (${form.speakers.length})`}
          hint="Public page: name, role @ company, bio, avatar"
          onAdd={() => addArr('speakers', emptySpeaker)}
          addLabel="Speaker"
        >
          {form.speakers.length === 0 && (
            <p className="text-xs text-neutral-400 italic">No speakers — the public page hides this section until at least one exists.</p>
          )}
          {form.speakers.map((s, i) => (
            <ItemCard key={i} title={`Speaker ${i + 1}`} onRemove={() => removeArr('speakers', i)}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <Field label="Name *">
                  <input type="text" value={s.name} onChange={(e) => setArr('speakers', i, 'name', e.target.value)} className={inputCls} placeholder="Jane Doe" />
                </Field>
                <Field label="Role">
                  <input type="text" value={s.role} onChange={(e) => setArr('speakers', i, 'role', e.target.value)} className={inputCls} placeholder="Keynote Speaker" />
                </Field>
                <Field label="Company">
                  <input type="text" value={s.company} onChange={(e) => setArr('speakers', i, 'company', e.target.value)} className={inputCls} placeholder="Acme AI" />
                </Field>
                <Field label="Avatar URL">
                  <input type="text" value={s.avatar} onChange={(e) => setArr('speakers', i, 'avatar', e.target.value)} className={inputCls} placeholder="https://…" />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Bio">
                    <textarea rows={2} value={s.bio} onChange={(e) => setArr('speakers', i, 'bio', e.target.value)} className={`${inputCls} resize-none`} placeholder="Short speaker bio…" />
                  </Field>
                </div>
              </div>
            </ItemCard>
          ))}
        </Section>

        {/* Agenda */}
        <Section
          icon={Calendar}
          title={`Agenda (${form.agenda.length})`}
          hint="Public page: time, title, description, speaker"
          onAdd={() => addArr('agenda', emptyAgendaItem)}
          addLabel="Session"
        >
          {form.agenda.length === 0 && (
            <p className="text-xs text-neutral-400 italic">No agenda items yet.</p>
          )}
          {form.agenda.map((a, i) => (
            <ItemCard key={i} title={`Session ${i + 1}`} onRemove={() => removeArr('agenda', i)}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <Field label="Time / Session">
                  <input type="text" value={a.session} onChange={(e) => setArr('agenda', i, 'session', e.target.value)} className={inputCls} placeholder="09:00 — 10:00" />
                </Field>
                <Field label="Duration">
                  <input type="text" value={a.duration} onChange={(e) => setArr('agenda', i, 'duration', e.target.value)} className={inputCls} placeholder="60 min" />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Title *">
                    <input type="text" value={a.title} onChange={(e) => setArr('agenda', i, 'title', e.target.value)} className={inputCls} placeholder="Opening keynote" />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label="Description">
                    <textarea rows={2} value={a.description} onChange={(e) => setArr('agenda', i, 'description', e.target.value)} className={`${inputCls} resize-none`} />
                  </Field>
                </div>
                <Field label="Speaker">
                  <input type="text" value={a.speaker} onChange={(e) => setArr('agenda', i, 'speaker', e.target.value)} className={inputCls} placeholder="Jane Doe" />
                </Field>
                <Field label="Type">
                  <input type="text" value={a.type} onChange={(e) => setArr('agenda', i, 'type', e.target.value)} className={inputCls} placeholder="keynote / workshop / panel" />
                </Field>
              </div>
            </ItemCard>
          ))}
        </Section>

        {/* FAQ */}
        <Section
          icon={HelpCircle}
          title={`FAQ (${form.faqs.length})`}
          hint="Question/answer pairs shown in the FAQ accordion"
          onAdd={() => addArr('faqs', emptyFaq)}
          addLabel="Question"
        >
          {form.faqs.length === 0 && (
            <p className="text-xs text-neutral-400 italic">No FAQs yet.</p>
          )}
          {form.faqs.map((f, i) => (
            <ItemCard key={i} title={`FAQ ${i + 1}`} onRemove={() => removeArr('faqs', i)}>
              <div className="space-y-2.5">
                <Field label="Question">
                  <input type="text" value={f.question} onChange={(e) => setArr('faqs', i, 'question', e.target.value)} className={inputCls} placeholder="Is there a student discount?" />
                </Field>
                <Field label="Answer">
                  <textarea rows={2} value={f.answer} onChange={(e) => setArr('faqs', i, 'answer', e.target.value)} className={`${inputCls} resize-none`} />
                </Field>
              </div>
            </ItemCard>
          ))}
        </Section>

        {/* Pricing */}
        <Section
          icon={Ticket}
          title={`Pricing (${form.pricing.length})`}
          hint="Tiered pricing tiers (audience, amount, status)"
          onAdd={() => addArr('pricing', emptyPrice)}
          addLabel="Tier"
        >
          {form.pricing.length === 0 && (
            <p className="text-xs text-neutral-400 italic">No pricing tiers — the event falls back to registration.feeState for display.</p>
          )}
          {form.pricing.map((p, i) => (
            <ItemCard key={i} title={`Tier ${i + 1}`} onRemove={() => removeArr('pricing', i)}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <Field label="Audience">
                  <input type="text" value={p.audience} onChange={(e) => setArr('pricing', i, 'audience', e.target.value)} className={inputCls} placeholder="Students" />
                </Field>
                <Field label="Amount">
                  <input type="number" min="0" step="0.01" value={p.amount ?? ''} onChange={(e) => setArr('pricing', i, 'amount', e.target.value)} className={inputCls} placeholder="149" />
                </Field>
                <Field label="Currency">
                  <select value={p.currency} onChange={(e) => setArr('pricing', i, 'currency', e.target.value)} className={`${inputCls} cursor-pointer`}>
                    {['USD', 'EUR', 'GBP', 'INR'].map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label="Status">
                  <select value={p.status} onChange={(e) => setArr('pricing', i, 'status', e.target.value)} className={`${inputCls} cursor-pointer`}>
                    {['available', 'sold_out', 'waitlist', 'coming_soon'].map((st) => <option key={st} value={st}>{st.replace('_', ' ')}</option>)}
                  </select>
                </Field>
              </div>
            </ItemCard>
          ))}
        </Section>

        {/* Preparation */}
        <Section
          icon={ClipboardList}
          title="Preparation"
          hint="What attendees need beforehand, get, and must bring"
          onAdd={() => addPrep('prerequisites')}
          addLabel="Prerequisite"
        >
          {(['prerequisites', 'materialsProvided', 'materialsRequired']).map((field) => {
            const labels = {
              prerequisites: 'Prerequisites — what attendees need beforehand',
              materialsProvided: 'Materials provided — what the event gives attendees',
              materialsRequired: 'Materials required — what attendees must bring',
            };
            return (
              <div key={field} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">{labels[field]}</span>
                  <button
                    type="button"
                    onClick={() => addPrep(field)}
                    className="p-1 rounded hover:bg-neutral-200/50 dark:hover:bg-white/5 text-neutral-400 hover:text-neutral-700 dark:hover:text-white transition-colors"
                    title="Add item"
                  >
                    <Plus size={12} />
                  </button>
                </div>
                {form.preparation[field].length === 0 && (
                  <p className="text-[11px] text-neutral-400 italic">None listed.</p>
                )}
                {form.preparation[field].map((item, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={item}
                      onChange={(e) => setPrep(field, i, e.target.value)}
                      className={inputCls}
                      placeholder={field === 'prerequisites' ? 'Basic Python knowledge' : field === 'materialsProvided' ? 'Lunch and course materials' : 'Laptop with Node.js installed'}
                    />
                    <button
                      type="button"
                      onClick={() => removePrep(field, i)}
                      className="p-1.5 rounded hover:bg-red-500/10 text-neutral-400 hover:text-red-500 transition-colors shrink-0"
                      title="Remove"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            );
          })}
        </Section>
      </div>
    </div>
  );
};

export default EventDetailsForm;
