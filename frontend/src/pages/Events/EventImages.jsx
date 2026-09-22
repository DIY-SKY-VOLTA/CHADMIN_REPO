import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search, X, AlertTriangle, Image as ImageIcon, Loader2, ChevronLeft, ChevronRight,
  RefreshCw, CheckCircle2, FileWarning, Ban, HelpCircle, Clock, ArrowUpDown,
  Upload, CloudDownload, Globe, Sparkles,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import ConfirmDialog from '@/components/UI/ConfirmDialog';
import adminAPI from '@/api/adminAPI';

const FILTER_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'no_image', label: 'No Image' },
  { key: 'broken', label: 'Broken' },
  { key: 'no_backup', label: 'No Backup' },
  { key: 'healthy', label: 'Healthy' },
  { key: 'stale', label: 'Stale' },
  { key: 'unknown', label: 'Unknown' },
];

const STATUS_CONFIG = {
  no_image: { icon: FileWarning, label: 'No Image', color: '#a1a1aa', bg: 'bg-neutral-500/10', text: 'text-neutral-600 dark:text-neutral-400', border: 'border-neutral-500/15' },
  broken: { icon: Ban, label: 'Broken', color: '#ef4444', bg: 'bg-red-500/10', text: 'text-red-600 dark:text-red-400', border: 'border-red-500/15' },
  no_backup: { icon: AlertTriangle, label: 'No Backup', color: '#eab308', bg: 'bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400', border: 'border-amber-500/15' },
  healthy: { icon: CheckCircle2, label: 'Healthy', color: '#22c55e', bg: 'bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-500/15' },
  unknown: { icon: HelpCircle, label: 'Unknown', color: '#a1a1aa', bg: 'bg-neutral-500/10', text: 'text-neutral-500', border: 'border-neutral-500/15' },
};

const formatDate = (dateStr) => {
  if (!dateStr) return 'Never';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return '—'; }
};

