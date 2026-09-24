import { useState, useEffect, useRef } from 'react';
import { useNestedForm } from '@/hooks/useNestedForm';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Save,
  Loader2,
  FileText,
  Target,
  Globe,
  Search,
  Trash2,
  Expand,
  Shrink,
  Cpu,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import {
  getContestDetails,
  saveContestDetails,
  deleteContestDetails,
} from '@/api/contestAPI';
import {
  Field,
  TextInput,
  TextArea,
  ChipInput,
  ListItemEditor,
  SectionCard,
} from './contestFormUI';

/* ────────────────────────────────────────────────────────────────────────────
   Empty / mapping helpers
──────────────────────────────────────────────────────────────────────────── */

const createEmptyForm = () => ({
  content: {
    hero: { subheadline: '', valueProposition: '' },
    whyJoin: '',
    whoShouldApply: '',
    benefits: [],
    submissionGuide: [],
    timelineSummary: [],
    tips: [],
    faq: [],
    shouldYouApply: { idealFor: '', goodFit: [], notIdealFor: [] },
    readingTime: '',
    judgingProcess: '',
    mentorshipDetails: '',
    resourceOfferings: [],
  },
  research: {
    officialWebsite: { url: '' },
    pastWinners: [],
    communityTips: [],
  },
  seo: {
    metaTitle: '',
    metaDescription: '',
    keywords: [],
  },
});

const str = (v) => (v === null || v === undefined ? '' : String(v));

const mapDocToForm = (doc) => {
  const f = createEmptyForm();
  const c = doc?.content || {};
  const h = c.hero || {};
  f.content.hero = {
    subheadline: str(h.subheadline),
    valueProposition: str(h.valueProposition),
  };
  f.content.whyJoin = str(c.whyJoin);
  f.content.whoShouldApply = str(c.whoShouldApply);
  f.content.benefits = Array.isArray(c.benefits) ? c.benefits.slice() : [];
  f.content.tips = Array.isArray(c.tips) ? c.tips.slice() : [];
  f.content.readingTime = c.readingTime === undefined || c.readingTime === null ? '' : String(c.readingTime);
  f.content.judgingProcess = str(c.judgingProcess);
  f.content.mentorshipDetails = str(c.mentorshipDetails);
  f.content.submissionGuide = (c.submissionGuide || []).map((g) => ({
    step: str(g?.step),
    detail: str(g?.detail),
  }));
  f.content.timelineSummary = (c.timelineSummary || []).map((t) => ({
    phase: str(t?.phase),
    date: str(t?.date),
    label: str(t?.label),
  }));
  f.content.faq = (c.faq || []).map((q) => ({
    question: str(q?.question),
    answer: str(q?.answer),
  }));
  const sya = c.shouldYouApply || {};
  f.content.shouldYouApply = {
    idealFor: str(sya.idealFor),
    goodFit: Array.isArray(sya.goodFit) ? sya.goodFit.slice() : [],
    notIdealFor: Array.isArray(sya.notIdealFor) ? sya.notIdealFor.slice() : [],
  };
  f.content.resourceOfferings = (c.resourceOfferings || []).map((o) => ({
    type: str(o?.type),
    provider: str(o?.provider),
    value: str(o?.value),
    description: str(o?.description),
  }));
  const r = doc?.research || {};
  f.research.officialWebsite = { url: str(r.officialWebsite?.url) };
  f.research.pastWinners = Array.isArray(r.pastWinners) ? r.pastWinners.slice() : [];
  f.research.communityTips = Array.isArray(r.communityTips) ? r.communityTips.slice() : [];
  const s = doc?.seo || {};
  f.seo.metaTitle = str(s.metaTitle);
  f.seo.metaDescription = str(s.metaDescription);
  f.seo.keywords = Array.isArray(s.keywords) ? s.keywords.slice() : [];
  return f;
};

