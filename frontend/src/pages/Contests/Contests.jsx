import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  X,
  Trophy,
  Plus,
  Loader2,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  ExternalLink,
  Pencil,
  Archive,
  RotateCcw,
  Calendar,
  DollarSign,
  Sparkles,
  Layers,
  Clock,
  CheckCircle,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import adminAPI from '@/api/adminAPI';
import { listContestCategories } from '@/api/contestAPI';
import { StatCard } from '@/components/UI';

const STATUS_CONFIG = {
  open: { label: 'Open', bg: 'bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-500/15' },
  scheduled: { label: 'Scheduled', bg: 'bg-blue-500/10', text: 'text-blue-600 dark:text-blue-400', border: 'border-blue-500/15' },
  closed: { label: 'Closed', bg: 'bg-neutral-500/10', text: 'text-neutral-500 dark:text-neutral-400', border: 'border-neutral-500/15' },
};

const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '—';
  }
};

const formatPrize = (prize) => {
  if (!prize) return '—';
  if (prize.prizeSummary) return prize.prizeSummary;
  const usd = Number(prize.totalUSD) || 0;
  if (usd > 0) {
    return usd >= 1000
      ? `$${(usd / 1000).toFixed(usd >= 100000 ? 0 : 1)}k`
      : `$${usd.toLocaleString()}`;
  }
  if (prize.isMonetary) return 'Cash prize';
  return 'Non-monetary';
};