const ImagePreview = ({ src, alt }) => {
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  if (!src || hasError) {
    return <ImageIcon size={12} className="text-neutral-400" strokeWidth={1.5} />;
  }

  return (
    <>
      {!isLoaded && <div className="absolute inset-0 bg-neutral-100 dark:bg-neutral-900/50 animate-pulse" />}
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

const EventImages = () => {
  const [events, setEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });
  const [facets, setFacets] = useState({ eventTypes: [] });
  const [stats, setStats] = useState({ total: 0, healthy: 0, broken: 0, no_backup: 0, no_image: 0, unknown: 0, stale: 0 });
  const [sortBy, setSortBy] = useState('title');
  const [sortOrder, setSortOrder] = useState('asc');

  // Per-row action state
  const [isRechecking, setIsRechecking] = useState(null);
  const [isBackingUp, setIsBackingUp] = useState(null);

  // Cleanup pass
  const [cleanupDialog, setCleanupDialog] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [cleanupResult, setCleanupResult] = useState(null); // { summary, changes }

  // Upload modal
  const [uploadTarget, setUploadTarget] = useState(null);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadPreview, setUploadPreview] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);

  const searchTimerRef = useRef(null);

  useEffect(() => () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); }, []);

  // Debounce search
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 350);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [search]);

  const fetchEvents = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const res = await adminAPI.get('/events/images/health', {
        params: {
          page,
          limit: 50,
          search: debouncedSearch,
          filter: activeFilter,
          sortBy,
          sortOrder,
          type: typeFilter || undefined,
        },
      });
      if (res.success) {
        setEvents(res.events || []);
        setPagination(res.pagination || { total: 0, pages: 1 });
        setStats(res.stats || { total: 0, healthy: 0, broken: 0, no_backup: 0, no_image: 0, unknown: 0, stale: 0 });
        if (res.facets) setFacets(res.facets);
      }
    } catch (err) {
      toast.error(err?.message || 'Failed to load event images');
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [page, debouncedSearch, activeFilter, sortBy, sortOrder, typeFilter]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  // Recheck one event's image URL (live HEAD + content-type probe)
  const handleRecheck = async (event) => {
    setIsRechecking(event.id);
    try {
      const res = await adminAPI.post('/events/images/recheck', { eventId: event.id });
      if (res.success) {
        const { status, dbStatus, contentType, healed, healedUrl } = res.check;
        if (contentType && !contentType.startsWith('image/')) {
          toast.error(`"${event.title}": responds but serves ${contentType.split(';')[0]} — not an image. Run Cleanup to clear it.`);
        } else if (status === 'alive') {
          toast.success(`"${event.title}": alive${healed ? ' (URL auto-healed)' : ''}`);
        } else {
          toast.error(`"${event.title}": ${status}${res.check.reason ? ` — ${res.check.reason}` : ''}`);
        }
        setEvents((prev) => prev.map((e) => (e.id === event.id ? {
          ...e,
          imageStatus: dbStatus,
          image: {
            ...e.image,
            primaryUrl: healed ? healedUrl : e.image.primaryUrl,
            lastCheckedAt: new Date().toISOString(),
          },
        } : e)));
      }
    } catch (err) {
      toast.error(err?.message || 'Re-check failed');
    } finally {
      setIsRechecking(null);
    }
  };

  // Backup one event's image to R2
  const handleBackup = async (event) => {
    setIsBackingUp(event.id);
    try {
      const res = await adminAPI.post('/events/images/backup', { eventId: event.id });
      if (res.success) {
        toast.success(`Backed up to R2: ${event.title}`);
        setEvents((prev) => prev.map((e) => (e.id === event.id ? {
          ...e,
          imageStatus: 'healthy',
          image: { ...e.image, primaryUrl: res.image.url, backupUrl: res.image.url, lastCheckedAt: new Date().toISOString() },
        } : e)));
        setStats((prev) => ({
          ...prev,
          no_backup: Math.max(0, prev.no_backup - 1),
          healthy: prev.healthy + 1,
        }));
      }
    } catch (err) {
      toast.error(err?.message || 'Backup failed');
    } finally {
      setIsBackingUp(null);
    }
  };

  // Cleanup pass — heal/flag/clear pipeline garbage across all events
  const handleCleanup = async () => {
    setIsCleaning(true);
    try {
      const res = await adminAPI.post('/events/images/cleanup', {});
      if (res.success) {
        setCleanupResult(res);
        setCleanupDialog(false);
        fetchEvents(true);
        const s = res.summary;
        if (s.healed + s.cleared + s.promoted === 0) {
          toast.success(`All ${s.scanned} event images are clean — nothing to fix`);
        } else {
          toast.success(`Cleanup: ${s.healed} healed, ${s.cleared} cleared, ${s.promoted} promoted`);
        }
      }
    } catch (err) {
      toast.error(err?.message || 'Cleanup failed');
    } finally {
      setIsCleaning(false);
    }
  };

  // Upload modal
  const openUpload = (event) => {
    setUploadTarget(event);
    setUploadFile(null);
    setUploadPreview(null);
  };

  const closeUpload = () => {
    if (uploadPreview) URL.revokeObjectURL(uploadPreview);
    setUploadTarget(null);
    setUploadFile(null);
    setUploadPreview(null);
    setIsUploading(false);
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
    if (uploadPreview) URL.revokeObjectURL(uploadPreview);
    setUploadFile(file);
    setUploadPreview(URL.createObjectURL(file));
  };

  const handleUploadSubmit = async () => {
    if (!uploadTarget || !uploadFile) return;
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('eventId', uploadTarget.id);
      formData.append('image', uploadFile);
      const res = await adminAPI.post('/events/images/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (res.success) {
        toast.success(`Image replaced for: ${uploadTarget.title}`);
        setEvents((prev) => prev.map((e) => (e.id === uploadTarget.id ? {
          ...e,
          imageStatus: 'healthy',
          image: { ...e.image, primaryUrl: res.image.url, backupUrl: res.image.url, lastCheckedAt: new Date().toISOString() },
        } : e)));
        closeUpload();
        fetchEvents(true);
      }
    } catch (err) {
      toast.error(err?.message || 'Upload failed');
      setIsUploading(false);
    }
  };

  const toggleSort = (field) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
    setPage(1);
  };

  const totalPages = Math.max(1, pagination.pages || 1);

  return (
    <div className="h-full flex flex-col bg-neutral-50/30 dark:bg-[#0d0d0f]/20 selection:bg-neutral-200/50 dark:selection:bg-neutral-400/40">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-neutral-200/50 dark:border-white/5 bg-white/40 dark:bg-[#121214]/40 backdrop-blur-sm">
        <div>
          <h1 className="text-base font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
            Event Image Health
          </h1>
          <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5">
            {stats.total > 0
              ? `Monitoring ${stats.total} event images — ${stats.broken} broken, ${stats.no_image} missing${stats.stale > 0 ? `, ${stats.stale} stale` : ''}`
              : 'Check the health of event images'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCleanupDialog(true)}
            disabled={isCleaning}
            title="Heal proxy/signed URLs, promote legacy heroes, clear non-image garbage"
            className="px-3 py-1.5 rounded-lg border border-sky-500/25 bg-sky-500/5 hover:bg-sky-500/10 text-sky-600 dark:text-sky-400 transition-all shadow-sm flex items-center gap-1.5 text-[11.5px] font-semibold disabled:opacity-50"
          >
            {isCleaning ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={13} />}
            Cleanup
          </button>
          <button
            onClick={() => { fetchEvents(); toast.success('Refreshed'); }}
            className="p-1.5 rounded-lg border border-neutral-200/50 dark:border-white/5 bg-white dark:bg-[#18181b] hover:bg-neutral-50 dark:hover:bg-white/5 text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-all shadow-sm flex items-center gap-1.5 text-[11.5px] font-medium"
          >
            <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="shrink-0 px-6 py-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        {[
          { key: 'total', label: 'Total Events', value: stats.total, icon: Globe, color: 'text-neutral-500', bg: 'bg-neutral-100 dark:bg-neutral-800/50' },
          { key: 'healthy', label: 'Healthy', value: stats.healthy, icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-500', bg: 'bg-emerald-500/10' },
          { key: 'no_image', label: 'No Image', value: stats.no_image, icon: FileWarning, color: 'text-neutral-500', bg: 'bg-neutral-500/10' },
          { key: 'no_backup', label: 'No Backup', value: stats.no_backup, icon: AlertTriangle, color: 'text-amber-600 dark:text-amber-500', bg: 'bg-amber-500/10' },
          { key: 'broken', label: 'Broken', value: stats.broken, icon: Ban, color: 'text-red-600 dark:text-red-500', bg: 'bg-red-500/10' },
          { key: 'stale', label: 'Stale', value: stats.stale, icon: Clock, color: 'text-sky-600 dark:text-sky-500', bg: 'bg-sky-500/10', hint: 'Never checked, or last checked over 30 days ago' },
          { key: 'unknown', label: 'Unknown', value: stats.unknown, icon: HelpCircle, color: 'text-neutral-500', bg: 'bg-neutral-500/10', hint: 'Image record has no status at all — normally 0 once the checker has run' },
        ].map((stat) => (
          <button
            key={stat.key}
            onClick={() => { setActiveFilter(stat.key === 'total' ? 'all' : stat.key); setPage(1); }}
            title={stat.hint || undefined}
            className={`bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 p-4 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex items-center justify-between hover:border-neutral-300 dark:hover:border-neutral-800 transition-all cursor-pointer ${
              activeFilter === stat.key || (stat.key === 'total' && activeFilter === 'all')
                ? 'ring-1 ring-neutral-400/30 dark:ring-neutral-600/50'
                : ''
            }`}
          >
            <div className="space-y-1">
              <span className="text-[10.5px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">{stat.label}</span>
              <p className="text-xl font-bold text-neutral-800 dark:text-neutral-100 leading-none">{stat.value}</p>
            </div>
            <div className={`w-8 h-8 rounded-lg ${stat.bg} flex items-center justify-center ${stat.color}`}>
              <stat.icon size={15} strokeWidth={1.5} />
            </div>
          </button>
        ))}
      </div>

      {/* Control bar */}
      <div className="shrink-0 px-6 pb-4 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="w-full md:w-80 relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-neutral-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, source, type..."
            className="w-full pl-9 pr-8 py-2 bg-white dark:bg-[#151518] border border-neutral-200/60 dark:border-white/5 rounded-lg text-[12.5px] text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:border-neutral-400 dark:focus:border-neutral-700 transition-all shadow-[0_1px_2px_rgba(0,0,0,0.01)]"
          />
          {search && (
            <button
              onClick={() => { setSearch(''); setDebouncedSearch(''); setPage(1); }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-800 dark:hover:text-white"
            >
              <X size={12} />
            </button>
          )}
        </div>

        <div className="w-full md:w-auto flex flex-wrap items-center gap-3 justify-end">
          {facets.eventTypes.length > 0 && (
            <select
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
              className="py-2 pl-2.5 pr-7 rounded-lg bg-white dark:bg-[#151518] border border-neutral-200/60 dark:border-white/5 text-[11.5px] font-medium text-neutral-600 dark:text-neutral-300 focus:outline-none focus:border-neutral-400 dark:focus:border-neutral-700 shadow-sm cursor-pointer max-w-[170px]"
            >
              <option value="">All Types</option>
              {facets.eventTypes.map((t) => (
                <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
              ))}
            </select>
          )}

          <div className="p-0.5 rounded-lg bg-neutral-200/50 dark:bg-neutral-900/60 border border-neutral-200/40 dark:border-white/5 flex gap-0.5 shadow-inner flex-wrap">
            {FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => { setActiveFilter(opt.key); setPage(1); }}
                className={`px-3 py-1.5 text-[11.5px] font-medium rounded-md transition-all cursor-pointer ${
                  activeFilter === opt.key
                    ? 'bg-white dark:bg-[#1b1b1e] text-neutral-900 dark:text-white shadow-sm'
                    : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-300'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {isLoading ? (
          <div className="grid grid-cols-1 gap-3 animate-pulse">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-16 bg-neutral-200/50 dark:bg-neutral-800 rounded-xl" />
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="bg-white dark:bg-[#151518]/40 border border-neutral-200/40 dark:border-white/5 rounded-2xl flex flex-col items-center justify-center py-20 shadow-sm">
            <StatusIcon status="no_image" size={28} />
            <p className="text-xs font-semibold text-neutral-800 dark:text-neutral-300 mt-3">
              {debouncedSearch ? 'No matching events found' : 'No event data available'}
            </p>
            <p className="text-[11px] text-neutral-400 mt-1">
              {debouncedSearch ? 'Try adjusting your search or filter' : 'Events will appear once data is synced from the pipeline'}
            </p>
          </div>
        ) : (
          <div className="bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 rounded-xl overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.01)]">
            <div className="min-w-full divide-y divide-neutral-200/50 dark:divide-white/5">
              {/* Headers */}
              <div className="bg-neutral-50/50 dark:bg-neutral-900/30 px-5 py-3 flex items-center text-[10.5px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
                <div className="w-[4%]"></div>
                <div
                  className="w-[34%] flex items-center gap-1 cursor-pointer hover:text-neutral-600 dark:hover:text-neutral-300"
                  onClick={() => toggleSort('title')}
                >
                  Event
                  <ArrowUpDown size={10} strokeWidth={2} className="opacity-50" />
                </div>
                <div
                  className="w-[12%] flex items-center gap-1 cursor-pointer hover:text-neutral-600 dark:hover:text-neutral-300"
                  onClick={() => toggleSort('eventType')}
                >
                  Type
                  <ArrowUpDown size={10} strokeWidth={2} className="opacity-50" />
                </div>
                <div className="w-[10%]">Image</div>
                <div className="w-[12%]">Backup</div>
                <div
                  className="w-[12%] flex items-center gap-1 cursor-pointer hover:text-neutral-600 dark:hover:text-neutral-300"
                  onClick={() => toggleSort('lastChecked')}
                >
                  Checked
                  <ArrowUpDown size={10} strokeWidth={2} className="opacity-50" />
                </div>
                <div className="w-[16%] text-right">Actions</div>
              </div>

              {/* Rows */}
              <div className="divide-y divide-neutral-200/50 dark:divide-white/5">
                {events.map((event) => {
                  const statusCfg = STATUS_CONFIG[event.imageStatus] || STATUS_CONFIG.unknown;
                  const StatusIconCmp = statusCfg.icon;
                  return (
                    <div
                      key={event.id}
                      className="px-5 py-2.5 flex items-center hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors text-xs text-neutral-700 dark:text-neutral-300"
                    >
                      <div className="w-[4%] flex items-center">
                        <StatusIconCmp size={14} strokeWidth={1.5} style={{ color: statusCfg.color }} />
                      </div>

                      {/* Title */}
                      <div className="w-[34%] truncate pr-4">
                        <span className="truncate font-semibold text-neutral-900 dark:text-white block text-[12.5px]">
                          {event.title}
                        </span>
                        <span className="text-[10px] text-neutral-400 dark:text-neutral-500 truncate block mt-0.5">
                          {event.sourceUrl || event.slug || '—'}
                          {event.image?.legacyHero && (
                            <span className="ml-1.5 px-1 py-px rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[9px] font-medium">
                              legacy hero
                            </span>
                          )}
                        </span>
                      </div>

                      {/* Type */}
                      <div className="w-[12%] pr-4 truncate">
                        {event.eventType ? (
                          <span className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800/50 text-[10px] font-medium text-neutral-500 dark:text-neutral-400 border border-neutral-200/50 dark:border-white/5 capitalize">
                            {event.eventType.replace(/_/g, ' ')}
                          </span>
                        ) : (
                          <span className="text-neutral-400">—</span>
                        )}
                      </div>

                      {/* Preview */}
                      <div className="w-[10%] pr-4">
                        <div className="w-8 h-8 rounded-lg overflow-hidden border border-neutral-200/50 dark:border-white/10 bg-neutral-100 dark:bg-neutral-900/50 flex items-center justify-center shrink-0 relative">
                          {event.image?.primaryUrl && event.imageStatus !== 'no_image' ? (
                            <ImagePreview src={event.image.primaryUrl} />
                          ) : (
                            <ImageIcon size={12} className="text-neutral-400" />
                          )}
                        </div>
                      </div>

                      {/* Backup */}
                      <div className="w-[12%] pr-4">
                        {event.image?.backupUrl ? (
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${STATUS_CONFIG.healthy.bg} ${STATUS_CONFIG.healthy.text} ${STATUS_CONFIG.healthy.border} border`}>
                            R2 Backup
                          </span>
                        ) : (
                          <span className="text-[10.5px] text-neutral-400">None</span>
                        )}
                      </div>

                      {/* Last checked */}
                      <div className="w-[12%] pr-4 text-[11px] text-neutral-400 dark:text-neutral-500">
                        {formatDate(event.image?.lastCheckedAt)}
                      </div>

                      {/* Actions */}
                      <div className="w-[16%] text-right flex items-center justify-end gap-1">
                        {event.image?.primaryUrl && !event.image?.backupUrl && (
                          <button
                            onClick={() => handleBackup(event)}
                            disabled={isBackingUp === event.id}
                            className="p-1.5 rounded hover:bg-blue-500/10 text-neutral-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors disabled:opacity-30"
                            title="Fetch current image and back it up to R2"
                          >
                            {isBackingUp === event.id ? <Loader2 size={13} className="animate-spin" /> : <CloudDownload size={13} />}
                          </button>
                        )}
                        <button
                          onClick={() => openUpload(event)}
                          className="p-1.5 rounded hover:bg-emerald-500/10 text-neutral-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                          title="Upload replacement image"
                        >
                          <Upload size={13} />
                        </button>
                        <button
                          onClick={() => handleRecheck(event)}
                          disabled={isRechecking === event.id || !event.image?.primaryUrl}
                          className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-white/5 text-neutral-500 hover:text-neutral-800 dark:hover:text-white transition-colors disabled:opacity-30"
                          title={event.image?.primaryUrl ? 'Re-check image URL' : 'No image URL to check'}
                        >
                          {isRechecking === event.id ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
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
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1.5 rounded-lg border border-neutral-200/60 dark:border-white/5 bg-white dark:bg-[#151518] text-neutral-500 hover:text-neutral-900 dark:hover:text-white disabled:opacity-30 transition-all shadow-sm"
            >
              <ChevronLeft size={13} />
            </button>
            <span className="text-[11px] font-medium text-neutral-500">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1.5 rounded-lg border border-neutral-200/60 dark:border-white/5 bg-white dark:bg-[#151518] text-neutral-500 hover:text-neutral-900 dark:hover:text-white disabled:opacity-30 transition-all shadow-sm"
            >
              <ChevronRight size={13} />
            </button>
          </div>
        )}
      </div>

      {/* Cleanup confirmation */}
      <ConfirmDialog
        open={cleanupDialog}
        onClose={() => setCleanupDialog(false)}
        onConfirm={handleCleanup}
        title="Run image cleanup?"
        confirmLabel="Clean all event images"
      >
        Scans every event and: unwraps markdown links & Next.js proxies, strips expiring CDN signatures, promotes legacy media.hero values to proper image fields, and clears URLs that aren't actually images (e.g. form pages captured by the scraper). Changes are reported afterwards.
      </ConfirmDialog>

      {/* Cleanup results */}
      <AnimatePresence>
        {cleanupResult && (
          <>
            <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-[2px]" onClick={() => setCleanupResult(null)} />
            <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-lg bg-white dark:bg-[#151518] rounded-xl border border-neutral-200/50 dark:border-white/5 p-5 shadow-2xl space-y-4"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-sky-500/10 flex items-center justify-center text-sky-600 dark:text-sky-400 shrink-0">
                    <Sparkles size={18} />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-neutral-900 dark:text-white uppercase tracking-wide">Cleanup complete</h3>
                    <p className="text-[10.5px] text-neutral-400 mt-0.5">
                      {cleanupResult.summary.scanned} scanned · {cleanupResult.summary.healed} healed · {cleanupResult.summary.cleared} cleared · {cleanupResult.summary.promoted} promoted · {cleanupResult.summary.ok} already clean
                    </p>
                  </div>
                </div>

                <div className="max-h-72 overflow-y-auto rounded-lg border border-neutral-200/50 dark:border-white/5 divide-y divide-neutral-200/40 dark:divide-white/5">
                  {cleanupResult.changes.filter((c) => c.action && c.action !== 'ok').length === 0 ? (
                    <div className="py-8 text-center">
                      <CheckCircle2 size={20} className="text-emerald-500 mx-auto" />
                      <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300 mt-2">Everything is already clean</p>
                    </div>
                  ) : (
                    cleanupResult.changes.filter((c) => c.action && c.action !== 'ok').map((c, i) => (
                      <div key={i} className="px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11.5px] font-semibold text-neutral-800 dark:text-neutral-200 truncate">{c.title}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide shrink-0 ${
                            c.action.includes('cleared') ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                              : c.action === 'promoted' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                                : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          }`}>
                            {c.action.replace('_', ' ')}
                          </span>
                        </div>
                        {c.before && (
                          <p className="text-[10px] text-neutral-400 mt-1 truncate">was: {c.before}</p>
                        )}
                        {c.after && (
                          <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5 truncate">now: {c.after}</p>
                        )}
                        {c.action.includes('cleared') && (
                          <p className="text-[10px] text-neutral-500 mt-0.5">
                            Not an image ({c.contentType || `HTTP ${c.httpStatus}`}) — cleared; upload a replacement when ready
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={() => setCleanupResult(null)}
                    className="px-3.5 py-2 rounded-lg text-[12px] font-semibold text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200/60 dark:hover:bg-white/5 transition-colors"
                  >
                    Done
                  </button>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* Upload modal */}
      <AnimatePresence>
        {uploadTarget && (
          <>
            <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-[2px]" onClick={() => { if (!isUploading) closeUpload(); }} />
            <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-md bg-white dark:bg-[#151518] rounded-xl border border-neutral-200/50 dark:border-white/5 p-5 shadow-2xl space-y-4"
              >
                <div>
                  <h3 className="text-xs font-bold text-neutral-900 dark:text-white uppercase tracking-wide">Replace image</h3>
                  <p className="text-[11.5px] text-neutral-400 mt-1 truncate">{uploadTarget.title}</p>
                </div>

                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className={`w-full rounded-xl border-2 border-dashed transition-colors flex flex-col items-center justify-center gap-2 py-8 cursor-pointer ${
                    uploadPreview
                      ? 'border-emerald-500/40 bg-emerald-500/5'
                      : 'border-neutral-300 dark:border-neutral-700 hover:border-neutral-400 dark:hover:border-neutral-600'
                  }`}
                >
                  {uploadPreview ? (
                    <img src={uploadPreview} alt="preview" className="max-h-32 rounded-lg" />
                  ) : (
                    <>
                      <Upload size={20} className="text-neutral-400" />
                      <span className="text-[11.5px] text-neutral-500">Click to choose an image (max 15MB)</span>
                    </>
                  )}
                </button>

                <p className="text-[10.5px] text-neutral-400 leading-relaxed">
                  Converted to WebP and stored in Cloudflare R2 — the event gets a permanent, fast URL instead of a rotting external link.
                </p>

                <div className="flex items-center justify-end gap-2.5">
                  <button
                    onClick={closeUpload}
                    disabled={isUploading}
                    className="px-3.5 py-2 rounded-lg text-[12px] font-semibold text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200/60 dark:hover:bg-white/5 disabled:opacity-40 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleUploadSubmit}
                    disabled={!uploadFile || isUploading}
                    className="px-3.5 py-2 rounded-lg text-[12px] font-bold bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 shadow-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all inline-flex items-center gap-1.5"
                  >
                    {isUploading && <Loader2 size={13} className="animate-spin" />}
                    Upload & Replace
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

const StatusIcon = ({ status, size = 13 }) => {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.unknown;
  const Icon = cfg.icon;
  return <Icon size={size} strokeWidth={1.5} style={{ color: cfg.color }} />;
};

export default EventImages;
