import { useState, useEffect, useMemo } from 'react';
import {
  X,
  Loader2,
  Save,
  Tag,
  FileText,
  CalendarDays,
  MapPin,
  Ticket,
  Building2,
  ImageIcon,
  Mail,
  Globe,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { createEvent, updateEvent } from '@/api/eventAPI';
import { useNestedForm } from '@/hooks/useNestedForm';

const inputCls =
  'w-full px-3 py-2 bg-white dark:bg-[#1b1b1e] border border-neutral-200/60 dark:border-white/5 rounded-lg text-xs text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:border-neutral-400 dark:focus:border-[#2b2b30] transition-all shadow-sm';

const EVENT_TYPE_FALLBACKS = [
  { name: 'Conference', slug: 'conference' },
  { name: 'Summit', slug: 'summit' },
  { name: 'Workshop', slug: 'workshop' },
  { name: 'Webinar', slug: 'webinar' },
  { name: 'Meetup', slug: 'meetup' },
  { name: 'Expo', slug: 'expo' },
  { name: 'Trade Show', slug: 'trade_show' },
  { name: 'Career Fair', slug: 'career_fair' },
  { name: 'Networking Event', slug: 'networking_event' },
  { name: 'Training Program', slug: 'training_program' },
  { name: 'Festival', slug: 'festival' },
];

const blankForm = () => ({
  title: '',
  headline: '',
  eventType: '',
  status: 'draft',
  visibility: 'public',
  audienceScope: '',
  featured: false,
  heroBanner: false,
  featuredPriority: 0,
  topics: '',
  tags: '',
  shortSummary: '',
  mediumSummary: '',
  detailedOverview: '',
  start: '',
  end: '',
  timezone: '',
  duration: '',
  mode: '',
  venueName: '',
  street: '',
  city: '',
  state: '',
  country: '',
  postalCode: '',
  virtualPlatform: '',
  googleMapsUrl: '',
  regStatus: '',
  fee: '',
  currency: '',
  deadline: '',
  regUrl: '',
  earlyBirdDeadline: '',
  earlyBirdFee: '',
  organizerName: '',
  organizerWebsite: '',
  organizerEmail: '',
  organizerPhone: '',
  organizerLogo: '',
  imageUrl: '',
  imageAlt: '',
  contactEmail: '',
  contactPhone: '',
  contactWebsite: '',
  metaTitle: '',
  metaDescription: '',
  seoKeywords: '',
  canonicalUrl: '',
});

const pad = (n) => String(n).padStart(2, '0');

const toInputDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const hydrate = (ev) => ({
  title: ev.title || '',
  headline: ev.headline || '',
  eventType: ev.eventType || '',
  status: ev.status || 'draft',
  visibility: ev.visibility || 'public',
  audienceScope: ev.audienceScope || '',
  featured: !!ev.featured,
  heroBanner: !!ev.heroBanner,
  featuredPriority: typeof ev.featuredPriority === 'number' ? ev.featuredPriority : 0,
  topics: (ev.topics || []).join(', '),
  tags: (ev.tags || []).join(', '),
  shortSummary: ev.shortSummary || '',
  mediumSummary: ev.mediumSummary || '',
  detailedOverview: ev.detailedOverview || '',
  start: toInputDate(ev.eventDates?.start),
  end: toInputDate(ev.eventDates?.end),
  timezone: ev.eventDates?.timezone || '',
  duration: ev.eventDates?.duration || '',
  mode: ev.venue?.mode || '',
  venueName: ev.venue?.venueName || '',
  street: ev.venue?.address?.street || '',
  city: ev.venue?.address?.city || '',
  state: ev.venue?.address?.state || '',
  country: ev.venue?.address?.country || '',
  postalCode: ev.venue?.address?.postalCode || '',
  virtualPlatform: ev.venue?.virtualPlatform || '',
  googleMapsUrl: ev.venue?.googleMapsUrl || '',
  regStatus: ev.registration?.status || '',
  fee: ev.registration?.fee != null ? String(ev.registration.fee) : '',
  currency: ev.registration?.currency || '',
  deadline: toInputDate(ev.registration?.deadline),
  regUrl: ev.registration?.url || '',
  earlyBirdDeadline: toInputDate(ev.registration?.earlyBirdDeadline),
  earlyBirdFee: ev.registration?.earlyBirdFee != null ? String(ev.registration.earlyBirdFee) : '',
  organizerName: ev.organizer?.name || '',
  organizerWebsite: ev.organizer?.website || '',
  organizerEmail: ev.organizer?.email || '',
  organizerPhone: ev.organizer?.phone || '',
  organizerLogo: ev.organizer?.logo || '',
  imageUrl: ev.image?.primary?.url || '',
  imageAlt: ev.image?.alt || '',
  contactEmail: ev.contact?.email || '',
  contactPhone: ev.contact?.phone || '',
  contactWebsite: ev.contact?.website || '',
  metaTitle: ev.seo?.metaTitle || '',
  metaDescription: ev.seo?.metaDescription || '',
  seoKeywords: (ev.seo?.seoKeywords || []).join(', '),
  canonicalUrl: ev.seo?.canonicalUrl || '',
});

// Nested objects become dotted $set paths server-side, so any field this form
// does not include (coordinates, gallery, eligibility, social links…) is preserved.
const serialize = (f) => {
  const iso = (v) => (v ? new Date(v).toISOString() : null);
  const list = (v) =>
    v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  const nul = (v) => {
    const t = (v || '').trim();
    return t === '' ? null : t;
  };
  return {
    title: f.title.trim(),
    headline: nul(f.headline),
    eventType: f.eventType || null,
    status: f.status,
    visibility: f.visibility,
    audienceScope: f.audienceScope || null,
    featured: f.featured,
    heroBanner: f.heroBanner,
    featuredPriority: Math.max(0, Math.min(10, Number(f.featuredPriority) || 0)),
    topics: list(f.topics),
    tags: list(f.tags),
    shortSummary: nul(f.shortSummary),
    mediumSummary: nul(f.mediumSummary),
    detailedOverview: nul(f.detailedOverview),
    eventDates: {
      start: iso(f.start),
      end: iso(f.end),
      timezone: nul(f.timezone),
      duration: nul(f.duration),
    },
    venue: {
      mode: f.mode || null,
      venueName: nul(f.venueName),
      address: {
        street: nul(f.street),
        city: nul(f.city),
        state: nul(f.state),
        country: nul(f.country),
        postalCode: nul(f.postalCode),
      },
      googleMapsUrl: nul(f.googleMapsUrl),
      virtualPlatform: nul(f.virtualPlatform),
    },
    registration: {
      status: f.regStatus || null,
      fee: nul(f.fee),
      currency: nul(f.currency),
      deadline: iso(f.deadline),
      url: nul(f.regUrl),
      earlyBirdDeadline: iso(f.earlyBirdDeadline),
      earlyBirdFee: nul(f.earlyBirdFee),
    },
    organizer: {
      name: nul(f.organizerName),
      website: nul(f.organizerWebsite),
      email: nul(f.organizerEmail),
      phone: nul(f.organizerPhone),
      logo: nul(f.organizerLogo),
    },
    image: { url: nul(f.imageUrl), alt: nul(f.imageAlt) },
    contact: {
      email: nul(f.contactEmail),
      phone: nul(f.contactPhone),
      website: nul(f.contactWebsite),
    },
    seo: {
      metaTitle: nul(f.metaTitle),
      metaDescription: nul(f.metaDescription),
      seoKeywords: list(f.seoKeywords),
      canonicalUrl: nul(f.canonicalUrl),
    },
  };
};

function Field({ label, children }) {
  return (
    <div className="space-y-1">
      <label className="block text-[9px] font-semibold text-neutral-400 uppercase tracking-wider">{label}</label>
      {children}
    </div>
  );
}

function Section({ icon: Icon, title, children }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon size={12} className="text-neutral-400" />
        <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
          {title}
        </span>
        <div className="flex-1 h-px bg-neutral-200/60 dark:bg-white/5" />
      </div>
      {children}
    </div>
  );
}

