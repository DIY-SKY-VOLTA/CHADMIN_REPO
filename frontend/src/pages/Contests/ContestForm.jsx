import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Save,
  Loader2,
  Image as ImageIcon,
  FileText,
  Ticket,
  DollarSign,
  Users,
  Calendar,
  Filter,
  Link2,
  Cpu,
  BadgeCheck,
  Upload,
  CheckCircle2,
  Globe,
  Expand,
  Shrink,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import {
  getContest,
  createContest,
  updateContest,
  uploadContestImage,
} from '@/api/contestAPI';
import { useNestedForm } from '@/hooks/useNestedForm';
import {
  inputCls,
  Field,
  TextInput,
  TextArea,
  Select,
  Segmented,
  ChipGroup,
  ChipInput,
  ListItemEditor,
  SectionCard,
  DateTimePicker,
} from './contestFormUI';

/* ────────────────────────────────────────────────────────────────────────────
   Constants — must match Phase2 Contests.js v3.0 + contest-structuring-v4.3-upgraded.txt schema
──────────────────────────────────────────────────────────────────────────── */

const CANONICAL_CATEGORIES = [
  'Creative Arts',
  'Technology & AI',
  'Science & Research',
  'Business & Innovation',
  'Writing & Media',
  'Environment & Sustainability',
  'Food & Cooking',
  'Education & Learning',
  'Social Impact & Leadership',
  'Open / Multidisciplinary',
];

const DOMAIN_MAP = {
  'Creative Arts': 'creative-arts',
  'Technology & AI': 'technology-ai',
  'Science & Research': 'science-research',
  'Business & Innovation': 'business-innovation',
  'Writing & Media': 'writing-media',
  'Environment & Sustainability': 'environment-sustainability',
  'Food & Cooking': 'food-cooking',
  'Education & Learning': 'education-learning',
  'Social Impact & Leadership': 'social-impact-leadership',
  'Open / Multidisciplinary': 'open-multidisciplinary',
};

const TYPE_OPTIONS = [
  { value: 'contest', label: 'Contest' },
  { value: 'hackathon', label: 'Hackathon' },
];

const FLAG_OPTIONS = [
  { value: 'women', label: 'Women' },
  { value: 'hero', label: 'Hero' },
  { value: 'featured', label: 'Featured' },
  { value: 'all', label: 'All' },
  { value: 'broken-link', label: 'Broken Link' },
];

const MODE_OPTIONS = ['online', 'offline', 'in-person', 'hybrid'];
const SKILL_LEVELS = ['beginner', 'intermediate', 'advanced', 'open'];
const SKILL_SOURCES = ['explicit', 'inferred', 'default'];
const PARTICIPANT_TYPES = [
  'students',
  'recent_graduates',
  'researchers',
  'startups',
  'individuals',
  'teams',
  'companies',
];
const FORMAT_OPTIONS = ['video', 'image', 'text', 'audio'];
const MEDIUM_OPTIONS = ['digital', 'physical', 'hybrid'];
const SOURCE_TYPES = ['aggregator', 'direct', 'partner', 'official'];
const FEE_CONFIDENCE = ['confirmed', 'extracted', 'unknown'];
const STATUS_OPTIONS = ['open', 'scheduled', 'closed'];
const VERIFICATION_OPTIONS = ['verified', 'pending', 'failed'];

const FREE_OPTIONS = [
  { value: true, label: 'Free' },
  { value: false, label: 'Paid' },
  { value: null, label: 'Unknown' },
];

const MONETARY_OPTIONS = [
  { value: true, label: 'Monetary' },
  { value: false, label: 'Non-monetary' },
];

/* ────────────────────────────────────────────────────────────────────────────
   Helpers
──────────────────────────────────────────────────────────────────────────── */

/** Stored dates are UTC ISO. Show the UTC wall-clock in a datetime-local input. */
const toDatetimeLocal = (val) => {
  if (!val) return '';
  const s = String(val);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return s.slice(0, 16);
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};

/** datetime-local (YYYY-MM-DDTHH:mm) → explicit UTC ISO so the backend parses UTC. */
const fromDatetimeLocal = (val) => {
  if (!val) return null;
  return `${String(val).slice(0, 16)}:00.000Z`;
};

const createEmptyForm = () => ({
  title: '',
  type: 'contest',
  category: '',
  subCategory: '',
  link: '',
  description: '',
  descriptionDetailed: '',
  tags: [],
  flags: [],
  image: {
    primary: { url: '' },
    alt: '',
    tag: '',
  },
  entry: {
    isFree: null,
    feeUSD: '',
    fee: { amount: '', currency: 'USD' },
    feeConfidence: 'unknown',
    feeNote: '',
  },
  prize: {
    isMonetary: false,
    originalAmount: '',
    currency: 'USD',
    totalUSD: '',
    prizeSummary: '',
    description: '',
    breakdown: '',
  },
  audience: {
    eligibilityLabel: '',
    eligibilityDetail: '',
    mode: '',
    location: '',
    skillLevels: [],
    primarySkillLevel: '',
    skillLevelSource: '',
    age: { min: '', max: '' },
    constraints: {
      participantType: [],
      academicStatus: '',
      teamSize: { min: '', max: '' },
      graduationAfter: '',
      organizationFoundedAfter: '',
    },
  },
  timeline: {
    startUTC: '',
    registrationDeadlineUTC: '',
    submissionDeadlineUTC: '',
    eventEndUTC: '',
    organizerTimeZone: '',
  },
  filterKeys: {
    domain: '',
    format: [],
    medium: [],
    themes: [],
  },
  source: {
    name: '',
    url: '',
    type: 'aggregator',
  },
  hackathon: {
    duration: '',
    platform: '',
    techStack: [],
    mentorship: false,
    tracks: [],
    judgingCriteria: [],
    submissionRequirements: [],
    prizeBreakdown: [],
    engagement: { totalParticipants: '', projectsSubmitted: '' },
    teamSize: { min: '', max: '' },
  },
  status: '',
  verificationStatus: 'pending',
  trendingUntil: '',
  archivedAt: null,
});

const num = (v) =>
  v === null || v === undefined || v === '' ? '' : String(v);