const buildPayload = (form) => {
  const s = (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
  const list = (v) => (Array.isArray(v) && v.length > 0 ? v : []);
  const num = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  };

  const payload = {
    content: {
      hero: {
        subheadline: s(form.content.hero.subheadline),
        valueProposition: s(form.content.hero.valueProposition),
      },
      whyJoin: s(form.content.whyJoin),
      whoShouldApply: s(form.content.whoShouldApply),
      benefits: list(form.content.benefits),
      tips: list(form.content.tips),
      readingTime: num(form.content.readingTime),
      judgingProcess: s(form.content.judgingProcess),
      mentorshipDetails: s(form.content.mentorshipDetails),
      submissionGuide: form.content.submissionGuide
        .filter((g) => (g.step || '').trim())
        .map((g) => ({
          step: g.step.trim(),
          detail: s(g.detail),
        })),
      timelineSummary: form.content.timelineSummary
        .filter((t) => (t.phase || t.label || '').trim())
        .map((t) => ({
          phase: s(t.phase),
          date: s(t.date),
          label: s(t.label),
        })),
      faq: form.content.faq
        .filter((q) => (q.question || '').trim())
        .map((q) => ({
          question: q.question.trim(),
          answer: s(q.answer),
        })),
      shouldYouApply: {
        idealFor: s(form.content.shouldYouApply.idealFor),
        goodFit: list(form.content.shouldYouApply.goodFit),
        notIdealFor: list(form.content.shouldYouApply.notIdealFor),
      },
      resourceOfferings: form.content.resourceOfferings
        .filter((o) => (o.type || '').trim())
        .map((o) => ({
          type: o.type.trim(),
          provider: s(o.provider),
          value: s(o.value),
          description: s(o.description),
        })),
    },
    research: {
      officialWebsite: { url: s(form.research.officialWebsite.url) },
      pastWinners: list(form.research.pastWinners),
      communityTips: list(form.research.communityTips),
    },
    seo: {
      metaTitle: s(form.seo.metaTitle),
      metaDescription: s(form.seo.metaDescription),
      keywords: list(form.seo.keywords),
    },
  };
  return payload;
};

/* ────────────────────────────────────────────────────────────────────────────
   Main component
──────────────────────────────────────────────────────────────────────────── */

const ContestDetailsForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();

  // Shared hook — replaces the copy-pasted update() that hid the read-only
  // fields bug. See hooks/useNestedForm.js.
  const { form, setForm, update } = useNestedForm(createEmptyForm);
  const [contest, setContest] = useState(null);
  const [existing, setExisting] = useState(null);
  const [openSections, setOpenSections] = useState({ guide: true });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const confirmDeleteRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        const res = await getContestDetails(id);
        if (cancelled) return;
        if (res.success && res.contest) {
          setContest(res.contest);
          if (res.details) {
            setExisting(res.details);
            setForm(mapDocToForm(res.details));
          } else {
            setExisting(null);
            setForm(createEmptyForm());
          }
        } else {
          toast.error('Contest not found');
          navigate('/contests', { replace: true });
        }
      } catch (err) {
        if (cancelled) return;
        toast.error(err?.message || 'Failed to load contest');
        navigate('/contests', { replace: true });
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, navigate]);

  const toggleSection = (key) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  // All collapsible sections (hackathon section only exists for hackathons)
  const sectionKeys = ['guide', 'fit', 'seo', 'sources'];
  if (contest?.type === 'hackathon') sectionKeys.push('hackathon');

  // allOpen must be checked against the real section list — Object.values({}).every()
  // is vacuously true, which left the button stuck on "Collapse All" after collapsing.
  const allOpen = sectionKeys.length > 0 && sectionKeys.every((k) => !!openSections[k]);

  const expandAll = () => setOpenSections(Object.fromEntries(sectionKeys.map((k) => [k, true])));
  const collapseAll = () => setOpenSections({});

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload = buildPayload(form);
      const res = await saveContestDetails(id, payload);
      if (res.success) {
        setExisting(res.details || existing);
        toast.success(res.message || 'Detailed guide saved');
        navigate(`/contests/${id}/edit`);
      }
    } catch (err) {
      toast.error(err?.message || 'Failed to save detailed guide');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDeleteRef.current) {
      confirmDeleteRef.current = true;
      toast('Click Delete again to confirm removing this DETAILED GUIDE.', { icon: '⚠️' });
      setTimeout(() => {
        confirmDeleteRef.current = false;
      }, 4000);
      return;
    }
    setIsDeleting(true);
    try {
      const res = await deleteContestDetails(id);
      if (res.success) {
        toast.success('Detailed guide deleted');
        navigate(`/contests/${id}/edit`);
      }
    } catch (err) {
      toast.error(err?.message || 'Failed to delete detailed guide');
    } finally {
      setIsDeleting(false);
      confirmDeleteRef.current = false;
    }
  };

  const sectionCount = existing
    ? Object.entries(buildPayload(form).content).filter(
        ([k, v]) =>
          // Skip nested container objects — count only populated scalar/array sections
          !['hero', 'shouldYouApply'].includes(k) &&
          (Array.isArray(v) ? v.length > 0 : !!v)
      ).length
    : 0;

  return (
    <div className="h-full flex flex-col bg-neutral-50/30 dark:bg-[#0d0d0f]/20 selection:bg-neutral-200/50 dark:selection:bg-neutral-400/40">
      {/* Sticky header */}
      <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-neutral-200/50 dark:border-white/5 bg-white/40 dark:bg-[#121214]/40 backdrop-blur-sm">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate('/contests')}
            className="p-1.5 rounded-md border border-neutral-200/50 dark:border-white/5 bg-white dark:bg-[#18181b] hover:bg-neutral-50 dark:hover:bg-white/5 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-all shadow-sm shrink-0"
            title="Back to contests"
          >
            <ArrowLeft size={15} />
          </button>
          <div className="min-w-0">
            <div className="flex items-baseline gap-3 min-w-0">
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
                Detailed Guide{existing ? ` · v${existing.version || 1}` : ' · no guide yet'}
              </span>
              <h1 className="text-base font-semibold text-neutral-900 dark:text-neutral-100 leading-snug truncate" title={contest?.title}>
                {contest ? contest.title : 'Contest Guide Editor'}
              </h1>
            </div>
            {contest && (
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 truncate">
                {[contest.type, contest.category, contest.status].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {existing && (
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="px-3 py-1.5 rounded-md border border-red-200/60 dark:border-red-500/20 bg-white dark:bg-[#18181b] hover:bg-red-50 dark:hover:bg-red-500/10 text-red-600 dark:text-red-400 hover:text-red-700 transition-all shadow-sm text-[11px] font-medium disabled:opacity-40 flex items-center gap-1.5"
            >
              {isDeleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
              Delete
            </button>
          )}
          <button
            onClick={() => navigate('/contests')}
            className="px-3 py-1.5 rounded-md border border-neutral-200/50 dark:border-white/5 bg-white dark:bg-[#18181b] hover:bg-neutral-50 dark:hover:bg-white/5 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-all shadow-sm text-[11px] font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isLoading || isSaving}
            className="px-4 py-1.5 rounded-md bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:opacity-90 transition-all shadow-sm flex items-center gap-1.5 text-[11px] font-semibold disabled:opacity-40"
          >
            {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} strokeWidth={2.5} />}
            {isSaving ? 'Saving…' : 'Save Detailed Guide'}
          </button>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-6">
        {isLoading ? (
          <div className="max-w-5xl mx-auto space-y-3 animate-pulse">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-neutral-200/50 dark:bg-neutral-800 rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="max-w-5xl mx-auto space-y-4">
            {/* Utility row */}
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-neutral-500 dark:text-neutral-500 flex items-center gap-1.5">
                <CheckCircle2 size={11} className="text-emerald-500" />
                Renders as the DETAILED GUIDE on the live contest page · empty fields are hidden
                {existing && sectionCount > 0 && (
                  <span className="font-mono text-neutral-500"> · {sectionCount} populated sections</span>
                )}
              </p>
              <button
                type="button"
                onClick={allOpen ? collapseAll : expandAll}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-neutral-200/50 dark:border-white/5 bg-white dark:bg-[#151518] hover:bg-neutral-50 dark:hover:bg-white/5 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-all shadow-sm text-[11px] font-medium"
              >
                {allOpen ? <Shrink size={12} /> : <Expand size={12} />}
                {allOpen ? 'Collapse All' : 'Expand All'}
              </button>
            </div>

            {/* Guide content */}
            <SectionCard
              title="Guide Content"
              desc="Why Join, Who Should Apply, Benefits, Submission Guide & FAQ"
              icon={FileText}
              open={!!openSections.guide}
              onToggle={() => toggleSection('guide')}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Hero — Subheadline">
                  <TextInput
                    value={form.content.hero.subheadline}
                    onChange={(v) => update('content.hero.subheadline', v)}
                    placeholder="e.g. The world's largest global innovation challenge"
                  />
                </Field>
                <Field label="Hero — Value Proposition">
                  <TextInput
                    value={form.content.hero.valueProposition}
                    onChange={(v) => update('content.hero.valueProposition', v)}
                    placeholder="e.g. Win $1M in funding, mentorship, and global visibility"
                  />
                </Field>
                <Field label="Why Join" className="md:col-span-2">
                  <TextArea
                    value={form.content.whyJoin}
                    onChange={(v) => update('content.whyJoin', v)}
                    placeholder="Why should someone enter? Impact, prizes, network, recognition…"
                    rows={3}
                  />
                </Field>
                <Field label="Who Should Apply" className="md:col-span-2">
                  <TextArea
                    value={form.content.whoShouldApply}
                    onChange={(v) => update('content.whoShouldApply', v)}
                    placeholder="Describe the ideal participant profile"
                    rows={3}
                  />
                </Field>
                <Field label="Benefits" className="md:col-span-2">
                  <ChipInput
                    value={form.content.benefits}
                    onChange={(v) => update('content.benefits', v)}
                    placeholder="Press Enter to add a benefit (e.g. $1M prize pool)"
                  />
                </Field>
                <Field label="Tips & Strategy" className="md:col-span-2">
                  <ChipInput
                    value={form.content.tips}
                    onChange={(v) => update('content.tips', v)}
                    placeholder="Press Enter to add a tip (e.g. Start with the demo video early)"
                  />
                </Field>
                <Field label="Reading Time (minutes)">
                  <TextInput
                    type="number"
                    min="1"
                    value={form.content.readingTime}
                    onChange={(v) => update('content.readingTime', v)}
                    placeholder="e.g. 5"
                  />
                </Field>
              </div>

              <div className="mt-5 space-y-5">
                <div>
                  <p className="text-[10px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-2">
                    Submission Guide
                  </p>
                  <ListItemEditor
                    items={form.content.submissionGuide}
                    onChange={(v) => update('content.submissionGuide', v)}
                    fields={[
                      { key: 'step', label: 'Step', placeholder: 'e.g. Create an account' },
                      { key: 'detail', label: 'Detail', type: 'textarea', full: true },
                    ]}
                    addLabel="Add Step"
                    emptyText="No steps yet"
                  />
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-2">
                    Timeline Summary
                  </p>
                  <ListItemEditor
                    items={form.content.timelineSummary}
                    onChange={(v) => update('content.timelineSummary', v)}
                    fields={[
                      { key: 'phase', label: 'Phase', placeholder: 'e.g. Submissions open' },
                      { key: 'label', label: 'Label', placeholder: 'e.g. Milestone' },
                      { key: 'date', label: 'Date', placeholder: 'e.g. Mar 15, 2026' },
                    ]}
                    addLabel="Add Phase"
                    emptyText="No phases yet"
                  />
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-2">
                    FAQ
                  </p>
                  <ListItemEditor
                    items={form.content.faq}
                    onChange={(v) => update('content.faq', v)}
                    fields={[
                      { key: 'question', label: 'Question', placeholder: 'e.g. Is there an entry fee?' },
                      { key: 'answer', label: 'Answer', type: 'textarea', full: true },
                    ]}
                    addLabel="Add FAQ"
                    emptyText="No FAQs yet"
                  />
                </div>
              </div>
            </SectionCard>

            {/* Fit */}
            <SectionCard
              title="Who's a Good Fit"
              desc="Ideal for, good fit & not ideal for — shown under Who Should Apply"
              icon={Target}
              open={!!openSections.fit}
              onToggle={() => toggleSection('fit')}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Ideal For" className="md:col-span-2">
                  <TextArea
                    value={form.content.shouldYouApply.idealFor}
                    onChange={(v) => update('content.shouldYouApply.idealFor', v)}
                    placeholder="Short description of the perfect applicant"
                    rows={2}
                  />
                </Field>
                <Field label="Good Fit">
                  <ChipInput
                    value={form.content.shouldYouApply.goodFit}
                    onChange={(v) => update('content.shouldYouApply.goodFit', v)}
                    placeholder="Press Enter to add"
                  />
                </Field>
                <Field label="Not Ideal For">
                  <ChipInput
                    value={form.content.shouldYouApply.notIdealFor}
                    onChange={(v) => update('content.shouldYouApply.notIdealFor', v)}
                    placeholder="Press Enter to add"
                  />
                </Field>
              </div>
            </SectionCard>

            {/* Hackathon extras */}
            {contest?.type === 'hackathon' && (
              <SectionCard
                title="Hackathon Guide"
                desc="Judging process, mentorship & resource offerings"
                icon={Cpu}
                open={!!openSections.hackathon}
                onToggle={() => toggleSection('hackathon')}
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Judging Process">
                    <TextArea
                      value={form.content.judgingProcess}
                      onChange={(v) => update('content.judgingProcess', v)}
                      placeholder="How judging works: rounds, format, timeline"
                      rows={3}
                    />
                  </Field>
                  <Field label="Mentorship Details">
                    <TextArea
                      value={form.content.mentorshipDetails}
                      onChange={(v) => update('content.mentorshipDetails', v)}
                      placeholder="Available mentorship: schedule, format, who provides it"
                      rows={3}
                    />
                  </Field>
                </div>
                <div className="mt-5">
                  <p className="text-[10px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-2">
                    Resource Offerings
                  </p>
                  <ListItemEditor
                    items={form.content.resourceOfferings}
                    onChange={(v) => update('content.resourceOfferings', v)}
                    fields={[
                      { key: 'type', label: 'Type', placeholder: 'e.g. Cloud Credits' },
                      { key: 'provider', label: 'Provider', placeholder: 'e.g. Google Cloud' },
                      { key: 'value', label: 'Value', placeholder: 'e.g. $500 in credits' },
                      { key: 'description', label: 'Description', type: 'textarea', full: true },
                    ]}
                    addLabel="Add Offering"
                    emptyText="No resource offerings yet"
                  />
                </div>
              </SectionCard>
            )}

            {/* SEO */}
            <SectionCard
              title="SEO"
              desc="Meta title, description & keywords for search engines"
              icon={Search}
              open={!!openSections.seo}
              onToggle={() => toggleSection('seo')}
            >
              <div className="grid grid-cols-1 gap-4">
                <Field label="Meta Title" hint="Falls back to the contest title if blank">
                  <TextInput
                    value={form.seo.metaTitle}
                    onChange={(v) => update('seo.metaTitle', v)}
                    placeholder="e.g. Global Innovation Challenge 2026 — $1M Prize"
                  />
                </Field>
                <Field label="Meta Description" hint="Falls back to an auto-generated description if blank">
                  <TextArea
                    value={form.seo.metaDescription}
                    onChange={(v) => update('seo.metaDescription', v)}
                    placeholder="One or two compelling sentences for search results"
                    rows={2}
                  />
                </Field>
                <Field label="Keywords">
                  <ChipInput
                    value={form.seo.keywords}
                    onChange={(v) => update('seo.keywords', v)}
                    placeholder="Press Enter to add a keyword"
                    kebab
                  />
                </Field>
              </div>
            </SectionCard>

            {/* Sources */}
            <SectionCard
              title="Research Sources"
              desc="Official website & referenced sources shown in the guide footer"
              icon={Globe}
              open={!!openSections.sources}
              onToggle={() => toggleSection('sources')}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Official Website URL">
                  <TextInput
                    value={form.research.officialWebsite.url}
                    onChange={(v) => update('research.officialWebsite.url', v)}
                    placeholder="https://example.com"
                  />
                </Field>
                <Field label="Past Winners Referenced">
                  <ChipInput
                    value={form.research.pastWinners}
                    onChange={(v) => update('research.pastWinners', v)}
                    placeholder="Press Enter to add a reference"
                  />
                </Field>
                <Field label="Community Tips Referenced" className="md:col-span-2">
                  <ChipInput
                    value={form.research.communityTips}
                    onChange={(v) => update('research.communityTips', v)}
                    placeholder="Press Enter to add a reference"
                  />
                </Field>
              </div>
            </SectionCard>

            {/* Footer save */}
            <div className="flex items-center justify-end gap-2 pb-4">
              <button
                onClick={() => navigate('/contests')}
                className="px-4 py-2 rounded-md border border-neutral-200/50 dark:border-white/5 bg-white dark:bg-[#18181b] hover:bg-neutral-50 dark:hover:bg-white/5 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-all shadow-sm text-[11px] font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isLoading || isSaving}
                className="px-5 py-2 rounded-md bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:opacity-90 transition-all shadow-sm flex items-center gap-1.5 text-[11px] font-semibold disabled:opacity-40"
              >
                {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} strokeWidth={2.5} />}
                {isSaving ? 'Saving…' : 'Save Detailed Guide'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ContestDetailsForm;
