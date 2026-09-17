import { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  MessageSquare,
  Users,
  Heart,
  Globe,
  RefreshCw,
  Activity,
  Star,
  Download,
  ArrowUpRight,
  ArrowDownRight,
  Gauge,
  Send,
  CheckCircle2,
  XCircle,
  Timer,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import adminAPI from '@/api/adminAPI';

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

const RANGES = [
  { label: '7D', value: 7 },
  { label: '14D', value: 14 },
  { label: '30D', value: 30 },
  { label: '90D', value: 90 },
];

const containerVariants = { hidden: {}, visible: { transition: { staggerChildren: 0.03 } } };
const cardVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.23, 1, 0.32, 1] } },
};

const cardClass =
  'bg-white dark:bg-[#151518] border border-neutral-200/70 dark:border-white/[0.06] rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.02)]';

const DeltaChip = ({ delta, tooltip }) => {
  if (delta === undefined || delta === null || !Number.isFinite(delta)) return null;
  return (
    <span
      title={tooltip}
      className={`inline-flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded ${
        delta > 0
          ? 'text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/10'
          : delta < 0
            ? 'text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-500/10'
            : 'text-neutral-600 bg-neutral-100 dark:text-neutral-400 dark:bg-white/[0.06]'
      }`}
    >
      {delta > 0 ? <ArrowUpRight size={11} /> : delta < 0 ? <ArrowDownRight size={11} /> : null}
      {delta > 0 ? `+${delta}` : delta}
    </span>
  );
};

const KpiCard = ({ label, value, sub, icon: Icon, color, delta, deltaTooltip }) => (
  <motion.div variants={cardVariants} className={`${cardClass} p-5 flex flex-col justify-between min-h-[112px]`}>
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-300 uppercase tracking-wider">
        {label}
      </span>
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border"
        style={{ color, backgroundColor: `${color}14`, borderColor: `${color}26` }}
      >
        <Icon size={15} strokeWidth={1.75} />
      </div>
    </div>
    <div className="mt-2">
      <div className="flex items-baseline gap-2">
        <p className="text-[26px] font-bold tracking-tight text-neutral-900 dark:text-white leading-none">
          {value.toLocaleString()}
        </p>
        <DeltaChip delta={delta} tooltip={deltaTooltip} />
      </div>
      {sub && (
        <p className="text-[11.5px] text-neutral-500 dark:text-neutral-400 mt-1.5 leading-snug">
          {sub}
        </p>
      )}
    </div>
  </motion.div>
);