const mapDocToForm = (doc) => {
  const f = createEmptyForm();
  f.title = doc.title || '';
  f.type = doc.type === 'hackathon' ? 'hackathon' : 'contest';
  f.category = doc.category || '';
  f.subCategory = doc.subCategory || '';
  f.link = doc.link || '';
  f.description = doc.description || '';
  f.descriptionDetailed = doc.descriptionDetailed || '';
  f.tags = Array.isArray(doc.tags) ? doc.tags.slice() : [];
  f.flags = Array.isArray(doc.flags) ? doc.flags.slice() : [];
  f.image = {
    primary: { url: doc.image?.primary?.url || '' },
    alt: doc.image?.alt || '',
    tag: doc.image?.tag || '',
  };
  f.entry = {
    isFree: doc.entry?.isFree ?? null,
    feeUSD: num(doc.entry?.feeUSD),
    fee: { amount: num(doc.entry?.fee?.amount), currency: doc.entry?.fee?.currency || 'USD' },
    feeConfidence: FEE_CONFIDENCE.includes(doc.entry?.feeConfidence) ? doc.entry.feeConfidence : 'unknown',
    feeNote: doc.entry?.feeNote || '',
  };
  f.prize = {
    isMonetary: !!doc.prize?.isMonetary,
    originalAmount: num(doc.prize?.originalAmount),
    currency: doc.prize?.currency || 'USD',
    totalUSD: num(doc.prize?.totalUSD),
    prizeSummary: doc.prize?.prizeSummary || '',
    description: doc.prize?.description || '',
    breakdown: doc.prize?.breakdown || '',
  };
  f.audience = {
    eligibilityLabel: doc.audience?.eligibilityLabel || '',
    eligibilityDetail: doc.audience?.eligibilityDetail || '',
    mode: MODE_OPTIONS.includes(doc.audience?.mode) ? doc.audience.mode : '',
    location: doc.audience?.location || '',
    skillLevels: Array.isArray(doc.audience?.skillLevels) ? doc.audience.skillLevels.slice() : [],
    primarySkillLevel: doc.audience?.primarySkillLevel || '',
    skillLevelSource: SKILL_SOURCES.includes(doc.audience?.skillLevelSource) ? doc.audience.skillLevelSource : '',
    age: { min: num(doc.audience?.age?.min), max: num(doc.audience?.age?.max) },
    constraints: {
      participantType: Array.isArray(doc.audience?.constraints?.participantType)
        ? doc.audience.constraints.participantType.slice()
        : [],
      academicStatus: doc.audience?.constraints?.academicStatus || '',
      teamSize: {
        min: num(doc.audience?.constraints?.teamSize?.min),
        max: num(doc.audience?.constraints?.teamSize?.max),
      },
      graduationAfter: doc.audience?.constraints?.graduationAfter || '',
      organizationFoundedAfter: doc.audience?.constraints?.organizationFoundedAfter || '',
    },
  };
  f.timeline = {
    startUTC: toDatetimeLocal(doc.timeline?.startUTC || doc.timeline?.startDateUTC),
    registrationDeadlineUTC: toDatetimeLocal(doc.timeline?.registrationDeadlineUTC),
    submissionDeadlineUTC: toDatetimeLocal(doc.timeline?.submissionDeadlineUTC),
    eventEndUTC: toDatetimeLocal(doc.timeline?.eventEndUTC),
    organizerTimeZone: doc.timeline?.organizerTimeZone || '',
  };
  f.filterKeys = {
    domain: doc.filterKeys?.domain || '',
    format: Array.isArray(doc.filterKeys?.format) ? doc.filterKeys.format.slice() : [],
    medium: Array.isArray(doc.filterKeys?.medium) ? doc.filterKeys.medium.slice() : [],
    themes: Array.isArray(doc.filterKeys?.themes) ? doc.filterKeys.themes.slice() : [],
  };
  f.source = {
    name: doc.source?.name || '',
    url: doc.source?.url || '',
    type: SOURCE_TYPES.includes(doc.source?.type) ? doc.source.type : 'aggregator',
  };
  if (doc.hackathon && typeof doc.hackathon === 'object') {
    const h = doc.hackathon;
    f.hackathon = {
      duration: h.duration || '',
      platform: h.platform || '',
      techStack: Array.isArray(h.techStack) ? h.techStack.slice() : [],
      mentorship: !!h.mentorship,
      tracks: (h.tracks || []).map((t) => ({
        name: t?.name || '',
        description: t?.description || '',
        prizeUSD: num(t?.prizeUSD),
      })),
      judgingCriteria: (h.judgingCriteria || []).map((j) => ({
        name: j?.name || '',
        description: j?.description || '',
        weight: num(j?.weight),
      })),
      submissionRequirements: Array.isArray(h.submissionRequirements) ? h.submissionRequirements.slice() : [],
      prizeBreakdown: (h.prizeBreakdown || []).map((p) => ({
        place: p?.place || '',
        track: p?.track || '',
        amount: p?.amount || '',
      })),
      engagement: {
        totalParticipants: num(h.engagement?.totalParticipants),
        projectsSubmitted: num(h.engagement?.projectsSubmitted),
      },
      teamSize: { min: num(h.teamSize?.min), max: num(h.teamSize?.max) },
    };
  }
  f.status = STATUS_OPTIONS.includes(doc.status) ? doc.status : '';
  f.verificationStatus = VERIFICATION_OPTIONS.includes(doc.verificationStatus)
    ? doc.verificationStatus
    : 'pending';
  f.trendingUntil = toDatetimeLocal(doc.trendingUntil);
  f.archivedAt = doc.archivedAt || null;
  return f;
};

/**
 * Build the canonical payload. Empty values are sent as `null` (never ""),
 * which the backend normalizer (cleanString/cleanNumber/toDate) then strips
 * into a clean document. Mirrors contest-structuring-v4.3-upgraded.txt field names exactly.
 */