function ToggleRow({ label, desc, checked, onChange }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-neutral-200/50 dark:border-white/5 px-3 py-2.5">
      <div>
        <p className="text-[10px] font-semibold text-neutral-700 dark:text-neutral-300">{label}</p>
        <p className="text-[9px] text-neutral-400">{desc}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={onChange}
        className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${
          checked ? 'bg-emerald-500' : 'bg-neutral-300 dark:bg-neutral-700'
        }`}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${
            checked ? 'left-[18px]' : 'left-0.5'
          }`}
        />
      </button>
    </div>
  );
}

export default function EventFormDrawer({ isOpen, isCreating, eventData, eventTypes, onClose, onSaved }) {
  // Shared form-state hook (same mechanism as the contest forms) — keys are
  // flat today, but nested dot-paths (e.g. 'address.city') work if the form
  // grows, and the whole form hydrates via the exposed setForm.
  const { form, setForm, update } = useNestedForm(blankForm);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setForm(eventData ? hydrate(eventData) : blankForm());
      setIsSaving(false);
    }
  }, [isOpen, eventData]);

  const typeOptions = useMemo(() => {
    const base = eventTypes?.length ? eventTypes : EVENT_TYPE_FALLBACKS;
    const opts = base.map((t) => ({ name: t.name, slug: t.slug }));
    if (form.eventType && !opts.some((t) => t.slug === form.eventType)) {
      opts.unshift({ name: form.eventType, slug: form.eventType });
    }
    return opts;
  }, [eventTypes, form.eventType]);

  const set = (key) => (e) => update(key, e.target.value);
  const toggle = (key) => () => setForm((f) => ({ ...f, [key]: !f[key] }));

  const handleSave = async () => {
    if (!form.title.trim()) return toast.error('Title is required');
    setIsSaving(true);
    try {
      const payload = serialize(form);
      const res = isCreating ? await createEvent(payload) : await updateEvent(eventData._id, payload);
      if (res.success) {
        toast.success(res.message || 'Saved');
        onSaved(res.event);
        onClose();
      } else {
        toast.error(res.message || 'Failed to save');
      }
    } catch (err) {
      toast.error(err?.message || 'Failed to save event');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-45 bg-black/30 dark:bg-black/60 backdrop-blur-[2px]"
          />

          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 220 }}
            className="fixed inset-y-0 right-0 z-50 w-full max-w-xl bg-white dark:bg-[#151518] border-l border-neutral-200/50 dark:border-white/5 shadow-2xl flex flex-col overflow-hidden text-xs"
          >
            {/* Header */}
            <div className="shrink-0 px-5 py-4 border-b border-neutral-200/50 dark:border-white/5 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="block text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
                  {isCreating ? 'Create Event' : 'Edit Event'}
                </span>
                <p className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 truncate mt-0.5">
                  {form.title || 'Untitled event'}
                </p>
                {!isCreating && eventData && (
                  <p className="text-[9px] font-mono text-neutral-400 truncate mt-0.5">
                    {eventData.eventId || eventData.slug || eventData._id}
                  </p>
                )}
              </div>
              <button
                onClick={onClose}
                className="p-1 rounded-lg hover:bg-neutral-100 dark:hover:bg-white/5 text-neutral-400 hover:text-neutral-750 dark:hover:text-white transition-colors shrink-0"
              >
                <X size={15} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-7">
              {/* Basics */}
              <Section icon={Tag} title="Basics & Status">
                <Field label="Title *">
                  <input type="text" value={form.title} onChange={set('title')} placeholder="Event name" className={inputCls} />
                </Field>
                <Field label="Headline">
                  <input type="text" value={form.headline} onChange={set('headline')} placeholder="One-line hook shown under the title" className={inputCls} />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Event Type">
                    <select value={form.eventType} onChange={set('eventType')} className={inputCls}>
                      <option value="">Unclassified</option>
                      {typeOptions.map((t) => (
                        <option key={t.slug} value={t.slug}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Status">
                    <select value={form.status} onChange={set('status')} className={inputCls}>
                      <option value="draft">Draft</option>
                      <option value="published">Published</option>
                      <option value="cancelled">Cancelled</option>
                      <option value="archived">Archived</option>
                    </select>
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Visibility">
                    <select value={form.visibility} onChange={set('visibility')} className={inputCls}>
                      <option value="public">Public</option>
                      <option value="private">Private</option>
                    </select>
                  </Field>
                  <Field label="Audience Scope">
                    <select value={form.audienceScope} onChange={set('audienceScope')} className={inputCls}>
                      <option value="">Not classified</option>
                      <option value="all">All audiences</option>
                      <option value="women">Women-focused</option>
                    </select>
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-3 items-end">
                  <Field label="Featured Priority (0–10)">
                    <input type="number" min={0} max={10} value={form.featuredPriority} onChange={set('featuredPriority')} className={inputCls} />
                  </Field>
                </div>

                <ToggleRow
                  label="Featured"
                  desc="Highlighted in the featured rail on the site"
                  checked={form.featured}
                  onChange={toggle('featured')}
                />
                <ToggleRow
                  label="Hero Banner"
                  desc="Eligible for the /events hero banner carousel"
                  checked={form.heroBanner}
                  onChange={toggle('heroBanner')}
                />

                <Field label="Topics (comma-separated)">
                  <input type="text" value={form.topics} onChange={set('topics')} placeholder="ai, robotics, startups" className={inputCls} />
                </Field>
                <Field label="Tags (comma-separated)">
                  <input type="text" value={form.tags} onChange={set('tags')} placeholder="tech, free-entry, students" className={inputCls} />
                </Field>
              </Section>

              {/* Summaries */}
              <Section icon={FileText} title="Summaries">
                <Field label="Short Summary">
                  <textarea rows={2} value={form.shortSummary} onChange={set('shortSummary')} placeholder="Card description (~160 chars)" className={`${inputCls} resize-none`} />
                </Field>
                <Field label="Medium Summary">
                  <textarea rows={3} value={form.mediumSummary} onChange={set('mediumSummary')} placeholder="Detail page intro paragraph" className={`${inputCls} resize-none`} />
                </Field>
                <Field label="Detailed Overview">
                  <textarea rows={5} value={form.detailedOverview} onChange={set('detailedOverview')} placeholder="Full about-this-event copy" className={`${inputCls} resize-y`} />
                </Field>
              </Section>

              {/* Schedule */}
              <Section icon={CalendarDays} title="Schedule">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Starts">
                    <input type="datetime-local" value={form.start} onChange={set('start')} className={inputCls} />
                  </Field>
                  <Field label="Ends">
                    <input type="datetime-local" value={form.end} onChange={set('end')} className={inputCls} />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Timezone">
                    <input type="text" value={form.timezone} onChange={set('timezone')} placeholder="Asia/Kolkata" className={inputCls} />
                  </Field>
                  <Field label="Duration Label">
                    <input type="text" value={form.duration} onChange={set('duration')} placeholder="2 days" className={inputCls} />
                  </Field>
                </div>
              </Section>

              {/* Venue */}
              <Section icon={MapPin} title="Venue">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Mode">
                    <select value={form.mode} onChange={set('mode')} className={inputCls}>
                      <option value="">Unknown</option>
                      <option value="in-person">In-person</option>
                      <option value="online">Online</option>
                      <option value="hybrid">Hybrid</option>
                      <option value="offline">Offline</option>
                    </select>
                  </Field>
                  <Field label="Venue Name">
                    <input type="text" value={form.venueName} onChange={set('venueName')} placeholder="Hall name" className={inputCls} />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="City">
                    <input type="text" value={form.city} onChange={set('city')} className={inputCls} />
                  </Field>
                  <Field label="State">
                    <input type="text" value={form.state} onChange={set('state')} className={inputCls} />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Country">
                    <input type="text" value={form.country} onChange={set('country')} placeholder="India / IN" className={inputCls} />
                  </Field>
                  <Field label="Postal Code">
                    <input type="text" value={form.postalCode} onChange={set('postalCode')} className={inputCls} />
                  </Field>
                </div>
                <Field label="Street Address">
                  <input type="text" value={form.street} onChange={set('street')} className={inputCls} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Virtual Platform">
                    <input type="text" value={form.virtualPlatform} onChange={set('virtualPlatform')} placeholder="Zoom, YouTube…" className={inputCls} />
                  </Field>
                  <Field label="Google Maps URL">
                    <input type="text" value={form.googleMapsUrl} onChange={set('googleMapsUrl')} className={inputCls} />
                  </Field>
                </div>
              </Section>

              {/* Registration */}
              <Section icon={Ticket} title="Registration">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Registration Status">
                    <select value={form.regStatus} onChange={set('regStatus')} className={inputCls}>
                      <option value="">Unknown</option>
                      <option value="open">Open</option>
                      <option value="closed">Closed</option>
                      <option value="waitlist">Waitlist</option>
                    </select>
                  </Field>
                  <Field label="Currency">
                    <input type="text" value={form.currency} onChange={set('currency')} placeholder="USD / INR" className={inputCls} />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Fee">
                    <input type="text" value={form.fee} onChange={set('fee')} placeholder="Free / 99 / ₹499" className={inputCls} />
                  </Field>
                  <Field label="Early Bird Fee">
                    <input type="text" value={form.earlyBirdFee} onChange={set('earlyBirdFee')} className={inputCls} />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Registration Deadline">
                    <input type="datetime-local" value={form.deadline} onChange={set('deadline')} className={inputCls} />
                  </Field>
                  <Field label="Early Bird Deadline">
                    <input type="datetime-local" value={form.earlyBirdDeadline} onChange={set('earlyBirdDeadline')} className={inputCls} />
                  </Field>
                </div>
                <Field label="Registration URL">
                  <input type="text" value={form.regUrl} onChange={set('regUrl')} placeholder="https://…" className={inputCls} />
                </Field>
              </Section>

              {/* Organizer */}
              <Section icon={Building2} title="Organizer">
                <Field label="Organizer Name">
                  <input type="text" value={form.organizerName} onChange={set('organizerName')} className={inputCls} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Website">
                    <input type="text" value={form.organizerWebsite} onChange={set('organizerWebsite')} className={inputCls} />
                  </Field>
                  <Field label="Logo URL">
                    <input type="text" value={form.organizerLogo} onChange={set('organizerLogo')} className={inputCls} />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Email">
                    <input type="text" value={form.organizerEmail} onChange={set('organizerEmail')} className={inputCls} />
                  </Field>
                  <Field label="Phone">
                    <input type="text" value={form.organizerPhone} onChange={set('organizerPhone')} className={inputCls} />
                  </Field>
                </div>
              </Section>

              {/* Image */}
              <Section icon={ImageIcon} title="Card Image">
                {form.imageUrl && (
                  <div className="rounded-lg overflow-hidden border border-neutral-200/60 dark:border-white/5 bg-neutral-50 dark:bg-[#1b1b1e]">
                    <img
                      src={form.imageUrl}
                      alt="preview"
                      className="w-full h-32 object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  </div>
                )}
                <Field label="Primary Image URL">
                  <input type="text" value={form.imageUrl} onChange={set('imageUrl')} placeholder="https://…" className={inputCls} />
                </Field>
                <Field label="Alt Text">
                  <input type="text" value={form.imageAlt} onChange={set('imageAlt')} className={inputCls} />
                </Field>
              </Section>

              {/* Contact */}
              <Section icon={Mail} title="Contact">
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Email">
                    <input type="text" value={form.contactEmail} onChange={set('contactEmail')} className={inputCls} />
                  </Field>
                  <Field label="Phone">
                    <input type="text" value={form.contactPhone} onChange={set('contactPhone')} className={inputCls} />
                  </Field>
                  <Field label="Website">
                    <input type="text" value={form.contactWebsite} onChange={set('contactWebsite')} className={inputCls} />
                  </Field>
                </div>
              </Section>

              {/* SEO */}
              <Section icon={Globe} title="SEO">
                <Field label="Meta Title">
                  <input type="text" value={form.metaTitle} onChange={set('metaTitle')} className={inputCls} />
                </Field>
                <Field label="Meta Description">
                  <textarea rows={2} value={form.metaDescription} onChange={set('metaDescription')} className={`${inputCls} resize-none`} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Keywords (comma-separated)">
                    <input type="text" value={form.seoKeywords} onChange={set('seoKeywords')} className={inputCls} />
                  </Field>
                  <Field label="Canonical URL">
                    <input type="text" value={form.canonicalUrl} onChange={set('canonicalUrl')} className={inputCls} />
                  </Field>
                </div>
              </Section>
            </div>

            {/* Footer */}
            <div className="shrink-0 p-4 border-t border-neutral-200/50 dark:border-white/5 bg-neutral-50/50 dark:bg-neutral-900/30 flex justify-between gap-3">
              <button
                onClick={handleSave}
                disabled={isSaving || !form.title.trim()}
                className="flex-1 py-2 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-lg text-xs font-semibold hover:opacity-90 disabled:opacity-40 transition-colors shadow-sm flex items-center justify-center gap-1.5"
              >
                {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                {isCreating ? 'Create Event' : 'Save Changes'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-neutral-200 dark:border-white/5 rounded-lg text-xs font-semibold text-neutral-500 hover:text-neutral-800 dark:hover:text-white bg-white dark:bg-[#18181b] hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors shadow-sm"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
