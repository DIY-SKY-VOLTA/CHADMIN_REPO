import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search,
  X,
  AlertTriangle,
  Image as ImageIcon,
  Globe,
  Calendar,
  Loader2,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  FileWarning,
  Ban,
  WifiOff,
  HelpCircle,
  Clock,
  ArrowUpDown,
  Eye,
  Upload,
  FileUp,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import adminAPI from '@/api/adminAPI';

const FILTER_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'no_image', label: 'No Image' },
  { key: 'broken', label: 'Broken' },
  { key: 'no_backup', label: 'No Backup' },
  { key: 'healthy', label: 'Healthy' },
  { key: 'unknown', label: 'Unknown' },
];

const STATUS_CONFIG = {
  no_image: { icon: FileWarning, label: 'No Image', color: '#a1a1aa', bg: 'bg-neutral-500/10', text: 'text-neutral-600 dark:text-neutral-400', border: 'border-neutral-500/15' },
  broken: { icon: Ban, label: 'Broken', color: '#ef4444', bg: 'bg-red-500/10', text: 'text-red-600 dark:text-red-400', border: 'border-red-500/15' },
  no_backup: { icon: AlertTriangle, label: 'No Backup', color: '#eab308', bg: 'bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400', border: 'border-amber-500/15' },
  healthy: { icon: CheckCircle2, label: 'Healthy', color: '#22c55e', bg: 'bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-500/15' },
  unknown: { icon: HelpCircle, label: 'Unknown', color: '#a1a1aa', bg: 'bg-neutral-500/10', text: 'text-neutral-500', border: 'border-neutral-500/15' },
};

const REALTIME_STATUS = {
  alive: { label: 'Alive', color: '#22c55e', icon: CheckCircle2 },
  dead: { label: 'Dead', color: '#ef4444', icon: Ban },
  blocked: { label: 'Blocked', color: '#eab308', icon: AlertTriangle },
  timeout: { label: 'Timeout', color: '#f97316', icon: Clock },
  dns_failed: { label: 'DNS Failed', color: '#ef4444', icon: WifiOff },
  connection_refused: { label: 'Refused', color: '#ef4444', icon: WifiOff },
  connection_reset: { label: 'Reset', color: '#ef4444', icon: WifiOff },
  server_error: { label: 'Server Error', color: '#ef4444', icon: AlertTriangle },
  redirected: { label: 'Redirected', color: '#3b82f6', icon: ExternalLink },
  error: { label: 'Error', color: '#ef4444', icon: AlertTriangle },
  no_image: { label: 'No Image URL', color: '#a1a1aa', icon: FileWarning },
};

const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch { return '—'; }
};

