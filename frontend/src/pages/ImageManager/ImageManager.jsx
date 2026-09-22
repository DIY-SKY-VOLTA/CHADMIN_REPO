import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search,
  X,
  Trash2,
  AlertTriangle,
  Eye,
  Image as ImageIcon,
  User,
  Calendar,
  FileType,
  Maximize2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  HardDrive,
  Layers,
  Grid,
  List,
  RefreshCw,
  Clock,
  Link as LinkIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import adminAPI from '@/api/adminAPI';

const FILTER_OPTIONS = [
  { key: 'all', label: 'All Images' },
  { key: 'active', label: 'Active' },
  { key: 'trashed', label: 'Trashed' },
  { key: 'unused', label: 'Unused' },
];

const formatBytes = (bytes) => {
  if (!bytes || bytes === 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(1)} ${units[i]}`;
};

// What the platform actually stores/serves — the optimized WebP master.
// Falls back to originalSizeBytes only for legacy records predating the
// compression gate (or Sanity proxy paths with no size recorded).
const getStoredSize = (img) => img?.storedSizeBytes || null;

// Savings from the compression gate (WebP q88, max 1600px) vs the original file.
const getCompressionPct = (img) => {
  if (!img?.storedSizeBytes || !img?.originalSizeBytes || img.storedSizeBytes >= img.originalSizeBytes) return null;
  return Math.round((1 - img.storedSizeBytes / img.originalSizeBytes) * 100);
};

const getThumbnailUrl = (variants) => {
  if (!variants) return null;
  return variants.thumbnail?.url || variants.medium?.url || variants.original?.url || null;
};

const getPreviewUrl = (variants) => {
  if (!variants) return null;
  return variants.large?.url || variants.original?.url || variants.medium?.url || null;
};

const ImageManager = () => {
  const [images, setImages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1, limit: 50 });
  
  // Redesign states
  const [layoutMode, setLayoutMode] = useState('grid'); // 'grid' | 'list'
  const [selectedImage, setSelectedImage] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isFullscreenPreview, setIsFullscreenPreview] = useState(false);
  
  const searchTimerRef = useRef(null);

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

  // Fetch images
  const fetchImages = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await adminAPI.get('/images', {
        params: {
          page,
          limit: 50,
          search: debouncedSearch,
          filter: activeFilter,
        },
      });

      if (res.success) {
        setImages(res.images || []);
        setPagination(res.pagination || { total: 0, pages: 1, limit: 50 });
      }
    } catch (err) {
      toast.error(err?.message || 'Failed to load images');
    } finally {
      setIsLoading(false);
    }
  }, [page, debouncedSearch, activeFilter]);

  useEffect(() => {
    fetchImages();
  }, [fetchImages]);

  // Search handlers
  const handleClearSearch = () => {
    setSearch('');
    setDebouncedSearch('');
    setPage(1);
  };

  // Filter change
  const handleFilterChange = (filter) => {
    setActiveFilter(filter);
    setPage(1);
  };

  // Delete handler
  const handleDelete = async (imageId, force = false) => {
    setIsDeleting(true);
    try {
      const endpoint = force ? `/images/${imageId}/force` : `/images/${imageId}`;
      const res = await adminAPI.delete(endpoint);

      if (res.success) {
        toast.success(res.message || 'Image deleted');
        setDeleteTarget(null);
        setSelectedImage(null);
        fetchImages();
      }
    } catch (err) {
      toast.error(err?.message || 'Failed to delete image');
    } finally {
      setIsDeleting(false);
    }
  };

  // Pagination
  const totalPages = Math.max(1, pagination.pages || 1);

  // Stats: stored = what we actually pay for (post-compression); original =
  // what users handed us. The gap is the compression gate's savings.
  const totalStorage = images.reduce((sum, img) => sum + (getStoredSize(img) || img.originalSizeBytes || 0), 0);
  const totalOriginal = images.reduce((sum, img) => sum + (img.originalSizeBytes || 0), 0);
  const totalSavedPct = totalOriginal > 0 && totalStorage > 0 && totalStorage < totalOriginal
    ? Math.round((1 - totalStorage / totalOriginal) * 100)
    : null;
  const activeCount = images.filter(img => !img.deletedAt).length;
  const trashedCount = images.filter(img => img.deletedAt).length;

  return (
    <div className="h-full flex flex-col bg-neutral-50/30 dark:bg-[#0d0d0f]/20 selection:bg-neutral-200/50 dark:selection:bg-neutral-400/40">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-neutral-200/50 dark:border-white/5 bg-white/40 dark:bg-[#121214]/40 backdrop-blur-sm">
        <div>
          <h1 className="text-base font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
            Image Library
          </h1>
          <p className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-0.5">
            {pagination.total > 0
              ? `Manage and inspect ${pagination.total} image assets across the network`
              : 'Inspect, preview, and unlink uploaded media files'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            fetchImages();
            toast.success('Library refreshed');
          }}
          className="p-1.5 rounded-lg border border-neutral-200/50 dark:border-white/5 bg-white dark:bg-[#18181b] hover:bg-neutral-50 dark:hover:bg-white/5 text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-all shadow-sm flex items-center gap-1.5 text-[11px] font-medium"
        >
          <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Reactive stats cards */}
      <div className="shrink-0 p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Assets */}
        <div className="bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 p-4 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex items-center justify-between group hover:border-neutral-300 dark:hover:border-neutral-800 transition-all">
          <div className="space-y-1">
            <span className="text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Total Assets</span>
            <p className="text-xl font-bold text-neutral-800 dark:text-neutral-100 leading-none">{pagination.total || images.length}</p>
          </div>
          <div className="w-8 h-8 rounded-lg bg-neutral-100 dark:bg-neutral-800/50 flex items-center justify-center text-neutral-550">
            <ImageIcon size={15} strokeWidth={1.5} />
          </div>
        </div>

        {/* Storage Volume */}
        <div className="bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 p-4 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex items-center justify-between group hover:border-neutral-300 dark:hover:border-neutral-800 transition-all">
          <div className="space-y-1">
            <span className="text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Stored</span>
            <p className="text-xl font-bold text-neutral-800 dark:text-neutral-100 leading-none font-mono text-[16px]">{formatBytes(totalStorage)}</p>
            {totalSavedPct !== null && (
              <p className="text-[9px] text-emerald-600 dark:text-emerald-400 font-semibold">
                −{totalSavedPct}% vs originals ({formatBytes(totalOriginal)})
              </p>
            )}
          </div>
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-550">
            <HardDrive size={15} strokeWidth={1.5} />
          </div>
        </div>

        {/* Active Assets */}
        <div className="bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 p-4 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex items-center justify-between group hover:border-neutral-300 dark:hover:border-neutral-800 transition-all">
          <div className="space-y-1">
            <span className="text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Active Assets</span>
            <p className="text-xl font-bold text-neutral-800 dark:text-neutral-100 leading-none">{activeCount}</p>
          </div>
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-550">
            <Layers size={15} strokeWidth={1.5} />
          </div>
        </div>

        {/* Trashed Assets */}
        <div className="bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 p-4 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex items-center justify-between group hover:border-neutral-300 dark:hover:border-neutral-800 transition-all">
          <div className="space-y-1">
            <span className="text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Trash Bin</span>
            <p className="text-xl font-bold text-neutral-800 dark:text-neutral-100 leading-none">{trashedCount}</p>
          </div>
          <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center text-red-600 dark:text-red-550">
            <Trash2 size={15} strokeWidth={1.5} />
          </div>
        </div>
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
            placeholder="Search by filename, alt text..."
            className="w-full pl-9 pr-8 py-1.5 bg-white dark:bg-[#151518] border border-neutral-200/60 dark:border-white/5 rounded-lg text-xs text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:border-neutral-400 dark:focus:border-neutral-700 transition-all shadow-[0_1px_2px_rgba(0,0,0,0.01)]"
          />
          {search && (
            <button
              onClick={handleClearSearch}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-750 dark:hover:text-white"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Filter / View Segment Toggles */}
        <div className="w-full md:w-auto flex flex-wrap items-center gap-3 justify-end">
          {/* Filters Segmented Control */}
          <div className="p-0.5 rounded-lg bg-neutral-200/50 dark:bg-neutral-950/60 border border-neutral-200/40 dark:border-white/5 flex gap-0.5 shadow-inner">
            {FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => handleFilterChange(opt.key)}
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

          {/* Grid vs List Layout Toggles */}
          <div className="p-0.5 rounded-lg bg-neutral-200/50 dark:bg-neutral-950/60 border border-neutral-200/40 dark:border-white/5 flex gap-0.5 shadow-inner">
            <button
              onClick={() => setLayoutMode('grid')}
              className={`p-1 rounded-md transition-all ${
                layoutMode === 'grid'
                  ? 'bg-white dark:bg-[#1b1b1e] text-neutral-900 dark:text-white shadow-sm'
                  : 'text-neutral-500 dark:text-neutral-450 hover:text-neutral-750 dark:hover:text-white'
              }`}
              title="Grid Layout"
            >
              <Grid size={13} />
            </button>
            <button
              onClick={() => setLayoutMode('list')}
              className={`p-1 rounded-md transition-all ${
                layoutMode === 'list'
                  ? 'bg-white dark:bg-[#1b1b1e] text-neutral-900 dark:text-white shadow-sm'
                  : 'text-neutral-500 dark:text-neutral-450 hover:text-neutral-750 dark:hover:text-white'
              }`}
              title="List Layout"
            >
              <List size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Pane */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {isLoading ? (
          /* Shimmer Placeholder Loading */
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 animate-pulse">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="aspect-square bg-neutral-200/50 dark:bg-neutral-800 rounded-xl" />
            ))}
          </div>
        ) : images.length === 0 ? (
          <div className="bg-white dark:bg-[#151518]/40 border border-neutral-200/40 dark:border-white/5 rounded-2xl flex flex-col items-center justify-center py-20 shadow-sm">
            <ImageIcon size={28} strokeWidth={1.5} className="text-neutral-350 dark:text-neutral-600 mb-3" />
            <p className="text-xs font-semibold text-neutral-800 dark:text-neutral-300">
              {debouncedSearch ? 'No matching assets found' : 'No images in this folder'}
            </p>
            <p className="text-[11px] text-neutral-400 mt-1">Try tweaking filters or query names.</p>
          </div>
        ) : layoutMode === 'grid' ? (
          /* Apple finder card gallery view */
          <motion.div layout className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            <AnimatePresence mode="popLayout">
              {images.map((img) => (
                <motion.div
                  key={img.id}
                  layoutId={`card-${img.id}`}
                  onClick={() => setSelectedImage(img)}
                  className={`group relative aspect-square rounded-xl bg-white dark:bg-[#151518] border overflow-hidden cursor-pointer shadow-[0_1px_3px_rgba(0,0,0,0.01)] hover:shadow-md transition-all duration-300 ${
                    selectedImage?.id === img.id
                      ? 'border-neutral-500 dark:border-neutral-700 shadow-md scale-[0.98]'
                      : 'border-neutral-200/60 dark:border-white/5 hover:border-neutral-350 dark:hover:border-white/10'
                  }`}
                >
                  {/* Photo Container */}
                  <div className="absolute inset-0 bg-neutral-50/50 dark:bg-neutral-900/30 overflow-hidden flex items-center justify-center">
                    {getThumbnailUrl(img.variants) ? (
                      <img
                        src={getThumbnailUrl(img.variants)}
                        alt={img.alt || ''}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        loading="lazy"
                      />
                    ) : (
                      <ImageIcon size={18} className="text-neutral-300 dark:text-neutral-700" />
                    )}
                  </div>

                  {/* Dark Glass Overlay details */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 p-3 flex flex-col justify-end">
                    <p className="text-[10px] font-semibold text-white truncate">{img.originalFileName || 'Unnamed'}</p>
                    <p className="text-[8px] text-neutral-300 font-mono mt-0.5">
                      {formatBytes(getStoredSize(img) || img.originalSizeBytes)} • {img.sourceWidth && img.sourceHeight ? `${img.sourceWidth}x${img.sourceHeight}` : '—'}
                    </p>
                  </div>

                  {/* Status indicator badge */}
                  {img.deletedAt && (
                    <span className="absolute top-2.5 right-2.5 px-1.5 py-0.5 rounded bg-red-500/80 text-white text-[7px] font-bold tracking-wide backdrop-blur-sm">
                      TRASHED
                    </span>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        ) : (
          /* List View: Notion-style database table */
          <div className="bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 rounded-xl overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.01)]">
            <div className="min-w-full divide-y divide-neutral-200/50 dark:divide-white/5">
              {/* Table Headers */}
              <div className="bg-neutral-50/50 dark:bg-neutral-900/30 px-5 py-2.5 flex items-center text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
                <div className="w-[10%]">Preview</div>
                <div className="w-[30%]">Filename</div>
                <div className="w-[20%]">Uploaded By</div>
                <div className="w-[15%]">Size & Specs</div>
                <div className="w-[15%]">Status</div>
                <div className="w-[10%] text-right">Actions</div>
              </div>

              {/* Table Rows */}
              <div className="divide-y divide-neutral-150 dark:divide-white/5">
                {images.map((img) => (
                  <div
                    key={img.id}
                    onClick={() => setSelectedImage(img)}
                    className={`px-5 py-2 flex items-center hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors cursor-pointer text-xs text-neutral-700 dark:text-neutral-350 ${
                      selectedImage?.id === img.id ? 'bg-neutral-100/60 dark:bg-white/5 font-medium' : ''
                    }`}
                  >
                    {/* Thumbnail */}
                    <div className="w-[10%] pr-4">
                      <div className="w-8 h-8 rounded-lg overflow-hidden border border-neutral-200/50 dark:border-white/10 bg-neutral-100 flex items-center justify-center shrink-0 shadow-sm">
                        {getThumbnailUrl(img.variants) ? (
                          <img src={getThumbnailUrl(img.variants)} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <ImageIcon size={12} className="text-neutral-400" />
                        )}
                      </div>
                    </div>

                    {/* Filename */}
                    <div className="w-[30%] truncate pr-4">
                      <span className="truncate font-semibold text-neutral-900 dark:text-white block">
                        {img.originalFileName || 'Unnamed'}
                      </span>
                      {img.alt && (
                        <span className="text-[9px] text-neutral-400 dark:text-neutral-500 truncate block mt-0.5">
                          {img.alt}
                        </span>
                      )}
                    </div>

                    {/* User */}
                    <div className="w-[20%] pr-4 flex items-center gap-2">
                      <div className="w-5 h-5 rounded-md overflow-hidden bg-neutral-150 shrink-0 border border-neutral-200/30">
                        {img.user?.avatar ? (
                          <img src={img.user.avatar} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-neutral-100 dark:bg-[#18181b]">
                            <User size={8} className="text-neutral-400" />
                          </div>
                        )}
                      </div>
                      <span className="truncate text-[10px] text-neutral-500 dark:text-neutral-400">
                        {img.user?.username || 'Unknown'}
                      </span>
                    </div>

                    {/* Specs */}
                    <div className="w-[15%] pr-4 space-y-0.5 font-mono text-[9px] text-neutral-500">
                      <p className="font-semibold text-neutral-600 dark:text-neutral-400">{formatBytes(getStoredSize(img) || img.originalSizeBytes)}</p>
                      <p>{img.sourceWidth && img.sourceHeight ? `${img.sourceWidth}×${img.sourceHeight}` : '—'}</p>
                    </div>

                    {/* Status */}
                    <div className="w-[15%] pr-4">
                      {img.deletedAt ? (
                        <span className="px-1.5 py-0.5 rounded bg-red-500/10 text-red-650 dark:text-red-400 text-[8px] font-bold border border-red-500/10">
                          Trashed
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-650 dark:text-emerald-400 text-[8px] font-bold border border-emerald-500/10">
                          Active
                        </span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="w-[10%] text-right flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setSelectedImage(img)}
                        className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-white/5 text-neutral-450 hover:text-neutral-750 dark:hover:text-white transition-colors"
                        title="Quick View"
                      >
                        <Eye size={13} />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(img)}
                        className="p-1 rounded hover:bg-red-500/10 text-neutral-455 hover:text-red-650 dark:hover:text-red-400 transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
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

      {/* Slide-over Asset details panel */}
      <AnimatePresence>
        {selectedImage && (
          <>
            {/* Backdrop overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedImage(null)}
              className="fixed inset-0 z-40 bg-black/30 dark:bg-black/60 backdrop-blur-[2px]"
            />

            {/* Panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-white dark:bg-[#151518] border-l border-neutral-200/50 dark:border-white/5 shadow-2xl flex flex-col justify-between overflow-hidden"
            >
              {/* Drawer Header */}
              <div className="shrink-0 p-4 border-b border-neutral-200/50 dark:border-white/5 flex items-center justify-between">
                <span className="text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
                  Asset Details Inspector
                </span>
                <div className="flex gap-2">
                  {getPreviewUrl(selectedImage.variants) && (
                    <button
                      onClick={() => setIsFullscreenPreview(true)}
                      className="p-1 rounded-lg hover:bg-neutral-100 dark:hover:bg-white/5 text-neutral-400 hover:text-neutral-750 dark:hover:text-white transition-colors"
                      title="Fullscreen Preview"
                    >
                      <Maximize2 size={13} />
                    </button>
                  )}
                  <button
                    onClick={() => setSelectedImage(null)}
                    className="p-1 rounded-lg hover:bg-neutral-100 dark:hover:bg-white/5 text-neutral-400 hover:text-neutral-750 dark:hover:text-white transition-colors"
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>

              {/* Scrollable details view */}
              <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar text-xs">
                {/* Photo Viewer Frame */}
                <div className="bg-neutral-100 dark:bg-neutral-900/30 border border-neutral-200/40 dark:border-white/5 rounded-xl p-3 shadow-inner flex items-center justify-center max-h-[220px] overflow-hidden group/viewer relative">
                  {getPreviewUrl(selectedImage.variants) ? (
                    <img
                      src={getPreviewUrl(selectedImage.variants)}
                      alt={selectedImage.alt || ''}
                      className="max-h-[200px] object-contain rounded-lg shadow-sm"
                    />
                  ) : (
                    <div className="py-10 text-center">
                      <ImageIcon size={32} className="text-neutral-350 dark:text-neutral-600 mx-auto mb-2" />
                      <p className="text-[10px] text-neutral-400">Preview not available</p>
                    </div>
                  )}

                  {/* External Link Overlay Button */}
                  {getPreviewUrl(selectedImage.variants) && (
                    <a
                      href={getPreviewUrl(selectedImage.variants)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="absolute right-3.5 bottom-3.5 p-1.5 rounded-lg bg-black/60 hover:bg-black/80 text-white backdrop-blur-sm shadow opacity-0 group-hover/viewer:opacity-100 transition-opacity duration-200"
                    >
                      <ExternalLink size={12} />
                    </a>
                  )}
                </div>

                {/* Filename and Alt text */}
                <div className="space-y-1">
                  <h2 className="text-[12px] font-bold text-neutral-900 dark:text-white break-all leading-snug">
                    {selectedImage.originalFileName || 'Unnamed Asset'}
                  </h2>
                  {selectedImage.alt ? (
                    <p className="text-[10px] text-neutral-500 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-900/40 px-2 py-1 rounded border border-neutral-200/30 dark:border-white/5 leading-relaxed">
                      <span className="font-semibold text-neutral-400 mr-1 uppercase text-[8px]">ALT Text:</span>
                      {selectedImage.alt}
                    </p>
                  ) : (
                    <p className="text-[9px] text-neutral-400 dark:text-neutral-550 italic">No alternative text provided.</p>
                  )}
                </div>

                {/* Technical specs block */}
                <div className="space-y-2">
                  <span className="block text-[9px] font-semibold text-neutral-400 uppercase tracking-wider">
                    Technical Specifications
                  </span>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-neutral-50/50 dark:bg-[#1b1b1e]/30 border border-neutral-200/30 dark:border-white/5 rounded-xl p-3 shadow-sm">
                      <div className="flex items-center gap-1 text-[8px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wide">
                        <Maximize2 size={9} /> Dimensions
                      </div>
                      <p className="text-[11px] font-mono font-bold text-neutral-800 dark:text-neutral-200 mt-0.5">
                        {selectedImage.sourceWidth && selectedImage.sourceHeight
                          ? `${selectedImage.sourceWidth} × ${selectedImage.sourceHeight}`
                          : '—'}
                      </p>
                    </div>
                    <div className="bg-neutral-50/50 dark:bg-[#1b1b1e]/30 border border-neutral-200/30 dark:border-white/5 rounded-xl p-3 shadow-sm">
                      <div className="flex items-center gap-1 text-[8px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wide">
                        <HardDrive size={9} /> Stored Size
                      </div>
                      <p className="text-[11px] font-mono font-bold text-neutral-800 dark:text-neutral-200 mt-0.5">
                        {formatBytes(getStoredSize(selectedImage) || selectedImage.originalSizeBytes)}
                      </p>
                      {getCompressionPct(selectedImage) !== null && (
                        <p className="text-[8.5px] text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">
                          −{getCompressionPct(selectedImage)}% vs original ({formatBytes(selectedImage.originalSizeBytes)})
                        </p>
                      )}
                    </div>
                    <div className="bg-neutral-50/50 dark:bg-[#1b1b1e]/30 border border-neutral-200/30 dark:border-white/5 rounded-xl p-3 shadow-sm">
                      <div className="flex items-center gap-1 text-[8px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wide">
                        <FileType size={9} /> Format
                      </div>
                      <p className="text-[10.5px] font-mono font-semibold text-neutral-850 dark:text-neutral-300 mt-0.5 truncate" title={selectedImage.storedMimeType || selectedImage.originalMimeType}>
                        {(selectedImage.storedMimeType || selectedImage.originalMimeType || 'image/unknown').replace('image/', '')}
                      </p>
                      {selectedImage.storedMimeType && selectedImage.originalMimeType && selectedImage.storedMimeType !== selectedImage.originalMimeType && (
                        <p className="text-[8.5px] text-neutral-400 mt-0.5">from {selectedImage.originalMimeType.replace('image/', '')}</p>
                      )}
                    </div>
                    <div className="bg-neutral-50/50 dark:bg-[#1b1b1e]/30 border border-neutral-200/30 dark:border-white/5 rounded-xl p-3 shadow-sm">
                      <div className="flex items-center gap-1 text-[8px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wide">
                        <Layers size={9} /> Status
                      </div>
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-[8px] font-bold border mt-0.5 ${
                        selectedImage.deletedAt
                          ? 'bg-red-500/10 border-red-500/10 text-red-650 dark:text-red-400'
                          : 'bg-emerald-500/10 border-emerald-500/10 text-emerald-650 dark:text-emerald-400'
                      }`}>
                        {selectedImage.deletedAt ? 'Trashed' : 'Active'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Upload metadata */}
                <div className="space-y-2">
                  <span className="block text-[9px] font-semibold text-neutral-400 uppercase tracking-wider">
                    Ownership Details
                  </span>
                  <div className="bg-neutral-50/50 dark:bg-[#1b1b1e]/30 border border-neutral-200/30 dark:border-white/5 rounded-xl p-3 space-y-2 text-[10.5px] text-neutral-500 dark:text-neutral-400 font-medium">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-md overflow-hidden bg-neutral-100 shrink-0 border border-neutral-200/40">
                        {selectedImage.user?.avatar ? (
                          <img src={selectedImage.user.avatar} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-neutral-150">
                            <User size={8} className="text-neutral-400" />
                          </div>
                        )}
                      </div>
                      <span className="truncate text-neutral-850 dark:text-neutral-200">
                        {selectedImage.user?.username || 'Unknown Upload'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar size={12} className="text-neutral-400 shrink-0" />
                      <span>Uploaded: {selectedImage.createdAt ? new Date(selectedImage.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—'}</span>
                    </div>
                  </div>
                </div>

                {/* Linked blogs list */}
                {selectedImage.linkedBlogs && selectedImage.linkedBlogs.filter(b => !b.removedAt).length > 0 && (
                  <div className="space-y-2">
                    <span className="block text-[9px] font-semibold text-neutral-400 uppercase tracking-wider flex items-center gap-1">
                      <LinkIcon size={10} className="text-blue-500" />
                      Linked Submissions ({selectedImage.linkedBlogs.filter(b => !b.removedAt).length})
                    </span>
                    <div className="bg-neutral-50/30 dark:bg-[#1b1b1e]/20 border border-neutral-200/35 dark:border-white/5 rounded-xl max-h-[140px] overflow-y-auto custom-scrollbar">
                      <div className="divide-y divide-neutral-100 dark:divide-white/5">
                        {selectedImage.linkedBlogs.filter(b => !b.removedAt).map((blog) => (
                          <div key={blog.blogId} className="p-2 flex items-center justify-between hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors">
                            <span className="text-[10px] font-semibold text-neutral-700 dark:text-neutral-350 truncate pr-3" title={blog.blogId}>
                              ID: {blog.blogId}
                            </span>
                            <span className="shrink-0 text-[8px] font-semibold text-neutral-400 bg-neutral-150 dark:bg-[#1c1c1e] px-1.5 py-0.5 rounded">
                              Active Reference
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Action drawer footer */}
              <div className="shrink-0 p-4 border-t border-neutral-200/50 dark:border-white/5 bg-neutral-50/50 dark:bg-neutral-900/30 flex justify-between gap-3">
                <button
                  onClick={() => setDeleteTarget(selectedImage)}
                  className="flex-1 py-2 border border-red-500/20 text-red-650 dark:text-red-400 rounded-lg text-xs font-semibold bg-white dark:bg-[#18181b] hover:bg-red-500/10 transition-colors shadow-sm flex items-center justify-center gap-1.5"
                >
                  <Trash2 size={12} />
                  Delete Asset
                </button>
                <button
                  onClick={() => setSelectedImage(null)}
                  className="px-4 py-2 border border-neutral-200 dark:border-white/5 rounded-lg text-xs font-semibold text-neutral-500 hover:text-neutral-800 dark:hover:text-white bg-white dark:bg-[#18181b] hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors shadow-sm"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Fullscreen Full size Image Modal */}
      <AnimatePresence>
        {isFullscreenPreview && selectedImage && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/95 select-none cursor-zoom-out"
            onClick={() => setIsFullscreenPreview(false)}
          >
            {getPreviewUrl(selectedImage.variants) && (
              <motion.img
                initial={{ scale: 0.96, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.96, opacity: 0 }}
                src={getPreviewUrl(selectedImage.variants)}
                alt={selectedImage.alt || ''}
                className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
              />
            )}
            <button
              onClick={() => setIsFullscreenPreview(false)}
              className="absolute top-5 right-5 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur-md transition-colors shadow-md"
            >
              <X size={18} />
            </button>
          </div>
        )}
      </AnimatePresence>

      {/* Modern Dialog Box for deleting confirmation */}
      <AnimatePresence>
        {deleteTarget && (
          <>
            <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-[2px]" />
            <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-sm bg-white dark:bg-[#151518] rounded-xl border border-neutral-200/50 dark:border-white/5 p-5 shadow-2xl space-y-4"
              >
                <div className="flex gap-3">
                  <div className="w-9 h-9 rounded-lg bg-red-500/10 flex items-center justify-center text-red-650 shrink-0">
                    <AlertTriangle size={18} />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-xs font-bold text-neutral-900 dark:text-white uppercase tracking-wide">
                      Delete Library Image
                    </h3>
                    <p className="text-[11px] text-neutral-400 leading-relaxed">
                      Permanently remove <span className="font-semibold text-neutral-800 dark:text-neutral-200">{deleteTarget.originalFileName || 'this image'}</span>. This cannot be undone.
                    </p>
                  </div>
                </div>

                {/* Render warn message if linked blogs */}
                {deleteTarget.linkedBlogs?.filter((b) => !b.removedAt).length > 0 && (
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/10 text-amber-650 dark:text-amber-400 space-y-1">
                    <p className="text-[9px] font-bold uppercase tracking-wider flex items-center gap-1">
                      <AlertTriangle size={10} /> Active References Detected
                    </p>
                    <p className="text-[10px] leading-relaxed">
                      This asset is currently in use across {deleteTarget.linkedBlogs.filter((b) => !b.removedAt).length} published blog(s).
                      Force deleting it will break media paths in those blogs.
                    </p>
                  </div>
                )}

                {/* Footer buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={() => setDeleteTarget(null)}
                    className="flex-1 py-2 border border-neutral-200 dark:border-white/5 rounded-lg text-xs font-semibold text-neutral-500 hover:text-neutral-800 dark:hover:text-white bg-white dark:bg-[#18181b] hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors shadow-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleDelete(deleteTarget.id, deleteTarget.linkedBlogs?.filter((b) => !b.removedAt).length > 0)}
                    disabled={isDeleting}
                    className="flex-1 py-2 rounded-lg text-xs font-semibold text-white bg-red-500 hover:bg-red-650 disabled:opacity-40 transition-colors shadow-sm flex items-center justify-center gap-1.5"
                  >
                    {isDeleting ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <>
                        <Trash2 size={12} />
                        {deleteTarget.linkedBlogs?.filter((b) => !b.removedAt).length > 0 ? 'Force Delete' : 'Confirm'}
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

export default ImageManager;
