import { useState, useEffect } from 'react';
import { 
  FileText, 
  CheckCircle, 
  XCircle, 
  Clock,
  Search,
  ArrowRight,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  BookOpen,
  MessageSquare,
  LayoutGrid,
  List,
  CheckSquare,
  Square,
  Loader2,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import adminAPI from '@/api/adminAPI';
import ConfirmDialog from '@/components/UI/ConfirmDialog';

const statusConfig = {
  pending: { color: 'text-amber-600 dark:text-amber-500', bg: 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20', label: 'Pending', icon: Clock },
  approved: { color: 'text-emerald-600 dark:text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20', label: 'Approved', icon: CheckCircle },
  rejected: { color: 'text-red-655 dark:text-red-500', bg: 'bg-red-50 dark:bg-red-550/10 border-red-200 dark:border-red-500/20', label: 'Rejected', icon: XCircle },
  draft: { color: 'text-neutral-500 dark:text-neutral-450', bg: 'bg-neutral-50 dark:bg-[#18181a] border-neutral-200 dark:border-white/5', label: 'Draft', icon: FileText },
  flagged: { color: 'text-red-655 dark:text-red-400', bg: 'bg-red-600/10 border-red-600/20', label: 'Flagged', icon: AlertTriangle }
};

const AllPosts = () => {
  const [submissions, setSubmissions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('list'); // 'grid' or 'list'
  const [pagination, setPagination] = useState({ page: 1, total: 0, pages: 1 });
  const [stats, setStats] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  // Pending permanent delete — { mode: 'single'|'bulk', id?, title?, count? }
  // renders the typed-confirmation dialog instead of deleting outright.
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const navigate = useNavigate();

  const fetchAllPosts = async (page = pagination.page, status = statusFilter, search = searchQuery) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '15',
      });
      if (status !== 'all') params.set('status', status);
      if (search.trim()) params.set('search', search.trim());

      const res = await adminAPI.get(`/blogs/all?${params}`);
      if (res.success) {
        setSubmissions(res.submissions);
        setPagination(prev => ({ ...prev, ...res.pagination }));
      }
    } catch (err) {
      toast.error('Failed to load posts');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await adminAPI.get('/stats');
      if (res.success) {
        setStats(res.overview);
      }
    } catch (err) {
      console.error('Failed to load stats overview:', err);
    }
  };

  useEffect(() => {
    fetchAllPosts(pagination.page, statusFilter, searchQuery);
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, pagination.page]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchAllPosts(1, statusFilter, searchQuery);
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handleStatusChange = (status) => {
    setStatusFilter(status);
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const clearSearch = () => {
    setSearchQuery('');
    fetchAllPosts(1, statusFilter, '');
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  // Bulk selection
  const toggleSelect = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === submissions.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(submissions.map(s => s._id));
    }
  };

  const handleBatchAction = async (action) => {
    if (selectedIds.length === 0) return;
    setIsBatchProcessing(true);
    try {
      const res = await adminAPI.post('/blogs/submissions/batch', {
        ids: selectedIds,
        action,
        feedback: action === 'reject' ? 'Batch rejected by admin' : 'Approved (batch)',
      });
      if (res.success) {
        toast.success(res.message || `Batch ${action} completed`);
        setSelectedIds([]);
        fetchAllPosts(pagination.page, statusFilter, searchQuery);
      }
    } catch (err) {
      toast.error(`Batch ${action} failed`);
    } finally {
      setIsBatchProcessing(false);
    }
  };

  // Permanent delete — wipes records from MongoDB outright (test drafts,
  // rejected junk). Bulk mode refuses approved/live posts server-side and
  // reports what was skipped. adminAPI's interceptor rejects with the
  // response body, so the server's reason is at err.message directly.
  const handleDeleteConfirmed = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      if (deleteTarget.mode === 'bulk') {
        const res = await adminAPI.post('/blogs/submissions/batch-delete', { ids: selectedIds });
        toast.success(res.message || 'Submissions permanently deleted');
        if (res.skipped?.length) {
          toast(`${res.skipped.length} approved post(s) skipped — unpublish them from Live Posts first`, { icon: '⚠️', duration: 6000 });
        }
        setSelectedIds([]);
      } else {
        const res = await adminAPI.delete(`/blogs/submissions/${deleteTarget.id}`);
        toast.success(res.message || 'Submission permanently deleted');
      }
      setDeleteTarget(null);
      fetchAllPosts(pagination.page, statusFilter, searchQuery);
      fetchStats();
    } catch (err) {
      toast.error(err?.message || 'Delete failed');
    } finally {
      setIsDeleting(false);
    }
  };

  const StatusBadge = ({ status }) => {
    const cfg = statusConfig[status] || statusConfig.draft;
    const Icon = cfg.icon;
    return (
      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-semibold border ${cfg.color} ${cfg.bg}`}>
        <Icon size={9} strokeWidth={2} />
        {cfg.label}
      </span>
    );
  };

  return (
    <div className="h-full flex flex-col bg-neutral-50/30 dark:bg-[#0d0d0f]/20">
      
      {/* Header bar */}
      <div className="shrink-0 px-6 py-4 border-b border-neutral-200/50 dark:border-white/5 bg-white/40 dark:bg-[#121214]/40 backdrop-blur-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-base font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
            Platform Posts
          </h1>
          <p className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-0.5">
            Manage writer submissions, evaluate article performance, and inspect publication lifecycle records
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono font-bold bg-neutral-100 dark:bg-white/5 text-neutral-500 dark:text-neutral-400 px-3 py-1.5 rounded-lg border border-neutral-200/50 dark:border-white/5 shadow-sm">
            {pagination.total} Records Found
          </span>
        </div>
      </div>

      {/* Metrics mini grid */}
      <div className="shrink-0 px-6 py-4 grid grid-cols-2 lg:grid-cols-4 gap-3 bg-neutral-50/10 dark:bg-transparent border-b border-neutral-200/50 dark:border-white/5">
        <div className="bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 p-4 rounded-xl flex items-center justify-between shadow-[0_1px_3px_rgba(0,0,0,0.01)]">
          <div>
            <span className="text-[9.5px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">Total Submissions</span>
            <p className="text-lg font-bold text-neutral-900 dark:text-white mt-1">{stats ? stats.totalSubmissions : '-'}</p>
          </div>
          <div className="w-8 h-8 rounded-lg bg-neutral-100 dark:bg-white/5 flex items-center justify-center text-neutral-450">
            <BookOpen size={14} />
          </div>
        </div>

        <div className="bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 p-4 rounded-xl flex items-center justify-between shadow-[0_1px_3px_rgba(0,0,0,0.01)]">
          <div>
            <span className="text-[9.5px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">Approved & Live</span>
            <p className="text-lg font-bold text-emerald-600 dark:text-emerald-500 mt-1">{stats ? stats.publishedBlogs : '-'}</p>
          </div>
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500">
            <CheckCircle size={14} />
          </div>
        </div>

        <div className="bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 p-4 rounded-xl flex items-center justify-between shadow-[0_1px_3px_rgba(0,0,0,0.01)]">
          <div>
            <span className="text-[9.5px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">Awaiting Action</span>
            <p className="text-lg font-bold text-amber-600 dark:text-amber-500 mt-1">
              {stats ? (stats.pendingBlogs + stats.flaggedBlogs) : '-'}
            </p>
          </div>
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500">
            <Clock size={14} />
          </div>
        </div>

        <div className="bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 p-4 rounded-xl flex items-center justify-between shadow-[0_1px_3px_rgba(0,0,0,0.01)]">
          <div>
            <span className="text-[9.5px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">Active Comments</span>
            <p className="text-lg font-bold text-purple-650 dark:text-purple-400 mt-1">{stats ? stats.totalComments : '-'}</p>
          </div>
          <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-650 dark:text-purple-400">
            <MessageSquare size={14} />
          </div>
        </div>
      </div>

      {/* Bulk Actions Toolbar */}
      {selectedIds.length > 0 && (
        <div className="shrink-0 px-6 py-3 bg-amber-50/70 dark:bg-amber-500/10 border-b border-amber-200/50 dark:border-amber-500/20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
              {selectedIds.length} selected
            </span>
            <button
              onClick={() => setSelectedIds([])}
              className="text-[10px] text-amber-600 dark:text-amber-400 hover:underline font-medium"
            >
              Clear selection
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleBatchAction('approve')}
              disabled={isBatchProcessing}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold uppercase flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50"
            >
              {isBatchProcessing ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle size={11} />}
              Approve All
            </button>
            <button
              onClick={() => handleBatchAction('reject')}
              disabled={isBatchProcessing}
              className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-[10px] font-bold uppercase flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50"
            >
              {isBatchProcessing ? <Loader2 size={11} className="animate-spin" /> : <XCircle size={11} />}
              Reject All
            </button>
            {/* Permanent bulk delete — destructive, lives last */}
            <button
              onClick={() => setDeleteTarget({ mode: 'bulk', count: selectedIds.length })}
              disabled={isBatchProcessing || isDeleting}
              className="px-3 py-1.5 border border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/10 rounded-lg text-[10px] font-bold uppercase flex items-center gap-1.5 transition-colors disabled:opacity-50"
              title="Permanently remove selected submissions from the database"
            >
              {isDeleting ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
              Delete Forever
            </button>
          </div>
        </div>
      )}

      {/* Filters Toolbar */}
      <div className="shrink-0 px-6 py-4 bg-white dark:bg-[#151518]/20 border-b border-neutral-200/50 dark:border-white/5 flex flex-col md:flex-row gap-4 items-center justify-between">
        
        {/* Search Input Box */}
        <form onSubmit={handleSearchSubmit} className="relative w-full md:w-80 shrink-0">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            placeholder="Search titles, excerpt keywords or author..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-8 py-2 bg-neutral-100 dark:bg-[#18181b] border border-neutral-200/60 dark:border-white/5 focus:border-neutral-400 dark:focus:border-white/20 focus:outline-none rounded-lg text-xs text-neutral-900 dark:text-white placeholder-neutral-400/80 transition-colors shadow-inner"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={clearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-900 dark:hover:text-white text-[10px] font-bold"
            >
              Clear
            </button>
          )}
        </form>

        {/* View mode toggle and Category status Filters */}
        <div className="flex items-center gap-3 w-full md:w-auto overflow-x-auto justify-between md:justify-end">
          
          {/* Apple HIG Segmented Buttons */}
          <div className="flex p-0.5 bg-neutral-100 dark:bg-black/20 rounded-lg border border-neutral-200/30 dark:border-white/[0.02]">
            {['all', 'pending', 'approved', 'rejected', 'draft'].map((s) => (
              <button
                key={s}
                onClick={() => handleStatusChange(s)}
                className={`px-3 py-1.5 text-[10px] font-bold uppercase rounded-md transition-all ${
                  statusFilter === s
                    ? 'bg-white dark:bg-[#1d1d22] text-neutral-900 dark:text-white shadow-sm border border-neutral-200/40 dark:border-white/5'
                    : 'text-neutral-500 dark:text-neutral-450 hover:text-neutral-900 dark:hover:text-white border border-transparent'
                }`}
              >
                {s === 'all' ? 'All' : statusConfig[s]?.label || s}
              </button>
            ))}
          </div>

          <span className="h-4 w-px bg-neutral-200 dark:bg-white/10 hidden md:inline" />

          {/* Grid/List View Toggler */}
          <div className="flex p-0.5 bg-neutral-100 dark:bg-black/20 rounded-lg border border-neutral-200/30 dark:border-white/[0.02] shrink-0">
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition-all ${
                viewMode === 'list'
                  ? 'bg-white dark:bg-[#1d1d22] text-neutral-900 dark:text-white shadow-sm border border-neutral-200/40 dark:border-white/5'
                  : 'text-neutral-450 hover:text-neutral-800 dark:hover:text-white'
              }`}
              title="Notion List View"
            >
              <List size={13} />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-all ${
                viewMode === 'grid'
                  ? 'bg-white dark:bg-[#1d1d22] text-neutral-900 dark:text-white shadow-sm border border-neutral-200/40 dark:border-white/5'
                  : 'text-neutral-450 hover:text-neutral-800 dark:hover:text-white'
              }`}
              title="Gallery Grid View"
            >
              <LayoutGrid size={13} />
            </button>
          </div>
        </div>

      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <AnimatePresence mode="wait">
          {isLoading ? (
            /* Skeleton Loader Shimmer */
            <div key="loader" className="h-full space-y-4 animate-pulse">
              {viewMode === 'list' ? (
                <div className="border border-neutral-200/40 dark:border-white/5 rounded-2xl bg-white dark:bg-[#151518]/70 overflow-hidden divide-y divide-neutral-150 dark:divide-white/5">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="h-16 flex items-center px-4 justify-between">
                      <div className="flex items-center gap-3 w-1/3">
                        <div className="w-10 h-7 rounded bg-neutral-200/50 dark:bg-neutral-800" />
                        <div className="h-3 w-32 bg-neutral-200/50 dark:bg-neutral-800 rounded" />
                      </div>
                      <div className="h-3 w-20 bg-neutral-200/50 dark:bg-neutral-800 rounded" />
                      <div className="h-3 w-24 bg-neutral-200/50 dark:bg-neutral-800 rounded" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="h-64 bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 rounded-2xl p-4 flex flex-col gap-3">
                      <div className="h-36 w-full rounded bg-neutral-200/50 dark:bg-neutral-800" />
                      <div className="h-3.5 w-3/4 bg-neutral-200/50 dark:bg-neutral-800 rounded" />
                      <div className="h-3 w-1/2 bg-neutral-200/50 dark:bg-neutral-800 rounded" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : submissions.length === 0 ? (
            <div key="empty" className="h-full flex flex-col items-center justify-center gap-3 py-20 border border-dashed border-neutral-200 dark:border-white/5 bg-white dark:bg-[#151518]/25 rounded-2xl">
              <FileText size={28} className="text-neutral-300 dark:text-neutral-700" />
              <p className="text-xs font-bold text-neutral-500 uppercase tracking-wider">No posts matches your search criteria</p>
              {statusFilter !== 'all' && (
                <button 
                  onClick={() => handleStatusChange('all')} 
                  className="text-[10px] font-bold text-neutral-800 dark:text-white uppercase tracking-wider hover:underline mt-1"
                >
                  Reset Filter
                </button>
              )}
            </div>
          ) : viewMode === 'list' ? (
            /* Notion Table List View */
            <motion.div
              key="list-layout"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="border border-neutral-200/40 dark:border-white/5 rounded-2xl bg-white dark:bg-[#151518]/70 overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.01)]"
            >
              <div className="w-full overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-neutral-200/50 dark:border-white/5 text-[10px] font-bold text-neutral-450 dark:text-neutral-500 uppercase tracking-wider bg-neutral-50/30 dark:bg-[#121214]/20">
                      <th className="py-3.5 px-4 w-10">
                        <button
                          onClick={toggleSelectAll}
                          className="p-0.5 rounded hover:bg-neutral-200/50 dark:hover:bg-white/10 transition-colors"
                        >
                          {selectedIds.length === submissions.length && submissions.length > 0 ? (
                            <CheckSquare size={13} className="text-neutral-700 dark:text-neutral-300" />
                          ) : (
                            <Square size={13} className="text-neutral-400" />
                          )}
                        </button>
                      </th>
                      <th className="py-3.5 px-4">Article Details</th>
                      <th className="py-3.5 px-4 w-28">Status</th>
                      <th className="py-3.5 px-4 w-40">Writer</th>
                      <th className="py-3.5 px-4 w-32">Category</th>
                      <th className="py-3.5 px-4 w-32">Published</th>
                      <th className="py-3.5 px-4 w-24 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-150 dark:divide-white/5">
                    {submissions.map((item) => (
                      <tr
                        key={item._id}
                        className="hover:bg-neutral-50/50 dark:hover:bg-white/[0.01] transition-colors cursor-pointer group"
                      >
                        <td className="py-3 px-4 w-10" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => toggleSelect(item._id)}
                            className="p-0.5 rounded hover:bg-neutral-200/50 dark:hover:bg-white/10 transition-colors"
                          >
                            {selectedIds.includes(item._id) ? (
                              <CheckSquare size={13} className="text-neutral-700 dark:text-neutral-300" />
                            ) : (
                              <Square size={13} className="text-neutral-400" />
                            )}
                          </button>
                        </td>
                        <td className="py-3 px-4 min-w-[280px]" onClick={() => navigate(`/editorial/${item._id}`)}>
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-9 rounded bg-neutral-100 dark:bg-black/20 overflow-hidden shrink-0 border border-neutral-200/50 dark:border-white/5 relative">
                              {item.coverImage ? (
                                <img 
                                  src={item.coverImage} 
                                  alt="" 
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <FileText size={12} className="text-neutral-400 dark:text-neutral-600" />
                                </div>
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-neutral-800 dark:text-neutral-200 truncate group-hover:text-neutral-900 dark:group-hover:text-white transition-colors">
                                {item.title}
                              </p>
                              {item.excerpt && (
                                <p className="text-[10px] text-neutral-450 dark:text-neutral-500 truncate mt-0.5 max-w-[400px]">
                                  {item.excerpt}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        
                        <td className="py-3 px-4">
                          <StatusBadge status={item.status} />
                        </td>

                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <div className="w-5 h-5 rounded-full bg-neutral-100 dark:bg-white/10 flex items-center justify-center text-[8.5px] font-bold text-neutral-600 dark:text-neutral-300 uppercase overflow-hidden shrink-0">
                              {item.author?.avatar ? (
                                <img src={item.author.avatar} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <span>{item.author?.name ? item.author.name[0] : 'U'}</span>
                              )}
                            </div>
                            <span className="font-medium text-neutral-700 dark:text-neutral-350 truncate max-w-[120px]">{item.author?.name || 'Unknown Writer'}</span>
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          {item.category ? (
                            <span className="px-1.5 py-0.5 bg-neutral-100 dark:bg-white/5 text-neutral-500 dark:text-neutral-450 rounded text-[9.5px] font-semibold border border-neutral-200/50 dark:border-white/5">
                              {item.category}
                            </span>
                          ) : (
                            <span className="text-[10px] text-neutral-450 dark:text-neutral-550 italic">—</span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-neutral-450 dark:text-neutral-500">
                          {new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>

                        <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            {item.sanityUrl && (
                              <a
                                href={item.sanityUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 rounded-lg border border-neutral-200/55 dark:border-white/5 text-neutral-450 dark:text-neutral-500 hover:text-neutral-800 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5 transition-all shadow-sm"
                                title="Open Live post"
                              >
                                <ExternalLink size={12} />
                              </a>
                            )}
                            <button
                              onClick={() => navigate(`/editorial/${item._id}`)}
                              className="p-1.5 rounded-lg border border-neutral-200/55 dark:border-white/5 text-neutral-450 dark:text-neutral-500 hover:text-neutral-800 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5 transition-all shadow-sm"
                              title="Inspect Submissions"
                            >
                              <ArrowRight size={12} />
                            </button>
                            {/* Permanent delete — destructive, lives last */}
                            <button
                              onClick={() => setDeleteTarget({ mode: 'single', id: item._id, title: item.title })}
                              disabled={isDeleting}
                              className="p-1.5 rounded-lg border border-red-500/25 text-red-500 dark:text-red-400 hover:bg-red-500/10 transition-all shadow-sm disabled:opacity-40"
                              title="Permanently delete this submission"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          ) : (
            /* Gallery Card Grid View */
            <motion.div
              key="grid-layout"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
            >
              {submissions.map((item) => (
                <div
                  key={item._id}
                  onClick={() => navigate(`/editorial/${item._id}`)}
                  className="group bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.01)] hover:border-neutral-350 dark:hover:border-neutral-850 hover:shadow-md transition-all duration-300 flex flex-col cursor-pointer"
                >
                  {/* Grid Cover */}
                  <div className="aspect-[1.8/1] w-full bg-neutral-100 dark:bg-black/20 relative overflow-hidden border-b border-neutral-200/40 dark:border-white/5 shrink-0">
                    {item.coverImage ? (
                      <img 
                        src={item.coverImage} 
                        alt="" 
                        className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300" 
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <FileText size={20} className="text-neutral-400 dark:text-neutral-600" />
                      </div>
                    )}
                    
                    {/* Floating elements */}
                    <div className="absolute top-3 right-3">
                      <StatusBadge status={item.status} />
                    </div>

                    {item.category && (
                      <div className="absolute bottom-3 left-3">
                        <span className="px-2 py-0.5 rounded-full bg-neutral-900/80 backdrop-blur-sm text-white text-[9px] font-semibold tracking-wide border border-white/5">
                          {item.category}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Body details */}
                  <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                    <div className="space-y-1">
                      <h3 className="text-xs font-semibold text-neutral-850 dark:text-neutral-200 group-hover:text-neutral-900 dark:group-hover:text-white transition-colors line-clamp-1 leading-snug">
                        {item.title}
                      </h3>
                      {item.excerpt && (
                        <p className="text-[10px] text-neutral-450 dark:text-neutral-500 line-clamp-2 leading-relaxed">
                          {item.excerpt}
                        </p>
                      )}
                    </div>

                    <div className="pt-2 border-t border-neutral-100 dark:border-white/[0.03] flex items-center justify-between text-[10px] text-neutral-450 dark:text-neutral-500">
                      <div className="flex items-center gap-1.5">
                        <div className="w-4 h-4 rounded-full bg-neutral-100 dark:bg-white/10 flex items-center justify-center text-[8px] font-bold text-neutral-600 dark:text-neutral-300 uppercase overflow-hidden shrink-0">
                          {item.author?.avatar ? (
                            <img src={item.author.avatar} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span>{item.author?.name ? item.author.name[0] : 'U'}</span>
                          )}
                        </div>
                        <span className="font-medium">{item.author?.name || 'Unknown Writer'}</span>
                      </div>
                      
                      <span>{new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                    </div>
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Pagination Footer */}
      <div className="shrink-0 px-6 py-3 border-t border-neutral-200/50 dark:border-white/5 bg-white/40 dark:bg-[#121214]/40 backdrop-blur-sm flex items-center justify-between transition-colors text-xs font-medium">
        <span className="text-[10px] font-semibold text-neutral-450 dark:text-neutral-550 font-mono">
          Page {pagination.page} of {pagination.pages || 1}
        </span>
        
        <div className="flex items-center gap-2">
          <button
            disabled={pagination.page <= 1}
            onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
            className="p-1.5 rounded-lg bg-white dark:bg-[#18181b] border border-neutral-200/50 dark:border-white/5 text-neutral-550 hover:text-neutral-800 dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-neutral-50 dark:hover:bg-white/5 transition-all shadow-sm"
            title="Previous Page"
          >
            <ChevronLeft size={13} />
          </button>
          
          <button
            disabled={pagination.page >= pagination.pages}
            onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
            className="p-1.5 rounded-lg bg-white dark:bg-[#18181b] border border-neutral-200/50 dark:border-white/5 text-neutral-550 hover:text-neutral-800 dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-neutral-50 dark:hover:bg-white/5 transition-all shadow-sm"
            title="Next Page"
          >
            <ChevronRight size={13} />
          </button>
        </div>
      </div>

      {/* Permanent delete confirmation — requires typing DELETE */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => { if (!isDeleting) setDeleteTarget(null); }}
        onConfirm={handleDeleteConfirmed}
        title={deleteTarget?.mode === 'bulk'
          ? `Permanently delete ${deleteTarget.count} submission(s)?`
          : deleteTarget ? `Permanently delete "${deleteTarget.title}"?` : ''}
        intent="danger"
        actionIcon="delete"
        confirmLabel="Delete forever"
        requireText="DELETE"
        busy={isDeleting}
      >
        {deleteTarget?.mode === 'bulk'
          ? <>Selected drafts, pending, and rejected posts are wiped from the database for good — no undo. Approved/live posts are skipped; unpublish those from Live Posts first.</>
          : <>This wipes the submission and its content from the database for good — no undo, no trash. If it was already approved, the live copy is removed too.</>}
      </ConfirmDialog>

    </div>
  );
};

export default AllPosts;