const Thumb = ({ src, alt }) => {
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const url = src?.backup?.url || src?.primary?.url;
  if (!url || error) {
    return (
      <div className="w-9 h-9 rounded-lg border border-neutral-200/60 dark:border-white/10 bg-neutral-100 dark:bg-neutral-900/50 flex items-center justify-center">
        <Trophy size={13} className="text-neutral-400" strokeWidth={1.5} />
      </div>
    );
  }
  return (
    <div className="w-9 h-9 rounded-lg border border-neutral-200/60 dark:border-white/10 bg-neutral-100 dark:bg-neutral-900/50 overflow-hidden relative">
      {!loaded && <div className="absolute inset-0 bg-neutral-100 dark:bg-neutral-900/50 animate-pulse" />}
      <img
        src={url}
        alt={alt || ''}
        className={`w-full h-full object-cover ${loaded ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
      />
    </div>
  );
};

const Contests = () => {
  const navigate = useNavigate();
  const [contests, setContests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showArchived, setShowArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });
  const [categories, setCategories] = useState([]);
  const [busy, setBusy] = useState(null); // id being archived/restored
  const searchTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 350);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [search]);

  const fetchContests = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const res = await adminAPI.get('/contests', {
        params: {
          page,
          limit: 25,
          search: debouncedSearch,
          type: typeFilter,
          status: statusFilter,
          category: categoryFilter,
          archived: showArchived,
        },
      });
      if (res.success) {
        setContests(res.contests || []);
        setPagination(res.pagination || { total: 0, pages: 1 });
        // Collect categories for the filter (from fetched rows)
        setCategories(prev => {
          const merged = new Map(prev.map(c => [c, c]));
          res.contests.forEach(c => { if (c.category) merged.set(c.category, c.category); });
          return [...merged.values()].sort();
        });
      }
    } catch (err) {
      toast.error(err?.message || 'Failed to load contests');
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [page, debouncedSearch, typeFilter, statusFilter, categoryFilter, showArchived]);

  useEffect(() => {
    fetchContests();
  }, [fetchContests]);

  // Populate the category filter from ALL categories in the DB (not just the
  // categories present on the currently loaded page).
  useEffect(() => {
    let mounted = true;
    listContestCategories()
      .then((res) => {
        if (mounted && res.success) {
          setCategories((res.categories || []).filter(Boolean).sort());
        }
      })
      .catch(() => {
        // fall back to categories derived from fetched rows
      });
    return () => { mounted = false; };
  }, []);

  const handleArchive = async (contest) => {
    setBusy(contest._id);
    try {
      const res = await adminAPI.delete(`/contests/${contest._id}`);
      if (res.success) {
        toast.success(showArchived ? 'Contest archived' : 'Contest archived');
        fetchContests(true);
      }
    } catch (err) {
      toast.error(err?.message || 'Failed to archive contest');
    } finally {
      setBusy(null);
    }
  };

  const handleRestore = async (contest) => {
    setBusy(contest._id);
    try {
      const res = await adminAPI.post(`/contests/${contest._id}/restore`);
      if (res.success) {
        toast.success('Contest restored');
        fetchContests(true);
      }
    } catch (err) {
      toast.error(err?.message || 'Failed to restore contest');
    } finally {
      setBusy(null);
    }
  };

  const totalPages = Math.max(1, pagination.pages || 1);

  // Compute stats from contests data
  const totalContests = pagination.total || contests.length;
  const openCount = contests.filter(c => c.status === 'open').length;
  const scheduledCount = contests.filter(c => c.status === 'scheduled').length;
  const closedCount = contests.filter(c => c.status === 'closed').length;

  return (
    <div className="h-full flex flex-col bg-neutral-50/30 dark:bg-[#0d0d0f]/20 selection:bg-neutral-200/50 dark:selection:bg-neutral-400/40">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-neutral-200/50 dark:border-white/5 bg-white/40 dark:bg-[#121214]/40 backdrop-blur-sm">
        <div>
          <h1 className="text-base font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
            <Trophy size={16} strokeWidth={1.5} className="text-neutral-400" />
            Contest Manager
          </h1>
          <p className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-0.5">
            {pagination.total > 0
              ? `Manage ${pagination.total} contest${pagination.total === 1 ? '' : 's'}${showArchived ? ' (including archived)' : ''}`
              : 'Add and manage contests — same schema as the automation pipeline'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { fetchContests(); toast.success('Refreshed'); }}
            className="p-1.5 rounded-lg border border-neutral-200/50 dark:border-white/5 bg-white dark:bg-[#18181b] hover:bg-neutral-50 dark:hover:bg-white/5 text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-all shadow-sm flex items-center gap-1.5 text-[11px] font-medium"
          >
            <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            onClick={() => navigate('/contests/new')}
            className="px-3 py-1.5 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:opacity-90 transition-all shadow-sm flex items-center gap-1.5 text-[11px] font-semibold"
          >
            <Plus size={12} strokeWidth={2.5} />
            Add Contest
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="shrink-0 p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Contests"
          value={totalContests}
          icon={Trophy}
          iconColor="text-neutral-500"
        />
        <StatCard
          label="Open"
          value={openCount}
          icon={CheckCircle}
          iconColor="text-emerald-600 dark:text-emerald-400"
          iconBg="bg-emerald-500/10"
        />
        <StatCard
          label="Scheduled"
          value={scheduledCount}
          icon={Clock}
          iconColor="text-blue-600 dark:text-blue-400"
          iconBg="bg-blue-500/10"
        />
        <StatCard
          label="Closed"
          value={closedCount}
          icon={Archive}
          iconColor="text-neutral-500"
          iconBg="bg-neutral-500/10"
        />
      </div>

      {/* Control Bar */}
      <div className="shrink-0 px-6 py-3 flex flex-col md:flex-row gap-3 items-center justify-between border-b border-neutral-200/30 dark:border-white/[0.04]">
        <div className="w-full md:w-72 relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-neutral-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, category, slug, tag..."
            className="w-full pl-9 pr-8 py-1.5 bg-white dark:bg-[#151518] border border-neutral-200/60 dark:border-white/5 rounded-lg text-xs text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:border-neutral-400 dark:focus:border-neutral-700 transition-all shadow-[0_1px_2px_rgba(0,0,0,0.01)]"
          />
          {search && (
            <button onClick={() => { setSearch(''); setDebouncedSearch(''); setPage(1); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-800 dark:hover:text-white">
              <X size={12} />
            </button>
          )}
        </div>

        <div className="w-full md:w-auto flex flex-wrap items-center gap-2 justify-end">
          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
            className="px-2.5 py-1.5 bg-white dark:bg-[#151518] border border-neutral-200/60 dark:border-white/5 rounded-lg text-[11px] font-medium text-neutral-600 dark:text-neutral-300 focus:outline-none"
          >
            <option value="all">All Types</option>
            <option value="contest">Contest</option>
            <option value="hackathon">Hackathon</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="px-2.5 py-1.5 bg-white dark:bg-[#151518] border border-neutral-200/60 dark:border-white/5 rounded-lg text-[11px] font-medium text-neutral-600 dark:text-neutral-300 focus:outline-none"
          >
            <option value="all">All Status</option>
            <option value="open">Open</option>
            <option value="scheduled">Scheduled</option>
            <option value="closed">Closed</option>
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
            className="max-w-[160px] px-2.5 py-1.5 bg-white dark:bg-[#151518] border border-neutral-200/60 dark:border-white/5 rounded-lg text-[11px] font-medium text-neutral-600 dark:text-neutral-300 focus:outline-none"
          >
            <option value="all">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#151518] border border-neutral-200/60 dark:border-white/5 cursor-pointer text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => { setShowArchived(e.target.checked); setPage(1); }}
              className="rounded border-neutral-300 dark:border-neutral-700"
            />
            <Archive size={11} />
            Archived
          </label>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {isLoading ? (
          <div className="grid grid-cols-1 gap-3 animate-pulse">
            {[...Array(8)].map((_, i) => <div key={i} className="h-14 bg-neutral-200/50 dark:bg-neutral-800 rounded-xl" />)}
          </div>
        ) : contests.length === 0 ? (
          <div className="bg-white dark:bg-[#151518]/40 border border-neutral-200/40 dark:border-white/5 rounded-2xl flex flex-col items-center justify-center py-20 shadow-sm">
            <Trophy size={28} strokeWidth={1.25} className="text-neutral-300 dark:text-neutral-700" />
            <p className="text-xs font-semibold text-neutral-800 dark:text-neutral-300 mt-3">
              {debouncedSearch || typeFilter !== 'all' || statusFilter !== 'all' || categoryFilter !== 'all'
                ? 'No matching contests found'
                : 'No contests yet'}
            </p>
            <p className="text-[11px] text-neutral-400 mt-1">
              {debouncedSearch ? 'Try adjusting your search or filters' : 'Click "Add Contest" to create your first one'}
            </p>
            {!debouncedSearch && (
              <button
                onClick={() => navigate('/contests/new')}
                className="mt-4 px-3 py-1.5 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:opacity-90 transition-all shadow-sm flex items-center gap-1.5 text-[11px] font-semibold"
              >
                <Plus size={12} strokeWidth={2.5} />
                Add Contest
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 rounded-xl overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.01)]">
            {/* Header */}
            <div className="bg-neutral-50/50 dark:bg-neutral-900/30 px-5 py-2.5 flex items-center text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
              <div className="w-[30%]">Contest</div>
              <div className="w-[13%]">Category</div>
              <div className="w-[10%]">Type</div>
              <div className="w-[9%]">Status</div>
              <div className="w-[13%]">Deadline</div>
              <div className="w-[12%]">Prize</div>
              <div className="w-[13%] text-right">Actions</div>
            </div>
            {/* Rows */}
            <div className="divide-y divide-neutral-200/50 dark:divide-white/5">
              {contests.map((contest) => {
                const statusCfg = STATUS_CONFIG[contest.status] || STATUS_CONFIG.closed;
                return (
                  <div
                    key={contest._id}
                    onClick={() => navigate(`/contests/${contest._id}/edit`)}
                    className={`px-5 py-2.5 flex items-center hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors cursor-pointer text-xs text-neutral-700 dark:text-neutral-300 ${contest.archivedAt ? 'opacity-55' : ''}`}
                  >
                    {/* Title */}
                    <div className="w-[30%] flex items-center gap-3 pr-4 min-w-0">
                      <Thumb src={contest.image} alt={contest.image?.alt} />
                      <div className="min-w-0">
                        <span className="truncate font-semibold text-neutral-900 dark:text-white block text-[12px]">
                          {contest.title}
                        </span>
                        <span className="text-[9px] text-neutral-400 dark:text-neutral-500 truncate block font-mono">
                          /{contest.slug || '—'}
                        </span>
                      </div>
                    </div>

                    {/* Category */}
                    <div className="w-[13%] pr-3 truncate">
                      {contest.category ? (
                        <span className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800/50 text-[9px] font-medium text-neutral-500 dark:text-neutral-400 border border-neutral-200/50 dark:border-white/5 truncate inline-block max-w-full">
                          {contest.category}
                        </span>
                      ) : (
                        <span className="text-neutral-400">—</span>
                      )}
                    </div>

                    {/* Type */}
                    <div className="w-[10%] pr-3">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold border ${contest.type === 'hackathon'
                        ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/15'
                        : 'bg-neutral-100 dark:bg-neutral-800/50 text-neutral-500 dark:text-neutral-400 border-neutral-200/50 dark:border-white/5'}`}>
                        {contest.type === 'hackathon' ? 'Hackathon' : 'Contest'}
                      </span>
                    </div>

                    {/* Status */}
                    <div className="w-[9%] pr-3">
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold border ${statusCfg.bg} ${statusCfg.text} ${statusCfg.border}`}>
                        {statusCfg.label}
                      </span>
                    </div>

                    {/* Deadline */}
                    <div className="w-[13%] pr-3 flex items-center gap-1.5 text-[10px] text-neutral-500 dark:text-neutral-400">
                      <Calendar size={10} className="text-neutral-400 shrink-0" />
                      {contest.timeline?.submissionDeadlineUTC
                        ? formatDate(contest.timeline.submissionDeadlineUTC)
                        : '—'}
                    </div>

                    {/* Prize */}
                    <div className="w-[12%] pr-3 flex items-center gap-1.5 text-[10px] text-neutral-500 dark:text-neutral-400 min-w-0">
                      <DollarSign size={10} className="text-neutral-400 shrink-0" />
                      <span className="truncate">{formatPrize(contest.prize)}</span>
                    </div>

                    {/* Actions */}
                    <div className="w-[13%] flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => navigate(`/contests/${contest._id}/edit`)}
                        className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-white/5 text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-colors"
                        title="Edit contest"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => navigate(`/contests/${contest._id}/details`)}
                        className="p-1.5 rounded hover:bg-amber-500/10 text-neutral-500 hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
                        title="Edit DETAILED GUIDE (AI insights on the public page)"
                      >
                        <Sparkles size={13} />
                      </button>
                      {contest.link && (
                        <a
                          href={contest.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded hover:bg-blue-500/10 text-neutral-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                          title="Open official link"
                        >
                          <ExternalLink size={13} />
                        </a>
                      )}
                      {contest.archivedAt ? (
                        <button
                          onClick={() => handleRestore(contest)}
                          disabled={busy === contest._id}
                          className="p-1.5 rounded hover:bg-emerald-500/10 text-neutral-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors disabled:opacity-30"
                          title="Restore contest"
                        >
                          {busy === contest._id ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                        </button>
                      ) : (
                        <button
                          onClick={() => handleArchive(contest)}
                          disabled={busy === contest._id}
                          className="p-1.5 rounded hover:bg-red-500/10 text-neutral-500 hover:text-red-600 dark:hover:text-red-400 transition-colors disabled:opacity-30"
                          title="Archive contest"
                        >
                          {busy === contest._id ? <Loader2 size={13} className="animate-spin" /> : <Archive size={13} />}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 px-4 py-6">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1.5 rounded-lg border border-neutral-200/60 dark:border-white/5 bg-white dark:bg-[#151518] text-neutral-500 hover:text-neutral-900 dark:hover:text-white disabled:opacity-30 transition-all shadow-sm"
            >
              <ChevronLeft size={13} />
            </button>
            <span className="text-[11px] font-medium text-neutral-500">
              Page {page} of {totalPages} · {pagination.total} total
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1.5 rounded-lg border border-neutral-200/60 dark:border-white/5 bg-white dark:bg-[#151518] text-neutral-500 hover:text-neutral-900 dark:hover:text-white disabled:opacity-30 transition-all shadow-sm"
            >
              <ChevronRight size={13} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Contests;
