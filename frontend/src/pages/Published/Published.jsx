import { useState, useEffect } from 'react';
import {
  Globe,
  Search,
  Unlink,
  ExternalLink,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  FileText,
  Eye,
  Loader2,
  Clock,
  User,
  RefreshCw,
  Grid,
  List,
  X,
  Pencil,
  Calendar,
  Database,
  CheckCircle2,
  ArrowUpDown,
  BookOpen,
  Settings,
  Layers,
  ChevronRight as ChevronRightIcon,
  Download,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import adminAPI from '@/api/adminAPI';
import ConfirmDialog from '@/components/UI/ConfirmDialog';

export default function PublishedPage() {
  const [submissions, setSubmissions] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [unpublishTarget, setUnpublishTarget] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  // Pending hard delete — the ConfirmDialog's typed-confirmation target
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Redesign local states
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('published_view_mode') || 'grid');
  const [platformFilter, setPlatformFilter] = useState('all'); // 'all' | 'sanity' | 'local'
  const [sortBy, setSortBy] = useState('newest'); // 'newest' | 'oldest' | 'title-asc' | 'title-desc'
  const [selectedBlog, setSelectedBlog] = useState(null);
  const [activeTab, setActiveTab] = useState('preview'); // 'preview' | 'edit'
  const [isSaving, setIsSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    title: '',
    slug: '',
    excerpt: '',
    category: '',
    tags: '',
    coverImage: '',
    metaTitle: '',
    metaDescription: ''
  });

  useEffect(() => {
    localStorage.setItem('published_view_mode', viewMode);
  }, [viewMode]);

  useEffect(() => {
    fetchPublished();
    fetchStats();
  }, [page]);

  const fetchPublished = async () => {
    setIsLoading(true);
    try {
      const res = await adminAPI.get(`/published?page=${page}&limit=30&search=${encodeURIComponent(search)}`);
      if (res.success) {
        setSubmissions(res.submissions);
        setPagination(res.pagination);
      }
    } catch {
      toast.error('Failed to load published blogs');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await adminAPI.get('/published/stats');
      if (res.success) setStats(res.stats);
    } catch {}
  };

  const handleSearch = (e) => {
    if (e) e.preventDefault();
    setPage(1);
    fetchPublished();
  };

  const handleResetSearch = () => {
    setSearch('');
    setPage(1);
  };

  const handleUnpublish = async () => {
    if (!unpublishTarget) return;
    setIsProcessing(true);
    try {
      const res = await adminAPI.post(`/published/${unpublishTarget._id}/unpublish`);
      if (res.success) {
        toast.success('Unpublished from Sanity');
        setSubmissions(prev => prev.filter(s => s._id !== unpublishTarget._id));
        if (selectedBlog?._id === unpublishTarget._id) {
          setSelectedBlog(null);
        }
        setUnpublishTarget(null);
        fetchStats();
      }
    } catch {
      toast.error('Failed to unpublish');
    } finally {
      setIsProcessing(false);
    }
  };

  // HARD delete a published post — removes the MongoDB record AND the live
  // Sanity copy (the endpoint handles both). For erasing test posts; real
  // users' content should be unpublish-ed (reversible) instead.
  const handleDeleteConfirmed = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await adminAPI.delete(`/blogs/submissions/${deleteTarget._id}`);
      if (res.success) {
        toast.success(res.message || `"${deleteTarget.title}" permanently deleted`);
        setSubmissions(prev => prev.filter(s => s._id !== deleteTarget._id));
        if (selectedBlog?._id === deleteTarget._id) setSelectedBlog(null);
        setDeleteTarget(null);
        fetchStats();
      } else {
        toast.error(res.message || 'Delete failed');
      }
    } catch (err) {
      toast.error(err?.message || 'Delete failed');
    } finally {
      setIsDeleting(false);
    }
  };

  // Open Preview Drawer
  const handleOpenDrawer = (blog) => {
    setSelectedBlog(blog);
    setActiveTab('preview');
    setEditForm({
      title: blog.title || '',
      slug: blog.slug || '',
      excerpt: blog.excerpt || '',
      category: blog.category || 'Engineering',
      tags: blog.tags ? blog.tags.join(', ') : '',
      coverImage: blog.coverImage || '',
      metaTitle: blog.metaTitle || '',
      metaDescription: blog.metaDescription || ''
    });
  };

  // Handle Edit Submit
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const tagsArray = editForm.tags
        ? editForm.tags.split(',').map(t => t.trim()).filter(Boolean)
        : [];
      
      const payload = {
        ...editForm,
        tags: tagsArray
      };

      const res = await adminAPI.put(`/published/${selectedBlog._id}`, payload);
      if (res.success) {
        toast.success('Blog metadata updated successfully');
        // Update local state in-place
        setSubmissions(prev => prev.map(s => s._id === selectedBlog._id ? res.submission : s));
        setSelectedBlog(res.submission);
        setActiveTab('preview');
        fetchStats();
      }
    } catch {
      toast.error('Failed to update blog metadata');
    } finally {
      setIsSaving(false);
    }
  };

  // Local filtering and sorting logic
  const filteredSubmissions = submissions
    .filter(item => {
      if (platformFilter === 'sanity') return !!item.sanityId;
      if (platformFilter === 'local') return !item.sanityId;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'newest') {
        return new Date(b.updatedAt) - new Date(a.updatedAt);
      }
      if (sortBy === 'oldest') {
        return new Date(a.updatedAt) - new Date(b.updatedAt);
      }
      if (sortBy === 'title-asc') {
        return a.title.localeCompare(b.title);
      }
      if (sortBy === 'title-desc') {
        return b.title.localeCompare(a.title);
      }
      return 0;
    });

  return (
    <div className="h-full flex flex-col bg-neutral-50/30 dark:bg-[#0d0d0f]/20 selection:bg-neutral-200/50 dark:selection:bg-neutral-400/40">
      {/* Premium Header */}
      <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-neutral-200/50 dark:border-white/5 bg-white/40 dark:bg-[#121214]/40 backdrop-blur-sm">
        <div>
          <h1 className="text-base font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
            Published Content
          </h1>
          <p className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-0.5">
            {stats ? `Showing ${filteredSubmissions.length} of ${stats.total} approved articles` : 'Overview of published blog submissions'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              try {
                const res = await adminAPI.get('/export/submissions?status=approved', { responseType: 'blob' });
                const blob = new Blob([res], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url; a.download = `published-${new Date().toISOString().split('T')[0]}.csv`;
                a.click(); URL.revokeObjectURL(url);
                toast.success('Published posts exported');
              } catch { toast.error('Export failed'); }
            }}
            className="p-1.5 rounded-lg border border-neutral-200/50 dark:border-white/5 bg-white dark:bg-[#18181b] hover:bg-neutral-50 dark:hover:bg-white/5 text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-all shadow-sm flex items-center gap-1.5 text-[11px] font-medium"
          >
            <Download size={12} />
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => {
              fetchPublished();
              fetchStats();
              toast.success('Stats and listings refreshed');
            }}
            className="p-1.5 rounded-lg border border-neutral-200/50 dark:border-white/5 bg-white dark:bg-[#18181b] hover:bg-neutral-50 dark:hover:bg-white/5 text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-all shadow-sm flex items-center gap-1.5 text-[11px] font-medium"
          >
            <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats Cards Section */}
      {stats && (
        <div className="shrink-0 p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total card */}
          <div className="bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 p-4 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex items-center justify-between group hover:border-neutral-300 dark:hover:border-neutral-800 transition-all">
            <div className="space-y-1">
              <span className="text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Total Published</span>
              <p className="text-xl font-bold text-neutral-800 dark:text-neutral-100 leading-none">{stats.total}</p>
            </div>
            <div className="w-8 h-8 rounded-lg bg-neutral-100 dark:bg-neutral-800/50 flex items-center justify-center text-neutral-500">
              <Globe size={15} strokeWidth={1.5} />
            </div>
          </div>

          {/* Sanity card */}
          <div className="bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 p-4 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex items-center justify-between group hover:border-neutral-300 dark:hover:border-neutral-800 transition-all">
            <div className="space-y-1">
              <span className="text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Live on Sanity</span>
              <p className="text-xl font-bold text-neutral-800 dark:text-neutral-100 leading-none">{stats.withSanity}</p>
            </div>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-500">
              <CheckCircle2 size={15} strokeWidth={1.5} />
            </div>
          </div>

          {/* Local DB card */}
          <div className="bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 p-4 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex items-center justify-between group hover:border-neutral-300 dark:hover:border-neutral-800 transition-all">
            <div className="space-y-1">
              <span className="text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Local DB Only</span>
              <p className="text-xl font-bold text-neutral-800 dark:text-neutral-100 leading-none">{stats.withoutSanity}</p>
            </div>
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-600 dark:text-amber-500">
              <Database size={15} strokeWidth={1.5} />
            </div>
          </div>

          {/* Month card */}
          <div className="bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 p-4 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex items-center justify-between group hover:border-neutral-300 dark:hover:border-neutral-800 transition-all">
            <div className="space-y-1">
              <span className="text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">This Month</span>
              <p className="text-xl font-bold text-neutral-800 dark:text-neutral-100 leading-none">{stats.publishedThisMonth}</p>
            </div>
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-500">
              <Calendar size={15} strokeWidth={1.5} />
            </div>
          </div>
        </div>
      )}

      {/* Control Bar */}
      <div className="shrink-0 px-6 pb-4 flex flex-col md:flex-row gap-4 items-center justify-between">
        {/* Left Search */}
        <form onSubmit={handleSearch} className="w-full md:w-80 flex gap-2">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-neutral-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search published titles/authors..."
              className="w-full pl-9 pr-8 py-1.5 bg-white dark:bg-[#151518] border border-neutral-200/60 dark:border-white/5 rounded-lg text-xs text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:border-neutral-400 dark:focus:border-neutral-700 transition-all shadow-[0_1px_2px_rgba(0,0,0,0.01)]"
            />
            {search && (
              <button
                type="button"
                onClick={handleResetSearch}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 dark:hover:text-white"
              >
                <X size={12} />
              </button>
            )}
          </div>
          <button
            type="submit"
            className="px-3 py-1.5 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-lg text-xs font-semibold hover:opacity-90 transition-all shadow-sm"
          >
            Search
          </button>
        </form>

        {/* Right Filters */}
        <div className="w-full md:w-auto flex flex-wrap items-center gap-3 justify-end">
          {/* Segmented Controls for Platform */}
          <div className="p-0.5 rounded-lg bg-neutral-200/50 dark:bg-neutral-950/60 border border-neutral-200/40 dark:border-white/5 flex gap-0.5 shadow-inner">
            <button
              onClick={() => setPlatformFilter('all')}
              className={`px-3 py-1 text-[11px] font-medium rounded-md transition-all ${
                platformFilter === 'all'
                  ? 'bg-white dark:bg-[#1b1b1e] text-neutral-900 dark:text-white shadow-sm'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-750 dark:hover:text-neutral-300'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setPlatformFilter('sanity')}
              className={`px-3 py-1 text-[11px] font-medium rounded-md transition-all ${
                platformFilter === 'sanity'
                  ? 'bg-white dark:bg-[#1b1b1e] text-neutral-900 dark:text-white shadow-sm'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-750 dark:hover:text-neutral-300'
              }`}
            >
              Sanity
            </button>
            <button
              onClick={() => setPlatformFilter('local')}
              className={`px-3 py-1 text-[11px] font-medium rounded-md transition-all ${
                platformFilter === 'local'
                  ? 'bg-white dark:bg-[#1b1b1e] text-neutral-900 dark:text-white shadow-sm'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-750 dark:hover:text-neutral-300'
              }`}
            >
              Local DB
            </button>
          </div>

          {/* Sort By Dropdown */}
          <div className="relative flex items-center gap-1 bg-white dark:bg-[#151518] border border-neutral-200/60 dark:border-white/5 rounded-lg px-2.5 py-1 shadow-sm">
            <ArrowUpDown size={11} className="text-neutral-400" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-transparent text-[11px] font-medium text-neutral-600 dark:text-neutral-350 focus:outline-none border-none pr-1 py-0.5 cursor-pointer"
            >
              <option value="newest" className="dark:bg-[#151518]">Newest</option>
              <option value="oldest" className="dark:bg-[#151518]">Oldest</option>
              <option value="title-asc" className="dark:bg-[#151518]">Title A-Z</option>
              <option value="title-desc" className="dark:bg-[#151518]">Title Z-A</option>
            </select>
          </div>

          {/* Grid/List layout switcher */}
          <div className="flex rounded-lg border border-neutral-200/50 dark:border-white/5 bg-white dark:bg-[#151518] p-0.5 shadow-sm">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-neutral-100 dark:bg-white/8 text-neutral-800 dark:text-white' : 'text-neutral-400 hover:text-neutral-750 dark:hover:text-neutral-350'}`}
              title="Grid View"
            >
              <Grid size={13} strokeWidth={1.5} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-neutral-100 dark:bg-white/8 text-neutral-800 dark:text-white' : 'text-neutral-400 hover:text-neutral-750 dark:hover:text-neutral-350'}`}
              title="List View"
            >
              <List size={13} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </div>

      {/* Main List/Grid View Content */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {isLoading ? (
          // Skeletal Loader redone following clean styles
          viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 rounded-xl p-3.5 space-y-3.5 animate-pulse shadow-sm">
                  <div className="aspect-[16/10] bg-neutral-200/50 dark:bg-neutral-800 rounded-lg w-full" />
                  <div className="space-y-2">
                    <div className="h-3.5 bg-neutral-200/50 dark:bg-neutral-800 rounded w-3/4" />
                    <div className="h-2.5 bg-neutral-200/50 dark:bg-neutral-800 rounded w-1/2" />
                  </div>
                  <div className="pt-2 border-t border-neutral-100 dark:border-white/5 flex items-center justify-between">
                    <div className="h-3 bg-neutral-200/50 dark:bg-neutral-800 rounded w-20" />
                    <div className="h-6 bg-neutral-200/50 dark:bg-neutral-800 rounded w-16" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 rounded-xl p-4 divide-y divide-neutral-100 dark:divide-white/5 animate-pulse space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3 w-1/2">
                    <div className="w-10 h-7 bg-neutral-200/50 dark:bg-neutral-800 rounded" />
                    <div className="space-y-1.5 flex-1">
                      <div className="h-3.5 bg-neutral-200/50 dark:bg-neutral-800 rounded w-3/4" />
                      <div className="h-2.5 bg-neutral-200/50 dark:bg-neutral-800 rounded w-1/4" />
                    </div>
                  </div>
                  <div className="h-3 bg-neutral-200/50 dark:bg-neutral-800 rounded w-24" />
                  <div className="h-6 bg-neutral-200/50 dark:bg-neutral-800 rounded w-16" />
                </div>
              ))}
            </div>
          )
        ) : filteredSubmissions.length === 0 ? (
          <div className="bg-white dark:bg-[#151518]/40 border border-neutral-200/40 dark:border-white/5 rounded-2xl flex flex-col items-center justify-center py-20 shadow-sm">
            <BookOpen size={28} strokeWidth={1.5} className="text-neutral-350 dark:text-neutral-600 mb-3" />
            <p className="text-xs font-semibold text-neutral-800 dark:text-neutral-300">No published blogs found</p>
            <p className="text-[11px] text-neutral-400 mt-1">Try resetting your filters or modifying the search.</p>
          </div>
        ) : viewMode === 'grid' ? (
          /* Grid Layout Overhaul */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredSubmissions.map((item) => (
              <div
                key={item._id}
                onClick={() => handleOpenDrawer(item)}
                className="bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 rounded-xl overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.01)] hover:shadow-md hover:border-neutral-300 dark:hover:border-neutral-800 transition-all duration-300 flex flex-col cursor-pointer group"
              >
                {/* Image Cover */}
                <div className="aspect-[16/10] bg-neutral-100 dark:bg-neutral-950 overflow-hidden relative shrink-0">
                  {item.coverImage ? (
                    <img
                      src={item.coverImage}
                      alt={item.coverImageAlt || ''}
                      className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-neutral-350 dark:text-neutral-600">
                      <FileText size={20} strokeWidth={1.5} />
                      <span className="text-[9px] mt-1 font-medium">No cover image</span>
                    </div>
                  )}
                  {/* Category Pill */}
                  <span className="absolute top-3 left-3 bg-neutral-900/70 dark:bg-neutral-950/70 backdrop-blur-sm text-white px-2 py-0.5 rounded-[4px] text-[8px] font-semibold uppercase tracking-wider">
                    {item.category || 'Blog'}
                  </span>
                  {/* Status Badge */}
                  <div className="absolute top-3 right-3">
                    {item.sanityId ? (
                      <span className="px-2 py-0.5 bg-emerald-500/90 text-white rounded-[4px] text-[8px] font-bold shadow-sm">
                        LIVE
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-amber-500/95 text-white rounded-[4px] text-[8px] font-bold shadow-sm">
                        DB ONLY
                      </span>
                    )}
                  </div>
                </div>

                {/* Content */}
                <div className="p-4 flex-1 flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <h2 className="text-xs font-semibold text-neutral-900 dark:text-white line-clamp-2 leading-relaxed">
                      {item.title}
                    </h2>
                    {item.excerpt && (
                      <p className="text-[11px] text-neutral-400 dark:text-neutral-500 line-clamp-2 leading-relaxed">
                        {item.excerpt}
                      </p>
                    )}
                  </div>

                  {/* Footer metadata */}
                  <div className="pt-3 border-t border-neutral-100 dark:border-white/5 flex items-center justify-between text-[10px] text-neutral-500">
                    <div className="flex items-center gap-1.5 truncate">
                      <div className="w-4 h-4 rounded-full overflow-hidden bg-neutral-100 border border-neutral-200/50 dark:border-white/10 flex-shrink-0">
                        <img
                          src={item.author?.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + (item.author?.name || 'Author')}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <span className="truncate max-w-[90px] font-medium text-neutral-700 dark:text-neutral-350">{item.author?.name}</span>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Clock size={9} />
                      <span>{item.readTime || '5 min'}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* List Layout Overhaul (Notion style) */
          <div className="bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 rounded-xl overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.01)]">
            <div className="min-w-full divide-y divide-neutral-200/50 dark:divide-white/5">
              {/* Table Header */}
              <div className="bg-neutral-50/50 dark:bg-neutral-900/30 px-4 py-2 flex items-center text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
                <div className="w-1/2">Title</div>
                <div className="w-1/6">Author</div>
                <div className="w-1/6">Platform</div>
                <div className="w-1/6 text-right">Updated At</div>
              </div>

              {/* Rows */}
              <div className="divide-y divide-neutral-100 dark:divide-white/5">
                {filteredSubmissions.map((item) => (
                  <div
                    key={item._id}
                    onClick={() => handleOpenDrawer(item)}
                    className="px-4 py-2.5 flex items-center hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors cursor-pointer group text-xs text-neutral-700 dark:text-neutral-300"
                  >
                    {/* Cover & Title */}
                    <div className="w-1/2 flex items-center gap-3 pr-4 min-w-0">
                      <div className="w-10 h-7 bg-neutral-100 dark:bg-neutral-950 rounded overflow-hidden border border-neutral-200/50 dark:border-white/10 shrink-0">
                        {item.coverImage ? (
                          <img src={item.coverImage} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-neutral-400">
                            <FileText size={10} />
                          </div>
                        )}
                      </div>
                      <span className="truncate font-medium text-neutral-900 dark:text-white group-hover:text-[#00f0ff] dark:group-hover:text-white transition-colors">
                        {item.title}
                      </span>
                    </div>

                    {/* Author */}
                    <div className="w-1/6 truncate flex items-center gap-1.5 pr-2">
                      <span className="truncate font-medium text-neutral-500 dark:text-neutral-450">{item.author?.name}</span>
                    </div>

                    {/* Platform Status */}
                    <div className="w-1/6 pr-2">
                      {item.sanityId ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-500 rounded text-[9px] font-bold">
                          LIVE
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-1.5 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-500 rounded text-[9px] font-bold">
                          DB ONLY
                        </span>
                      )}
                    </div>

                    {/* Date & Action */}
                    <div className="w-1/6 text-right flex items-center justify-end gap-1.5 text-neutral-400 font-medium">
                      <span>
                        {new Date(item.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                      <ChevronRightIcon size={12} className="opacity-0 group-hover:opacity-100 transition-opacity text-neutral-400" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Pagination Controls */}
        {pagination && pagination.pages > 1 && (
          <div className="flex items-center justify-center gap-3 px-4 py-6">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1.5 rounded-lg border border-neutral-200/60 dark:border-white/5 bg-white dark:bg-[#151518] text-neutral-500 hover:text-neutral-900 dark:hover:text-white disabled:opacity-30 transition-all shadow-sm"
            >
              <ChevronLeft size={13} />
            </button>
            <span className="text-[11px] font-medium text-neutral-500">
              Page {pagination.page} of {pagination.pages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
              disabled={page >= pagination.pages}
              className="p-1.5 rounded-lg border border-neutral-200/60 dark:border-white/5 bg-white dark:bg-[#151518] text-neutral-500 hover:text-neutral-900 dark:hover:text-white disabled:opacity-30 transition-all shadow-sm"
            >
              <ChevronRight size={13} />
            </button>
          </div>
        )}
      </div>

      {/* Slide-over Preview & Editor Drawer (Framer Motion) */}
      <AnimatePresence>
        {selectedBlog && (
          <>
            {/* Backdrop overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedBlog(null)}
              className="fixed inset-0 z-40 bg-black/30 dark:bg-black/60 backdrop-blur-[2px]"
            />

            {/* Drawer Panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-white dark:bg-[#151518] border-l border-neutral-200/50 dark:border-white/5 shadow-2xl flex flex-col justify-between overflow-hidden"
            >
              {/* Header */}
              <div className="shrink-0 p-4 border-b border-neutral-200/50 dark:border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-neutral-100 dark:bg-white/5 border border-neutral-250 dark:border-white/5 rounded text-[9px] font-semibold text-neutral-500">
                    Metadata Hub
                  </span>
                  {selectedBlog.sanityId && (
                    <span className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-500 rounded text-[9px] font-bold">
                      Sanity Active
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {/* Segmented Tab Switcher */}
                  <div className="p-0.5 rounded-lg bg-neutral-100 dark:bg-neutral-900 border border-neutral-200/40 dark:border-white/5 flex shadow-inner">
                    <button
                      onClick={() => setActiveTab('preview')}
                      className={`px-3 py-1 text-[10px] font-semibold rounded-md transition-all ${
                        activeTab === 'preview'
                          ? 'bg-white dark:bg-[#1b1b1e] text-neutral-900 dark:text-white shadow-sm'
                          : 'text-neutral-500 hover:text-neutral-700'
                      }`}
                    >
                      Preview
                    </button>
                    <button
                      onClick={() => setActiveTab('edit')}
                      className={`px-3 py-1 text-[10px] font-semibold rounded-md transition-all ${
                        activeTab === 'edit'
                          ? 'bg-white dark:bg-[#1b1b1e] text-neutral-900 dark:text-white shadow-sm'
                          : 'text-neutral-500 hover:text-neutral-700'
                      }`}
                    >
                      Edit
                    </button>
                  </div>
                  <button
                    onClick={() => setSelectedBlog(null)}
                    className="p-1 rounded-lg hover:bg-neutral-100 dark:hover:bg-white/5 text-neutral-400 hover:text-neutral-700 dark:hover:text-white transition-colors ml-1"
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar">
                {activeTab === 'preview' ? (
                  /* Preview Mode */
                  <div className="space-y-5 text-neutral-800 dark:text-neutral-200">
                    {/* Cover photo banner */}
                    {selectedBlog.coverImage ? (
                      <div className="w-full aspect-[16/9] bg-neutral-100 dark:bg-neutral-950 rounded-xl overflow-hidden border border-neutral-200/50 dark:border-white/10 shadow-sm relative">
                        <img
                          src={selectedBlog.coverImage}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none" />
                      </div>
                    ) : (
                      <div className="w-full aspect-[16/9] bg-neutral-50 dark:bg-neutral-950/40 rounded-xl flex flex-col items-center justify-center border border-dashed border-neutral-200 dark:border-white/5">
                        <FileText size={20} className="text-neutral-400" />
                        <span className="text-[10px] text-neutral-400 mt-1">No cover image uploaded</span>
                      </div>
                    )}

                    {/* Metadata fields */}
                    <div className="space-y-3">
                      <h2 className="text-base font-bold text-neutral-900 dark:text-white leading-relaxed">
                        {selectedBlog.title}
                      </h2>
                      {selectedBlog.excerpt && (
                        <p className="text-xs text-neutral-500 dark:text-neutral-455 leading-relaxed bg-neutral-50/50 dark:bg-[#1b1b1e]/40 p-3 rounded-lg border border-neutral-200/30 dark:border-white/5 italic">
                          "{selectedBlog.excerpt}"
                        </p>
                      )}
                    </div>

                    {/* Category & Tags */}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <span className="px-2.5 py-0.5 rounded-full bg-neutral-100 dark:bg-white/5 text-[9px] font-semibold text-neutral-600 dark:text-neutral-300 border border-neutral-200/50 dark:border-white/5">
                        {selectedBlog.category || 'Engineering'}
                      </span>
                      {selectedBlog.tags && selectedBlog.tags.map(tag => (
                        <span key={tag} className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[9px] font-medium border border-blue-500/10">
                          #{tag}
                        </span>
                      ))}
                    </div>

                    {/* Author section */}
                    <div className="p-3 bg-neutral-50 dark:bg-[#1b1b1e]/50 border border-neutral-200/40 dark:border-white/5 rounded-xl flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-full bg-neutral-250 border border-neutral-250 dark:border-white/10 overflow-hidden shrink-0">
                          <img
                            src={selectedBlog.author?.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + (selectedBlog.author?.name || 'Author')}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div>
                          <p className="text-[11px] font-semibold text-neutral-900 dark:text-white">{selectedBlog.author?.name}</p>
                          <p className="text-[9px] text-neutral-400 mt-0.5">{selectedBlog.author?.email}</p>
                        </div>
                      </div>
                      <div className="text-right text-[10px] text-neutral-400 space-y-0.5 font-medium">
                        <p>Read time: {selectedBlog.readTime || '5 min'}</p>
                        <p>{new Date(selectedBlog.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                      </div>
                    </div>

                    {/* Actions and External Links */}
                    <div className="grid grid-cols-2 gap-3">
                      {selectedBlog.sanityUrl && (
                        <a
                          href={selectedBlog.sanityUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-center gap-2 py-2 border border-neutral-200/60 dark:border-white/5 rounded-lg text-xs font-semibold text-neutral-700 dark:text-neutral-300 bg-white dark:bg-[#18181b] hover:bg-neutral-50 dark:hover:bg-white/5 shadow-sm transition-all"
                        >
                          <Eye size={12} />
                          View on Sanity
                        </a>
                      )}
                      {selectedBlog.slug && (
                        <a
                          href={`https://www.contesthopper.live/blog/${selectedBlog.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-center gap-2 py-2 border border-neutral-200/60 dark:border-white/5 rounded-lg text-xs font-semibold text-neutral-700 dark:text-neutral-300 bg-white dark:bg-[#18181b] hover:bg-neutral-50 dark:hover:bg-white/5 shadow-sm transition-all"
                        >
                          <ExternalLink size={12} />
                          View Live Post
                        </a>
                      )}
                    </div>

                    {/* Platform Integration technical IDs */}
                    <div className="p-3 bg-neutral-50/50 dark:bg-[#1b1b1e]/30 border border-neutral-200/30 dark:border-white/5 rounded-xl text-[10px] space-y-1.5 font-medium text-neutral-400">
                      <span className="block text-[8px] uppercase tracking-wider font-semibold text-neutral-500">Technical Data</span>
                      <div className="flex justify-between">
                        <span>Database ID:</span>
                        <code className="text-neutral-600 dark:text-neutral-300 select-all">{selectedBlog._id}</code>
                      </div>
                      {selectedBlog.sanityId && (
                        <div className="flex justify-between">
                          <span>Sanity Doc ID:</span>
                          <code className="text-neutral-600 dark:text-neutral-300 select-all">{selectedBlog.sanityId}</code>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Edit Mode — platform packaging only. Title/excerpt are the
                     author's voice and render read-only; content fixes go
                     through unpublish → writer revision, not silent rewrites. */
                  <form onSubmit={handleEditSubmit} className="space-y-4 text-xs">
                    {/* Title — read-only (author voice) */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Blog Title</label>
                        <span className="text-[8px] font-bold text-neutral-400 uppercase tracking-wider">Author's — locked</span>
                      </div>
                      <input
                        type="text"
                        readOnly
                        value={editForm.title}
                        className="w-full px-3 py-2 bg-neutral-100/70 dark:bg-neutral-900/60 border border-neutral-200 dark:border-white/5 rounded-lg text-neutral-500 dark:text-neutral-400 cursor-not-allowed select-all"
                        title="Author-owned content — admins cannot retitle published posts"
                      />
                    </div>

                    {/* Slug */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Slug URL Path</label>
                      <input
                        type="text"
                        required
                        value={editForm.slug}
                        onChange={(e) => setEditForm(prev => ({ ...prev, slug: e.target.value }))}
                        className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-white/5 rounded-lg text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:border-neutral-400 dark:focus:border-neutral-700 transition-colors"
                      />
                    </div>

                    {/* Cover image URL */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Cover Image URL</label>
                      <input
                        type="text"
                        value={editForm.coverImage}
                        onChange={(e) => setEditForm(prev => ({ ...prev, coverImage: e.target.value }))}
                        className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-white/5 rounded-lg text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:border-neutral-400 dark:focus:border-neutral-700 transition-colors"
                      />
                    </div>

                    {/* Row with Category & Tags */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Category</label>
                        <select
                          value={editForm.category}
                          onChange={(e) => setEditForm(prev => ({ ...prev, category: e.target.value }))}
                          className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-white/5 rounded-lg text-neutral-900 dark:text-white focus:outline-none focus:border-neutral-400 dark:focus:border-neutral-700 transition-colors cursor-pointer"
                        >
                          <option value="Engineering">Engineering</option>
                          <option value="Product">Product</option>
                          <option value="Design">Design</option>
                          <option value="Tutorials">Tutorials</option>
                          <option value="News">News</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Tags (comma split)</label>
                        <input
                          type="text"
                          placeholder="tech, react, code"
                          value={editForm.tags}
                          onChange={(e) => setEditForm(prev => ({ ...prev, tags: e.target.value }))}
                          className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-white/5 rounded-lg text-neutral-900 dark:text-white placeholder-neutral-450 focus:outline-none focus:border-neutral-400 dark:focus:border-neutral-700 transition-colors"
                        />
                      </div>
                    </div>

                    {/* Excerpt — read-only (author voice) */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Excerpt Description</label>
                        <span className="text-[8px] font-bold text-neutral-400 uppercase tracking-wider">Author's — locked</span>
                      </div>
                      <p className="w-full px-3 py-2 bg-neutral-100/70 dark:bg-neutral-900/60 border border-neutral-200 dark:border-white/5 rounded-lg text-[11px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
                        {editForm.excerpt || <span className="italic">No excerpt</span>}
                      </p>
                    </div>

                    {/* SEO section */}
                    <div className="pt-2 border-t border-neutral-200/50 dark:border-white/5 space-y-3">
                      <span className="block text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">SEO Parameters</span>
                      
                      <div className="space-y-1">
                        <label className="text-[10px] font-medium text-neutral-450">Meta Title</label>
                        <input
                          type="text"
                          value={editForm.metaTitle}
                          onChange={(e) => setEditForm(prev => ({ ...prev, metaTitle: e.target.value }))}
                          className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-white/5 rounded-lg text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:border-neutral-400 dark:focus:border-neutral-700 transition-colors"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-medium text-neutral-450">Meta Description</label>
                        <textarea
                          rows={2}
                          value={editForm.metaDescription}
                          onChange={(e) => setEditForm(prev => ({ ...prev, metaDescription: e.target.value }))}
                          className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-white/5 rounded-lg text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:border-neutral-400 dark:focus:border-neutral-700 transition-colors resize-none leading-relaxed"
                        />
                      </div>
                    </div>

                    {/* Submit footer actions */}
                    <div className="flex gap-3 pt-4 border-t border-neutral-200/50 dark:border-white/5">
                      <button
                        type="button"
                        onClick={() => setActiveTab('preview')}
                        className="flex-1 py-2 border border-neutral-200/60 dark:border-white/5 rounded-lg text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/5 font-semibold transition-all"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSaving}
                        className="flex-1 py-2 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-lg font-semibold hover:opacity-90 disabled:opacity-40 transition-all flex items-center justify-center gap-1.5"
                      >
                        {isSaving ? <Loader2 size={12} className="animate-spin" /> : null}
                        Save Changes
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* Drawer footer (Unpublish / Delete Forever) */}
              <div className="shrink-0 p-4 border-t border-neutral-200/50 dark:border-white/5 bg-neutral-50/50 dark:bg-neutral-900/30 space-y-2">
                {selectedBlog.sanityId ? (
                  <button
                    onClick={() => {
                      setUnpublishTarget(selectedBlog);
                    }}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-red-500/10 hover:bg-red-500 text-red-600 hover:text-white border border-transparent rounded-xl text-xs font-semibold shadow-sm transition-all duration-200"
                  >
                    <Unlink size={13} />
                    Unpublish from Sanity Server
                  </button>
                ) : (
                  <div className="text-center py-2 text-[10px] text-neutral-400">
                    This post is not currently associated with an active Sanity server document.
                  </div>
                )}
                {/* Hard delete — quiet destructive action for erasing test posts */}
                <button
                  onClick={() => setDeleteTarget(selectedBlog)}
                  className="w-full flex items-center justify-center gap-2 py-2 text-[11px] font-semibold text-neutral-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/5 border border-transparent hover:border-red-500/20 rounded-xl transition-all duration-200"
                >
                  <Trash2 size={12} />
                  Delete Forever
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Redesigned Unpublish Confirmation Modal */}
      <AnimatePresence>
        {unpublishTarget && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-[2px]">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="w-full max-w-sm bg-white dark:bg-[#151518] rounded-xl p-5 border border-neutral-200/50 dark:border-white/5 shadow-2xl space-y-4"
            >
              <div className="flex items-center gap-3 text-red-500">
                <AlertTriangle size={18} strokeWidth={1.5} />
                <span className="text-[13px] font-semibold text-neutral-900 dark:text-white uppercase tracking-wider">Unpublish Post</span>
              </div>
              <div className="space-y-1 text-xs">
                <p className="text-neutral-500 dark:text-neutral-400 leading-relaxed">
                  Are you sure you want to unpublish <strong className="text-neutral-900 dark:text-white font-medium">"{unpublishTarget.title}"</strong> from Sanity?
                </p>
                <p className="text-red-500/80 mt-1 leading-normal font-medium">
                  This actions removes it from the live site and moves it to a pending status.
                </p>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setUnpublishTarget(null)}
                  className="flex-1 py-2 border border-neutral-200/60 dark:border-white/5 rounded-lg text-xs font-semibold text-neutral-500 hover:bg-neutral-100 dark:hover:bg-white/5 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUnpublish}
                  disabled={isProcessing}
                  className="flex-1 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-semibold disabled:opacity-40 transition-all flex items-center justify-center gap-1.5"
                >
                  {isProcessing ? <Loader2 size={12} className="animate-spin" /> : <Unlink size={12} />}
                  Confirm
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Hard delete confirmation — typed DELETE required */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirmed}
        title={`Permanently delete "${deleteTarget?.title || ''}"?`}
        intent="danger"
        actionIcon="delete"
        confirmLabel="Delete forever"
        requireText="DELETE"
        busy={isDeleting}
      >
        This erases the blog from MongoDB <strong>and</strong> removes its live
        copy from Sanity. The public site will 404 immediately. This cannot be
        undone — only do this for test posts; for real content prefer Unpublish.
      </ConfirmDialog>
    </div>
  );
}
