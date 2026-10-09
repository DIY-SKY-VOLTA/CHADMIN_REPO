import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search, X, AlertTriangle, Image as ImageIcon, Loader2, ChevronLeft, ChevronRight,
  RefreshCw, CheckCircle2, FileWarning, Ban, HelpCircle, Clock, ArrowUpDown,
  Upload, CloudDownload, Globe, Sparkles, ExternalLink, FileUp, Copy, Check,
  ShieldCheck, Maximize2, Eye, SkipForward, Link2, Calendar,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import ConfirmDialog from '@/components/UI/ConfirmDialog';
import adminAPI from '@/api/adminAPI';
import { copyToClipboard } from '@/utils/clipboard';
import { uploadEventImageFromUrl } from '@/api/eventAPI';

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

// Cache-buster for R2 image URLs — same stale-cache issue as contests: a
// replacement at the same key renders the old cached bytes without ?v=.
const withCacheBuster = (rawUrl, version) => {
  if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
  if (rawUrl.startsWith('data:') || rawUrl.startsWith('blob:')) return rawUrl;
  const v = version ? new Date(version).getTime() : null;
  if (!v || Number.isNaN(v)) return rawUrl;
  return rawUrl.includes('?') ? `${rawUrl}&v=${v}` : `${rawUrl}?v=${v}`;
};

const isValidHttpUrl = (value) => {
  if (!value || typeof value !== 'string') return false;
  const t = value.trim();
  if (t.startsWith('data:')) return true;
  if (t.startsWith('http:')) return true;
  try {
    const u = new URL(t);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
};

// Turn a data: URL into a File so it can ride the normal multipart path — the
// backend URL-fetch endpoint only accepts http(s) URLs.
const dataUrlToFile = async (dataUrl) => {
  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const meta = dataUrl.match(/^data:([^;,]+)/);
    const mime = (meta && meta[1]) || blob.type || 'image/png';
    const ext = mime.split('/')[1]?.split('+')[0]?.replace(/[^a-z0-9]/gi, '') || 'png';
    return new File([blob], `pasted-image.${ext}`, { type: mime });
  } catch {
    throw new Error('Invalid data URL');
  }
};