const buildPayload = (form) => {
  const str = (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
  const nbr = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  };
  const arr = (v) => (Array.isArray(v) && v.length > 0 ? v : null);

  const payload = {
    title: str(form.title),
    type: form.type,
    category: str(form.category),
    subCategory: str(form.subCategory),
    link: str(form.link),
    description: str(form.description),
    descriptionDetailed: str(form.descriptionDetailed),
    tags: arr(form.tags),
    flags: arr(form.flags),
    image: {
      primary: { url: str(form.image.primary.url) },
      alt: str(form.image.alt),
      tag: str(form.image.tag),
    },
    entry: {
      isFree: form.entry.isFree,
      feeUSD: nbr(form.entry.feeUSD),
      fee: {
        amount: nbr(form.entry.fee.amount),
        currency: str(form.entry.fee.currency) || 'USD',
      },
      feeConfidence: FEE_CONFIDENCE.includes(form.entry.feeConfidence) ? form.entry.feeConfidence : 'unknown',
      feeNote: str(form.entry.feeNote),
    },
    prize: {
      isMonetary: form.prize.isMonetary,
      originalAmount: nbr(form.prize.originalAmount),
      currency: str(form.prize.currency) || 'USD',
      totalUSD: nbr(form.prize.totalUSD),
      prizeSummary: str(form.prize.prizeSummary),
      description: str(form.prize.description),
      breakdown: str(form.prize.breakdown),
    },
    audience: {
      eligibilityLabel: str(form.audience.eligibilityLabel),
      eligibilityDetail: str(form.audience.eligibilityDetail),
      mode: str(form.audience.mode),
      location: str(form.audience.location),
      skillLevels: arr(form.audience.skillLevels),
      primarySkillLevel: str(form.audience.primarySkillLevel),
      skillLevelSource: str(form.audience.skillLevelSource),
      age: {
        min: nbr(form.audience.age.min),
        max: nbr(form.audience.age.max),
      },
      constraints: {
        participantType: arr(form.audience.constraints.participantType),
        academicStatus: str(form.audience.constraints.academicStatus),
        teamSize: {
          min: nbr(form.audience.constraints.teamSize.min),
          max: nbr(form.audience.constraints.teamSize.max),
        },
        graduationAfter: str(form.audience.constraints.graduationAfter),
        organizationFoundedAfter: str(form.audience.constraints.organizationFoundedAfter),
      },
    },
    timeline: {
      startUTC: fromDatetimeLocal(form.timeline.startUTC),
      registrationDeadlineUTC: fromDatetimeLocal(form.timeline.registrationDeadlineUTC),
      submissionDeadlineUTC: fromDatetimeLocal(form.timeline.submissionDeadlineUTC),
      eventEndUTC: fromDatetimeLocal(form.timeline.eventEndUTC),
      organizerTimeZone: str(form.timeline.organizerTimeZone),
    },
    filterKeys: {
      domain: str(form.filterKeys.domain),
      format: arr(form.filterKeys.format),
      medium: arr(form.filterKeys.medium),
      themes: arr(form.filterKeys.themes),
    },
    source: {
      name: str(form.source.name),
      url: str(form.source.url),
      type: SOURCE_TYPES.includes(form.source.type) ? form.source.type : 'aggregator',
    },
    hackathon:
      form.type === 'hackathon'
        ? {
            duration: str(form.hackathon.duration),
            platform: str(form.hackathon.platform),
            techStack: arr(form.hackathon.techStack),
            mentorship: form.hackathon.mentorship,
            submissionRequirements: arr(form.hackathon.submissionRequirements),
            tracks: form.hackathon.tracks
              .filter((t) => (t.name || '').trim())
              .map((t) => ({
                name: t.name.trim(),
                description: str(t.description),
                prizeUSD: nbr(t.prizeUSD),
              })),
            judgingCriteria: form.hackathon.judgingCriteria
              .filter((j) => (j.name || '').trim())
              .map((j) => ({
                name: j.name.trim(),
                description: str(j.description),
                weight: nbr(j.weight),
              })),
            prizeBreakdown: form.hackathon.prizeBreakdown
              .filter((p) => (p.place || '').trim())
              .map((p) => ({
                place: p.place.trim(),
                track: str(p.track),
                amount: str(p.amount),
              })),
            engagement: {
              totalParticipants: nbr(form.hackathon.engagement.totalParticipants),
              projectsSubmitted: nbr(form.hackathon.engagement.projectsSubmitted),
            },
            teamSize: {
              min: nbr(form.hackathon.teamSize.min),
              max: nbr(form.hackathon.teamSize.max),
            },
          }
        : null,
    status: str(form.status),
    verificationStatus: VERIFICATION_OPTIONS.includes(form.verificationStatus)
      ? form.verificationStatus
      : 'pending',
    trendingUntil: fromDatetimeLocal(form.trendingUntil),
    archivedAt: form.archivedAt,
  };
  return payload;
};

/* Reusable UI primitives live in ./contestFormUI.jsx */

/* ────────────────────────────────────────────────────────────────────────────
   Main form component
──────────────────────────────────────────────────────────────────────────── */

const ContestForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = !!id;

  // Shared hook — same dot-path update() both contest forms previously
  // copy-pasted (and one copy of which was broken). See hooks/useNestedForm.js.
  const { form, setForm, update } = useNestedForm(createEmptyForm);
  const [openSections, setOpenSections] = useState({ identity: true });
  const [isLoading, setIsLoading] = useState(isEditing);
  const [isSaving, setIsSaving] = useState(false);
  const [localFile, setLocalFile] = useState(null);
  const [localPreview, setLocalPreview] = useState(null);
  const [domainEdited, setDomainEdited] = useState(false);
  const [imageErr, setImageErr] = useState(false);
  const [addDetailsNow, setAddDetailsNow] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (localPreview) return () => URL.revokeObjectURL(localPreview);
    return undefined;
  }, [localPreview]);

  // Load existing doc when editing
  useEffect(() => {
    if (!isEditing) return;
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        const res = await getContest(id);
        if (cancelled) return;
        if (res.success && res.contest) {
          setForm(mapDocToForm(res.contest));
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
  }, [isEditing, id, navigate]);

  const toggleSection = (key) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  // All collapsible sections (hackathon section only exists for hackathons)
  const sectionKeys = ['identity', 'image', 'entry', 'prize', 'audience', 'timeline', 'filterKeys', 'source', 'status', 'detailsLink', 'detailsChoice'];
  if (form.type === 'hackathon') sectionKeys.push('hackathon');

  // allOpen must be checked against the real section list — Object.values({}).every()
  // is vacuously true, which left the button stuck on "Collapse All" after collapsing.
  const allOpen = sectionKeys.length > 0 && sectionKeys.every((k) => !!openSections[k]);

  const expandAll = () => setOpenSections(Object.fromEntries(sectionKeys.map((k) => [k, true])));
  const collapseAll = () => setOpenSections({});

  const handleCategoryChange = (value) => {
    update('category', value);
    if (!domainEdited) {
      update('filterKeys.domain', DOMAIN_MAP[value] || '');
    }
  };

  const handleTypeChange = (value) => {
    update('type', value);
    if (value === 'hackathon') {
      setOpenSections((prev) => ({ ...prev, hackathon: true }));
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast.error('Image must be under 15MB');
      return;
    }
    if (localPreview) URL.revokeObjectURL(localPreview);
    setLocalFile(file);
    setLocalPreview(URL.createObjectURL(file));
    setImageErr(false);
  };

  const handleSave = async () => {
    const missing = [];
    if (!form.title.trim()) missing.push('Title');
    if (!form.category) missing.push('Category');
    if (!form.timeline.submissionDeadlineUTC) missing.push('Submission deadline');
    if (missing.length > 0) {
      toast.error(`Missing required fields: ${missing.join(', ')}`);
      return;
    }

    if (form.description && (form.description.length < 30 || form.description.length > 100)) {
      toast(
        `Description is ${form.description.length} chars — pipeline expects 30–100. Saving anyway.`,
        { icon: '⚠️' }
      );
    }
    if (
      form.descriptionDetailed &&
      (form.descriptionDetailed.length < 400 || form.descriptionDetailed.length > 700)
    ) {
      toast(
        `Detailed description is ${form.descriptionDetailed.length} chars — pipeline expects 400–700. Saving anyway.`,
        { icon: '⚠️' }
      );
    }

    setIsSaving(true);
    try {
      const payload = buildPayload(form);
      let savedId = id;
      if (isEditing) {
        const res = await updateContest(id, payload);
        savedId = res.contest?._id || id;
        toast.success('Contest updated');
      } else {
        const res = await createContest(payload);
        savedId = res.contest?._id;
        toast.success('Contest created');
      }

      // Upload staged image after the contest exists
      if (localFile && savedId) {
        try {
          await uploadContestImage(savedId, localFile);
          toast.success('Image uploaded');
        } catch (upErr) {
          toast.error(`Contest saved, but image upload failed: ${upErr?.message || 'unknown error'}`);
        }
      }

      // New contest + "add DETAILED GUIDE now" → jump straight into the details editor
      if (!isEditing && addDetailsNow && savedId) {
        navigate(`/contests/${savedId}/details`);
        return;
      }
      navigate('/contests');
    } catch (err) {
      toast.error(err?.message || 'Failed to save contest');
    } finally {
      setIsSaving(false);
    }
  };

  const previewSrc = localPreview || form.image.primary.url;

  const counter = (len, min, max) => {
    if (len === 0) return null;
    const bad = len < min || len > max;
    return (
      <span
        className={`text-[9px] font-medium font-mono ${bad ? 'text-red-500' : 'text-neutral-400'}`}
      >
        {len} / {max}
        {bad && <span className="ml-1 normal-case">({min}–{max})</span>}
      </span>
    );
  };

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
            <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
              {isEditing ? 'Edit Contest' : 'Add Contest'}
            </p>
            <h1 className="text-base font-semibold text-neutral-900 dark:text-neutral-100 leading-snug mt-1" title={form.title}>
              {isEditing ? form.title || 'Untitled contest' : 'Create a new contest'}
            </h1>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 truncate">
              {isEditing ? 'Pipeline v4.1 schema — changes apply to the live page' : 'Same schema as the automation pipeline'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
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
            {isSaving ? 'Saving…' : isEditing ? 'Save Changes' : 'Create Contest'}
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
              <p className="text-[10px] text-neutral-500 dark:text-neutral-500">
                <span className="text-red-500 mr-0.5">*</span> Required · empty values are saved as{' '}
                <code className="font-mono bg-neutral-100 dark:bg-neutral-800/50 px-1 py-0.5 rounded-md text-[9px]">null</code>
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={allOpen ? collapseAll : expandAll}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-neutral-200/50 dark:border-white/5 bg-white dark:bg-[#151518] hover:bg-neutral-50 dark:hover:bg-white/5 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-all shadow-sm text-[11px] font-medium"
                >
                  {allOpen ? <Shrink size={12} /> : <Expand size={12} />}
                  {allOpen ? 'Collapse All' : 'Expand All'}
                </button>
              </div>
            </div>

            {/* Identity */}
            <SectionCard
              title="Identity"
              desc="Title, type, category, description & tags"
              icon={FileText}
              open={!!openSections.identity}
              onToggle={() => toggleSection('identity')}
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Field label="Title" required className="md:col-span-2">
                  <TextInput
                    value={form.title}
                    onChange={(v) => update('title', v)}
                    placeholder="e.g. Global Innovation Challenge 2026"
                  />
                </Field>
                <Field label="Type" hint="Hackathon unlocks the Hackathon section below">
                  <Segmented value={form.type} options={TYPE_OPTIONS} onChange={handleTypeChange} />
                </Field>
                <Field label="Category (canonical)" required>
                  <Select
                    value={form.category}
                    onChange={handleCategoryChange}
                    options={CANONICAL_CATEGORIES}
                    placeholder="Select canonical category"
                  />
                </Field>
                <Field label="Sub Category">
                  <TextInput
                    value={form.subCategory}
                    onChange={(v) => update('subCategory', v)}
                    placeholder="e.g. Illustration & Visual Art"
                  />
                </Field>
                <Field label="Official Link">
                  <div className="flex gap-2">
                    <TextInput
                      value={form.link}
                      onChange={(v) => update('link', v)}
                      placeholder="https://example.com/contest"
                    />
                    <a
                      href={form.link || undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => { if (!form.link) e.preventDefault(); }}
                      title={form.link ? 'Open official link in new tab' : 'Enter a link above to open it'}
                      className={`shrink-0 w-9 px-0 py-2 rounded-md border flex items-center justify-center transition-all shadow-sm ${
                        form.link
                          ? 'border-neutral-200/60 dark:border-white/5 bg-white dark:bg-[#18181b] text-neutral-600 dark:text-neutral-400 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-500/30 hover:bg-blue-500/5 cursor-pointer'
                          : 'border-neutral-200/40 dark:border-white/5 bg-neutral-50 dark:bg-[#151518] text-neutral-400 dark:text-neutral-500 cursor-not-allowed'
                      }`}
                    >
                      <ExternalLink size={14} />
                    </a>
                  </div>
                </Field>
                <Field
                  label="Description"
                  hint="Short summary — pipeline expects 30–100 chars"
                  counter={counter(form.description.length, 30, 100)}
                >
                  <TextArea
                    value={form.description}
                    onChange={(v) => update('description', v)}
                    placeholder="One to two sentences summarizing the contest"
                    rows={2}
                  />
                </Field>
                <Field
                  label="Detailed Description"
                  hint="Longer write-up — pipeline expects 400–700 chars"
                  counter={counter(form.descriptionDetailed.length, 400, 700)}
                  className="md:col-span-2"
                >
                  <TextArea
                    value={form.descriptionDetailed}
                    onChange={(v) => update('descriptionDetailed', v)}
                    placeholder="Full details: mission, background, what participants do…"
                    rows={4}
                  />
                </Field>
                <Field label="Tags" hint="Max 3 — hyphenated on enter, normalized to type-diverse set">
                  <ChipInput
                    value={form.tags}
                    onChange={(v) => update('tags', v)}
                    max={3}
                    kebab
                    placeholder="Press Enter to add a tag"
                  />
                </Field>
                <Field label="Flags" hint="Feature flags shown across the site">
                  <ChipGroup
                    value={form.flags}
                    options={FLAG_OPTIONS}
                    onChange={(v) => update('flags', v)}
                  />
                </Field>
              </div>
            </SectionCard>

            {/* Image */}
            <SectionCard
              title="Image"
              desc="Primary image URL, alt text & optional local upload"
              icon={ImageIcon}
              open={!!openSections.image}
              onToggle={() => toggleSection('image')}
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Field label="Primary Image URL" hint="External URL — will be set as image.primary.url">
                  <TextInput
                    value={form.image.primary.url}
                    onChange={(v) => {
                      update('image.primary.url', v);
                      setImageErr(false);
                    }}
                    placeholder="https://example.com/hero.jpg"
                  />
                </Field>
                <Field label="Alt Text">
                  <TextInput
                    value={form.image.alt}
                    onChange={(v) => update('image.alt', v)}
                    placeholder="Describe the image for accessibility"
                  />
                </Field>
                <Field label="Image Tag">
                  <TextInput
                    value={form.image.tag}
                    onChange={(v) => update('image.tag', v)}
                    placeholder="e.g. hero, banner, logo"
                  />
                </Field>
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Preview */}
                <div className="bg-neutral-50/50 dark:bg-[#1b1b1e]/30 border border-neutral-200/30 dark:border-white/5 rounded-lg p-3 flex items-center justify-center min-h-[160px] overflow-hidden relative">
                  {previewSrc && !imageErr ? (
                    <img
                      src={previewSrc}
                      alt={form.image.alt || 'Preview'}
                      className="max-h-[200px] w-full object-contain rounded-md"
                      onError={() => setImageErr(true)}
                    />
                  ) : (
                    <div className="text-center py-8">
                      <ImageIcon size={28} className="text-neutral-400 dark:text-neutral-600 mx-auto mb-2" strokeWidth={1.25} />
                      <p className="text-[10px] text-neutral-500 dark:text-neutral-500">
                        {imageErr ? 'Image failed to load' : 'No image yet'}
                      </p>
                    </div>
                  )}
                </div>

                {/* Local upload */}
                <div className="flex flex-col gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 min-h-[100px] border-2 border-dashed border-neutral-300/40 dark:border-neutral-700/40 hover:border-neutral-400 dark:hover:border-neutral-600 bg-neutral-50/30 dark:bg-[#1b1b1e]/20 rounded-lg flex flex-col items-center justify-center gap-2 transition-all text-neutral-500 dark:text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
                  >
                    <Upload size={23} strokeWidth={1.5} />
                    <span className="text-[11px] font-medium text-neutral-600 dark:text-neutral-400">
                      {localFile ? localFile.name : 'Upload local image'}
                    </span>
                    <span className="text-[9px] text-neutral-500 dark:text-neutral-500">
                      PNG / JPEG / WebP — max 15MB
                    </span>
                  </button>
                  {localFile && (
                    <div className="flex items-center gap-1.5 text-[10px] text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 size={11} />
                      Staged — uploaded to R2 right after save
                    </div>
                  )}
                  {localFile && (
                    <button
                      type="button"
                      onClick={() => {
                        if (localPreview) URL.revokeObjectURL(localPreview);
                        setLocalFile(null);
                        setLocalPreview(null);
                      }}
                      className="text-[10px] text-red-500 hover:text-red-600 font-medium self-start"
                    >
                      Remove local file
                    </button>
                  )}
                  {isEditing && form.image.primary.url && !localFile && (
                    <p className="text-[10px] text-neutral-400 flex items-center gap-1.5">
                      <Globe size={10} />
                      Showing current primary URL. Uploading a file will replace it.
                    </p>
                  )}
                </div>
              </div>
            </SectionCard>

            {/* Entry */}
            <SectionCard
              title="Entry & Fees"
              desc="Free entry, fee amount & confidence"
              icon={Ticket}
              open={!!openSections.entry}
              onToggle={() => toggleSection('entry')}
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Field label="Entry Fee Status">
                  <Segmented value={form.entry.isFree} options={FREE_OPTIONS} onChange={(v) => update('entry.isFree', v)} />
                </Field>
                <Field label="Fee USD">
                  <TextInput
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.entry.feeUSD}
                    onChange={(v) => update('entry.feeUSD', v)}
                    placeholder="e.g. 25"
                  />
                </Field>
                <Field label="Fee Confidence">
                  <Select
                    value={form.entry.feeConfidence}
                    onChange={(v) => update('entry.feeConfidence', v)}
                    options={FEE_CONFIDENCE}
                  />
                </Field>
                <Field label="Fee Amount">
                  <TextInput
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.entry.fee.amount}
                    onChange={(v) => update('entry.fee.amount', v)}
                    placeholder="e.g. 25"
                  />
                </Field>
                <Field label="Fee Currency">
                  <TextInput
                    value={form.entry.fee.currency}
                    onChange={(v) => update('entry.fee.currency', v)}
                    placeholder="USD"
                  />
                </Field>
                <Field label="Fee Note" className="md:col-span-3">
                  <TextInput
                    value={form.entry.feeNote}
                    onChange={(v) => update('entry.feeNote', v)}
                    placeholder="e.g. Free for students; $25 for professionals"
                  />
                </Field>
              </div>
            </SectionCard>

            {/* Prize */}
            <SectionCard
              title="Prize"
              desc="Monetary toggle, amounts, summary & breakdown"
              icon={DollarSign}
              open={!!openSections.prize}
              onToggle={() => toggleSection('prize')}
            >
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Field label="Prize Type">
                  <Segmented value={form.prize.isMonetary} options={MONETARY_OPTIONS} onChange={(v) => update('prize.isMonetary', v)} />
                </Field>
                <Field label="Original Amount" hint="Raw amount as written by the source">
                  <TextInput
                    type="number"
                    min="0"
                    value={form.prize.originalAmount}
                    onChange={(v) => update('prize.originalAmount', v)}
                    placeholder="e.g. 10000"
                  />
                </Field>
                <Field label="Currency">
                  <TextInput
                    value={form.prize.currency}
                    onChange={(v) => update('prize.currency', v)}
                    placeholder="USD"
                  />
                </Field>
                <Field label="Total USD" hint="Auto-computed for monetary prizes if left blank">
                  <TextInput
                    type="number"
                    min="0"
                    value={form.prize.totalUSD}
                    onChange={(v) => update('prize.totalUSD', v)}
                    placeholder="e.g. 10000"
                  />
                </Field>
                <Field label="Prize Summary" className="md:col-span-2">
                  <TextInput
                    value={form.prize.prizeSummary}
                    onChange={(v) => update('prize.prizeSummary', v)}
                    placeholder="e.g. $10,000 in cash prizes + mentorship"
                  />
                </Field>
                <Field label="Prize Description" className="md:col-span-2">
                  <TextInput
                    value={form.prize.description}
                    onChange={(v) => update('prize.description', v)}
                    placeholder="What winners receive"
                  />
                </Field>
                <Field label="Breakdown" className="md:col-span-4">
                  <TextArea
                    value={form.prize.breakdown}
                    onChange={(v) => update('prize.breakdown', v)}
                    placeholder="1st: $5,000 · 2nd: $3,000 · 3rd: $2,000"
                    rows={2}
                  />
                </Field>
              </div>
            </SectionCard>

            {/* Audience */}
            <SectionCard
              title="Audience"
              desc="Eligibility, mode, location, skill levels & constraints"
              icon={Users}
              open={!!openSections.audience}
              onToggle={() => toggleSection('audience')}
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Field label="Eligibility Label">
                  <TextInput
                    value={form.audience.eligibilityLabel}
                    onChange={(v) => update('audience.eligibilityLabel', v)}
                    placeholder="e.g. Open to all ages, worldwide"
                  />
                </Field>
                <Field label="Mode">
                  <Select
                    value={form.audience.mode}
                    onChange={(v) => update('audience.mode', v)}
                    options={MODE_OPTIONS}
                    placeholder="Select mode"
                  />
                </Field>
                <Field label="Location">
                  <TextInput
                    value={form.audience.location}
                    onChange={(v) => update('audience.location', v)}
                    placeholder="e.g. San Francisco / online"
                  />
                </Field>
                <Field label="Eligibility Detail" className="md:col-span-3">
                  <TextArea
                    value={form.audience.eligibilityDetail}
                    onChange={(v) => update('audience.eligibilityDetail', v)}
                    placeholder="Detailed eligibility rules"
                    rows={2}
                  />
                </Field>
                <Field label="Skill Levels">
                  <ChipGroup
                    value={form.audience.skillLevels}
                    options={SKILL_LEVELS.map((s) => ({ value: s, label: s }))}
                    onChange={(v) => update('audience.skillLevels', v)}
                  />
                </Field>
                <Field label="Primary Skill Level">
                  <Select
                    value={form.audience.primarySkillLevel}
                    onChange={(v) => update('audience.primarySkillLevel', v)}
                    options={SKILL_LEVELS}
                    placeholder="Not set"
                  />
                </Field>
                <Field label="Skill Level Source">
                  <Select
                    value={form.audience.skillLevelSource}
                    onChange={(v) => update('audience.skillLevelSource', v)}
                    options={SKILL_SOURCES}
                    placeholder="Not set"
                  />
                </Field>
                <Field label="Age Min">
                  <TextInput
                    type="number"
                    min="0"
                    value={form.audience.age.min}
                    onChange={(v) => update('audience.age.min', v)}
                    placeholder="e.g. 18"
                  />
                </Field>
                <Field label="Age Max">
                  <TextInput
                    type="number"
                    min="0"
                    value={form.audience.age.max}
                    onChange={(v) => update('audience.age.max', v)}
                    placeholder="e.g. 30"
                  />
                </Field>
                <Field label="Participant Types" className="md:col-span-3">
                  <ChipGroup
                    value={form.audience.constraints.participantType}
                    options={PARTICIPANT_TYPES.map((p) => ({ value: p, label: p.replace(/_/g, ' ') }))}
                    onChange={(v) => update('audience.constraints.participantType', v)}
                  />
                </Field>
                <Field label="Academic Status">
                  <TextInput
                    value={form.audience.constraints.academicStatus}
                    onChange={(v) => update('audience.constraints.academicStatus', v)}
                    placeholder="e.g. enrolled, graduated"
                  />
                </Field>
                <Field label="Team Size Min">
                  <TextInput
                    type="number"
                    min="1"
                    value={form.audience.constraints.teamSize.min}
                    onChange={(v) => update('audience.constraints.teamSize.min', v)}
                    placeholder="e.g. 1"
                  />
                </Field>
                <Field label="Team Size Max">
                  <TextInput
                    type="number"
                    min="1"
                    value={form.audience.constraints.teamSize.max}
                    onChange={(v) => update('audience.constraints.teamSize.max', v)}
                    placeholder="e.g. 5"
                  />
                </Field>
                <Field label="Graduation After" hint="YYYY or YYYY-MM">
                  <TextInput
                    value={form.audience.constraints.graduationAfter}
                    onChange={(v) => update('audience.constraints.graduationAfter', v)}
                    placeholder="e.g. 2024-06"
                  />
                </Field>
                <Field label="Organization Founded After" hint="YYYY or YYYY-MM">
                  <TextInput
                    value={form.audience.constraints.organizationFoundedAfter}
                    onChange={(v) => update('audience.constraints.organizationFoundedAfter', v)}
                    placeholder="e.g. 2020"
                  />
                </Field>
              </div>
            </SectionCard>

            {/* Timeline */}
            <SectionCard
              title="Timeline"
              desc="Start, registration & submission deadlines"
              icon={Calendar}
              open={!!openSections.timeline}
              onToggle={() => toggleSection('timeline')}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Start UTC" hint="When the contest opens">
                  <DateTimePicker
                    value={form.timeline.startUTC}
                    onChange={(v) => update('timeline.startUTC', v)}
                  />
                </Field>
                <Field label="Registration Deadline UTC">
                  <DateTimePicker
                    value={form.timeline.registrationDeadlineUTC}
                    onChange={(v) => update('timeline.registrationDeadlineUTC', v)}
                  />
                </Field>
                <Field label="Submission Deadline UTC" required>
                  <DateTimePicker
                    value={form.timeline.submissionDeadlineUTC}
                    onChange={(v) => update('timeline.submissionDeadlineUTC', v)}
                  />
                </Field>
                <Field label="Event End UTC">
                  <DateTimePicker
                    value={form.timeline.eventEndUTC}
                    onChange={(v) => update('timeline.eventEndUTC', v)}
                  />
                </Field>
                <Field label="Organizer Time Zone" className="md:col-span-2">
                  <TextInput
                    value={form.timeline.organizerTimeZone}
                    onChange={(v) => update('timeline.organizerTimeZone', v)}
                    placeholder="e.g. America/New_York, UTC+5:30, IST"
                  />
                </Field>
              </div>
            </SectionCard>

            {/* Filter Keys */}
            <SectionCard
              title="Filter Keys"
              desc="Domain, format, medium & themes for discovery"
              icon={Filter}
              open={!!openSections.filterKeys}
              onToggle={() => toggleSection('filterKeys')}
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Field label="Domain" hint="Auto-derived from category — editable">
                  <TextInput
                    value={form.filterKeys.domain}
                    onChange={(v) => {
                      setDomainEdited(true);
                      update('filterKeys.domain', v);
                    }}
                    placeholder="e.g. technology-ai"
                  />
                </Field>
                <Field label="Format">
                  <ChipGroup
                    value={form.filterKeys.format}
                    options={FORMAT_OPTIONS.map((f) => ({ value: f, label: f }))}
                    onChange={(v) => update('filterKeys.format', v)}
                  />
                </Field>
                <Field label="Medium">
                  <ChipGroup
                    value={form.filterKeys.medium}
                    options={MEDIUM_OPTIONS.map((m) => ({ value: m, label: m }))}
                    onChange={(v) => update('filterKeys.medium', v)}
                  />
                </Field>
                <Field label="Themes" className="md:col-span-3">
                  <ChipInput
                    value={form.filterKeys.themes}
                    onChange={(v) => update('filterKeys.themes', v)}
                    placeholder="Press Enter to add a theme"
                    max={8}
                    kebab
                  />
                </Field>
              </div>
            </SectionCard>

            {/* Source */}
            <SectionCard
              title="Source"
              desc="Where this contest was found"
              icon={Link2}
              open={!!openSections.source}
              onToggle={() => toggleSection('source')}
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Field label="Source Name">
                  <TextInput
                    value={form.source.name}
                    onChange={(v) => update('source.name', v)}
                    placeholder="e.g. Devpost, competition official site"
                  />
                </Field>
                <Field label="Source URL">
                  <TextInput
                    value={form.source.url}
                    onChange={(v) => update('source.url', v)}
                    placeholder="https://example.com"
                  />
                </Field>
                <Field label="Source Type">
                  <Select
                    value={form.source.type}
                    onChange={(v) => update('source.type', v)}
                    options={SOURCE_TYPES}
                  />
                </Field>
              </div>
            </SectionCard>

            {/* Hackathon (conditional) */}
            {form.type === 'hackathon' && (
              <SectionCard
                title="Hackathon"
                desc="Hackathon-specific details"
                icon={Cpu}
                open={!!openSections.hackathon}
                onToggle={() => toggleSection('hackathon')}
              >
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Field label="Duration">
                    <TextInput
                      value={form.hackathon.duration}
                      onChange={(v) => update('hackathon.duration', v)}
                      placeholder="e.g. 48 hours, 2 weeks"
                    />
                  </Field>
                  <Field label="Platform">
                    <TextInput
                      value={form.hackathon.platform}
                      onChange={(v) => update('hackathon.platform', v)}
                      placeholder="e.g. Devpost, online"
                    />
                  </Field>
                  <Field label="Mentorship" hint="Whether mentors are provided">
                    <Segmented
                      value={form.hackathon.mentorship}
                      options={[
                        { value: true, label: 'Yes' },
                        { value: false, label: 'No' },
                      ]}
                      onChange={(v) => update('hackathon.mentorship', v)}
                    />
                  </Field>
                  <Field label="Tech Stack" className="md:col-span-2">
                    <ChipInput
                      value={form.hackathon.techStack}
                      onChange={(v) => update('hackathon.techStack', v)}
                      placeholder="Press Enter to add e.g. react, python"
                      max={12}
                      kebab
                    />
                  </Field>
                  <Field label="Team Size Min">
                    <TextInput
                      type="number"
                      min="1"
                      value={form.hackathon.teamSize.min}
                      onChange={(v) => update('hackathon.teamSize.min', v)}
                      placeholder="e.g. 1"
                    />
                  </Field>
                  <Field label="Team Size Max">
                    <TextInput
                      type="number"
                      min="1"
                      value={form.hackathon.teamSize.max}
                      onChange={(v) => update('hackathon.teamSize.max', v)}
                      placeholder="e.g. 5"
                    />
                  </Field>
                  <Field label="Submission Requirements" className="md:col-span-3">
                    <ChipInput
                      value={form.hackathon.submissionRequirements}
                      onChange={(v) => update('hackathon.submissionRequirements', v)}
                      placeholder="Press Enter to add e.g. github-repo, demo-video"
                      max={10}
                      kebab
                    />
                  </Field>
                </div>

                <div className="mt-5 space-y-5">
                  <div>
                    <p className="text-[10px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-2">
                      Tracks
                    </p>
                    <ListItemEditor
                      items={form.hackathon.tracks}
                      onChange={(v) => update('hackathon.tracks', v)}
                      fields={[
                        { key: 'name', label: 'Track Name', placeholder: 'e.g. Best AI Solution' },
                        { key: 'description', label: 'Description', type: 'textarea', full: true },
                        { key: 'prizeUSD', label: 'Prize (USD)', type: 'number', placeholder: 'e.g. 5000' },
                      ]}
                      addLabel="Add Track"
                      emptyText="No tracks yet"
                    />
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-2">
                      Judging Criteria
                    </p>
                    <ListItemEditor
                      items={form.hackathon.judgingCriteria}
                      onChange={(v) => update('hackathon.judgingCriteria', v)}
                      fields={[
                        { key: 'name', label: 'Criterion', placeholder: 'e.g. Innovation' },
                        { key: 'description', label: 'Description', type: 'textarea', full: true },
                        { key: 'weight', label: 'Weight', type: 'number', placeholder: 'e.g. 30' },
                      ]}
                      addLabel="Add Criterion"
                      emptyText="No criteria yet"
                    />
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-2">
                      Prize Breakdown
                    </p>
                    <ListItemEditor
                      items={form.hackathon.prizeBreakdown}
                      onChange={(v) => update('hackathon.prizeBreakdown', v)}
                      fields={[
                        { key: 'place', label: 'Place', placeholder: 'e.g. 1st' },
                        { key: 'track', label: 'Track', placeholder: 'e.g. Overall' },
                        { key: 'amount', label: 'Amount', placeholder: 'e.g. $5,000' },
                      ]}
                      addLabel="Add Prize Entry"
                      emptyText="No prize breakdown yet"
                    />
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Engagement — Total Participants">
                    <TextInput
                      type="number"
                      min="0"
                      value={form.hackathon.engagement.totalParticipants}
                      onChange={(v) => update('hackathon.engagement.totalParticipants', v)}
                      placeholder="e.g. 1200"
                    />
                  </Field>
                  <Field label="Engagement — Projects Submitted">
                    <TextInput
                      type="number"
                      min="0"
                      value={form.hackathon.engagement.projectsSubmitted}
                      onChange={(v) => update('hackathon.engagement.projectsSubmitted', v)}
                      placeholder="e.g. 350"
                    />
                  </Field>
                </div>
              </SectionCard>
            )}

            {/* Detailed Guide choice — create flow only */}
            {!isEditing && (
              <SectionCard
                title="Detailed Guide"
                desc="Optional — the AI-POWERED INSIGHTS section on the public contest page"
                icon={FileText}
                open={!!openSections.detailsChoice}
                onToggle={() => toggleSection('detailsChoice')}
              >
                <div className="flex items-start justify-between gap-4 flex-col md:flex-row">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-neutral-800 dark:text-neutral-200">
                      Add DETAILED GUIDE content now?
                    </p>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-500 mt-1 leading-relaxed">
                      The contest detail page renders a rich guide (Why Join, Benefits, Submission
                      Guide, FAQ…). You can fill it in right after creating the contest, or add it
                      later from the contests list.
                    </p>
                  </div>
                  <Segmented
                    value={addDetailsNow}
                    options={[
                      { value: false, label: 'Add Later' },
                      { value: true, label: 'Now' },
                    ]}
                    onChange={setAddDetailsNow}
                  />
                </div>
              </SectionCard>
            )}

            {/* Detailed Guide link — edit flow only */}
            {isEditing && (
              <SectionCard
                title="Detailed Guide"
                desc="Edit the AI-POWERED INSIGHTS section for this contest"
                icon={FileText}
                open={!!openSections.detailsLink}
                onToggle={() => toggleSection('detailsLink')}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-neutral-800 dark:text-neutral-200">
                      DETAILED GUIDE content
                    </p>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-500 mt-1 leading-relaxed">
                      Why Join, Benefits, Submission Guide, FAQ, Timeline Summary, SEO & research
                      sources. Shown on the live contest page — add or edit it any time.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate(`/contests/${id}/details`)}
                    className="shrink-0 px-3 py-1.5 rounded-md border border-neutral-200/50 dark:border-white/5 bg-white dark:bg-[#18181b] hover:bg-neutral-50 dark:hover:bg-white/5 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-all shadow-sm text-[11px] font-medium"
                  >
                    Edit Detailed Guide
                  </button>
                </div>
              </SectionCard>
            )}

            {/* Status */}
            <SectionCard
              title="Status & Verification"
              desc="Status, verification level & trending window"
              icon={BadgeCheck}
              open={!!openSections.status}
              onToggle={() => toggleSection('status')}
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Field label="Status" hint="Blank = auto-computed from timeline dates">
                  <Select
                    value={form.status}
                    onChange={(v) => update('status', v)}
                    options={STATUS_OPTIONS}
                    placeholder="Auto-compute from timeline"
                  />
                </Field>
                <Field label="Verification Status">
                  <Select
                    value={form.verificationStatus}
                    onChange={(v) => update('verificationStatus', v)}
                    options={VERIFICATION_OPTIONS}
                  />
                </Field>
                <Field label="Trending Until">
                  <DateTimePicker
                    value={form.trendingUntil}
                    onChange={(v) => update('trendingUntil', v)}
                  />
                </Field>
                {isEditing && (
                  <Field label="Archived At" hint="Read-only — manage archiving from the list page">
                    <div className={`${inputCls} flex items-center text-neutral-500 dark:text-neutral-500`}>
                      {form.archivedAt ? new Date(form.archivedAt).toLocaleString() : 'Not archived'}
                    </div>
                  </Field>
                )}
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
                {isSaving ? 'Saving…' : isEditing ? 'Save Changes' : 'Create Contest'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ContestForm;
