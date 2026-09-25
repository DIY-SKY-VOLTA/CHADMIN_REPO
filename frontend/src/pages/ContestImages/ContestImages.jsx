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
  CloudDownload,
  Copy,
  Check,
  CheckCheck,
  SkipForward,
  ShieldCheck,
  Link2,
  Maximize2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import ConfirmDialog from '@/components/UI/ConfirmDialog';
import adminAPI from '@/api/adminAPI';
import { copyToClipboard } from '@/utils/clipboard';
import { uploadContestImageFromUrl } from '@/api/contestAPI';

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
  error: { icon: AlertTriangle, label: 'Check Error', color: '#f97316', bg: 'bg-orange-500/10', text: 'text-orange-600 dark:text-orange-400', border: 'border-orange-500/15' },
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

// Convert a data: URL into a File so it can go through the normal multipart
// upload path (the backend URL-fetch endpoint only accepts http(s) URLs).
const dataUrlToFile = async (dataUrl) => {
  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const meta = dataUrl.match(/^data:([^;,]+)/);
    const mime = (meta && meta[1]) || blob.type || 'image/png';
    const ext = mime.split('/')[1]?.split('+')[0]?.replace(/[^a-z0-9]/gi, '') || 'png';
    return new File([blob], `pasted-image.${ext}`, { type: mime });
  } catch (err) {
    throw new Error('Invalid data URL');
  }
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
  const [stats, setStats] = useState({ total: 0, healthy: 0, broken: 0, no_backup: 0, no_image: 0, unknown: 0, stale: 0 });
  const [facets, setFacets] = useState({ categories: [], sources: [] });
  const [categoryFilter, setCategoryFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  // Deep Check: explicit live verification sweep. { done, total, alive, dead, errors } while running.
  const [deepCheck, setDeepCheck] = useState(null);
  const [deepCheckDialog, setDeepCheckDialog] = useState(false);
  const [sortBy, setSortBy] = useState('title');
  const [sortOrder, setSortOrder] = useState('asc');

  // Selection and detail state
  const [selectedContest, setSelectedContest] = useState(null);
  const [selectedContestDetails, setSelectedContestDetails] = useState(null);
  const [isLoadingSelectedDetails, setIsLoadingSelectedDetails] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [checkedContests, setCheckedContests] = useState(new Set());
  const [isRechecking, setIsRechecking] = useState(null); // contestId being rechecked
  const [recheckResult, setRecheckResult] = useState(null);
  const [isBulkRechecking, setIsBulkRechecking] = useState(false);

  // Backup state
  const [isBackingUp, setIsBackingUp] = useState(null);
  const [isBulkBackingUp, setIsBulkBackingUp] = useState(false);

  // Bulk-select + progress state
  const [isSelectingAllMatching, setIsSelectingAllMatching] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(null); // { total, processed, succeeded, failed, errors, done }
  const headerCheckRef = useRef(null);

  // Upload state
  const [uploadTarget, setUploadTarget] = useState(null); // contest being uploaded for
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadPreview, setUploadPreview] = useState(null);
  const [contestDetails, setContestDetails] = useState(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const fileInputRef = useRef(null);

  // Background upload queue — submissions return instantly and run in the
  // background so the admin can keep hunting the next image mid-upload.
  // Active tab URL detection constants
  const ACTIVE_TAB_PRIMARY_ATTR = ['href', 'src', 'data-src', 'xlink:href'];

  // Try to pull a URL out of the most relevant attributes of the active element.
  const extractUrlFromActiveElement = () => {
    const el = document.activeElement;
    if (!el) return null;
    // 1) A focused link/image input or any element with a URL attribute
    for (const attr of ACTIVE_TAB_PRIMARY_ATTR) {
      const v = el?.getAttribute(attr);
      if (v && typeof v === 'string' && v.trim()) {
        const t = v.trim();
        if (t.startsWith('data:')) return t;
        try {
          const u = new URL(t);
          if (u.protocol === 'http:' || u.protocol === 'https:') return t;
        } catch {
          // Not a parseable URL; keep scanning
        }
      }
    }
    // 2) Selection (e.g. user selected a link's text)
    const sel = window.getSelection()?.toString()?.trim();
    if (sel) return sel;
    // 3) Falling back to the current page's location
    try {
      const host = window.location.origin;
      return host;
    } catch {
      return null;
    }
  };

  // Stick the active tab URL into the paste-url field when the user asks.
  const useActiveTabUrl = () => {
    const url = extractUrlFromActiveElement();
    if (!url) {
      toast.error('No URL found in the active tab — select a link first, or paste one manually.');
      return;
    }
    setUploadUrl(url);
    setUrlPreviewSize(null);
    toast.success('Pasted from the active tab: ' + url.split('/').slice(0, 4).join('/'));
  };

  // Quick-copy for the primary image URL (details slide-over).
  const [isPrimaryUrlCopied, setIsPrimaryUrlCopied] = useState(false);
  const copyPrimaryUrlTimer = useRef(null);

  const handleCopyPrimaryUrl = (contest) => {
    const url = contest?.image?.primaryUrl;
    if (!url) {
      toast.error('No primary image URL to copy');
      return;
    }
    const done = () => {
      setIsPrimaryUrlCopied(true);
      toast.success('Image URL copied');
      if (copyPrimaryUrlTimer.current) clearTimeout(copyPrimaryUrlTimer.current);
      copyPrimaryUrlTimer.current = setTimeout(() => setIsPrimaryUrlCopied(false), 2000);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(done).catch(() => toast.error('Could not copy URL'));
    } else {
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        done();
      } catch {
        toast.error('Could not copy URL');
      }
      document.body.removeChild(ta);
    }
  };

  const [uploadQueue, setUploadQueue] = useState([]); // [{ id, contestId, title, status: 'active'|'done'|'failed', message }]
  const [queueOpen, setQueueOpen] = useState(true);
  const queueActiveCount = uploadQueue.filter(j => j.status === 'active').length;
  const queueDoneCount = uploadQueue.filter(j => j.status === 'done').length;
  const queueFailedCount = uploadQueue.filter(j => j.status === 'failed').length;

  // Set indeterminate state on the select-all header checkbox when only some
  // contests on the current page are selected.
  useEffect(() => {
    if (!headerCheckRef.current) return;
    const pageIds = contests.map(c => c.id);
    const some = pageIds.some(id => checkedContests.has(id));
    const all = pageIds.length > 0 && pageIds.every(id => checkedContests.has(id));
    headerCheckRef.current.indeterminate = some && !all;
  }, [contests, checkedContests]);

  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadMode, setUploadMode] = useState('url'); // 'url' (default) | 'file'
  const [uploadUrl, setUploadUrl] = useState('');
  const [urlPreviewError, setUrlPreviewError] = useState(false);
  const [urlPreviewSize, setUrlPreviewSize] = useState(null); // natural {w, h} of the URL preview

  const searchTimerRef = useRef(null);
  const recheckTimerRef = useRef(null);

  // Prune finished jobs from the pill once nothing is active and the user has
  // seen the outcome (10s after completion).
  useEffect(() => {
    if (uploadQueue.length > 0 && queueActiveCount === 0) {
      const t = setTimeout(() => setUploadQueue([]), 10000);
      return () => clearTimeout(t);
    }
  }, [uploadQueue, queueActiveCount]);

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
  const fetchContests = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const res = await adminAPI.get('/contests/images/health', {
        params: {
          page,
          limit: 50,
          search: debouncedSearch,
          filter: activeFilter,
          sortBy,
          sortOrder,
          // Reads stored statuses (persisted by ingestion + Deep Checks) —
          // instant. Re-verification only happens via the header Deep Check.
          category: categoryFilter || undefined,
          source: sourceFilter || undefined,
        },
      });

      if (res.success) {
        setContests(res.contests || []);
        setPagination(res.pagination || { total: 0, pages: 1 });
        setStats(res.stats || { total: 0, healthy: 0, broken: 0, no_backup: 0, no_image: 0, unknown: 0, stale: 0 });
        if (res.facets) setFacets(res.facets);
      }
    } catch (err) {
      toast.error(err?.message || 'Failed to load contest images');
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [page, debouncedSearch, activeFilter, sortBy, sortOrder, categoryFilter, sourceFilter]);

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
        
        // Update local state directly instead of full refresh
        setContests(prev => prev.map(c => {
          if (c.id === contest.id) {
            return {
              ...c,
              imageStatus: res.check.dbStatus,
              image: {
                ...c.image,
                lastCheckedAt: new Date().toISOString()
              }
            };
          }
          return c;
        }));
        // Keep the details slide-over badge in sync when rechecking from it
        if (selectedContest?.id === contest.id) {
          setSelectedContest(prev => ({
            ...prev,
            imageStatus: res.check.dbStatus,
            image: {
              ...prev.image,
              lastCheckedAt: new Date().toISOString(),
            },
          }));
        }
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
        fetchContests(true);
      }
    } catch (err) {
      toast.error(err?.message || 'Bulk re-check failed');
    } finally {
      setIsBulkRechecking(false);
    }
  };

  // Backup single image
  const handleBackup = async (contest) => {
    if (!contest.image?.primaryUrl) return;
    setIsBackingUp(contest.id);
    try {
      const res = await adminAPI.post('/contests/images/backup', { contestId: contest.id });
      if (res.success) {
        toast.success('Image backed up successfully');
        fetchContests(true);
      }
    } catch (err) {
      toast.error(err?.message || 'Backup failed');
    } finally {
      setIsBackingUp(null);
    }
  };

  // Bulk backup selected contests — runs in batches so the progress modal can
  // report live per-batch success/failure counts, then shows a final summary.
  const handleBulkBackup = async () => {
    const ids = Array.from(checkedContests);
    if (ids.length === 0) return;

    const progress = { total: ids.length, processed: 0, succeeded: 0, failed: 0, errors: [], done: false };
    setBulkProgress(progress);
    setIsBulkBackingUp(true);

    try {
      for (let i = 0; i < ids.length; i += BULK_BACKUP_BATCH) {
        const batch = ids.slice(i, i + BULK_BACKUP_BATCH);
        try {
          const res = await adminAPI.post('/contests/images/bulk-backup', { contestIds: batch });
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
      setCheckedContests(new Set());
      fetchContests(true);
    } finally {
      setIsBulkBackingUp(false);
    }
  };

  // Deep Check — explicitly re-test every image URL against the live web in
  // client-driven batches (progress per batch) and persist results to Mongo.
  // Deliberately NOT part of normal browsing: stored statuses make the list
  // load instantly; verification is an on-demand operation.
  const DEEP_CHECK_BATCH = 50;
  const handleDeepCheck = async () => {
    if (deepCheck) return; // one sweep at a time
    setDeepCheckDialog(false);
    const progress = { done: 0, total: 0, alive: 0, dead: 0, errors: 0 };
    setDeepCheck(progress);
    try {
      const idsRes = await adminAPI.get('/contests/images/health', {
        params: { page: 1, limit: 100, filter: 'all', idsOnly: true },
      });
      const ids = idsRes?.ids || [];
      if (ids.length === 0) {
        toast.error('No contests to check');
        setDeepCheck(null);
        return;
      }
      progress.total = ids.length;
      setDeepCheck({ ...progress });

      for (let i = 0; i < ids.length; i += DEEP_CHECK_BATCH) {
        const batch = ids.slice(i, i + DEEP_CHECK_BATCH);
        try {
          const res = await adminAPI.post('/contests/images/bulk-recheck', { contestIds: batch });
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
      fetchContests(true);
    } catch (err) {
      toast.error(err?.message || 'Deep check failed');
    } finally {
      // Leave the final summary visible for a moment before clearing
      setTimeout(() => setDeepCheck(null), 4000);
    }
  };

  // Select ALL contests matching the current filter/search (across every page)
  const handleSelectAllMatching = async () => {
    setIsSelectingAllMatching(true);
    try {
      const res = await adminAPI.get('/contests/images/health', {
        params: {
          page: 1,
          limit: 100,
          search: debouncedSearch,
          filter: activeFilter,
          sortBy,
          sortOrder,
          category: categoryFilter || undefined,
          source: sourceFilter || undefined,
          idsOnly: true,
        },
      });
      if (res.success && res.ids?.length) {
        setCheckedContests(new Set(res.ids));
        toast.success(`Selected all ${res.ids.length} matching contests`);
      }
    } catch (err) {
      toast.error(err?.message || 'Failed to select all matching contests');
    } finally {
      setIsSelectingAllMatching(false);
    }
  };

  // Handle opening details panel
  const handleOpenDetails = async (contest) => {
    setSelectedContest(contest);
    setSelectedContestDetails(null);
    setIsLoadingSelectedDetails(true);
    try {
      const res = await adminAPI.get('/contests/images/details', {
        params: { contestId: contest.id },
      });
      if (res.success) {
        setSelectedContestDetails(res.contest);
      }
    } catch (err) {
      // Ignore, panel will just show less info
    } finally {
      setIsLoadingSelectedDetails(false);
    }
  };

  const handleCopyContext = () => {
    if (!selectedContest || !selectedContestDetails) return;
    
    let text = `Title: ${selectedContest.title}\n`;
    if (selectedContest.category) text += `Category: ${selectedContest.category}\n`;
    if (selectedContestDetails.description) text += `Description: ${selectedContestDetails.description}\n`;
    if (selectedContestDetails.tags?.length > 0) text += `Tags: ${selectedContestDetails.tags.join(', ')}\n`;

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

  // Handle opening the upload modal — fetches full contest details
  const handleOpenUpload = async (contest) => {
    setUploadTarget(contest);
    setUploadFile(null);
    setUploadPreview(null);
    setUploadMode('url');
    setUploadUrl('');
    setUrlPreviewSize(null);
    setUrlPreviewError(false);
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

  // Push a job onto the background queue and fire the request without
  // awaiting the result in the UI — the modal is free immediately.
  const startUploadJob = (contest, payload) => {
    const jobId = `${contest.id}-${Date.now()}`;
    setUploadQueue(q => [...q, { id: jobId, contestId: contest.id, title: contest.title, status: 'active', message: 'Uploading…' }]);

    payload
      .then(res => {
        if (res?.success) {
          setUploadQueue(q => q.map(j => j.id === jobId ? { ...j, status: 'done', message: 'Replaced' } : j));
          toast.success(`Image replaced: ${contest.title}`);
          // Repair the row in place — no list refresh, no lost scroll/filter state
          applyRepairedImage(contest.id, res.image);
        } else {
          setUploadQueue(q => q.map(j => j.id === jobId ? { ...j, status: 'failed', message: res?.message || 'Upload failed' } : j));
          toast.error(`${contest.title}: ${res?.message || 'Upload failed'}`);
        }
      })
      .catch(err => {
        setUploadQueue(q => q.map(j => j.id === jobId ? { ...j, status: 'failed', message: err?.message || 'Upload failed' } : j));
        toast.error(`${contest.title}: ${err?.message || 'Upload failed'}`);
      });

    return jobId;
  };

  // Patch a contest row + stats locally after a successful background upload.
  const applyRepairedImage = (contestId, image) => {
    const newUrl = image?.url;
    setContests(prev => prev.map(c => {
      if (c.id !== contestId) return c;
      return {
        ...c,
        imageStatus: 'healthy',
        image: {
          ...c.image,
          primaryUrl: newUrl || c.image?.primaryUrl,
          backupUrl: newUrl || c.image?.backupUrl,
          lastCheckedAt: new Date().toISOString(),
        },
      };
    }));
    // Keep the details slide-over in sync if it's showing this contest
    setSelectedContest(prev => (prev?.id === contestId
      ? { ...prev, imageStatus: 'healthy', image: { ...prev.image, primaryUrl: newUrl || prev.image?.primaryUrl, backupUrl: newUrl || prev.image?.backupUrl, lastCheckedAt: new Date().toISOString() } }
      : prev));
    // Move one count from broken/no_image into healthy so the cards stay truthful
    setStats(prev => {
      const next = { ...prev };
      if (next.broken > 0) next.broken -= 1; else if (next.no_image > 0) next.no_image -= 1;
      next.healthy += 1;
      return next;
    });
  };

  // Advance the modal to the next broken contest (Broken filter only).
  // Skips rows already repaired this session (patched healthy locally) and
  // wraps around to the top when past the last one.
  const advanceToNextBroken = (currentTarget) => {
    if (activeFilter !== 'broken') return null;
    const broken = contests.filter(c => c.imageStatus === 'broken' || c.imageStatus === 'no_image');
    const candidates = broken.filter(c => c.id !== currentTarget.id);
    if (candidates.length === 0) return null;
    const currentIdx = broken.findIndex(c => c.id === currentTarget.id);
    const next = candidates.find(c => broken.findIndex(b => b.id === c.id) > currentIdx) || candidates[0];
    return next;
  };

  // Handle upload submission — file OR URL source. Submits to the background
  // queue (non-blocking), then either closes or chains to the next broken.
  const handleUploadSubmit = async (advance = false) => {
    if (!uploadTarget) return;
    if (uploadMode === 'file' && !uploadFile) return;
    if (uploadMode === 'url' && !isValidHttpUrl(uploadUrl)) return;

    const target = uploadTarget;
    let payload;
    let fetchedFromUrl = false; // true when the server fetches an http(s) URL itself
    if (uploadMode === 'url') {
      const rawUrl = uploadUrl.trim();
      if (rawUrl.startsWith('data:')) {
        // data: URLs can't go through the backend URL-fetch endpoint (it only
        // accepts http(s)), so decode to a file client-side and use the normal
        // multipart upload path instead.
        try {
          const file = await dataUrlToFile(rawUrl);
          if (file.size > 15 * 1024 * 1024) {
            toast.error('Decoded image is over the 15MB limit (' + Math.round(file.size / (1024 * 1024)) + 'MB)');
            return;
          }
          payload = adminAPI.post('/contests/images/upload', (() => {
            const formData = new FormData();
            formData.append('contestId', target.id);
            formData.append('image', file);
            return formData;
          })(), { headers: { 'Content-Type': 'multipart/form-data' } });
        } catch (err) {
          toast.error('Could not decode this data: URL as an image');
          return;
        }
      } else {
        payload = uploadContestImageFromUrl(target.id, rawUrl);
        fetchedFromUrl = true;
      }
    } else {
      const formData = new FormData();
      formData.append('contestId', target.id);
      formData.append('image', uploadFile);
      payload = adminAPI.post('/contests/images/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    }

    startUploadJob(target, payload);
    toast.success(fetchedFromUrl
      ? 'Queued — fetching in background. You can keep working.'
      : 'Queued — uploading in background. You can keep working.');

    // Reset input state (keep the modal open when chaining)
    if (uploadPreview) URL.revokeObjectURL(uploadPreview);
    setUploadFile(null);
    setUploadPreview(null);
    setUploadUrl('');
    setUrlPreviewSize(null);
    setUrlPreviewError(false);

    // Save & Next Broken: jump straight to the next broken contest
    if (advance) {
      const next = advanceToNextBroken(target);
      if (next) {
        handleOpenUpload(next);
      } else {
        toast.success('All caught up — no more broken images in this view 🎉');
        handleCloseUpload();
      }
    } else {
      handleCloseUpload();
      // Silent refresh so the table reflects finished uploads soon; background
      // completions already patch rows in place.
      setTimeout(() => fetchContests(true), 4000);
    }
  };

  // Close upload modal
  const handleCloseUpload = () => {
    if (uploadPreview) URL.revokeObjectURL(uploadPreview);
    setUploadTarget(null);
    setUploadFile(null);
    setUploadPreview(null);
    setUploadUrl('');
    setUploadMode('url');
    setUrlPreviewSize(null);
    setUrlPreviewError(false);
    setContestDetails(null);
    setIsDragOver(false);
  };

  // Ingest an image file from paste or drag-drop into the upload modal.
  const ingestImageFile = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Clipboard does not contain an image');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast.error('Image must be under 15MB');
      return;
    }
    setUploadMode('file');
    setUrlPreviewError(false);
    if (uploadPreview) URL.revokeObjectURL(uploadPreview);
    setUploadFile(file);
    setUploadPreview(URL.createObjectURL(file));
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

  // Toggle select
  const toggleSelect = (id) => {
    setCheckedContests(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Toggle selection for all contests on the current page, preserving any
  // selections made on other pages (e.g. via "select all matching").
  const selectAll = () => {
    const pageIds = contests.map(c => c.id);
    const allPageSelected = pageIds.length > 0 && pageIds.every(id => checkedContests.has(id));
    setCheckedContests(prev => {
      const next = new Set(prev);
      if (allPageSelected) {
        pageIds.forEach(id => next.delete(id));
      } else {
        pageIds.forEach(id => next.add(id));
      }
      return next;
    });
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
    <div className="h-full flex flex-col bg-neutral-50/30 dark:bg-[#0d0d0f]/20 selection:bg-neutral-200/50 dark:selection:bg-neutral-400/40">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-neutral-200/50 dark:border-white/5 bg-white/40 dark:bg-[#121214]/40 backdrop-blur-sm">
        <div>
          <h1 className="text-base font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
            Contest Image Health
          </h1>
          <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5">
            {stats.total > 0
              ? `Monitoring ${stats.total} contest images — ${stats.broken} broken, ${stats.no_image} missing${stats.stale > 0 ? `, ${stats.stale} stale` : ''}`
              : 'Check the health of contest images across all sources'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDeepCheckDialog(true)}
            disabled={!!deepCheck}
            title="Re-test every image URL against the live web and save the result"
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
            onClick={() => {
              fetchContests();
              toast.success('Refreshed');
            }}
            className="p-1.5 rounded-lg border border-neutral-200/50 dark:border-white/5 bg-white dark:bg-[#18181b] hover:bg-neutral-50 dark:hover:bg-white/5 text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-all shadow-sm flex items-center gap-1.5 text-[11.5px] font-medium"
          >
            <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats Summary Cards */}
      <div className="shrink-0 px-6 py-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        {[
          { key: 'total', label: 'Total Contests', value: stats.total, icon: Globe, color: 'text-neutral-500', bg: 'bg-neutral-100 dark:bg-neutral-800/50' },
          { key: 'healthy', label: 'Healthy', value: stats.healthy, icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-500', bg: 'bg-emerald-500/10' },
          { key: 'no_image', label: 'No Image', value: stats.no_image, icon: FileWarning, color: 'text-neutral-500', bg: 'bg-neutral-500/10' },
          { key: 'no_backup', label: 'No Backup', value: stats.no_backup, icon: AlertTriangle, color: 'text-amber-600 dark:text-amber-500', bg: 'bg-amber-500/10' },
          { key: 'broken', label: 'Broken', value: stats.broken, icon: Ban, color: 'text-red-600 dark:text-red-500', bg: 'bg-red-500/10' },
          { key: 'stale', label: 'Stale', value: stats.stale, icon: Clock, color: 'text-sky-600 dark:text-sky-500', bg: 'bg-sky-500/10', hint: 'Never checked, or last checked over 30 days ago' },
          { key: 'unknown', label: 'Unknown', value: stats.unknown, icon: HelpCircle, color: 'text-neutral-500', bg: 'bg-neutral-500/10', hint: 'Image record has no status at all — normally 0 once the checker has run' },
        ].map((stat) => (
          <button
            key={stat.key}
            onClick={() => {
              if (stat.key === 'total') { setActiveFilter('all'); }
              else { setActiveFilter(stat.key); }
              setPage(1);
            }}
            title={stat.hint || undefined}
            className={`bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 p-4 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex items-center justify-between group hover:border-neutral-300 dark:hover:border-neutral-800 transition-all cursor-pointer ${
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

      {/* Control Bar */}
      <div className="shrink-0 px-6 pb-4 flex flex-col md:flex-row gap-4 items-center justify-between">
        {/* Search */}
        <div className="w-full md:w-80 relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-neutral-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, source, category..."
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
          {/* Bulk actions — always visible, counts update live with selection */}
          {(checkedContests.size > 0 || isSelectingAllMatching) && (
            <div className="flex items-center gap-2">
              {checkedContests.size > 0 && (
                <>
                  <button
                    onClick={handleBulkBackup}
                    disabled={isBulkBackingUp}
                    className="px-3 py-1.5 rounded-lg border border-neutral-200/50 dark:border-white/5 bg-white dark:bg-[#18181b] hover:bg-neutral-50 dark:hover:bg-white/5 text-neutral-600 hover:text-neutral-900 dark:hover:text-white transition-all shadow-sm flex items-center gap-1.5 text-[13px] font-medium disabled:opacity-40"
                  >
                    {isBulkBackingUp ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <CloudDownload size={12} />
                    )}
                    Backup ({checkedContests.size})
                  </button>
                  <button
                    onClick={handleBulkRecheck}
                    disabled={isBulkRechecking}
                    className="px-3 py-1.5 rounded-lg border border-neutral-200/50 dark:border-white/5 bg-white dark:bg-[#18181b] hover:bg-neutral-50 dark:hover:bg-white/5 text-neutral-600 hover:text-neutral-900 dark:hover:text-white transition-all shadow-sm flex items-center gap-1.5 text-[13px] font-medium disabled:opacity-40"
                  >
                    {isBulkRechecking ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <RefreshCw size={12} />
                    )}
                    Re-check ({checkedContests.size})
                  </button>
                </>
              )}
              {isSelectingAllMatching && (
                <span className="flex items-center gap-1.5 text-[13px] text-neutral-400">
                  <Loader2 size={12} className="animate-spin" />
                  Fetching all matching contests...
                </span>
              )}
            </div>
          )}

          {/* Facet filters — narrow by pipeline metadata */}
          <select
            value={categoryFilter}
            onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
            className="py-2 pl-2.5 pr-7 rounded-lg bg-white dark:bg-[#151518] border border-neutral-200/60 dark:border-white/5 text-[11.5px] font-medium text-neutral-600 dark:text-neutral-300 focus:outline-none focus:border-neutral-400 dark:focus:border-neutral-700 shadow-sm cursor-pointer max-w-[170px]"
          >
            <option value="">All Categories</option>
            {facets.categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
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

          {/* Filters */}
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

      {/* Select-all-matching banner — shown when the whole current page is selected but more matching contests exist */}
      {!isLoading && contests.length > 0 && contests.every(c => checkedContests.has(c.id)) && pagination.total > contests.length && (
        <div className="shrink-0 px-6 pb-4 flex items-center justify-between">
          <p className="text-[13px] text-neutral-500">
            All <span className="font-semibold text-neutral-700 dark:text-neutral-300">{contests.length}</span> contests on this page are selected.
          </p>
          <button
            onClick={handleSelectAllMatching}
            disabled={isSelectingAllMatching || checkedContests.size >= pagination.total || isBulkBackingUp}
            className="px-3 py-1.5 rounded-lg border border-blue-200/60 dark:border-blue-500/25 bg-blue-500/5 hover:bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[13px] font-semibold transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-40"
          >
            {isSelectingAllMatching ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Check size={12} />
            )}
            {checkedContests.size >= pagination.total
              ? `All ${pagination.total} selected`
              : `Select all ${pagination.total} matching`}
          </button>
        </div>
      )}

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
            <p className="text-[13px] text-neutral-400 mt-1">
              {debouncedSearch ? 'Try adjusting your search or filter' : 'Contests will appear once data is synced from the scrapping pipeline'}
            </p>
          </div>
        ) : (
          /* Table View */
          <div className="bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 rounded-xl overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.01)]">
            <div className="min-w-full divide-y divide-neutral-200/50 dark:divide-white/5">
              {/* Table Headers */}
              <div className="bg-neutral-50/50 dark:bg-neutral-900/30 px-5 py-3 flex items-center text-[10.5px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
                <div className="w-[3%] flex items-center">
                  <input
                    ref={headerCheckRef}
                    type="checkbox"
                    checked={contests.length > 0 && contests.every(c => checkedContests.has(c.id))}
                    onChange={selectAll}
                    disabled={isBulkBackingUp}
                    className="rounded border-neutral-300 dark:border-neutral-700 disabled:opacity-40"
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
              <div className="divide-y divide-neutral-200/50 dark:divide-white/5">
                {contests.map((contest) => {
                  const statusCfg = getStatusConfig(contest);
                  const StatusIconCmp = statusCfg.icon;
                  return (
                    <div
                      key={contest.id}
                      onClick={() => handleOpenDetails(contest)}
                      className={`px-5 py-2.5 flex items-center hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors cursor-pointer text-xs text-neutral-700 dark:text-neutral-300 ${
                        selectedContest?.id === contest.id ? 'bg-neutral-100/60 dark:bg-white/5 font-medium' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <div className="w-[3%] pr-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={checkedContests.has(contest.id)}
                          onChange={() => toggleSelect(contest.id)}
                          disabled={isBulkBackingUp}
                          className="rounded border-neutral-300 dark:border-neutral-700 disabled:opacity-40"
                        />
                      </div>

                      {/* Status dot */}
                      <div className="w-[4%] flex items-center">
                        <StatusIconCmp size={14} strokeWidth={1.5} style={{ color: statusCfg.color }} />
                      </div>

                      {/* Title */}
                      <div className="w-[28%] truncate pr-4">
                        <span className="truncate font-semibold text-neutral-900 dark:text-white block text-[12.5px]">
                          {contest.title}
                        </span>
                        {contest.image?.alt && (
                          <span className="text-[12px] text-neutral-400 dark:text-neutral-500 truncate block mt-0.5">
                            {contest.image.alt}
                          </span>
                        )}
                      </div>

                      {/* Category */}
                      <div className="w-[12%] pr-4 truncate">
                        {contest.category ? (
                          <span className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800/50 text-[12px] font-medium text-neutral-500 dark:text-neutral-400 border border-neutral-200/50 dark:border-white/5">
                            {contest.category}
                          </span>
                        ) : (
                          <span className="text-neutral-400">—</span>
                        )}
                      </div>

                      {/* Source */}
                      <div className="w-[10%] pr-4 flex items-center gap-1.5">
                        {contest.source?.name ? (
                          <>
                            <Globe size={11} className="text-neutral-400 shrink-0" />
                            <span className="truncate text-[13px]">{contest.source.name}</span>
                          </>
                        ) : (
                          <span className="text-neutral-400">—</span>
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
                          <span className={`px-1.5 py-0.5 rounded text-[12px] font-semibold ${STATUS_CONFIG.healthy.bg} ${STATUS_CONFIG.healthy.text} ${STATUS_CONFIG.healthy.border} border`}>
                            R2 Backup
                          </span>
                        ) : (
                          <span className="text-[10.5px] text-neutral-400">None</span>
                        )}
                      </div>

                      {/* Last Checked */}
                      <div className="w-[11%] pr-4 text-[13px] text-neutral-400 dark:text-neutral-500">
                        {contest.image?.lastCheckedAt
                          ? formatDate(contest.image.lastCheckedAt)
                          : 'Never'}
                      </div>

                      {/* Actions */}
                      <div className="w-[10%] text-right flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        {!contest.image?.backupUrl && contest.image?.primaryUrl && (
                          <button
                            onClick={() => handleBackup(contest)}
                            disabled={isBackingUp === contest.id}
                            className="p-1.5 rounded hover:bg-blue-500/10 text-neutral-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors disabled:opacity-30"
                            title="Backup image to R2"
                          >
                            {isBackingUp === contest.id ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <CloudDownload size={13} />
                            )}
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenUpload(contest)}
                          className="p-1.5 rounded hover:bg-emerald-500/10 text-neutral-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                          title="Upload replacement image"
                        >
                          <Upload size={13} />
                        </button>
                        <button
                          onClick={() => handleRecheck(contest)}
                          disabled={isRechecking === contest.id || !contest.image?.primaryUrl}
                          className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-white/5 text-neutral-500 hover:text-neutral-800 dark:hover:text-white transition-colors disabled:opacity-30"
                          title={contest.image?.primaryUrl ? 'Re-check image URL' : 'No image URL to check'}
                        >
                          {isRechecking === contest.id ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <RefreshCw size={13} />
                          )}
                        </button>
                        <button
                          onClick={() => handleOpenDetails(contest)}
                          className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-white/5 text-neutral-500 hover:text-neutral-800 dark:hover:text-white transition-colors"
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
            <span className="text-[13px] font-medium text-neutral-500">
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

      {/* Deep Check confirmation */}
      <ConfirmDialog
        open={deepCheckDialog}
        onClose={() => setDeepCheckDialog(false)}
        onConfirm={handleDeepCheck}
        title="Run a live deep check?"
        confirmLabel={stats.total > 0 ? `Check all ${stats.total} images` : 'Check all images'}
      >
        Every image URL is re-tested against the live web and the result is saved — broken flags then reflect reality. Runs in background batches on this page (a few minutes for ~1000 images); browsing stays instant and uses stored statuses.
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
                {/* Header */}
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                    <CloudDownload size={18} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-xs font-bold text-neutral-900 dark:text-white uppercase tracking-wide">
                      {bulkProgress.done ? 'Backup Complete' : 'Backing Up Images'}
                    </h3>
                    <p className="text-[12px] text-neutral-400 mt-0.5">
                      {bulkProgress.done
                        ? `${bulkProgress.succeeded} succeeded, ${bulkProgress.failed} failed`
                        : `Processing ${bulkProgress.processed} of ${bulkProgress.total}`}
                    </p>
                  </div>
                </div>

                {/* Progress bar */}
                <div>
                  <div className="h-2 rounded-full bg-neutral-100 dark:bg-neutral-900 border border-neutral-200/40 dark:border-white/5 overflow-hidden">
                    <div
                      className="h-full bg-blue-500 transition-all duration-300 ease-out"
                      style={{ width: `${bulkProgress.total ? Math.round((bulkProgress.processed / bulkProgress.total) * 100) : 0}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-[12px] text-neutral-400">
                      {bulkProgress.total ? Math.round((bulkProgress.processed / bulkProgress.total) * 100) : 0}%
                    </span>
                    <span className="text-[12px] flex items-center gap-2">
                      <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                        <Check size={11} /> {bulkProgress.succeeded}
                      </span>
                      <span className="flex items-center gap-1 text-red-500 font-semibold">
                        <X size={11} /> {bulkProgress.failed}
                      </span>
                    </span>
                  </div>
                </div>

                {/* Failure summary */}
                {bulkProgress.errors.length > 0 && (
                  <div className="bg-red-500/5 border border-red-500/15 rounded-lg p-3 max-h-40 overflow-y-auto custom-scrollbar">
                    <p className="text-[11px] font-bold text-red-500/80 uppercase tracking-wider mb-1.5">
                      Failed ({bulkProgress.errors.length})
                    </p>
                    <ul className="space-y-1">
                      {bulkProgress.errors.slice(0, 8).map((err, i) => (
                        <li key={i} className="text-[12px] text-red-600/80 dark:text-red-400/80 flex items-start gap-1.5">
                          <AlertTriangle size={10} className="shrink-0 mt-0.5" />
                          <span className="break-all">{err.reason}</span>
                        </li>
                      ))}
                      {bulkProgress.errors.length > 8 && (
                        <li className="text-[12px] text-neutral-400">…and {bulkProgress.errors.length - 8} more</li>
                      )}
                    </ul>
                  </div>
                )}

                {/* Footer */}
                <div className="flex gap-3 pt-1">
                  <button
                    onClick={() => setBulkProgress(null)}
                    disabled={!bulkProgress.done}
                    className="flex-1 py-2 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
                  >
                    {bulkProgress.done ? 'Done' : 'Working...'}
                  </button>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

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
              <p className="text-[13px] font-semibold text-neutral-800 dark:text-neutral-200">
                {REALTIME_STATUS[recheckResult.status]?.label || recheckResult.status}
              </p>
              <p className="text-[12px] text-neutral-400 mt-0.5 break-all">
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
                <span className="text-[12px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
                  Contest Image Details
                </span>
                <button
                  onClick={() => setSelectedContest(null)}
                  className="p-1 rounded-lg hover:bg-neutral-100 dark:hover:bg-white/5 text-neutral-400 hover:text-neutral-800 dark:hover:text-white transition-colors"
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
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-bold ${cfg.bg} ${cfg.text} ${cfg.border} border`}>
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
                    <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800/50 text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                      {selectedContest.category}
                    </span>
                  )}
                </div>

                {/* Image Preview */}
                <div className="bg-neutral-100 dark:bg-neutral-900/30 border border-neutral-200/40 dark:border-white/5 rounded-xl p-3 shadow-inner flex items-center justify-center min-h-[140px] overflow-hidden group/viewer relative">
                  {selectedContest.image?.primaryUrl && selectedContest.imageStatus !== 'no_image' ? (
                    <div className="max-h-[180px] w-full flex items-center justify-center relative">
                      <ImagePreview src={selectedContest.image.primaryUrl} size="lg" />
                      <a
                        href={selectedContest.image.primaryUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="absolute top-2 right-2 p-1.5 rounded-lg bg-white/90 dark:bg-black/60 text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white shadow-sm transition-colors"
                        title="Open full image in a new tab"
                      >
                        <Maximize2 size={13} />
                      </a>
                      <button
                        onClick={() => handleCopyPrimaryUrl(selectedContest)}
                        className="absolute top-2 right-9 p-1.5 rounded-lg bg-white/90 dark:bg-black/60 text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white shadow-sm transition-colors"
                        title="Copy image URL"
                      >
                        {isPrimaryUrlCopied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                      </button>
                    </div>
                  ) : selectedContest.image?.backupUrl ? (
                    <div className="max-h-[180px] w-full flex items-center justify-center relative">
                      <ImagePreview src={selectedContest.image.backupUrl} size="lg" />
                    </div>
                  ) : (
                    <div className="py-10 text-center">
                      <ImageIcon size={32} className="text-neutral-400 dark:text-neutral-600 mx-auto mb-2" />
                      <p className="text-[12px] text-neutral-400">No image available</p>
                    </div>
                  )}
                </div>

                {/* Context for Generation */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="block text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Context for Image Generation</span>
                    {!isLoadingSelectedDetails && selectedContestDetails && (
                      <button
                        onClick={handleCopyContext}
                        className="flex items-center gap-1.5 px-2 py-1 rounded bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200 dark:hover:bg-white/10 text-[11px] font-medium text-neutral-500 hover:text-neutral-800 dark:hover:text-white transition-colors"
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
                        <span className="text-[12px] text-neutral-400">Loading full details...</span>
                      </div>
                    ) : (
                      <div className="space-y-3 text-[13px]">
                        <div>
                          <span className="text-[11px] font-bold text-neutral-400 uppercase block">Description</span>
                          {selectedContestDetails?.description ? (
                            <p className="text-neutral-600 dark:text-neutral-400 mt-0.5 leading-relaxed break-words whitespace-pre-line">{selectedContestDetails.description}</p>
                          ) : (
                            <span className="text-neutral-400 italic mt-0.5 block">No description</span>
                          )}
                        </div>
                        {selectedContestDetails?.tags?.length > 0 && (
                          <div>
                            <span className="text-[11px] font-bold text-neutral-400 uppercase block">Tags</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {selectedContestDetails.tags.map((tag, i) => (
                                <span key={i} className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800/50 text-[11px] text-neutral-500 dark:text-neutral-400 border border-neutral-200/50 dark:border-white/5">
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

                {/* Image Source Details */}
                <div className="space-y-2">
                  <span className="block text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Image Source</span>
                  <div className="bg-neutral-50/50 dark:bg-[#1b1b1e]/30 border border-neutral-200/30 dark:border-white/5 rounded-xl p-3 space-y-2.5">
                    <div className="flex items-start gap-2">
                      <ExternalLink size={12} className="text-neutral-400 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <span className="text-[10px] font-bold text-neutral-400 uppercase">Primary URL</span>
                        <p className="text-[12px] font-mono text-neutral-700 dark:text-neutral-400 break-all mt-0.5">
                          {selectedContest.image?.primaryUrl || '—'}
                        </p>
                      </div>
                    </div>
                    {selectedContest.image?.originalDomain && (
                      <div className="flex items-center gap-2">
                        <Globe size={12} className="text-neutral-400 shrink-0" />
                        <span className="text-[12px] text-neutral-500">
                          Domain: <span className="font-mono text-neutral-700 dark:text-neutral-400">{selectedContest.image.originalDomain}</span>
                        </span>
                      </div>
                    )}
                    {selectedContest.image?.alt && (
                      <div className="flex items-start gap-2">
                        <ImageIcon size={12} className="text-neutral-400 shrink-0 mt-0.5" />
                        <span className="text-[12px] text-neutral-500">{selectedContest.image.alt}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Backup Status */}
                <div className="space-y-2">
                  <span className="block text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Backup (R2)</span>
                  <div className="bg-neutral-50/50 dark:bg-[#1b1b1e]/30 border border-neutral-200/30 dark:border-white/5 rounded-xl p-3 space-y-2">
                    {selectedContest.image?.backupUrl ? (
                      <>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 size={12} className="text-emerald-500" />
                          <span className="text-[12px] font-semibold text-emerald-600 dark:text-emerald-400">Backed up to R2</span>
                        </div>
                        <p className="text-[11px] font-mono text-neutral-400 break-all">{selectedContest.image.backupUrl}</p>
                        {selectedContest.image?.backupFormat && (
                          <span className="inline-flex px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold">
                            {selectedContest.image.backupFormat.toUpperCase()}
                          </span>
                        )}
                      </>
                    ) : (
                      <div className="flex items-center gap-2">
                        <AlertTriangle size={12} className="text-amber-500" />
                        <span className="text-[12px] text-amber-600 dark:text-amber-400 font-medium">No backup stored</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Source Info */}
                <div className="space-y-2">
                  <span className="block text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Source</span>
                  <div className="bg-neutral-50/50 dark:bg-[#1b1b1e]/30 border border-neutral-200/30 dark:border-white/5 rounded-xl p-3 space-y-2 text-[12px]">
                    {selectedContest.source?.name && (
                      <div className="flex items-center gap-2">
                        <Globe size={12} className="text-neutral-400 shrink-0" />
                        <span className="text-neutral-700 dark:text-neutral-400 font-medium">{selectedContest.source.name}</span>
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
                        {selectedContest.image?.primaryUrl && (
                          <button
                            onClick={() => handleCopyPrimaryUrl(selectedContest)}
                            className="ml-auto flex items-center gap-1 px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200 dark:hover:bg-white/10 text-neutral-500 hover:text-neutral-800 dark:hover:text-white transition-colors"
                            title="Copy image URL"
                          >
                            <Link2 size={11} />
                            Copy URL
                          </button>
                        )}
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
                    onClick={() => {
                      if (selectedContest.image?.primaryUrl) {
                        window.open(selectedContest.image.primaryUrl, '_blank', 'noopener,noreferrer');
                      } else {
                        toast.error('No primary image URL to open');
                      }
                    }}
                    disabled={!selectedContest.image?.primaryUrl}
                    className="flex-1 py-2 border border-neutral-200 dark:border-white/5 rounded-lg text-xs font-semibold text-neutral-500 hover:text-neutral-800 dark:hover:text-white bg-white dark:bg-[#18181b] hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-40"
                  >
                    <Maximize2 size={12} />
                    Open Image
                  </button>
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
                    Re-check
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
                {/* Header */}
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                    <Upload size={18} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-xs font-bold text-neutral-900 dark:text-white uppercase tracking-wide">
                      Upload Contest Image
                    </h3>
                    <p className="text-[12px] text-neutral-400 mt-0.5">
                      Paste a URL (http or data:), drop/paste a file (Ctrl+V), or upload — runs in the background
                    </p>
                  </div>
                </div>

                {/* Source mode toggle: file upload vs URL */}
                <div className="p-0.5 rounded-lg bg-neutral-200/50 dark:bg-neutral-900/60 border border-neutral-200/40 dark:border-white/5 flex gap-0.5 shadow-inner">
                  {[
                    { key: 'url', label: 'Paste URL', icon: Globe },
                    { key: 'file', label: 'Upload File', icon: FileUp },
                  ].map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => { setUploadMode(opt.key); setUrlPreviewError(false); }}
                      className={`flex-1 px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1.5 ${
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

                {/* Contest Details (for reference) */}
                <div className="bg-neutral-50/50 dark:bg-[#1b1b1e]/30 border border-neutral-200/30 dark:border-white/5 rounded-xl p-4 space-y-2.5">
                  <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider flex items-center gap-1">
                    <FileUp size={10} />
                    Contest Reference
                  </span>

                  {isLoadingDetails ? (
                    <div className="flex items-center gap-2 py-2">
                      <Loader2 size={12} className="animate-spin text-neutral-400" />
                      <span className="text-[12px] text-neutral-400">Loading details...</span>
                    </div>
                  ) : (
                    <div className="space-y-2 text-[13px]">
                      <div>
                        <span className="text-[11px] font-bold text-neutral-400 uppercase block">Title</span>
                        <p className="text-neutral-900 dark:text-neutral-100 font-semibold mt-0.5">{contestDetails?.title || uploadTarget.title}</p>
                      </div>
                      {contestDetails?.description && (
                        <div>
                          <span className="text-[11px] font-bold text-neutral-400 uppercase block">Description</span>
                          <p className="text-neutral-600 dark:text-neutral-400 mt-0.5 leading-relaxed">{contestDetails.description}</p>
                        </div>
                      )}
                      <div className="flex gap-4">
                        {contestDetails?.category && (
                          <div>
                            <span className="text-[11px] font-bold text-neutral-400 uppercase block">Category</span>
                            <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800/50 text-[12px] font-medium text-neutral-600 dark:text-neutral-400">
                              {contestDetails.category}
                            </span>
                          </div>
                        )}
                        {contestDetails?.tags?.length > 0 && (
                          <div>
                            <span className="text-[11px] font-bold text-neutral-400 uppercase block">Tags</span>
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {contestDetails.tags.slice(0, 5).map((tag, i) => (
                                <span key={i} className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800/50 text-[11px] text-neutral-500 dark:text-neutral-400">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      {contestDetails?.source?.name && (
                        <div>
                          <span className="text-[11px] font-bold text-neutral-400 uppercase block">Source</span>
                          <p className="text-neutral-600 dark:text-neutral-400 mt-0.5">{contestDetails.source.name}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* File Drop Zone */}
                {uploadMode === 'file' && (
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
                      <p className="text-[13px] font-medium text-neutral-700 dark:text-neutral-300">
                        {uploadFile.name}
                      </p>
                      <p className="text-[12px] text-neutral-400">
                        {(uploadFile.size / 1024).toFixed(1)} KB — Will be compressed to WebP @80%
                      </p>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setUploadFile(null);
                          setUploadPreview(null);
                        }}
                        className="text-[12px] text-red-500 hover:text-red-600 font-medium"
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
                      <p className="text-[12px] text-neutral-400 dark:text-neutral-500">
                        PNG, JPEG, WebP — up to 15MB
                      </p>
                    </div>
                  )}
                </div>
                )}

                {/* URL Source */}
                {uploadMode === 'url' && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 bg-white dark:bg-[#1b1b1e] border border-neutral-200/60 dark:border-white/5 rounded-lg px-3 py-2 focus-within:border-neutral-400 dark:focus-within:border-neutral-600 transition-all shadow-sm">
                      <Globe size={14} className="text-neutral-400 shrink-0" />
                      <input
                        type="url"
                        value={uploadUrl}
                        onChange={(e) => { setUploadUrl(e.target.value); setUrlPreviewError(false); setUrlPreviewSize(null); }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && isValidHttpUrl(uploadUrl)) {
                            e.preventDefault();
                            handleUploadSubmit(activeFilter === 'broken');
                          }
                        }}
                        placeholder="https://example.com/contest-image.jpg"
                        className="w-full bg-transparent text-xs text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none"
                      />
                      {uploadUrl && (
                        <button
                          onClick={() => { setUploadUrl(''); setUrlPreviewError(false); setUrlPreviewSize(null); }}
                          className="shrink-0 text-neutral-400 hover:text-neutral-800 dark:hover:text-white transition-colors"
                        >
                          <X size={12} />
                        </button>
                      )}
                      <button
                        onClick={useActiveTabUrl}
                        className="px-2 py-1 rounded-md bg-neutral-100 dark:bg-neutral-800/50 text-[12px] font-semibold text-neutral-600 dark:text-neutral-400 border border-neutral-200/40 dark:border-white/5 hover:bg-neutral-200 dark:hover:bg-neutral-700/50 transition-colors shrink-0"
                      >
                        Use active tab
                      </button>
                    </div>

                    {urlPreviewError && (
                      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-[12px] text-amber-600 dark:text-amber-400 flex items-start gap-2">
                        <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                        <span>
                          Couldn't load a preview from this URL. The server will still attempt to fetch it — double-check it points directly to an image file.
                        </span>
                      </div>
                    )}
                    {uploadUrl && !urlPreviewError && (
                      <div className="relative max-h-[200px] overflow-hidden rounded-lg border border-neutral-200/50 dark:border-white/10 bg-neutral-100 dark:bg-neutral-900/30">
                        <img
                          src={uploadUrl}
                          alt="URL preview"
                          className="max-h-[200px] w-full object-contain"
                          onError={() => setUrlPreviewError(true)}
                          onLoad={(e) => {
                            const img = e.currentTarget;
                            if (img.naturalWidth && img.naturalHeight) {
                              setUrlPreviewSize({ w: img.naturalWidth, h: img.naturalHeight });
                            }
                          }}
                        />
                        {urlPreviewSize && urlPreviewSize.w < 200 && urlPreviewSize.h < 200 && (
                          <div className="absolute top-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/90 text-white text-[10px] font-bold shadow-sm">
                            <AlertTriangle size={10} />
                            Low-res source ({urlPreviewSize.w}×{urlPreviewSize.h}) — will look blurry when enlarged
                          </div>
                        )}
                      </div>
                    )}
                    {!urlPreviewError && !uploadUrl && (
                      <div className="rounded-lg border border-dashed border-neutral-300/40 dark:border-neutral-700/40 bg-neutral-50/30 dark:bg-[#1b1b1e]/20 px-3 py-5 text-center">
                        <Globe size={20} className="mx-auto text-neutral-400 dark:text-neutral-500 mb-1.5" strokeWidth={1.5} />
                        <p className="text-[13px] font-medium text-neutral-500 dark:text-neutral-400">
                          Paste a working image URL to preview it here
                        </p>
                      </div>
                    )}

                    <p className="text-[12px] text-neutral-400 dark:text-neutral-500 leading-relaxed">
                      http(s) URLs are fetched server-side; data: URLs are decoded in the browser and uploaded
                      as a file. Either way it is compressed to WebP (best-effort AVIF) and stored as the
                      contest's primary + backup on Cloudflare R2.
                    </p>
                  </div>
                )}

                {/* Footer Buttons */}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={handleCloseUpload}
                    className="px-3 py-2 border border-neutral-200 dark:border-white/5 rounded-lg text-xs font-semibold text-neutral-500 hover:text-neutral-800 dark:hover:text-white bg-white dark:bg-[#18181b] hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors shadow-sm"
                  >
                    Cancel
                  </button>
                  {activeFilter === 'broken' && (
                    <button
                      onClick={() => {
                        const next = advanceToNextBroken(uploadTarget);
                        if (next) {
                          handleOpenUpload(next);
                        } else {
                          toast.success('No other broken images in this view');
                          handleCloseUpload();
                        }
                      }}
                      className="px-3 py-2 border border-neutral-200 dark:border-white/5 rounded-lg text-xs font-semibold text-neutral-500 hover:text-neutral-800 dark:hover:text-white bg-white dark:bg-[#18181b] hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors shadow-sm flex items-center gap-1.5"
                      title="Move to the next broken contest without saving"
                    >
                      <SkipForward size={12} />
                      Skip
                    </button>
                  )}
                  <button
                    onClick={() => handleUploadSubmit(activeFilter === 'broken')}
                    disabled={uploadMode === 'file' ? !uploadFile : !isValidHttpUrl(uploadUrl)}
                    className="flex-1 py-2 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-40 transition-all shadow-sm flex items-center justify-center gap-1.5"
                  >
                    <Upload size={12} />
                    {activeFilter === 'broken'
                      ? 'Save & Next Broken'
                      : uploadMode === 'url'
                        ? 'Fetch & Backup'
                        : 'Upload & Replace'}
                  </button>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* Background upload queue pill — floats bottom-right while jobs run,
          visible with or without the modal open. */}
      {uploadQueue.length > 0 && (
        <div className="fixed bottom-4 right-4 z-[130]">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-[#1b1b1e] rounded-xl border border-neutral-200/60 dark:border-white/10 shadow-2xl overflow-hidden max-w-xs"
          >
            <button
              onClick={() => setQueueOpen(o => !o)}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left"
            >
              {queueActiveCount > 0 ? (
                <Loader2 size={14} className="animate-spin text-emerald-600 dark:text-emerald-400 shrink-0" />
              ) : queueFailedCount > 0 ? (
                <AlertTriangle size={14} className="text-red-500 shrink-0" />
              ) : (
                <CheckCheck size={14} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
              )}
              <span className="text-[13px] font-semibold text-neutral-800 dark:text-neutral-100 flex-1">
                {queueActiveCount > 0
                  ? `Replacing ${queueActiveCount} image${queueActiveCount > 1 ? 's' : ''}…`
                  : queueFailedCount > 0
                    ? `${queueDoneCount} replaced, ${queueFailedCount} failed`
                    : `${queueDoneCount} image${queueDoneCount > 1 ? 's' : ''} replaced`}
              </span>
              {queueFailedCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 text-[11px] font-bold">
                  {queueFailedCount}
                </span>
              )}
              <ChevronRight
                size={12}
                className={`text-neutral-400 transition-transform ${queueOpen ? 'rotate-90' : ''}`}
              />
            </button>
            {queueOpen && (
              <div className="max-h-44 overflow-y-auto custom-scrollbar border-t border-neutral-200/50 dark:border-white/5">
                {uploadQueue.map(job => (
                  <div
                    key={job.id}
                    className="flex items-center gap-2 px-3.5 py-1.5 border-b border-neutral-100 dark:border-white/5 last:border-0"
                  >
                    {job.status === 'active' ? (
                      <Loader2 size={10} className="animate-spin text-neutral-400 shrink-0" />
                    ) : job.status === 'done' ? (
                      <CheckCircle2 size={10} className="text-emerald-500 shrink-0" />
                    ) : (
                      <AlertTriangle size={10} className="text-red-500 shrink-0" />
                    )}
                    <span className="text-[12px] text-neutral-700 dark:text-neutral-200 truncate flex-1" title={job.title}>
                      {job.title}
                    </span>
                    {job.status === 'failed' && (
                      <span className="text-[11px] text-red-500 truncate max-w-[100px]" title={job.message}>
                        {job.message}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default ContestImages;