/* SVG sparkline — points normalized into a 100×28 box */
const Sparkline = ({ points = [], stroke = '#6366f1' }) => {
  if (points.length < 2) return <div className="h-7" />;
  const max = Math.max(...points, 1);
  const step = 100 / (points.length - 1);
  const d = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${(i * step).toFixed(2)} ${(28 - (p / max) * 26 - 1).toFixed(2)}`)
    .join(' ');
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="w-full h-7" aria-hidden="true">
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
};

/* Donut ring showing approval rate */
const ApprovalRing = ({ rate }) => {
  const pct = rate ?? 0;
  const r = 52;
  const c = 2 * Math.PI * r;
  const color = rate === null ? '#a1a1aa' : pct >= 70 ? '#059669' : pct >= 40 ? '#d97706' : '#dc2626';
  return (
    <div className="relative w-[128px] h-[128px] shrink-0" role="img" aria-label={`Approval rate ${rate === null ? 'unavailable' : pct + '%'}`}>
      <svg viewBox="0 0 128 128" className="w-full h-full -rotate-90">
        <circle cx="64" cy="64" r={r} fill="none" strokeWidth="12" className="stroke-neutral-100 dark:stroke-white/[0.06]" />
        <motion.circle
          cx="64" cy="64" r={r} fill="none" strokeWidth="12" strokeLinecap="round"
          stroke={color}
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - (pct / 100) * c }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-neutral-900 dark:text-white leading-none">
          {rate === null ? '—' : `${pct}%`}
        </span>
        <span className="text-[10.5px] text-neutral-500 dark:text-neutral-400 mt-1">approval rate</span>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [range, setRange] = useState(14);
  const [hoveredBarIndex, setHoveredBarIndex] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const fetchAnalytics = async () => {
      setIsLoading(true);
      try {
        const res = await adminAPI.get(`/analytics/dashboard?range=${range}`);
        if (!cancelled && res.success) setAnalytics(res.analytics);
      } catch {
        if (!cancelled) toast.error('Failed to load analytics');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    fetchAnalytics();
    return () => { cancelled = true; };
  }, [range]);

  /* Fill date gaps so the chart shows zero-days honestly */
  const rangeStart = analytics?.rangeStart;
  const fillGaps = (perDay) => {
    const byDate = new Map(perDay.map((d) => [d._id, d.count ?? d.total]));
    const out = [];
    const start = new Date(rangeStart + 'T00:00:00Z');
    const today = new Date();
    for (let d = new Date(start); d <= today; d.setUTCDate(d.getUTCDate() + 1)) {
      out.push(byDate.get(d.toISOString().slice(0, 10)) || 0);
    }
    return out;
  };

  const submissionsSeries = useMemo(() => {
    if (!analytics) return [];
    const byDate = new Map(analytics.submissions.perDay.map((d) => [d._id, d]));
    const out = [];
    const start = new Date(rangeStart + 'T00:00:00Z');
    const today = new Date();
    for (let d = new Date(start); d <= today; d.setUTCDate(d.getUTCDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      const hit = byDate.get(key);
      out.push({
        _id: key,
        total: hit?.total || 0,
        approved: hit?.approved || 0,
        rejected: hit?.rejected || 0,
      });
    }
    return out;
  }, [analytics, rangeStart]);

  const commentsPoints = useMemo(
    () => (analytics ? fillGaps(analytics.comments.perDay) : []),
    [analytics, rangeStart]
  );
  const usersPoints = useMemo(
    () => (analytics ? fillGaps(analytics.users.perDay) : []),
    [analytics, rangeStart]
  );
  const publishedPoints = useMemo(
    () => (analytics ? fillGaps(analytics.published.perDay) : []),
    [analytics, rangeStart]
  );

  const maxBar = Math.max(...submissionsSeries.map((d) => d.total), 1);

  /* Sparse x labels: ~8 ticks regardless of range */
  const labelEvery = Math.max(1, Math.ceil(submissionsSeries.length / 8));

  const exportCsv = () => {
    if (!analytics) return;
    const rows = [['date', 'submitted', 'approved', 'rejected', 'pending']];
    submissionsSeries.forEach((d) =>
      rows.push([d._id, d.total, d.approved, d.rejected, d.total - d.approved - d.rejected])
    );
    const csv = rows.map((r) => r.join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics-submissions-${analytics.range}d.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exported');
  };

  const submitDeltaTooltip = (curr, prev, unit) =>
    `${curr} ${unit} in the last ${analytics?.range} days vs ${prev} the ${analytics?.range} days before`;

  if (isLoading && !analytics) {
    return (
      <div className="h-full flex flex-col bg-neutral-50/30 dark:bg-[#0d0d0f]/20 animate-pulse">
        <div className="shrink-0 px-6 py-5 border-b border-neutral-200/50 dark:border-white/5 bg-white/40 dark:bg-[#121214]/40 flex justify-between items-center">
          <div className="space-y-2">
            <div className="h-3 w-32 bg-neutral-200/60 dark:bg-neutral-800 rounded" />
            <div className="h-5 w-48 bg-neutral-200/60 dark:bg-neutral-800 rounded" />
          </div>
          <div className="h-8 w-28 bg-neutral-200/60 dark:bg-neutral-800 rounded-lg" />
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-28 bg-white dark:bg-[#111113]/60 border border-neutral-200/40 dark:border-white/5 rounded-2xl p-5" />
            ))}
          </div>
          <div className="h-80 bg-white dark:bg-[#111113]/60 border border-neutral-200/40 dark:border-white/5 rounded-2xl p-5" />
        </div>
      </div>
    );
  }

  if (!analytics) return null;

  const a = analytics;

  return (
    <div className="h-full flex flex-col bg-neutral-50/30 dark:bg-[#0d0d0f]/20 selection:bg-neutral-200/60 dark:selection:bg-neutral-400/40">

      {/* Header */}
      <div className="shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-4 border-b border-neutral-200/50 dark:border-white/5 bg-white/40 dark:bg-[#121214]/40 backdrop-blur-sm">
        <div>
          <h1 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
            Platform Analytics
          </h1>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
            Submissions, review velocity, audience engagement — last {a.range} days
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Range tabs */}
          <div className="flex items-center p-0.5 rounded-lg border border-neutral-200/70 dark:border-white/[0.07] bg-neutral-100/60 dark:bg-white/[0.03]" role="tablist" aria-label="Date range">
            {RANGES.map((r) => (
              <button
                key={r.value}
                role="tab"
                aria-selected={range === r.value}
                onClick={() => setRange(r.value)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                  range === r.value
                    ? 'bg-white dark:bg-white/[0.10] text-neutral-900 dark:text-white shadow-sm'
                    : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          <button
            onClick={exportCsv}
            className="p-2 rounded-lg border border-neutral-200/60 dark:border-white/[0.07] bg-white dark:bg-[#18181b] hover:bg-neutral-50 dark:hover:bg-white/5 text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-colors"
            title="Export chart data as CSV"
            aria-label="Export CSV"
          >
            <Download size={14} />
          </button>
          <button
            onClick={() => setRange((r) => r)}
            className={`p-2 rounded-lg border border-neutral-200/60 dark:border-white/[0.07] bg-white dark:bg-[#18181b] hover:bg-neutral-50 dark:hover:bg-white/5 text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-colors ${isLoading ? 'animate-spin' : ''}`}
            title="Refresh"
            aria-label="Refresh analytics"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">

          {/* ---------------- KPI row ---------------- */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <KpiCard
              label="Submissions"
              value={a.submissions.inRange}
              delta={a.submissions.delta}
              deltaTooltip={submitDeltaTooltip(a.submissions.inRange, a.submissions.prevRange, 'submissions')}
              sub={`${a.submissions.pending} pending · ${a.submissions.approved} approved · ${a.submissions.rejected} rejected (all time)`}
              icon={Send}
              color="#6366f1"
            />
            <KpiCard
              label="Published"
              value={a.published.inRange}
              delta={a.published.delta}
              deltaTooltip={submitDeltaTooltip(a.published.inRange, Math.max(a.published.inRange - a.published.delta, 0), 'articles published')}
              sub={`${a.published.inRange} went live in the last ${a.range} days`}
              icon={CheckCircle2}
              color="#059669"
            />
            <KpiCard
              label="Reader Comments"
              value={a.comments.inRange}
              delta={a.comments.delta}
              deltaTooltip={submitDeltaTooltip(a.comments.inRange, a.comments.prevRange, 'comments')}
              sub={`${a.comments.total} all time · ${a.comments.thisWeek} this week`}
              icon={MessageSquare}
              color="#f5a53a"
            />
            <KpiCard
              label="New Writers"
              value={a.users.inRange}
              delta={a.users.delta}
              deltaTooltip={submitDeltaTooltip(a.users.inRange, a.users.prevRange, 'new writers')}
              sub={`${a.users.total} registered · ${a.users.thisMonth} this month`}
              icon={Users}
              color="#8b5cf6"
            />
            <KpiCard
              label="Article Likes"
              value={a.likes}
              sub="Total likes across all published posts"
              icon={Heart}
              color="#ec4899"
            />
            <KpiCard
              label="Active Contests"
              value={a.contests.active}
              sub="Writing contests currently open or upcoming"
              icon={Globe}
              color="#0ea5e9"
            />
          </div>

          {/* ---------------- Submissions chart ---------------- */}
          <motion.div variants={cardVariants} className={`${cardClass} p-5 relative`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <BarChartIcon />
                <span className="text-xs font-bold text-neutral-800 dark:text-neutral-100 uppercase tracking-wider">
                  Submissions — last {a.range} days
                </span>
              </div>

              <div className="h-7 flex items-center" aria-live="polite">
                <AnimatePresence mode="wait">
                  {hoveredBarIndex !== null && submissionsSeries[hoveredBarIndex] ? (
                    <motion.div
                      key="tip"
                      initial={{ opacity: 0, y: 3 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 3 }}
                      className="text-[11px] bg-neutral-50 dark:bg-[#1e1e24] border border-neutral-200/70 dark:border-white/[0.08] px-2.5 py-1 rounded-lg flex items-center gap-2.5 shadow-sm"
                    >
                      <span className="text-neutral-600 dark:text-neutral-300 font-semibold">
                        {new Date(submissionsSeries[hoveredBarIndex]._id + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-sm bg-amber-500" />
                        <span className="text-amber-700 dark:text-amber-400 font-semibold">{submissionsSeries[hoveredBarIndex].total - submissionsSeries[hoveredBarIndex].approved - submissionsSeries[hoveredBarIndex].rejected} pending</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-sm bg-emerald-500" />
                        <span className="text-emerald-700 dark:text-emerald-400 font-semibold">{submissionsSeries[hoveredBarIndex].approved} approved</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-sm bg-red-500" />
                        <span className="text-red-700 dark:text-red-400 font-semibold">{submissionsSeries[hoveredBarIndex].rejected} rejected</span>
                      </span>
                    </motion.div>
                  ) : (
                    <motion.span key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[11px] text-neutral-400 dark:text-neutral-500">
                      Hover a bar for daily breakdown
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Chart: gridlines + stacked bars */}
            <div className="relative h-64">
              {[100, 75, 50, 25].map((pct) => (
                <div
                  key={pct}
                  className="absolute left-0 right-0 border-t border-dashed border-neutral-200/60 dark:border-white/[0.05]"
                  style={{ top: `${100 - pct}%` }}
                >
                  <span className="absolute -top-2 right-0 text-[10px] tabular-nums text-neutral-400 dark:text-neutral-500 bg-white dark:bg-[#151518] px-1">
                    {Math.round((maxBar * pct) / 100)}
                  </span>
                </div>
              ))}

              <div className="absolute inset-0 flex items-end gap-[2px] sm:gap-1 pb-6">
                {submissionsSeries.map((day, idx) => {
                  const heightPct = (day.total / maxBar) * 100;
                  const pending = day.total - day.approved - day.rejected;
                  return (
                    <div
                      key={day._id}
                      className="flex-1 h-full flex flex-col justify-end items-center relative group cursor-pointer"
                      onMouseEnter={() => setHoveredBarIndex(idx)}
                      onMouseLeave={() => setHoveredBarIndex(null)}
                      tabIndex={0}
                      role="img"
                      aria-label={`${day._id}: ${day.total} submitted, ${day.approved} approved, ${day.rejected} rejected`}
                      onFocus={() => setHoveredBarIndex(idx)}
                      onBlur={() => setHoveredBarIndex(null)}
                    >
                      <div className="absolute inset-x-0 bottom-6 top-0 group-hover:bg-neutral-100/50 dark:group-hover:bg-white/[0.03] transition-colors" />
                      <div
                        className={`relative w-full max-w-[26px] flex flex-col-reverse gap-px overflow-hidden rounded-t-[3px] transition-transform duration-150 group-hover:scale-y-[1.02] origin-bottom ${hoveredBarIndex === idx ? 'ring-1 ring-neutral-300 dark:ring-white/20 rounded-t' : ''}`}
                        style={{ height: `calc(${Math.max(heightPct, day.total > 0 ? 3 : 0.8)}% )` }}
                      >
                        {day.rejected > 0 && (
                          <div className="w-full bg-red-500/90" style={{ height: `${(day.rejected / day.total) * 100}%` }} />
                        )}
                        {day.approved > 0 && (
                          <div className="w-full bg-emerald-500/90" style={{ height: `${(day.approved / day.total) * 100}%` }} />
                        )}
                        {pending > 0 && (
                          <div className="w-full bg-amber-500/90" style={{ height: `${(pending / day.total) * 100}%` }} />
                        )}
                      </div>
                      {/* x labels — sparse, readable */}
                      <span className={`absolute bottom-0 text-[10.5px] tabular-nums whitespace-nowrap ${
                        idx % labelEvery === 0
                          ? 'text-neutral-500 dark:text-neutral-400'
                          : 'text-transparent'
                      }`}>
                        {idx % labelEvery === 0 &&
                          new Date(day._id + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-5 mt-2 pt-3 border-t border-neutral-100 dark:border-white/[0.04] text-[11.5px] text-neutral-600 dark:text-neutral-300">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px] bg-amber-500/90" /> Pending</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px] bg-emerald-500/90" /> Approved</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px] bg-red-500/90" /> Rejected</span>
            </div>
          </motion.div>

          {/* ---------------- Review pipeline + engagement ---------------- */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Review pipeline */}
            <motion.div variants={cardVariants} className={`${cardClass} p-5`}>
              <div className="flex items-center gap-2 mb-4">
                <Gauge size={14} className="text-neutral-500 dark:text-neutral-400" />
                <span className="text-xs font-bold text-neutral-800 dark:text-neutral-100 uppercase tracking-wider">
                  Review pipeline
                </span>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-5">
                <ApprovalRing rate={a.review.approvalRate} />

                <div className="flex-1 w-full space-y-2.5">
                  <div className="flex items-center justify-between text-[13px] py-2 px-3 rounded-lg bg-emerald-50/70 dark:bg-emerald-500/[0.07] border border-emerald-100 dark:border-emerald-500/[0.08]">
                    <span className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-medium">
                      <CheckCircle2 size={14} /> Approved
                    </span>
                    <span className="font-bold text-emerald-900 dark:text-emerald-200 tabular-nums">
                      {a.review.approvedInRange}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[13px] py-2 px-3 rounded-lg bg-red-50/70 dark:bg-red-500/[0.07] border border-red-100 dark:border-red-500/[0.08]">
                    <span className="flex items-center gap-2 text-red-800 dark:text-red-300 font-medium">
                      <XCircle size={14} /> Rejected
                    </span>
                    <span className="font-bold text-red-900 dark:text-red-200 tabular-nums">
                      {a.review.rejectedInRange}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[13px] py-2 px-3 rounded-lg bg-neutral-50 dark:bg-white/[0.03] border border-neutral-200/60 dark:border-white/[0.05]">
                    <span className="flex items-center gap-2 text-neutral-700 dark:text-neutral-300 font-medium">
                      <Timer size={14} /> Avg review time
                    </span>
                    <span className="font-bold text-neutral-900 dark:text-white tabular-nums">
                      {a.review.avgReviewHours === null ? '—' : `${a.review.avgReviewHours}h`}
                    </span>
                  </div>
                  {a.review.approvalRate !== null && a.review.prevApprovalRate !== null && a.review.approvalRate !== a.review.prevApprovalRate && (
                    <p className="text-[11.5px] text-neutral-500 dark:text-neutral-400 px-1">
                      {a.review.approvalRate > a.review.prevApprovalRate ? 'Improving' : 'Declining'} vs previous period
                      ({a.review.prevApprovalRate}%)
                    </p>
                  )}
                </div>
              </div>
            </motion.div>

            {/* Engagement */}
            <motion.div variants={cardVariants} className={`${cardClass} p-5`}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Activity size={14} className="text-neutral-500 dark:text-neutral-400" />
                  <span className="text-xs font-bold text-neutral-800 dark:text-neutral-100 uppercase tracking-wider">
                    Engagement — last {a.range} days
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-neutral-600 dark:text-neutral-300">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#f5a53a]" /> Comments</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#8b5cf6]" /> New writers</span>
                </div>
              </div>

              <div className="space-y-5">
                <div>
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="text-[11.5px] font-medium text-neutral-600 dark:text-neutral-300">Comments per day</span>
                    <span className="text-[11px] text-neutral-500 dark:text-neutral-400 tabular-nums">peak {Math.max(...commentsPoints, 0)}</span>
                  </div>
                  <Sparkline points={commentsPoints} stroke="#f5a53a" />
                </div>
                <div>
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="text-[11.5px] font-medium text-neutral-600 dark:text-neutral-300">New writers per day</span>
                    <span className="text-[11px] text-neutral-500 dark:text-neutral-400 tabular-nums">peak {Math.max(...usersPoints, 0)}</span>
                  </div>
                  <Sparkline points={usersPoints} stroke="#8b5cf6" />
                </div>
                <div>
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="text-[11.5px] font-medium text-neutral-600 dark:text-neutral-300">Publishing output per day</span>
                    <span className="text-[11px] text-neutral-500 dark:text-neutral-400 tabular-nums">peak {Math.max(...publishedPoints, 0)}</span>
                  </div>
                  <Sparkline points={publishedPoints} stroke="#059669" />
                </div>
              </div>
            </motion.div>
          </div>

          {/* ---------------- Topics ---------------- */}
          <motion.div variants={cardVariants} className={`${cardClass} p-5`}>
            <div className="flex items-center gap-2 mb-5">
              <Star size={14} className="text-amber-500" />
              <span className="text-xs font-bold text-neutral-800 dark:text-neutral-100 uppercase tracking-wider">
                Popular article topics
              </span>
            </div>
            {a.topCategories.length === 0 ? (
              <p className="text-xs text-neutral-500 dark:text-neutral-400 py-8 text-center">
                No category data yet
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3.5">
                {a.topCategories.map((cat, idx) => {
                  const maxCount = a.topCategories[0]?.count || 1;
                  const barWidth = (cat.count / maxCount) * 100;
                  return (
                    <div key={cat._id || idx} className="flex items-center gap-3 group">
                      <span className="text-[12.5px] font-medium text-neutral-700 dark:text-neutral-200 w-28 truncate" title={cat._id || 'Uncategorized'}>
                        {cat._id || 'Uncategorized'}
                      </span>
                      <div className="flex-1 h-2 bg-neutral-100 dark:bg-white/[0.05] rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${barWidth}%` }}
                          transition={{ duration: 0.6, delay: idx * 0.03 }}
                          className="h-full bg-neutral-800 dark:bg-neutral-200 rounded-full"
                        />
                      </div>
                      <span className="text-[12px] font-semibold text-neutral-600 dark:text-neutral-300 w-8 text-right tabular-nums">
                        {cat.count}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>

        </motion.div>
      </div>
    </div>
  );
}

function BarChartIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" className="text-neutral-500 dark:text-neutral-400" aria-hidden="true">
      <line x1="6" y1="20" x2="6" y2="12" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="18" y1="20" x2="18" y2="14" />
    </svg>
  );
}