const ImagePreview = ({ src, alt, size = 'sm' }) => {
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // Reset error/loaded flags when the URL changes so a replacement renders.
  useEffect(() => {
    setHasError(false);
    setIsLoaded(false);
  }, [src]);

  if (!src || hasError) {
    return <ImageIcon size={size === 'lg' ? 32 : 12} className="text-neutral-400" strokeWidth={1.5} />;
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

const StatusIcon = ({ status, size = 13 }) => {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.unknown;
  const Icon = cfg.icon;
  return <Icon size={size} strokeWidth={1.5} style={{ color: cfg.color }} />;
};

const EventImages = () => {
  const [events, setEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });
  const [facets, setFacets] = useState({ eventTypes: [], sources: [] });
  const [stats, setStats] = useState({ total: 0, healthy: 0, broken: 0, no_backup: 0, no_image: 0, unknown: 0, stale: 0 });
  const [sortBy, setSortBy] = useState('title');
  const [sortOrder, setSortOrder] = useState('asc');

  // Per-row action state
  const [isRechecking, setIsRechecking] = useState(null);
  const [isBackingUp, setIsBackingUp] = useState(null);

  // Bulk select + progress state
  const [checkedEvents, setCheckedEvents] = useState(new Set());
  const [isBulkRechecking, setIsBulkRechecking] = useState(false);
  const [isBulkBackingUp, setIsBulkBackingUp] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(null); // { total, processed, succeeded, failed, errors, done }
  const [isSelectingAllMatching, setIsSelectingAllMatching] = useState(false);
  const headerCheckRef = useRef(null);

  // Deep Check: explicit live sweep. { done, total, alive, dead, errors }
  const [deepCheck, setDeepCheck] = useState(null);
  const [deepCheckDialog, setDeepCheckDialog] = useState(false);

  // Details slide-over
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [selectedEventDetails, setSelectedEventDetails] = useState(null);
  const [isLoadingSelectedDetails, setIsLoadingSelectedDetails] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isPrimaryUrlCopied, setIsPrimaryUrlCopied] = useState(false);
  const copyPrimaryUrlTimer = useRef(null);
  const [lightbox, setLightbox] = useState(null); // full-size image viewer

  // Cleanup pass
  const [cleanupDialog, setCleanupDialog] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [cleanupResult, setCleanupResult] = useState(null); // { summary, changes }

  // Upload modal
  const [uploadTarget, setUploadTarget] = useState(null);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadPreview, setUploadPreview] = useState(null);
  const [uploadMode, setUploadMode] = useState('url'); // 'url' (default) | 'file'
  const [uploadUrl, setUploadUrl] = useState('');
  const [urlPreviewError, setUrlPreviewError] = useState(false);
  const [urlPreviewSize, setUrlPreviewSize] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [eventDetails, setEventDetails] = useState(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const fileInputRef = useRef(null);

  // Background upload queue — submissions return instantly and run in the
  // background so the admin can keep hunting the next image mid-upload.
  const [uploadQueue, setUploadQueue] = useState([]); // [{ id, eventId, title, status, message }]
  const [queueOpen, setQueueOpen] = useState(true);
  const queueActiveCount = uploadQueue.filter(j => j.status === 'active').length;
  const queueDoneCount = uploadQueue.filter(j => j.status === 'done').length;
  const queueFailedCount = uploadQueue.filter(j => j.status === 'failed').length;

  const searchTimerRef = useRef(null);

  useEffect(() => () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); }, []);

  // Prune finished jobs from the pill once nothing is active and the user has
  // seen the outcome.
  useEffect(() => {
    if (uploadQueue.length > 0 && queueActiveCount === 0) {
      const t = setTimeout(() => setUploadQueue([]), 10000);
      return () => clearTimeout(t);
    }
  }, [uploadQueue, queueActiveCount]);

  // Indeterminate header checkbox when only some rows on this page are selected.
  useEffect(() => {
    if (!headerCheckRef.current) return;
    const pageIds = events.map(e => e.id);
    const some = pageIds.some(id => checkedEvents.has(id));
    const all = pageIds.length > 0 && pageIds.every(id => checkedEvents.has(id));
    headerCheckRef.current.indeterminate = some && !all;
  }, [events, checkedEvents]);

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
          source: sourceFilter || undefined,
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
  }, [page, debouncedSearch, activeFilter, sortBy, sortOrder, typeFilter, sourceFilter]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  /* ── Single-row actions ──────────────────────────────────────────────── */

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

  /* ── Bulk actions ─────────────────────────────────────────────────────── */

  const handleBulkRecheck = async () => {
    if (checkedEvents.size === 0) {
      toast.error('Select events to re-check');
      return;
    }
    setIsBulkRechecking(true);
    try {
      const res = await adminAPI.post('/events/images/bulk-recheck', {
        eventIds: Array.from(checkedEvents),
      });
      if (res.success) {
        const alive = res.results.filter(r => r.status === 'alive').length;
        const dead = res.results.filter(r => r.status === 'dead').length;
        const errors = res.results.filter(r => r.status === 'error' || r.status === 'no_image').length;
        toast.success(`Checked ${res.results.length}: ${alive} alive, ${dead} dead, ${errors} errors`);
        setCheckedEvents(new Set());
        fetchEvents(true);
      }
    } catch (err) {
      toast.error(err?.message || 'Bulk re-check failed');
    } finally {
      setIsBulkRechecking(false);
    }
  };

  // Bulk backup — runs in batches so the progress modal can report live
  // per-batch success/failure counts, then shows a final summary.
  const BULK_BACKUP_BATCH = 25;
  const handleBulkBackup = async () => {
    const ids = Array.from(checkedEvents);
    if (ids.length === 0) return;

    const progress = { total: ids.length, processed: 0, succeeded: 0, failed: 0, errors: [], done: false };
    setBulkProgress(progress);
    setIsBulkBackingUp(true);

    try {
      for (let i = 0; i < ids.length; i += BULK_BACKUP_BATCH) {
        const batch = ids.slice(i, i + BULK_BACKUP_BATCH);
        try {
          const res = await adminAPI.post('/events/images/bulk-backup', { eventIds: batch });
          if (res.success) {
            progress.succeeded += res.results?.success || 0;
            progress.failed += res.results?.failed || 0;
            if (res.results?.errors?.length) progress.errors.push(...res.results.errors);
          } else {
            progress.failed += batch.length;
            progress.errors.push({ id: 'batch', reason: res.message || 'Batch failed' });
          }
        } catch (err) {
          progress.failed += batch.length;
          progress.errors.push({ id: 'batch', reason: err?.message || 'Batch request failed' });
        }
        progress.processed = Math.min(progress.total, progress.processed + batch.length);
        setBulkProgress({ ...progress });
      }

      progress.done = true;
      setBulkProgress({ ...progress });
      setCheckedEvents(new Set());
      fetchEvents(true);
    } finally {
      setIsBulkBackingUp(false);
    }
  };

  // Deep Check — explicitly re-test every image URL against the live web in
  // client-driven batches and persist the result to Mongo. Deliberately NOT
  // part of normal browsing: stored statuses keep the list instant.
  const DEEP_CHECK_BATCH = 50;
  const handleDeepCheck = async () => {
    if (deepCheck) return; // one sweep at a time
    setDeepCheckDialog(false);
    const progress = { done: 0, total: 0, alive: 0, dead: 0, errors: 0 };
    setDeepCheck(progress);
    try {
      const idsRes = await adminAPI.get('/events/images/health', {
        params: { page: 1, limit: 100, filter: 'all', idsOnly: true },
      });
      const ids = idsRes?.ids || [];
      if (ids.length === 0) {
        toast.error('No events to check');
        setDeepCheck(null);
        return;
      }
      progress.total = ids.length;
      setDeepCheck({ ...progress });

      for (let i = 0; i < ids.length; i += DEEP_CHECK_BATCH) {
        const batch = ids.slice(i, i + DEEP_CHECK_BATCH);
        try {
          const res = await adminAPI.post('/events/images/bulk-recheck', { eventIds: batch });
          if (res.success) {
            for (const r of res.results || []) {
              if (r.status === 'alive') progress.alive += 1;
              else if (r.status === 'dead') progress.dead += 1;
              else progress.errors += 1;
            }
          } else {
            progress.errors += batch.length;
          }
        } catch {
          progress.errors += batch.length;
        }
        progress.done = Math.min(progress.total, progress.done + batch.length);
        setDeepCheck({ ...progress });
      }

      toast.success(`Deep check complete — ${progress.alive} alive, ${progress.dead} broken, ${progress.errors} errors`);
      fetchEvents(true);
    } catch (err) {
      toast.error(err?.message || 'Deep check failed');
    } finally {
      setTimeout(() => setDeepCheck(null), 4000);
    }
  };

  // Select ALL events matching the current filter/search, across every page.
  const handleSelectAllMatching = async () => {
    setIsSelectingAllMatching(true);
    try {
      const res = await adminAPI.get('/events/images/health', {
        params: {
          page: 1,
          limit: 100,
          search: debouncedSearch,
          filter: activeFilter,
          sortBy,
          sortOrder,
          type: typeFilter || undefined,
          source: sourceFilter || undefined,
          idsOnly: true,
        },
      });
      if (res.success && res.ids?.length) {
        setCheckedEvents(new Set(res.ids));
        toast.success(`Selected all ${res.ids.length} matching events`);
      }
    } catch (err) {
      toast.error(err?.message || 'Failed to select all matching events');
    } finally {
      setIsSelectingAllMatching(false);
    }
  };

  /* ── Details slide-over ───────────────────────────────────────────────── */

  const handleOpenDetails = async (event) => {
    setSelectedEvent(event);
    setSelectedEventDetails(null);
    setIsLoadingSelectedDetails(true);
    try {
      const res = await adminAPI.get('/events/images/details', { params: { eventId: event.id } });
      if (res.success) setSelectedEventDetails(res.event);
    } catch {
      // Ignore — the panel still renders what the table already gave us
    } finally {
      setIsLoadingSelectedDetails(false);
    }
  };

  const handleCopyContext = () => {
    if (!selectedEvent || !selectedEventDetails) return;
    const d = selectedEventDetails;
    let text = `Title: ${selectedEvent.title}\n`;
    if (d.eventType) text += `Type: ${d.eventType}\n`;
    if (d.dateLabel) text += `Date: ${d.dateLabel}\n`;
    if (d.location) text += `Location: ${d.location}\n`;
    if (d.summary) text += `Summary: ${d.summary}\n`;
    if (d.topics?.length > 0) text += `Topics: ${d.topics.join(', ')}\n`;
    if (d.tags?.length > 0) text += `Tags: ${d.tags.join(', ')}\n`;
    copyToClipboard(text).then((ok) => {
      if (ok) {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
        toast.success('Context copied to clipboard');
      } else {
        toast.error('Copy failed — clipboard not available');
      }
    });
  };

  const handleCopyPrimaryUrl = (event) => {
    const url = event?.image?.primaryUrl;
    if (!url) {
      toast.error('No primary image URL to copy');
      return;
    }
    copyToClipboard(url).then((ok) => {
      if (!ok) {
        toast.error('Could not copy URL');
        return;
      }
      setIsPrimaryUrlCopied(true);
      toast.success('Image URL copied');
      if (copyPrimaryUrlTimer.current) clearTimeout(copyPrimaryUrlTimer.current);
      copyPrimaryUrlTimer.current = setTimeout(() => setIsPrimaryUrlCopied(false), 2000);
    });
  };

  /* ── Upload modal ─────────────────────────────────────────────────────── */

  const handleOpenUpload = async (event) => {
    setUploadTarget(event);
    setUploadFile(null);
    setUploadPreview(null);
    setUploadMode('url');
    setUploadUrl('');
    setUrlPreviewSize(null);
    setUrlPreviewError(false);
    setEventDetails(null);
    setIsLoadingDetails(true);
    try {
      const res = await adminAPI.get('/events/images/details', { params: { eventId: event.id } });
      if (res.success) setEventDetails(res.event);
    } catch {
      // Fall back to what the table already gave us
      setEventDetails({
        id: event.id,
        title: event.title,
        eventType: event.eventType,
        summary: null,
        topics: [],
        tags: [],
        image: event.image,
      });
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const handleCloseUpload = () => {
    if (uploadPreview) URL.revokeObjectURL(uploadPreview);
    setUploadTarget(null);
    setUploadFile(null);
    setUploadPreview(null);
    setUploadUrl('');
    setUploadMode('url');
    setUrlPreviewSize(null);
    setUrlPreviewError(false);
    setEventDetails(null);
    setIsDragOver(false);
  };

  const ingestImageFile = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('That is not an image file');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast.error('Image must be under 15MB');
      return;
    }
    if (uploadPreview) URL.revokeObjectURL(uploadPreview);
    setUploadMode('file');
    setUploadFile(file);
    setUploadPreview(URL.createObjectURL(file));
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) ingestImageFile(file);
  };

  // While the upload modal is open, an image copied anywhere (right-click →
  // "Copy image" on the source site) lands as the upload on Ctrl+V.
  useEffect(() => {
    if (!uploadTarget) return;
    const onPaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            ingestImageFile(file);
            toast.success('Image pasted from clipboard');
          }
          return;
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [uploadTarget, uploadPreview]);

  // Push a job onto the background queue and fire the request without
  // awaiting it in the UI — the modal is free immediately.
  const startUploadJob = (event, payload) => {
    const jobId = `${event.id}-${Date.now()}`;
    setUploadQueue(q => [...q, { id: jobId, eventId: event.id, title: event.title, status: 'active', message: 'Uploading…' }]);

    payload
      .then(res => {
        if (res?.success) {
          setUploadQueue(q => q.map(j => j.id === jobId ? { ...j, status: 'done', message: 'Replaced' } : j));
          toast.success(`Image replaced: ${event.title}`);
          applyRepairedImage(event.id, res.image);
        } else {
          setUploadQueue(q => q.map(j => j.id === jobId ? { ...j, status: 'failed', message: res?.message || 'Upload failed' } : j));
          toast.error(`${event.title}: ${res?.message || 'Upload failed'}`);
        }
      })
      .catch(err => {
        setUploadQueue(q => q.map(j => j.id === jobId ? { ...j, status: 'failed', message: err?.message || 'Upload failed' } : j));
        toast.error(`${event.title}: ${err?.message || 'Upload failed'}`);
      });

    return jobId;
  };

  // Patch a row + stats locally after a successful background upload, so the
  // list refreshes in place without losing scroll/filter state.
  const applyRepairedImage = (eventId, image) => {
    const newUrl = image?.url;
    setEvents(prev => prev.map(e => {
      if (e.id !== eventId) return e;
      return {
        ...e,
        imageStatus: 'healthy',
        image: {
          ...e.image,
          primaryUrl: newUrl || e.image?.primaryUrl,
          backupUrl: newUrl || e.image?.backupUrl,
          lastCheckedAt: new Date().toISOString(),
        },
      };
    }));
    setSelectedEvent(prev => (prev?.id === eventId
      ? { ...prev, imageStatus: 'healthy', image: { ...prev.image, primaryUrl: newUrl || prev.image?.primaryUrl, backupUrl: newUrl || prev.image?.backupUrl, lastCheckedAt: new Date().toISOString() } }
      : prev));
    // Move one count out of broken/no_image into healthy so the cards stay honest
    setStats(prev => {
      const next = { ...prev };
      if (next.broken > 0) next.broken -= 1; else if (next.no_image > 0) next.no_image -= 1;
      next.healthy += 1;
      return next;
    });
  };

  // Advance the modal to the next broken event (Broken filter only).
  const advanceToNextBroken = (currentTarget) => {
    if (activeFilter !== 'broken') return null;
    const broken = events.filter(e => e.imageStatus === 'broken' || e.imageStatus === 'no_image');
    const candidates = broken.filter(e => e.id !== currentTarget.id);
    if (candidates.length === 0) return null;
    const currentIdx = broken.findIndex(e => e.id === currentTarget.id);
    return candidates.find(c => broken.findIndex(b => b.id === c.id) > currentIdx) || candidates[0];
  };

  const handleUploadSubmit = async (advance = false) => {
    if (!uploadTarget) return;
    if (uploadMode === 'file' && !uploadFile) return;
    if (uploadMode === 'url' && !isValidHttpUrl(uploadUrl)) return;

    const target = uploadTarget;
    let payload;
    let fetchedFromUrl = false;

    if (uploadMode === 'url') {
      const rawUrl = uploadUrl.trim();
      if (rawUrl.startsWith('data:')) {
        // data: URLs can't go through the backend URL-fetch endpoint (it only
        // accepts http(s)), so decode to a file client-side instead.
        try {
          const file = await dataUrlToFile(rawUrl);
          if (file.size > 15 * 1024 * 1024) {
            toast.error(`Decoded image is over the 15MB limit (${Math.round(file.size / (1024 * 1024))}MB)`);
            return;
          }
          const formData = new FormData();
          formData.append('eventId', target.id);
          formData.append('image', file);
          payload = adminAPI.post('/events/images/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
        } catch {
          toast.error('Could not decode this data: URL as an image');
          return;
        }
      } else {
        payload = uploadEventImageFromUrl(target.id, rawUrl);
        fetchedFromUrl = true;
      }
    } else {
      const formData = new FormData();
      formData.append('eventId', target.id);
      formData.append('image', uploadFile);
      payload = adminAPI.post('/events/images/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    }

    startUploadJob(target, payload);
    toast.success(fetchedFromUrl
      ? 'Queued — fetching in background. You can keep working.'
      : 'Queued — uploading in background. You can keep working.');

    if (uploadPreview) URL.revokeObjectURL(uploadPreview);
    setUploadFile(null);
    setUploadPreview(null);
    setUploadUrl('');
    setUrlPreviewSize(null);
    setUrlPreviewError(false);

    if (advance) {
      const next = advanceToNextBroken(target);
      if (next) {
        handleOpenUpload(next);
      } else {
        toast.success('All caught up — no more broken images in this view');
        handleCloseUpload();
      }
    } else {
      handleCloseUpload();
      setTimeout(() => fetchEvents(true), 4000);
    }
  };

  /* ── Cleanup pass ─────────────────────────────────────────────────────── */

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

  /* ── Selection helpers ────────────────────────────────────────────────── */

  const toggleSelect = (id) => {
    setCheckedEvents(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Toggle selection for all rows on the current page, preserving selections
  // made on other pages (e.g. via "select all matching").
  const selectAll = () => {
    const pageIds = events.map(e => e.id);
    const allPageSelected = pageIds.length > 0 && pageIds.every(id => checkedEvents.has(id));
    setCheckedEvents(prev => {
      const next = new Set(prev);
      if (allPageSelected) pageIds.forEach(id => next.delete(id));
      else pageIds.forEach(id => next.add(id));
      return next;
    });
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
  const detailCfg = selectedEvent ? (STATUS_CONFIG[selectedEvent.imageStatus] || STATUS_CONFIG.unknown) : null;
  const DetailIcon = detailCfg?.icon;

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
              : 'Check the health of event images across all sources'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDeepCheckDialog(true)}
            disabled={!!deepCheck}
            title="Re-test every event image URL against the live web and save the result"
            className="px-3 py-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 transition-all shadow-sm flex items-center gap-1.5 text-[11.5px] font-semibold disabled:opacity-50"
          >
            {deepCheck ? (
              deepCheck.done >= deepCheck.total && deepCheck.total > 0
                ? <Check size={12} />
                : <Loader2 size={12} className="animate-spin" />
            ) : (
              <ShieldCheck size={13} />
            )}
            {deepCheck
              ? deepCheck.done >= deepCheck.total
                ? `${deepCheck.alive} alive · ${deepCheck.dead} broken`
                : `Checking ${deepCheck.done}/${deepCheck.total}`
              : 'Deep Check'}
          </button>
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
            title="Reload from stored statuses"
            className="p-1.5 rounded-lg border border-neutral-200/50 dark:border-white/5 bg-white dark:bg-[#18181b] hover:bg-neutral-50 dark:hover:bg-white/5 text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-all shadow-sm flex items-center gap-1.5 text-[11.5px] font-medium"
          >
            <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stat cards — each doubles as a filter toggle */}
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
          {/* Bulk actions */}
          {(checkedEvents.size > 0 || isSelectingAllMatching) && (
            <div className="flex items-center gap-2">
              {checkedEvents.size > 0 && (
                <>
                  <button
                    onClick={handleBulkBackup}
                    disabled={isBulkBackingUp}
                    title="Back the selected events' images up to R2"
                    className="px-3 py-1.5 rounded-lg border border-neutral-200/50 dark:border-white/5 bg-white dark:bg-[#18181b] hover:bg-neutral-50 dark:hover:bg-white/5 text-neutral-600 hover:text-neutral-900 dark:hover:text-white transition-all shadow-sm flex items-center gap-1.5 text-[11.5px] font-medium disabled:opacity-40"
                  >
                    {isBulkBackingUp ? <Loader2 size={12} className="animate-spin" /> : <CloudDownload size={12} />}
                    Backup ({checkedEvents.size})
                  </button>
                  <button
                    onClick={handleBulkRecheck}
                    disabled={isBulkRechecking || isBulkBackingUp}
                    title="Live re-verify the selected events' image URLs"
                    className="px-3 py-1.5 rounded-lg border border-neutral-200/50 dark:border-white/5 bg-white dark:bg-[#18181b] hover:bg-neutral-50 dark:hover:bg-white/5 text-neutral-600 hover:text-neutral-900 dark:hover:text-white transition-all shadow-sm flex items-center gap-1.5 text-[11.5px] font-medium disabled:opacity-40"
                  >
                    {isBulkRechecking ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                    Re-check ({checkedEvents.size})
                  </button>
                </>
              )}
              {isSelectingAllMatching && (
                <span className="flex items-center gap-1.5 text-[11.5px] text-neutral-400">
                  <Loader2 size={12} className="animate-spin" />
                  Fetching all matching events...
                </span>
              )}
            </div>
          )}

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

          {facets.sources.length > 0 && (
            <select
              value={sourceFilter}
              onChange={(e) => { setSourceFilter(e.target.value); setPage(1); }}
              className="py-2 pl-2.5 pr-7 rounded-lg bg-white dark:bg-[#151518] border border-neutral-200/60 dark:border-white/5 text-[11.5px] font-medium text-neutral-600 dark:text-neutral-300 focus:outline-none focus:border-neutral-400 dark:focus:border-neutral-700 shadow-sm cursor-pointer max-w-[170px]"
            >
              <option value="">All Sources</option>
              {facets.sources.map((s) => (
                <option key={s} value={s}>{s}</option>
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

      {/* Select-all-matching banner — the whole page is selected but more matches exist */}
      {!isLoading && events.length > 0 && events.every(e => checkedEvents.has(e.id)) && pagination.total > events.length && (
        <div className="shrink-0 px-6 pb-4 flex items-center justify-between">
          <p className="text-[12.5px] text-neutral-500">
            All <span className="font-semibold text-neutral-700 dark:text-neutral-300">{events.length}</span> events on this page are selected.
          </p>
          <button
            onClick={handleSelectAllMatching}
            disabled={isSelectingAllMatching || checkedEvents.size >= pagination.total || isBulkBackingUp}
            className="px-3 py-1.5 rounded-lg border border-blue-200/60 dark:border-blue-500/25 bg-blue-500/5 hover:bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[11.5px] font-semibold transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-40"
          >
            {isSelectingAllMatching ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            {checkedEvents.size >= pagination.total
              ? `All ${pagination.total} selected`
              : `Select all ${pagination.total} matching`}
          </button>
        </div>
      )}

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
                <div className="w-[3%] flex items-center">
                  <input
                    ref={headerCheckRef}
                    type="checkbox"
                    checked={events.length > 0 && events.every(e => checkedEvents.has(e.id))}
                    onChange={selectAll}
                    disabled={isBulkBackingUp}
                    className="rounded border-neutral-300 dark:border-neutral-700 disabled:opacity-40"
                  />
                </div>
                <div className="w-[4%]"></div>
                <div
                  className="w-[26%] flex items-center gap-1 cursor-pointer hover:text-neutral-600 dark:hover:text-neutral-300"
                  onClick={() => toggleSort('title')}
                >
                  Event
                  <ArrowUpDown size={10} strokeWidth={2} className="opacity-50" />
                </div>
                <div
                  className="w-[11%] flex items-center gap-1 cursor-pointer hover:text-neutral-600 dark:hover:text-neutral-300"
                  onClick={() => toggleSort('eventType')}
                >
                  Type
                  <ArrowUpDown size={10} strokeWidth={2} className="opacity-50" />
                </div>
                <div
                  className="w-[10%] flex items-center gap-1 cursor-pointer hover:text-neutral-600 dark:hover:text-neutral-300"
                  onClick={() => toggleSort('source')}
                >
                  Source
                  <ArrowUpDown size={10} strokeWidth={2} className="opacity-50" />
                </div>
                <div className="w-[10%]">Image</div>
                <div className="w-[11%]">Backup</div>
                <div
                  className="w-[11%] flex items-center gap-1 cursor-pointer hover:text-neutral-600 dark:hover:text-neutral-300"
                  onClick={() => toggleSort('lastChecked')}
                >
                  Checked
                  <ArrowUpDown size={10} strokeWidth={2} className="opacity-50" />
                </div>
                <div className="w-[11%] text-right">Actions</div>
              </div>

              {/* Rows */}
              <div className="divide-y divide-neutral-200/50 dark:divide-white/5">
                {events.map((event) => {
                  const statusCfg = STATUS_CONFIG[event.imageStatus] || STATUS_CONFIG.unknown;
                  const StatusIconCmp = statusCfg.icon;
                  return (
                    <div
                      key={event.id}
                      onClick={() => handleOpenDetails(event)}
                      className={`px-5 py-2.5 flex items-center hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors cursor-pointer text-xs text-neutral-700 dark:text-neutral-300 ${
                        selectedEvent?.id === event.id ? 'bg-neutral-100/60 dark:bg-white/5 font-medium' : ''
                      }`}
                    >
                      <div className="w-[3%] pr-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={checkedEvents.has(event.id)}
                          onChange={() => toggleSelect(event.id)}
                          disabled={isBulkBackingUp}
                          className="rounded border-neutral-300 dark:border-neutral-700 disabled:opacity-40"
                        />
                      </div>

                      <div className="w-[4%] flex items-center">
                        <StatusIconCmp size={14} strokeWidth={1.5} style={{ color: statusCfg.color }} />
                      </div>

                      {/* Title */}
                      <div className="w-[26%] truncate pr-4">
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
                      <div className="w-[11%] pr-4 truncate">
                        {event.eventType ? (
                          <span className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800/50 text-[10px] font-medium text-neutral-500 dark:text-neutral-400 border border-neutral-200/50 dark:border-white/5 capitalize">
                            {event.eventType.replace(/_/g, ' ')}
                          </span>
                        ) : (
                          <span className="text-neutral-400">—</span>
                        )}
                      </div>

                      {/* Source */}
                      <div className="w-[10%] pr-4 truncate text-[10.5px] text-neutral-500 dark:text-neutral-400">
                        {event.sourceUrl || '—'}
                      </div>

                      {/* Preview */}
                      <div className="w-[10%] pr-4">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (event.image?.primaryUrl) {
                              setLightbox({ url: withCacheBuster(event.image.primaryUrl, event.image.lastCheckedAt), title: event.title });
                            }
                          }}
                          disabled={!event.image?.primaryUrl}
                          title={event.image?.primaryUrl ? 'View full size' : 'No image'}
                          className="w-8 h-8 rounded-lg overflow-hidden border border-neutral-200/50 dark:border-white/10 bg-neutral-100 dark:bg-neutral-900/50 flex items-center justify-center shrink-0 relative group/prev disabled:cursor-default"
                        >
                          {event.image?.primaryUrl && event.imageStatus !== 'no_image' ? (
                            <ImagePreview src={withCacheBuster(event.image.primaryUrl, event.image.lastCheckedAt)} />
                          ) : (
                            <ImageIcon size={12} className="text-neutral-400" />
                          )}
                          {event.image?.primaryUrl && (
                            <span className="absolute inset-0 bg-black/40 opacity-0 group-hover/prev:opacity-100 transition-opacity flex items-center justify-center">
                              <Eye size={12} className="text-white" />
                            </span>
                          )}
                        </button>
                      </div>

                      {/* Backup */}
                      <div className="w-[11%] pr-4">
                        {event.image?.backupUrl ? (
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${STATUS_CONFIG.healthy.bg} ${STATUS_CONFIG.healthy.text} ${STATUS_CONFIG.healthy.border} border`}>
                            R2 Backup
                          </span>
                        ) : (
                          <span className="text-[10.5px] text-neutral-400">None</span>
                        )}
                      </div>

                      {/* Last checked */}
                      <div className="w-[11%] pr-4 text-[11px] text-neutral-400 dark:text-neutral-500">
                        {formatDate(event.image?.lastCheckedAt)}
                      </div>

                      {/* Actions */}
                      <div className="w-[11%] text-right flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        {event.image?.primaryUrl && !event.image?.backupUrl && (
                          <button
                            onClick={() => handleBackup(event)}
                            disabled={isBackingUp === event.id}
                            title="Fetch current image and back it up to R2"
                            className="p-1.5 rounded hover:bg-blue-500/10 text-neutral-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors disabled:opacity-30"
                          >
                            {isBackingUp === event.id ? <Loader2 size={13} className="animate-spin" /> : <CloudDownload size={13} />}
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenUpload(event)}
                          title="Replace image (paste a URL or upload a file)"
                          className="p-1.5 rounded hover:bg-emerald-500/10 text-neutral-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                        >
                          <Upload size={13} />
                        </button>
                        <button
                          onClick={() => handleRecheck(event)}
                          disabled={isRechecking === event.id || !event.image?.primaryUrl}
                          title={event.image?.primaryUrl ? 'Re-check image URL' : 'No image URL to check'}
                          className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-white/5 text-neutral-500 hover:text-neutral-800 dark:hover:text-white transition-colors disabled:opacity-30"
                        >
                          {isRechecking === event.id ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                        </button>
                        <button
                          onClick={() => handleOpenDetails(event)}
                          title="View details"
                          className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-white/5 text-neutral-500 hover:text-neutral-800 dark:hover:text-white transition-colors"
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
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1.5 rounded-lg border border-neutral-200/60 dark:border-white/5 bg-white dark:bg-[#151518] text-neutral-500 hover:text-neutral-900 dark:hover:text-white disabled:opacity-30 transition-all shadow-sm"
            >
              <ChevronLeft size={13} />
            </button>
            <span className="text-[11px] font-medium text-neutral-500">Page {page} of {totalPages}</span>
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

      {/* Deep Check confirmation */}
      <ConfirmDialog
        open={deepCheckDialog}
        onClose={() => setDeepCheckDialog(false)}
        onConfirm={handleDeepCheck}
        title="Run a Deep Check on all event images?"
        confirmLabel="Deep check every image"
      >
        Re-tests every event image URL against the live web in batches and saves the result, which refreshes the Healthy / Broken / Stale counts. This makes a real network request per event and can take a while on a large collection.
      </ConfirmDialog>

      {/* Cleanup confirmation */}
      <ConfirmDialog
        open={cleanupDialog}
        onClose={() => setCleanupDialog(false)}
        onConfirm={handleCleanup}
        title="Run image cleanup?"
        confirmLabel="Clean all event images"
      >
        Scans every event and: unwraps markdown links &amp; Next.js proxies, strips expiring CDN signatures, promotes legacy media.hero values to proper image fields, and clears URLs that aren't actually images (e.g. form pages captured by the scraper). Changes are reported afterwards.
      </ConfirmDialog>

      {/* Bulk Backup Progress Modal */}
      <AnimatePresence>
        {bulkProgress && (
          <>
            <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-[2px]" onClick={() => { if (bulkProgress.done) setBulkProgress(null); }} />
            <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-md bg-white dark:bg-[#151518] rounded-xl border border-neutral-200/50 dark:border-white/5 p-5 shadow-2xl space-y-4"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                    {bulkProgress.done ? <Check size={18} /> : <CloudDownload size={18} />}
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-neutral-900 dark:text-white uppercase tracking-wide">
                      {bulkProgress.done ? 'Backup Complete' : 'Backing Up Images'}
                    </h3>
                    <p className="text-[10.5px] text-neutral-400 mt-0.5">
                      {bulkProgress.done
                        ? `${bulkProgress.succeeded} succeeded, ${bulkProgress.failed} failed`
                        : `Processing ${bulkProgress.processed} of ${bulkProgress.total}`}
                    </p>
                  </div>
                </div>

                <div className="w-full h-1.5 bg-neutral-200/60 dark:bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-300"
                    style={{ width: `${bulkProgress.total ? Math.round((bulkProgress.processed / bulkProgress.total) * 100) : 0}%` }}
                  />
                </div>

                <div className="flex items-center gap-4 text-[11px]">
                  <span className="text-neutral-400">
                    {bulkProgress.total ? Math.round((bulkProgress.processed / bulkProgress.total) * 100) : 0}%
                  </span>
                  <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                    <Check size={11} /> {bulkProgress.succeeded}
                  </span>
                  <span className="flex items-center gap-1 text-red-600 dark:text-red-400 font-semibold">
                    <X size={11} /> {bulkProgress.failed}
                  </span>
                </div>

                {bulkProgress.errors.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[10.5px] font-semibold text-neutral-500 uppercase tracking-wide">
                      Failed ({bulkProgress.errors.length})
                    </span>
                    <ul className="max-h-28 overflow-y-auto rounded-lg border border-neutral-200/50 dark:border-white/5 divide-y divide-neutral-200/40 dark:divide-white/5">
                      {bulkProgress.errors.slice(0, 8).map((err, i) => (
                        <li key={i} className="px-3 py-1.5 text-[10.5px] text-neutral-500 dark:text-neutral-400 truncate">
                          {err.title || err.id}: {err.reason}
                        </li>
                      ))}
                    </ul>
                    {bulkProgress.errors.length > 8 && (
                      <li className="text-[11px] text-neutral-400">…and {bulkProgress.errors.length - 8} more</li>
                    )}
                  </div>
                )}

                <div className="flex justify-end">
                  <button
                    onClick={() => setBulkProgress(null)}
                    disabled={!bulkProgress.done}
                    className="px-3.5 py-2 rounded-lg text-[12px] font-semibold text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200/60 dark:hover:bg-white/5 disabled:opacity-40 transition-colors"
                  >
                    {bulkProgress.done ? 'Done' : 'Working...'}
                  </button>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

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
                        {c.before && <p className="text-[10px] text-neutral-400 mt-1 truncate">was: {c.before}</p>}
                        {c.after && <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5 truncate">now: {c.after}</p>}
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

      {/* Details slide-over */}
      <AnimatePresence>
        {selectedEvent && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedEvent(null)}
              className="fixed inset-0 z-40 bg-black/30 dark:bg-black/60 backdrop-blur-[2px]"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-white dark:bg-[#151518] border-l border-neutral-200/50 dark:border-white/5 shadow-2xl flex flex-col overflow-hidden"
            >
              <div className="shrink-0 p-4 border-b border-neutral-200/50 dark:border-white/5 flex items-center justify-between">
                <span className="text-[12px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
                  Event Image Details
                </span>
                <button
                  onClick={() => setSelectedEvent(null)}
                  className="p-1 rounded-lg hover:bg-neutral-100 dark:hover:bg-white/5 text-neutral-400 hover:text-neutral-800 dark:hover:text-white transition-colors"
                >
                  <X size={15} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar text-xs">
                {/* Status badge */}
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${detailCfg.bg} ${detailCfg.text} ${detailCfg.border} border`}>
                  <DetailIcon size={12} strokeWidth={2} />
                  {detailCfg.label}
                </span>

                {/* Title */}
                <div>
                  <h2 className="text-[13px] font-bold text-neutral-900 dark:text-white leading-snug">
                    {selectedEvent.title}
                  </h2>
                  {selectedEvent.eventType && (
                    <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800/50 text-[10px] font-medium text-neutral-500 dark:text-neutral-400 capitalize">
                      {selectedEvent.eventType.replace(/_/g, ' ')}
                    </span>
                  )}
                </div>

                {/* Preview */}
                <div className="bg-neutral-100 dark:bg-neutral-900/30 border border-neutral-200/40 dark:border-white/5 rounded-xl p-3 shadow-inner flex items-center justify-center min-h-[140px] overflow-hidden relative">
                  {selectedEvent.image?.primaryUrl && selectedEvent.imageStatus !== 'no_image' ? (
                    <div className="max-h-[180px] w-full flex items-center justify-center relative">
                      <ImagePreview src={withCacheBuster(selectedEvent.image.primaryUrl, selectedEvent.image.lastCheckedAt)} size="lg" />
                      <a
                        href={selectedEvent.image.primaryUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="absolute top-2 right-2 p-1.5 rounded-lg bg-white/90 dark:bg-black/60 text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white shadow-sm transition-colors"
                        title="Open full image in a new tab"
                      >
                        <Maximize2 size={13} />
                      </a>
                      <button
                        onClick={() => handleCopyPrimaryUrl(selectedEvent)}
                        className="absolute top-2 right-9 p-1.5 rounded-lg bg-white/90 dark:bg-black/60 text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white shadow-sm transition-colors"
                        title="Copy image URL"
                      >
                        {isPrimaryUrlCopied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                      </button>
                    </div>
                  ) : selectedEvent.image?.backupUrl ? (
                    <div className="max-h-[180px] w-full flex items-center justify-center">
                      <ImagePreview src={withCacheBuster(selectedEvent.image.backupUrl, selectedEvent.image.lastCheckedAt)} size="lg" />
                    </div>
                  ) : (
                    <div className="py-10 text-center">
                      <ImageIcon size={32} className="text-neutral-400 dark:text-neutral-600 mx-auto mb-2" />
                      <p className="text-[11px] text-neutral-400">No image available</p>
                    </div>
                  )}
                </div>

                {/* Context for Image Generation */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="block text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Context for Image Generation</span>
                    {!isLoadingSelectedDetails && selectedEventDetails && (
                      <button
                        onClick={handleCopyContext}
                        className="flex items-center gap-1.5 px-2 py-1 rounded bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200 dark:hover:bg-white/10 text-[10.5px] font-medium text-neutral-500 hover:text-neutral-800 dark:hover:text-white transition-colors"
                      >
                        {isCopied ? <Check size={10} className="text-emerald-500" /> : <Copy size={10} />}
                        {isCopied ? 'Copied!' : 'Copy'}
                      </button>
                    )}
                  </div>
                  <div className="bg-neutral-50/50 dark:bg-[#1b1b1e]/30 border border-neutral-200/30 dark:border-white/5 rounded-xl p-3 space-y-2.5">
                    {isLoadingSelectedDetails ? (
                      <div className="flex items-center gap-2 py-2">
                        <Loader2 size={12} className="animate-spin text-neutral-400" />
                        <span className="text-[11px] text-neutral-400">Loading full details...</span>
                      </div>
                    ) : (
                      <div className="space-y-3 text-[11.5px]">
                        <div>
                          <span className="text-[10px] font-bold text-neutral-400 uppercase block">Description</span>
                          {selectedEventDetails?.summary ? (
                            <p className="text-neutral-600 dark:text-neutral-400 mt-0.5 leading-relaxed break-words whitespace-pre-line">
                              {selectedEventDetails.summary}
                            </p>
                          ) : (
                            <span className="text-neutral-400 italic mt-0.5 block">No description</span>
                          )}
                        </div>
                        {selectedEventDetails?.topics?.length > 0 && (
                          <div>
                            <span className="text-[10px] font-bold text-neutral-400 uppercase block">Topics</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {selectedEventDetails.topics.slice(0, 10).map((t, i) => (
                                <span key={i} className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800/50 text-[10px] text-neutral-500 dark:text-neutral-400 border border-neutral-200/50 dark:border-white/5">
                                  {t}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {selectedEventDetails?.tags?.length > 0 && (
                          <div>
                            <span className="text-[10px] font-bold text-neutral-400 uppercase block">Tags</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {selectedEventDetails.tags.map((tag, i) => (
                                <span key={i} className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800/50 text-[10px] text-neutral-500 dark:text-neutral-400 border border-neutral-200/50 dark:border-white/5">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Image Source */}
                <div className="space-y-2">
                  <span className="block text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Image Source</span>
                  <div className="bg-neutral-50/50 dark:bg-[#1b1b1e]/30 border border-neutral-200/30 dark:border-white/5 rounded-xl p-3 space-y-2.5">
                    <div className="flex items-start gap-2">
                      <ExternalLink size={12} className="text-neutral-400 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <span className="text-[10px] font-bold text-neutral-400 uppercase">Primary URL</span>
                        <p className="text-[11px] font-mono text-neutral-700 dark:text-neutral-400 break-all mt-0.5">
                          {selectedEvent.image?.primaryUrl || '—'}
                        </p>
                      </div>
                    </div>
                    {selectedEvent.image?.originalDomain && (
                      <div className="flex items-center gap-2">
                        <Globe size={12} className="text-neutral-400 shrink-0" />
                        <span className="text-[11px] text-neutral-500">
                          Domain: <span className="font-mono text-neutral-700 dark:text-neutral-400">{selectedEvent.image.originalDomain}</span>
                        </span>
                      </div>
                    )}
                    {selectedEvent.image?.alt && (
                      <div className="flex items-start gap-2">
                        <ImageIcon size={12} className="text-neutral-400 shrink-0 mt-0.5" />
                        <span className="text-[11px] text-neutral-500">{selectedEvent.image.alt}</span>
                      </div>
                    )}
                    {selectedEvent.image?.legacyHero && (
                      <div className="flex items-center gap-2">
                        <AlertTriangle size={12} className="text-amber-500 shrink-0" />
                        <span className="text-[11px] text-amber-600 dark:text-amber-400">
                          Still on legacy media.hero — run Cleanup to promote it
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Backup (R2) */}
                <div className="space-y-2">
                  <span className="block text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Backup (R2)</span>
                  <div className="bg-neutral-50/50 dark:bg-[#1b1b1e]/30 border border-neutral-200/30 dark:border-white/5 rounded-xl p-3 space-y-2">
                    {selectedEvent.image?.backupUrl ? (
                      <>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 size={12} className="text-emerald-500" />
                          <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">Backed up to R2</span>
                        </div>
                        <p className="text-[10px] font-mono text-neutral-400 break-all">{selectedEvent.image.backupUrl}</p>
                        {selectedEvent.image?.backupFormat && (
                          <span className="inline-flex px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold">
                            {selectedEvent.image.backupFormat.toUpperCase()}
                          </span>
                        )}
                      </>
                    ) : (
                      <div className="flex items-center gap-2">
                        <AlertTriangle size={12} className="text-amber-500" />
                        <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">No backup stored</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Source */}
                <div className="space-y-2">
                  <span className="block text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Source</span>
                  <div className="bg-neutral-50/50 dark:bg-[#1b1b1e]/30 border border-neutral-200/30 dark:border-white/5 rounded-xl p-3 space-y-2 text-[11px]">
                    {selectedEvent.source?.name && (
                      <div className="flex items-center gap-2">
                        <Globe size={12} className="text-neutral-400 shrink-0" />
                        <span className="text-neutral-700 dark:text-neutral-400 font-medium">{selectedEvent.source.name}</span>
                      </div>
                    )}
                    {selectedEvent.source?.url && (
                      <div className="flex items-center gap-2">
                        <ExternalLink size={12} className="text-neutral-400 shrink-0" />
                        <a
                          href={selectedEvent.source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 dark:text-blue-400 hover:underline truncate"
                        >
                          {selectedEvent.source.url}
                        </a>
                      </div>
                    )}
                    {selectedEventDetails?.organizerWebsite && (
                      <div className="flex items-center gap-2">
                        <Link2 size={12} className="text-neutral-400 shrink-0" />
                        <a
                          href={selectedEventDetails.organizerWebsite}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 dark:text-blue-400 hover:underline truncate"
                        >
                          Organizer{selectedEventDetails.organizer ? ` — ${selectedEventDetails.organizer}` : ''}
                        </a>
                        {selectedEvent.image?.primaryUrl && (
                          <button
                            onClick={() => handleCopyPrimaryUrl(selectedEvent)}
                            className="ml-auto flex items-center gap-1 px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200 dark:hover:bg-white/10 text-neutral-500 hover:text-neutral-800 dark:hover:text-white transition-colors shrink-0"
                            title="Copy image URL"
                          >
                            <Link2 size={11} />
                            Copy URL
                          </button>
                        )}
                      </div>
                    )}
                    {selectedEventDetails?.dateLabel && (
                      <div className="flex items-center gap-2">
                        <Calendar size={12} className="text-neutral-400 shrink-0" />
                        <span>{selectedEventDetails.dateLabel}</span>
                      </div>
                    )}
                    {selectedEvent.image?.lastCheckedAt && (
                      <div className="flex items-center gap-2">
                        <RefreshCw size={12} className="text-neutral-400 shrink-0" />
                        <span>Last checked: {formatDate(selectedEvent.image.lastCheckedAt)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="shrink-0 p-4 border-t border-neutral-200/50 dark:border-white/5 bg-neutral-50/50 dark:bg-neutral-900/30 flex flex-col gap-2">
                <button
                  onClick={() => {
                    handleOpenUpload(selectedEvent);
                    setSelectedEvent(null);
                  }}
                  className="w-full py-2 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500 transition-colors shadow-sm flex items-center justify-center gap-1.5"
                >
                  <Upload size={12} />
                  Upload Replacement Image
                </button>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      const link = selectedEventDetails?.source?.url || selectedEventDetails?.organizerWebsite || selectedEvent.image?.primaryUrl;
                      if (link) {
                        window.open(link, '_blank', 'noopener,noreferrer');
                      } else {
                        toast.error('No event link or image URL to open');
                      }
                    }}
                    disabled={!selectedEventDetails?.source?.url && !selectedEventDetails?.organizerWebsite && !selectedEvent.image?.primaryUrl}
                    className="flex-1 py-2 border border-neutral-200 dark:border-white/5 rounded-lg text-xs font-semibold text-neutral-500 hover:text-neutral-800 dark:hover:text-white bg-white dark:bg-[#18181b] hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-40"
                    title="Open the source page or image in a new tab"
                  >
                    <ExternalLink size={12} />
                    Open Link
                  </button>
                  <button
                    onClick={() => handleRecheck(selectedEvent)}
                    disabled={isRechecking === selectedEvent.id || !selectedEvent.image?.primaryUrl}
                    className="flex-1 py-2 border border-neutral-200 dark:border-white/5 rounded-lg text-xs font-semibold text-neutral-500 hover:text-neutral-800 dark:hover:text-white bg-white dark:bg-[#18181b] hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-40"
                  >
                    {isRechecking === selectedEvent.id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <RefreshCw size={12} />
                    )}
                    Re-check
                  </button>
                  <button
                    onClick={() => setSelectedEvent(null)}
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

      {/* Upload modal */}
      <AnimatePresence>
        {uploadTarget && (
          <>
            <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-[2px]" onClick={handleCloseUpload} />
            <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={(e) => { if (e.currentTarget === e.target) setIsDragOver(false); }}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragOver(false);
                  const f = e.dataTransfer?.files?.[0];
                  if (f) ingestImageFile(f);
                }}
                className={`w-full max-w-lg bg-white dark:bg-[#151518] rounded-xl border p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto custom-scrollbar transition-colors ${
                  isDragOver
                    ? 'border-emerald-500/60 ring-2 ring-emerald-500/20 border-dashed'
                    : 'border-neutral-200/50 dark:border-white/5'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                    <Upload size={18} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-xs font-bold text-neutral-900 dark:text-white uppercase tracking-wide">Replace Event Image</h3>
                    <p className="text-[11px] text-neutral-400 mt-0.5">
                      Paste a URL, drop/paste a file (Ctrl+V), or upload — runs in the background
                    </p>
                  </div>
                </div>

                {/* Mode toggle */}
                <div className="p-0.5 rounded-lg bg-neutral-200/50 dark:bg-neutral-900/60 border border-neutral-200/40 dark:border-white/5 flex gap-0.5 shadow-inner">
                  {[
                    { key: 'url', label: 'Paste URL', icon: Globe },
                    { key: 'file', label: 'Upload File', icon: FileUp },
                  ].map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => { setUploadMode(opt.key); setUrlPreviewError(false); }}
                      className={`flex-1 px-3 py-1.5 text-[11.5px] font-semibold rounded-md transition-all flex items-center justify-center gap-1.5 ${
                        uploadMode === opt.key
                          ? 'bg-white dark:bg-[#1b1b1e] text-neutral-900 dark:text-white shadow-sm'
                          : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-300'
                      }`}
                    >
                      <opt.icon size={12} strokeWidth={1.5} />
                      {opt.label}
                    </button>
                  ))}
                </div>

                {/* Event reference */}
                <div className="bg-neutral-50/50 dark:bg-[#1b1b1e]/30 border border-neutral-200/30 dark:border-white/5 rounded-xl p-4 space-y-2.5">
                  <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider flex items-center gap-1">
                    <FileUp size={10} />
                    Event Reference
                  </span>
                  {isLoadingDetails ? (
                    <div className="flex items-center gap-2 py-2">
                      <Loader2 size={12} className="animate-spin text-neutral-400" />
                      <span className="text-[11px] text-neutral-400">Loading details...</span>
                    </div>
                  ) : (
                    <div className="space-y-2 text-[11.5px]">
                      <div>
                        <span className="text-[10px] font-bold text-neutral-400 uppercase block">Title</span>
                        <p className="text-neutral-900 dark:text-neutral-100 font-semibold mt-0.5">{eventDetails?.title || uploadTarget.title}</p>
                      </div>
                      <div className="flex gap-4 flex-wrap">
                        {eventDetails?.eventType && (
                          <div>
                            <span className="text-[10px] font-bold text-neutral-400 uppercase block">Type</span>
                            <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800/50 text-[10px] font-medium text-neutral-600 dark:text-neutral-400 capitalize">
                              {eventDetails.eventType.replace(/_/g, ' ')}
                            </span>
                          </div>
                        )}
                        {eventDetails?.dateLabel && (
                          <div>
                            <span className="text-[10px] font-bold text-neutral-400 uppercase block">Date</span>
                            <p className="text-neutral-600 dark:text-neutral-400 mt-0.5">{eventDetails.dateLabel}</p>
                          </div>
                        )}
                        {eventDetails?.location && (
                          <div>
                            <span className="text-[10px] font-bold text-neutral-400 uppercase block">Location</span>
                            <p className="text-neutral-600 dark:text-neutral-400 mt-0.5">{eventDetails.location}</p>
                          </div>
                        )}
                      </div>
                      {eventDetails?.topics?.length > 0 && (
                        <div>
                          <span className="text-[10px] font-bold text-neutral-400 uppercase block">Topics</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {eventDetails.topics.slice(0, 6).map((t, i) => (
                              <span key={i} className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800/50 text-[10px] text-neutral-500 dark:text-neutral-400">
                                {t}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* URL mode */}
                {uploadMode === 'url' && (
                  <div className="space-y-2.5">
                    <div className="relative">
                      <input
                        type="text"
                        value={uploadUrl}
                        onChange={(e) => { setUploadUrl(e.target.value); setUrlPreviewError(false); }}
                        onPaste={(e) => {
                          const text = e.clipboardData?.getData('text');
                          if (text && text.startsWith('data:image')) {
                            e.preventDefault();
                            setUploadUrl(text.trim());
                            setUrlPreviewError(false);
                            toast.success('Image data pasted from clipboard');
                          }
                        }}
                        placeholder="https://example.com/hero.jpg  (or paste an image directly)"
                        className="w-full pl-9 pr-3 py-2.5 bg-white dark:bg-[#151518] border border-neutral-200/60 dark:border-white/5 rounded-lg text-[12px] text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:border-neutral-400 dark:focus:border-neutral-700 transition-all font-mono"
                      />
                      <Link2 size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                    </div>

                    {uploadUrl && !uploadUrl.trim().startsWith('data:') && (
                      <div className="relative rounded-lg overflow-hidden border border-neutral-200/50 dark:border-white/5 bg-neutral-100 dark:bg-neutral-900/30 flex items-center justify-center min-h-[110px]">
                        {urlPreviewError ? (
                          <div className="py-6 text-center">
                            <AlertTriangle size={16} className="text-amber-500 mx-auto mb-1" />
                            <p className="text-[10.5px] text-neutral-400">Preview unavailable — the server will still try to fetch it</p>
                          </div>
                        ) : (
                          <img
                            src={uploadUrl}
                            alt="preview"
                            onLoad={(e) => {
                              setUrlPreviewSize({ w: e.target.naturalWidth, h: e.target.naturalHeight });
                              setUrlPreviewError(false);
                            }}
                            onError={() => setUrlPreviewError(true)}
                            className="max-h-40 w-auto object-contain"
                          />
                        )}
                      </div>
                    )}

                    {urlPreviewSize && (
                      <p className="text-[10px] text-neutral-400">
                        {urlPreviewSize.w} × {urlPreviewSize.h}px — the server re-encodes to WebP and stores it in R2
                      </p>
                    )}

                    <p className="text-[10.5px] text-neutral-400 leading-relaxed">
                      The server fetches the URL, verifies it really is an image, then converts to WebP and stores it in Cloudflare R2 — the event gets a permanent, fast URL instead of a rotting external link.
                    </p>
                  </div>
                )}

                {/* File mode */}
                {uploadMode === 'file' && (
                  <>
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
                          <FileUp size={20} className="text-neutral-400" />
                          <span className="text-[11.5px] text-neutral-500">Click to choose, drop, or paste an image (max 15MB)</span>
                        </>
                      )}
                    </button>
                    <p className="text-[10.5px] text-neutral-400 leading-relaxed">
                      Converted to WebP and stored in Cloudflare R2 — the event gets a permanent, fast URL instead of a rotting external link.
                    </p>
                  </>
                )}

                {/* Actions */}
                <div className="flex items-center justify-end gap-2.5 pt-1">
                  <button
                    onClick={handleCloseUpload}
                    className="px-3.5 py-2 rounded-lg text-[12px] font-semibold text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200/60 dark:hover:bg-white/5 transition-colors"
                  >
                    Cancel
                  </button>
                  {activeFilter === 'broken' && (
                    <button
                      onClick={() => handleUploadSubmit(true)}
                      disabled={(uploadMode === 'file' && !uploadFile) || (uploadMode === 'url' && !isValidHttpUrl(uploadUrl))}
                      title="Save this image and jump straight to the next broken event"
                      className="px-3.5 py-2 rounded-lg text-[12px] font-semibold border border-blue-200/60 dark:border-blue-500/25 bg-blue-500/5 hover:bg-blue-500/10 text-blue-600 dark:text-blue-400 shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <SkipForward size={13} />
                      Save &amp; Next Broken
                    </button>
                  )}
                  <button
                    onClick={() => handleUploadSubmit(false)}
                    disabled={(uploadMode === 'file' && !uploadFile) || (uploadMode === 'url' && !isValidHttpUrl(uploadUrl))}
                    className="px-3.5 py-2 rounded-lg text-[12px] font-bold bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 shadow-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all inline-flex items-center gap-1.5"
                  >
                    <Upload size={13} />
                    Upload &amp; Replace
                  </button>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* Lightbox */}
      <AnimatePresence>
        {lightbox && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightbox(null)}
            className="fixed inset-0 z-[130] bg-black/85 backdrop-blur-sm flex items-center justify-center p-6 cursor-zoom-out"
          >
            <img src={lightbox.url} alt={lightbox.title} className="max-h-full max-w-full object-contain rounded-lg" />
            <button
              onClick={() => setLightbox(null)}
              className="absolute top-4 right-4 p-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
            >
              <X size={16} />
            </button>
            <p className="absolute bottom-4 left-0 right-0 text-center text-[12px] text-white/70 px-6 truncate">{lightbox.title}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Background upload queue pill */}
      {uploadQueue.length > 0 && (
        <div className="fixed bottom-5 right-5 z-[100] w-72 bg-white dark:bg-[#151518] border border-neutral-200/60 dark:border-white/10 rounded-xl shadow-2xl overflow-hidden">
          <button
            onClick={() => setQueueOpen(o => !o)}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              {queueActiveCount > 0 ? (
                <Loader2 size={13} className="animate-spin text-emerald-500 shrink-0" />
              ) : queueFailedCount > 0 ? (
                <AlertTriangle size={13} className="text-amber-500 shrink-0" />
              ) : (
                <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
              )}
              <span className="text-[11.5px] font-semibold text-neutral-700 dark:text-neutral-200 truncate">
                {queueActiveCount > 0
                  ? `Replacing ${queueActiveCount} image${queueActiveCount > 1 ? 's' : ''}…`
                  : queueFailedCount > 0
                    ? `${queueDoneCount} replaced, ${queueFailedCount} failed`
                    : `${queueDoneCount} image${queueDoneCount > 1 ? 's' : ''} replaced`}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-2">
              {queueFailedCount > 0 && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-500/10 text-red-600 dark:text-red-400">
                  {queueFailedCount}
                </span>
              )}
              <ChevronRight
                size={13}
                className={`text-neutral-400 transition-transform ${queueOpen ? 'rotate-90' : ''}`}
              />
            </div>
          </button>

          {queueOpen && (
            <div className="max-h-48 overflow-y-auto border-t border-neutral-200/50 dark:border-white/5 divide-y divide-neutral-200/40 dark:divide-white/5">
              {uploadQueue.map(job => (
                <div key={job.id} className="px-4 py-2.5 flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    job.status === 'active' ? 'bg-emerald-500 animate-pulse'
                      : job.status === 'done' ? 'bg-emerald-500' : 'bg-red-500'
                  }`} />
                  <span className="text-[11px] text-neutral-600 dark:text-neutral-300 truncate flex-1">{job.title}</span>
                  <span className={`text-[10px] shrink-0 ${
                    job.status === 'failed' ? 'text-red-500' : 'text-neutral-400'
                  }`}>
                    {job.message}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default EventImages;