const ImagePreview = ({ src, alt, size = 'sm' }) => {
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  if (!src || hasError) {
    const iconClass = size === 'lg' ? 'w-8 h-8' : 'w-4 h-4';
    return (
      <ImageIcon size={size === 'lg' ? 32 : 12} className={`text-neutral-400 ${iconClass}`} strokeWidth={1.5} />
    );
  }

  return (
    <>
      {!isLoaded && (
        <div className="absolute inset-0 bg-neutral-100 dark:bg-neutral-900/50 animate-pulse" />
      )}
      <img
        src={src}
        alt={alt || ''}
        className={`w-full h-full object-cover transition-opacity duration-200 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => setIsLoaded(true)}
        onError={() => setHasError(true)}
      />
    </>
  );
};

const ContestImages = () => {
  const [contests, setContests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });
  const [stats, setStats] = useState({ total: 0, healthy: 0, broken: 0, noBackup: 0, noImage: 0 });
  const [sortBy, setSortBy] = useState('title');
  const [sortOrder, setSortOrder] = useState('asc');

  // Selection and detail state
  const [selectedContest, setSelectedContest] = useState(null);
  const [checkedContests, setCheckedContests] = useState(new Set());
  const [isRechecking, setIsRechecking] = useState(null); // contestId being rechecked
  const [recheckResult, setRecheckResult] = useState(null);
  const [isBulkRechecking, setIsBulkRechecking] = useState(false);

  // Upload state
  const [uploadTarget, setUploadTarget] = useState(null); // contest being uploaded for
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadPreview, setUploadPreview] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [contestDetails, setContestDetails] = useState(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const fileInputRef = useRef(null);

  const [isDragOver, setIsDragOver] = useState(false);

  const searchTimerRef = useRef(null);
  const recheckTimerRef = useRef(null);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      if (recheckTimerRef.current) clearTimeout(recheckTimerRef.current);
    };
  }, []);

  // Debounce search
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

  // Fetch contests
  const fetchContests = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await adminAPI.get('/contests/images/health', {
        params: {
          page,
          limit: 50,
          search: debouncedSearch,
          filter: activeFilter,
          sortBy,
          sortOrder,
        },
      });

      if (res.success) {
        setContests(res.contests || []);
        setPagination(res.pagination || { total: 0, pages: 1 });
        setStats(res.stats || { total: 0, healthy: 0, broken: 0, noBackup: 0, noImage: 0 });
      }
    } catch (err) {
      toast.error(err?.message || 'Failed to load contest images');
    } finally {
      setIsLoading(false);
    }
  }, [page, debouncedSearch, activeFilter, sortBy, sortOrder]);

  useEffect(() => {
    fetchContests();
  }, [fetchContests]);

  // Recheck single image
  const handleRecheck = async (contest) => {
    const imageUrl = contest.image?.primaryUrl;
    if (!imageUrl) {
      toast.error('Contest has no image URL to check');
      return;
    }

    setIsRechecking(contest.id);
    setRecheckResult(null);
    try {
      const res = await adminAPI.post('/contests/images/recheck', {
        contestId: contest.id,
        url: imageUrl,
        updateDb: true,
      });
      if (res.success) {
        setRecheckResult(res.check);
        toast.success(`Check complete: ${res.check.status}`);
        // Refresh to get updated status
        if (recheckTimerRef.current) clearTimeout(recheckTimerRef.current);
        recheckTimerRef.current = setTimeout(() => fetchContests(), 1000);
      }
    } catch (err) {
      toast.error(err?.message || 'Re-check failed');
    } finally {
      setIsRechecking(null);
    }
  };

  // Bulk recheck selected
  const handleBulkRecheck = async () => {
    if (checkedContests.size === 0) {
      toast.error('Select contests to re-check');
      return;
    }

    setIsBulkRechecking(true);
    try {
      const res = await adminAPI.post('/contests/images/bulk-recheck', {
        contestIds: Array.from(checkedContests),
      });

      if (res.success) {
        const alive = res.results.filter(r => r.status === 'alive').length;
        const dead = res.results.filter(r => r.status === 'dead').length;
        const errors = res.results.filter(r => r.status === 'error' || r.status === 'no_image').length;
        toast.success(`Checked ${res.results.length}: ${alive} alive, ${dead} dead, ${errors} errors`);
        setCheckedContests(new Set());
        fetchContests();
      }
    } catch (err) {
      toast.error(err?.message || 'Bulk re-check failed');
    } finally {
      setIsBulkRechecking(false);
    }
  };

  // Handle opening the upload modal — fetches full contest details
  const handleOpenUpload = async (contest) => {
    setUploadTarget(contest);
    setUploadFile(null);
    setUploadPreview(null);
    setContestDetails(null);
    setIsLoadingDetails(true);

    try {
      const res = await adminAPI.get('/contests/images/details', {
        params: { contestId: contest.id },
      });
      if (res.success) {
        setContestDetails(res.contest);
      }
    } catch (err) {
      // Fall back to what we have from the table
      setContestDetails({
        id: contest.id,
        title: contest.title,
        description: null,
        category: contest.category,
        tags: [],
        source: contest.source,
        link: contest.link,
        image: contest.image,
      });
    } finally {
      setIsLoadingDetails(false);
    }
  };

  // Handle file selection
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    // Validate size (15MB)
    if (file.size > 15 * 1024 * 1024) {
      toast.error('Image must be under 15MB');
      return;
    }

    // Revoke previous preview URL to avoid memory leak
    if (uploadPreview) URL.revokeObjectURL(uploadPreview);
    setUploadFile(file);
    setUploadPreview(URL.createObjectURL(file));
    setIsDragOver(false);
  };

  // Handle upload submission
  const handleUploadSubmit = async () => {
    if (!uploadTarget || !uploadFile) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('contestId', uploadTarget.id);
      formData.append('image', uploadFile);

      const res = await adminAPI.post('/contests/images/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (res.success) {
        toast.success('Image uploaded and contest updated successfully');
        setUploadTarget(null);
        setUploadFile(null);
        setUploadPreview(null);
        setContestDetails(null);
        fetchContests();
      }
    } catch (err) {
      toast.error(err?.message || 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  // Close upload modal
  const handleCloseUpload = () => {
    if (uploadPreview) URL.revokeObjectURL(uploadPreview);
    setUploadTarget(null);
    setUploadFile(null);
    setUploadPreview(null);
    setContestDetails(null);
    setIsDragOver(false);
  };

  // Toggle select
  const toggleSelect = (id) => {
    setCheckedContests(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (checkedContests.size === contests.length) {
      setCheckedContests(new Set());
    } else {
      setCheckedContests(new Set(contests.map(c => c.id)));
    }
  };

  // Get status config
  const getStatusConfig = (contest) => {
    return STATUS_CONFIG[contest.imageStatus] || STATUS_CONFIG.unknown;
  };

  // Toggle sort
  const toggleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
    setPage(1);
  };

  const StatusIcon = ({ status, size = 13 }) => {
    const cfg = getStatusConfig({ imageStatus: status });
    const Icon = cfg.icon;
    return <Icon size={size} strokeWidth={1.5} style={{ color: cfg.color }} />;
  };

  const totalPages = Math.max(1, pagination.pages || 1);

  return (
    <div className="h-full flex flex-col bg-neutral-50/30 dark:bg-[#0d0d0f]/20 selection:bg-neutral-200/50 dark:selection:bg-neutral-800/50">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-neutral-200/50 dark:border-white/5 bg-white/40 dark:bg-[#121214]/40 backdrop-blur-sm">
        <div>
          <h1 className="text-base font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
            Contest Images Health
          </h1>
          <p className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-0.5">
            {stats.total > 0
              ? `Monitoring ${stats.total} contest images — ${stats.broken} broken, ${stats.noImage} missing`
              : 'Check the health of contest images across all sources'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              fetchContests();
              toast.success('Refreshed');
            }}
            className="p-1.5 rounded-lg border border-neutral-200/50 dark:border-white/5 bg-white dark:bg-[#18181b] hover:bg-neutral-50 dark:hover:bg-white/5 text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-all shadow-sm flex items-center gap-1.5 text-[11px] font-medium"
          >
            <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats Summary Cards */}
      <div className="shrink-0 p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
        {[
          { key: 'total', label: 'Total Contests', value: stats.total, icon: Globe, color: 'text-neutral-550', bg: 'bg-neutral-100 dark:bg-neutral-800/50' },
          { key: 'healthy', label: 'Healthy', value: stats.healthy, icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-550', bg: 'bg-emerald-500/10' },
          { key: 'no_image', label: 'No Image', value: stats.noImage, icon: FileWarning, color: 'text-neutral-500', bg: 'bg-neutral-500/10' },
          { key: 'no_backup', label: 'No Backup', value: stats.noBackup, icon: AlertTriangle, color: 'text-amber-600 dark:text-amber-550', bg: 'bg-amber-500/10' },
          { key: 'broken', label: 'Broken', value: stats.broken, icon: Ban, color: 'text-red-600 dark:text-red-550', bg: 'bg-red-500/10' },
          { key: 'unknown', label: 'Unknown', value: stats.unknown, icon: HelpCircle, color: 'text-neutral-500', bg: 'bg-neutral-500/10' },
        ].map((stat) => (
          <button
            key={stat.key}
            onClick={() => {
              if (stat.key === 'total') { setActiveFilter('all'); }
              else { setActiveFilter(stat.key); }
              setPage(1);
            }}
            className={`bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 p-4 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex items-center justify-between group hover:border-neutral-300 dark:hover:border-neutral-800 transition-all cursor-pointer ${
              activeFilter === stat.key || (stat.key === 'total' && activeFilter === 'all')
                ? 'ring-1 ring-neutral-400/30 dark:ring-neutral-600/50'
                : ''
            }`}
          >
            <div className="space-y-1">
              <span className="text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">{stat.label}</span>
              <p className="text-xl font-bold text-neutral-800 dark:text-neutral-100 leading-none">{stat.value}</p>
            </div>
            <div className={`w-8 h-8 rounded-lg ${stat.bg} flex items-center justify-center ${stat.color}`}>
              <stat.icon size={15} strokeWidth={1.5} />
            </div>
          </button>
        ))}
      </div>

      {/* Control Bar */}
      <div className="shrink-0 px-6 pb-4 flex flex-col md:flex-row gap-4 items-center justify-between">
        {/* Search */}
        <div className="w-full md:w-80 relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-neutral-550" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, source, category..."
            className="w-full pl-9 pr-8 py-1.5 bg-white dark:bg-[#151518] border border-neutral-200/60 dark:border-white/5 rounded-lg text-xs text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:border-neutral-400 dark:focus:border-neutral-700 transition-all shadow-[0_1px_2px_rgba(0,0,0,0.01)]"
          />
          {search && (
            <button
              onClick={() => { setSearch(''); setDebouncedSearch(''); setPage(1); }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-750 dark:hover:text-white"
            >
              <X size={12} />
            </button>
          )}
        </div>

        <div className="w-full md:w-auto flex flex-wrap items-center gap-3 justify-end">
          {/* Filters */}
          <div className="p-0.5 rounded-lg bg-neutral-200/50 dark:bg-neutral-950/60 border border-neutral-200/40 dark:border-white/5 flex gap-0.5 shadow-inner">
            {FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => { setActiveFilter(opt.key); setPage(1); }}
                className={`px-3 py-1 text-[11px] font-medium rounded-md transition-all ${
                  activeFilter === opt.key
                    ? 'bg-white dark:bg-[#1b1b1e] text-neutral-900 dark:text-white shadow-sm'
                    : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-750 dark:hover:text-neutral-350'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Bulk actions */}
          {checkedContests.size > 0 && (
            <button
              onClick={handleBulkRecheck}
              disabled={isBulkRechecking}
              className="px-3 py-1.5 rounded-lg border border-neutral-200/50 dark:border-white/5 bg-white dark:bg-[#18181b] hover:bg-neutral-50 dark:hover:bg-white/5 text-neutral-600 hover:text-neutral-900 dark:hover:text-white transition-all shadow-sm flex items-center gap-1.5 text-[11px] font-medium disabled:opacity-40"
            >
              {isBulkRechecking ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <RefreshCw size={12} />
              )}
              Re-check ({checkedContests.size})
            </button>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {isLoading ? (
          <div className="grid grid-cols-1 gap-3 animate-pulse">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-16 bg-neutral-200/50 dark:bg-neutral-800 rounded-xl" />
            ))}
          </div>
        ) : contests.length === 0 ? (
          <div className="bg-white dark:bg-[#151518]/40 border border-neutral-200/40 dark:border-white/5 rounded-2xl flex flex-col items-center justify-center py-20 shadow-sm">
            <StatusIcon status="no_image" size={28} />
            <p className="text-xs font-semibold text-neutral-800 dark:text-neutral-300 mt-3">
              {debouncedSearch ? 'No matching contests found' : 'No contest data available'}
            </p>
            <p className="text-[11px] text-neutral-400 mt-1">
              {debouncedSearch ? 'Try adjusting your search or filter' : 'Contests will appear once data is synced from the scrapping pipeline'}
            </p>
          </div>
        ) : (
          /* Table View */
          <div className="bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 rounded-xl overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.01)]">
            <div className="min-w-full divide-y divide-neutral-200/50 dark:divide-white/5">
              {/* Table Headers */}
              <div className="bg-neutral-50/50 dark:bg-neutral-900/30 px-5 py-2.5 flex items-center text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
                <div className="w-[3%] flex items-center">
                  <input
                    type="checkbox"
                    checked={contests.length > 0 && checkedContests.size === contests.length}
                    onChange={selectAll}
                    className="rounded border-neutral-300 dark:border-neutral-700"
                  />
                </div>
                <div className="w-[4%]"></div>
                <div
                  className="w-[28%] flex items-center gap-1 cursor-pointer hover:text-neutral-600 dark:hover:text-neutral-300"
                  onClick={() => toggleSort('title')}
                >
                  Contest
                  <ArrowUpDown size={10} strokeWidth={2} className="opacity-50" />
                </div>
                <div className="w-[12%]">Category</div>
                <div
                  className="w-[10%] flex items-center gap-1 cursor-pointer hover:text-neutral-600 dark:hover:text-neutral-300"
                  onClick={() => toggleSort('source')}
                >
                  Source
                  <ArrowUpDown size={10} strokeWidth={2} className="opacity-50" />
                </div>
                <div className="w-[10%]">Image</div>
                <div className="w-[12%]">Backup</div>
                <div
                  className="w-[11%] flex items-center gap-1 cursor-pointer hover:text-neutral-600 dark:hover:text-neutral-300"
                  onClick={() => toggleSort('lastChecked')}
                >
                  Checked
                  <ArrowUpDown size={10} strokeWidth={2} className="opacity-50" />
                </div>
                <div className="w-[10%] text-right">Actions</div>
              </div>

              {/* Table Rows */}
              <div className="divide-y divide-neutral-150 dark:divide-white/5">
                {contests.map((contest) => {
                  const statusCfg = getStatusConfig(contest);
                  const StatusIconCmp = statusCfg.icon;
                  return (
                    <div
                      key={contest.id}
                      onClick={() => setSelectedContest(contest)}
                      className={`px-5 py-2.5 flex items-center hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors cursor-pointer text-xs text-neutral-700 dark:text-neutral-350 ${
                        selectedContest?.id === contest.id ? 'bg-neutral-100/60 dark:bg-white/5 font-medium' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <div className="w-[3%] pr-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={checkedContests.has(contest.id)}
                          onChange={() => toggleSelect(contest.id)}
                          className="rounded border-neutral-300 dark:border-neutral-700"
                        />
                      </div>

                      {/* Status dot */}
                      <div className="w-[4%] flex items-center">
                        <StatusIconCmp size={14} strokeWidth={1.5} style={{ color: statusCfg.color }} />
                      </div>

                      {/* Title */}
                      <div className="w-[28%] truncate pr-4">
                        <span className="truncate font-semibold text-neutral-900 dark:text-white block text-[12px]">
                          {contest.title}
                        </span>
                        {contest.image?.alt && (
                          <span className="text-[9px] text-neutral-400 dark:text-neutral-500 truncate block mt-0.5">
                            {contest.image.alt}
                          </span>
                        )}
                      </div>

                      {/* Category */}
                      <div className="w-[12%] pr-4 truncate">
                        {contest.category ? (
                          <span className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800/50 text-[9px] font-medium text-neutral-500 dark:text-neutral-400 border border-neutral-200/50 dark:border-white/5">
                            {contest.category}
                          </span>
                        ) : (
                          <span className="text-neutral-350">—</span>
                        )}
                      </div>

                      {/* Source */}
                      <div className="w-[10%] pr-4 flex items-center gap-1.5">
                        {contest.source?.name ? (
                          <>
                            <Globe size={10} className="text-neutral-400 shrink-0" />
                            <span className="truncate text-[10px]">{contest.source.name}</span>
                          </>
                        ) : (
                          <span className="text-neutral-350">—</span>
                        )}
                      </div>

                      {/* Image Preview */}
                      <div className="w-[10%] pr-4">
                        <div className="w-8 h-8 rounded-lg overflow-hidden border border-neutral-200/50 dark:border-white/10 bg-neutral-100 dark:bg-neutral-900/50 flex items-center justify-center shrink-0 relative">
                          {contest.image?.primaryUrl && contest.imageStatus !== 'no_image' ? (
                            <ImagePreview src={contest.image.primaryUrl} />
                          ) : (
                            <ImageIcon size={12} className="text-neutral-400" />
                          )}
                        </div>
                      </div>

                      {/* Backup Status */}
                      <div className="w-[12%] pr-4">
                        {contest.image?.backupUrl ? (
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${STATUS_CONFIG.healthy.bg} ${STATUS_CONFIG.healthy.text} ${STATUS_CONFIG.healthy.border} border`}>
                            R2 Backup
                          </span>
                        ) : (
                          <span className="text-[9px] text-neutral-400">None</span>
                        )}
                      </div>

                      {/* Last Checked */}
                      <div className="w-[11%] pr-4 text-[10px] text-neutral-400 dark:text-neutral-500">
                        {contest.image?.lastCheckedAt
                          ? formatDate(contest.image.lastCheckedAt)
                          : 'Never'}
                      </div>

                      {/* Actions */}
                      <div className="w-[10%] text-right flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleOpenUpload(contest)}
                          className="p-1.5 rounded hover:bg-emerald-500/10 text-neutral-450 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                          title="Upload replacement image"
                        >
                          <Upload size={13} />
                        </button>
                        <button
                          onClick={() => handleRecheck(contest)}
                          disabled={isRechecking === contest.id || !contest.image?.primaryUrl}
                          className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-white/5 text-neutral-450 hover:text-neutral-750 dark:hover:text-white transition-colors disabled:opacity-30"
                          title={contest.image?.primaryUrl ? 'Re-check image URL' : 'No image URL to check'}
                        >
                          {isRechecking === contest.id ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <RefreshCw size={13} />
                          )}
                        </button>
                        <button
                          onClick={() => setSelectedContest(contest)}
                          className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-white/5 text-neutral-450 hover:text-neutral-750 dark:hover:text-white transition-colors"
                          title="View details"
                        >
                          <Eye size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
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
              Page {page} of {totalPages}
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

      {/* Recheck Result Toast */}
      {recheckResult && (
        <div className="fixed bottom-6 right-6 z-50 bg-white dark:bg-[#151518] border border-neutral-200/50 dark:border-white/5 rounded-xl p-4 shadow-2xl max-w-xs">
          <div className="flex items-start gap-3">
            <div className="shrink-0 mt-0.5">
              {recheckResult.status === 'alive' ? (
                <CheckCircle2 size={16} className="text-emerald-500" />
              ) : (
                <AlertTriangle size={16} className="text-amber-500" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-neutral-800 dark:text-neutral-200">
                {REALTIME_STATUS[recheckResult.status]?.label || recheckResult.status}
              </p>
              <p className="text-[10px] text-neutral-400 mt-0.5 break-all">
                {recheckResult.reason || `HTTP ${recheckResult.statusCode || '—'}`}
              </p>
            </div>
            <button
              onClick={() => setRecheckResult(null)}
              className="shrink-0 p-0.5 rounded hover:bg-neutral-100 dark:hover:bg-white/5 text-neutral-400"
            >
              <X size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Detail Slide-over Panel */}
      <AnimatePresence>
        {selectedContest && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedContest(null)}
              className="fixed inset-0 z-40 bg-black/30 dark:bg-black/60 backdrop-blur-[2px]"
            />

            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-white dark:bg-[#151518] border-l border-neutral-200/50 dark:border-white/5 shadow-2xl flex flex-col overflow-hidden"
            >
              {/* Header */}
              <div className="shrink-0 p-4 border-b border-neutral-200/50 dark:border-white/5 flex items-center justify-between">
                <span className="text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
                  Contest Image Details
                </span>
                <button
                  onClick={() => setSelectedContest(null)}
                  className="p-1 rounded-lg hover:bg-neutral-100 dark:hover:bg-white/5 text-neutral-400 hover:text-neutral-750 dark:hover:text-white transition-colors"
                >
                  <X size={15} />
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar text-xs">
                {/* Status Badge */}
                <div className="flex items-center gap-2">
                  {(() => {
                    const cfg = getStatusConfig(selectedContest);
                    const Icon = cfg.icon;
                    return (
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${cfg.bg} ${cfg.text} ${cfg.border} border`}>
                        <Icon size={12} strokeWidth={2} />
                        {cfg.label}
                      </span>
                    );
                  })()}
                </div>

                {/* Contest Title */}
                <div>
                  <h2 className="text-[13px] font-bold text-neutral-900 dark:text-white leading-snug">
                    {selectedContest.title}
                  </h2>
                  {selectedContest.category && (
                    <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800/50 text-[9px] font-medium text-neutral-500 dark:text-neutral-400">
                      {selectedContest.category}
                    </span>
                  )}
                </div>

                {/* Image Preview */}
                <div className="bg-neutral-100 dark:bg-neutral-900/30 border border-neutral-200/40 dark:border-white/5 rounded-xl p-3 shadow-inner flex items-center justify-center min-h-[140px] overflow-hidden group/viewer relative">
                  {selectedContest.image?.primaryUrl && selectedContest.imageStatus !== 'no_image' ? (
                    <div className="max-h-[180px] w-full flex items-center justify-center relative">
                      <ImagePreview src={selectedContest.image.primaryUrl} size="lg" />
                    </div>
                  ) : (
                    <div className="py-10 text-center">
                      <ImageIcon size={32} className="text-neutral-350 dark:text-neutral-600 mx-auto mb-2" />
                      <p className="text-[10px] text-neutral-400">No image available</p>
                    </div>
                  )}
                </div>

                {/* Image Source Details */}
                <div className="space-y-2">
                  <span className="block text-[9px] font-semibold text-neutral-400 uppercase tracking-wider">Image Source</span>
                  <div className="bg-neutral-50/50 dark:bg-[#1b1b1e]/30 border border-neutral-200/30 dark:border-white/5 rounded-xl p-3 space-y-2.5">
                    <div className="flex items-start gap-2">
                      <ExternalLink size={12} className="text-neutral-400 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <span className="text-[8px] font-bold text-neutral-400 uppercase">Primary URL</span>
                        <p className="text-[10px] font-mono text-neutral-700 dark:text-neutral-350 break-all mt-0.5">
                          {selectedContest.image?.primaryUrl || '—'}
                        </p>
                      </div>
                    </div>
                    {selectedContest.image?.originalDomain && (
                      <div className="flex items-center gap-2">
                        <Globe size={12} className="text-neutral-400 shrink-0" />
                        <span className="text-[10px] text-neutral-500">
                          Domain: <span className="font-mono text-neutral-700 dark:text-neutral-350">{selectedContest.image.originalDomain}</span>
                        </span>
                      </div>
                    )}
                    {selectedContest.image?.alt && (
                      <div className="flex items-start gap-2">
                        <ImageIcon size={12} className="text-neutral-400 shrink-0 mt-0.5" />
                        <span className="text-[10px] text-neutral-500">{selectedContest.image.alt}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Backup Status */}
                <div className="space-y-2">
                  <span className="block text-[9px] font-semibold text-neutral-400 uppercase tracking-wider">Backup (R2)</span>
                  <div className="bg-neutral-50/50 dark:bg-[#1b1b1e]/30 border border-neutral-200/30 dark:border-white/5 rounded-xl p-3 space-y-2">
                    {selectedContest.image?.backupUrl ? (
                      <>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 size={12} className="text-emerald-500" />
                          <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">Backed up to R2</span>
                        </div>
                        <p className="text-[9px] font-mono text-neutral-400 break-all">{selectedContest.image.backupUrl}</p>
                        {selectedContest.image?.backupFormat && (
                          <span className="inline-flex px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[8px] font-bold">
                            {selectedContest.image.backupFormat.toUpperCase()}
                          </span>
                        )}
                      </>
                    ) : (
                      <div className="flex items-center gap-2">
                        <AlertTriangle size={12} className="text-amber-500" />
                        <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">No backup stored</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Source Info */}
                <div className="space-y-2">
                  <span className="block text-[9px] font-semibold text-neutral-400 uppercase tracking-wider">Source</span>
                  <div className="bg-neutral-50/50 dark:bg-[#1b1b1e]/30 border border-neutral-200/30 dark:border-white/5 rounded-xl p-3 space-y-2 text-[10px]">
                    {selectedContest.source?.name && (
                      <div className="flex items-center gap-2">
                        <Globe size={12} className="text-neutral-400 shrink-0" />
                        <span className="text-neutral-700 dark:text-neutral-350 font-medium">{selectedContest.source.name}</span>
                      </div>
                    )}
                    {selectedContest.source?.url && (
                      <div className="flex items-center gap-2">
                        <ExternalLink size={12} className="text-neutral-400 shrink-0" />
                        <a
                          href={selectedContest.source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 dark:text-blue-400 hover:underline truncate"
                        >
                          {selectedContest.source.url}
                        </a>
                      </div>
                    )}
                    {selectedContest.link && (
                      <div className="flex items-center gap-2">
                        <ExternalLink size={12} className="text-neutral-400 shrink-0" />
                        <a
                          href={selectedContest.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 dark:text-blue-400 hover:underline truncate"
                        >
                          Contest Link
                        </a>
                      </div>
                    )}
                    {selectedContest.image?.lastCheckedAt && (
                      <div className="flex items-center gap-2">
                        <Calendar size={12} className="text-neutral-400 shrink-0" />
                        <span>Last checked: {formatDate(selectedContest.image.lastCheckedAt)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="shrink-0 p-4 border-t border-neutral-200/50 dark:border-white/5 bg-neutral-50/50 dark:bg-neutral-900/30 flex flex-col gap-2">
                <button
                  onClick={() => {
                    handleOpenUpload(selectedContest);
                    setSelectedContest(null);
                  }}
                  className="w-full py-2 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500 transition-colors shadow-sm flex items-center justify-center gap-1.5"
                >
                  <Upload size={12} />
                  Upload Replacement Image
                </button>
                <div className="flex gap-3">
                  <button
                    onClick={() => handleRecheck(selectedContest)}
                    disabled={isRechecking === selectedContest.id || !selectedContest.image?.primaryUrl}
                    className="flex-1 py-2 border border-neutral-200 dark:border-white/5 rounded-lg text-xs font-semibold text-neutral-500 hover:text-neutral-800 dark:hover:text-white bg-white dark:bg-[#18181b] hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-40"
                  >
                    {isRechecking === selectedContest.id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <RefreshCw size={12} />
                    )}
                    Re-check Image
                  </button>
                  <button
                    onClick={() => setSelectedContest(null)}
                    className="px-4 py-2 border border-neutral-200 dark:border-white/5 rounded-lg text-xs font-semibold text-neutral-500 hover:text-neutral-800 dark:hover:text-white bg-white dark:bg-[#18181b] hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors shadow-sm"
                  >
                    Close
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Upload Modal */}
      <AnimatePresence>
        {uploadTarget && (
          <>
            <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-[2px]" onClick={handleCloseUpload} />
            <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-lg bg-white dark:bg-[#151518] rounded-xl border border-neutral-200/50 dark:border-white/5 p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto custom-scrollbar"
              >
                {/* Header */}
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                    <Upload size={18} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-xs font-bold text-neutral-900 dark:text-white uppercase tracking-wide">
                      Upload Contest Image
                    </h3>
                    <p className="text-[10px] text-neutral-400 mt-0.5">
                      Upload an image you generated externally for this contest
                    </p>
                  </div>
                </div>

                {/* Contest Details (for reference) */}
                <div className="bg-neutral-50/50 dark:bg-[#1b1b1e]/30 border border-neutral-200/30 dark:border-white/5 rounded-xl p-4 space-y-2.5">
                  <span className="text-[9px] font-semibold text-neutral-400 uppercase tracking-wider flex items-center gap-1">
                    <FileUp size={10} />
                    Contest Reference
                  </span>

                  {isLoadingDetails ? (
                    <div className="flex items-center gap-2 py-2">
                      <Loader2 size={12} className="animate-spin text-neutral-400" />
                      <span className="text-[10px] text-neutral-400">Loading details...</span>
                    </div>
                  ) : (
                    <div className="space-y-2 text-[11px]">
                      <div>
                        <span className="text-[9px] font-bold text-neutral-400 uppercase block">Title</span>
                        <p className="text-neutral-900 dark:text-neutral-100 font-semibold mt-0.5">{contestDetails?.title || uploadTarget.title}</p>
                      </div>
                      {contestDetails?.description && (
                        <div>
                          <span className="text-[9px] font-bold text-neutral-400 uppercase block">Description</span>
                          <p className="text-neutral-600 dark:text-neutral-400 mt-0.5 leading-relaxed">{contestDetails.description}</p>
                        </div>
                      )}
                      <div className="flex gap-4">
                        {contestDetails?.category && (
                          <div>
                            <span className="text-[9px] font-bold text-neutral-400 uppercase block">Category</span>
                            <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800/50 text-[10px] font-medium text-neutral-600 dark:text-neutral-400">
                              {contestDetails.category}
                            </span>
                          </div>
                        )}
                        {contestDetails?.tags?.length > 0 && (
                          <div>
                            <span className="text-[9px] font-bold text-neutral-400 uppercase block">Tags</span>
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {contestDetails.tags.slice(0, 5).map((tag, i) => (
                                <span key={i} className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800/50 text-[9px] text-neutral-500 dark:text-neutral-400">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      {contestDetails?.source?.name && (
                        <div>
                          <span className="text-[9px] font-bold text-neutral-400 uppercase block">Source</span>
                          <p className="text-neutral-600 dark:text-neutral-400 mt-0.5">{contestDetails.source.name}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* File Drop Zone */}
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                  onDragLeave={(e) => { setIsDragOver(false); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragOver(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) {
                      if (!file.type.startsWith('image/')) {
                        toast.error('Please select an image file');
                        return;
                      }
                      if (file.size > 15 * 1024 * 1024) {
                        toast.error('Image must be under 15MB');
                        return;
                      }
                      if (uploadPreview) URL.revokeObjectURL(uploadPreview);
                      setUploadFile(file);
                      setUploadPreview(URL.createObjectURL(file));
                    }
                  }}
                  className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                    uploadFile
                      ? 'border-emerald-500/30 bg-emerald-500/5'
                      : isDragOver
                        ? 'border-emerald-500 bg-emerald-500/5'
                        : 'border-neutral-300/40 dark:border-neutral-700/40 hover:border-neutral-400 dark:hover:border-neutral-600 bg-neutral-50/30 dark:bg-[#1b1b1e]/20'
                  }`}
                >
                  {uploadPreview ? (
                    <div className="space-y-3">
                      <div className="max-h-[200px] overflow-hidden rounded-lg border border-neutral-200/50 dark:border-white/10 bg-neutral-100 dark:bg-neutral-900/30">
                        <img
                          src={uploadPreview}
                          alt="Preview"
                          className="max-h-[200px] w-full object-contain"
                        />
                      </div>
                      <p className="text-[11px] font-medium text-neutral-700 dark:text-neutral-300">
                        {uploadFile.name}
                      </p>
                      <p className="text-[10px] text-neutral-400">
                        {(uploadFile.size / 1024).toFixed(1)} KB — Will be compressed to WebP @80%
                      </p>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setUploadFile(null);
                          setUploadPreview(null);
                        }}
                        className="text-[10px] text-red-500 hover:text-red-600 font-medium"
                      >
                        Remove and choose another
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2 py-4">
                      <FileUp size={28} className="mx-auto text-neutral-400 dark:text-neutral-500" strokeWidth={1.5} />
                      <p className="text-xs font-semibold text-neutral-600 dark:text-neutral-400">
                        Click or drag an image here
                      </p>
                      <p className="text-[10px] text-neutral-400 dark:text-neutral-500">
                        PNG, JPEG, WebP — up to 15MB
                      </p>
                    </div>
                  )}
                </div>

                {/* Footer Buttons */}
                <div className="flex gap-3 pt-1">
                  <button
                    onClick={handleCloseUpload}
                    className="flex-1 py-2 border border-neutral-200 dark:border-white/5 rounded-lg text-xs font-semibold text-neutral-500 hover:text-neutral-800 dark:hover:text-white bg-white dark:bg-[#18181b] hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors shadow-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleUploadSubmit}
                    disabled={!uploadFile || isUploading}
                    className="flex-1 py-2 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-40 transition-all shadow-sm flex items-center justify-center gap-1.5"
                  >
                    {isUploading ? (
                      <>
                        <Loader2 size={12} className="animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload size={12} />
                        Upload & Replace
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ContestImages;
