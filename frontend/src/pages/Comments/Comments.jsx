import { useState, useEffect } from 'react';
import {
  Search,
  MessageSquare,
  Trash2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  Loader2,
  X,
  RefreshCw,
  User,
  Calendar,
  Clock,
  Link as LinkIcon,
  Download
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import adminAPI from '@/api/adminAPI';

const itemVariants = {
  hidden: { opacity: 0, y: 6 },
  visible: (i) => ({
    opacity: 1, y: 0,
    transition: { delay: 0.01 * i, duration: 0.3, ease: [0.23, 1, 0.32, 1] },
  }),
};

export default function CommentsPage() {
  const [comments, setComments] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);

  // Redesign states
  const [selectedComment, setSelectedComment] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    fetchComments();
    fetchStats();
  }, [page, filter]);

  const fetchComments = async () => {
    setIsLoading(true);
    try {
      const res = await adminAPI.get(`/comments?page=${page}&limit=30&filter=${filter}&search=${encodeURIComponent(search)}`);
      if (res.success) {
        setComments(res.comments);
        setPagination(res.pagination);
      }
    } catch {
      toast.error('Failed to load comments');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await adminAPI.get('/comments/stats');
      if (res.success) setStats(res.stats);
    } catch {}
  };

  const handleSearch = (e) => {
    if (e) e.preventDefault();
    setPage(1);
    fetchComments();
  };

  const handleClearSearch = () => {
    setSearch('');
    setPage(1);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await adminAPI.delete(`/comments/${deleteTarget._id}`);
      if (res.success) {
        toast.success('Comment deleted');
        setComments(prev => prev.filter(c => c._id !== deleteTarget._id));
        setDeleteTarget(null);
        setSelectedComment(null);
        fetchStats();
      }
    } catch {
      toast.error('Failed to delete comment');
    } finally {
      setIsDeleting(false);
    }
  };

  const totalPages = pagination ? pagination.pages : 1;

  // Local helper stats
  const activeCount = stats ? stats.active : comments.filter(c => !c.isDeleted).length;
  const totalCount = stats ? stats.total : comments.length;
  const recentWeek = stats ? stats.recentWeek : 0;
  const deletedCount = Math.max(0, totalCount - activeCount);

  return (
    <div className="h-full flex flex-col bg-neutral-50/30 dark:bg-[#0d0d0f]/20 selection:bg-neutral-200/50 dark:selection:bg-neutral-400/40">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-neutral-200/50 dark:border-white/5 bg-white/40 dark:bg-[#121214]/40 backdrop-blur-sm">
        <div>
          <h1 className="text-base font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
            Comments Moderation
          </h1>
          <p className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-0.5">
            {stats ? `Moderate ${stats.active} active comment threads across your published content` : 'Review and delete user comments'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              try {
                const params = new URLSearchParams({ filter });
                const res = await adminAPI.get(`/export/comments?${params}`, { responseType: 'blob' });
                const blob = new Blob([res], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url; a.download = `comments-${new Date().toISOString().split('T')[0]}.csv`;
                a.click(); URL.revokeObjectURL(url);
                toast.success('Comments exported');
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
              fetchComments();
              fetchStats();
              toast.success('Moderation dashboard updated');
            }}
            className="p-1.5 rounded-lg border border-neutral-200/50 dark:border-white/5 bg-white dark:bg-[#18181b] hover:bg-neutral-50 dark:hover:bg-white/5 text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-all shadow-sm flex items-center gap-1.5 text-[11px] font-medium"
          >
            <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Reactive stats cards */}
      <div className="shrink-0 p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total moderated threads */}
        <div className="bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 p-4 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex items-center justify-between group hover:border-neutral-300 dark:hover:border-neutral-800 transition-all">
          <div className="space-y-1">
            <span className="text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Total Threads</span>
            <p className="text-xl font-bold text-neutral-800 dark:text-neutral-100 leading-none">{totalCount}</p>
          </div>
          <div className="w-8 h-8 rounded-lg bg-neutral-100 dark:bg-neutral-800/50 flex items-center justify-center text-neutral-550">
            <MessageSquare size={15} strokeWidth={1.5} />
          </div>
        </div>

        {/* Active comments */}
        <div className="bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 p-4 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex items-center justify-between group hover:border-neutral-300 dark:hover:border-neutral-800 transition-all">
          <div className="space-y-1">
            <span className="text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Active comments</span>
            <p className="text-xl font-bold text-neutral-800 dark:text-neutral-100 leading-none">{activeCount}</p>
          </div>
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-500">
            <MessageCircle size={15} strokeWidth={1.5} />
          </div>
        </div>

        {/* Weekly Volume */}
        <div className="bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 p-4 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex items-center justify-between group hover:border-neutral-300 dark:hover:border-neutral-800 transition-all">
          <div className="space-y-1">
            <span className="text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Volume This Week</span>
            <p className="text-xl font-bold text-neutral-800 dark:text-neutral-100 leading-none">{recentWeek}</p>
          </div>
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-550">
            <Calendar size={15} strokeWidth={1.5} />
          </div>
        </div>

        {/* Deleted comments count */}
        <div className="bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 p-4 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex items-center justify-between group hover:border-neutral-300 dark:hover:border-neutral-800 transition-all">
          <div className="space-y-1">
            <span className="text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Deleted Threads</span>
            <p className="text-xl font-bold text-neutral-800 dark:text-neutral-100 leading-none">{deletedCount}</p>
          </div>
          <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center text-red-650 dark:text-red-500">
            <Trash2 size={15} strokeWidth={1.5} />
          </div>
        </div>
      </div>

      {/* Control Bar */}
      <div className="shrink-0 px-6 pb-4 flex flex-col md:flex-row gap-4 items-center justify-between">
        {/* Search */}
        <form onSubmit={handleSearch} className="w-full md:w-80 flex gap-2">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-neutral-550" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search comments..."
              className="w-full pl-9 pr-8 py-1.5 bg-white dark:bg-[#151518] border border-neutral-200/60 dark:border-white/5 rounded-lg text-xs text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:border-neutral-400 dark:focus:border-neutral-700 transition-all shadow-[0_1px_2px_rgba(0,0,0,0.01)]"
            />
            {search && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-750 dark:hover:text-white"
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

        {/* Filters */}
        <div className="p-0.5 rounded-lg bg-neutral-200/50 dark:bg-neutral-950/60 border border-neutral-200/40 dark:border-white/5 flex gap-0.5 shadow-inner">
          {['all', 'active', 'deleted'].map((f) => (
            <button
              key={f}
              onClick={() => {
                setFilter(f);
                setPage(1);
              }}
              className={`px-3 py-1 text-[11px] font-medium rounded-md uppercase transition-all ${
                filter === f
                  ? 'bg-white dark:bg-[#1b1b1e] text-neutral-900 dark:text-white shadow-sm'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-750 dark:hover:text-neutral-350'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Main Comment Rows */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {isLoading ? (
          /* Shimmer Pulse Loading */
          <div className="bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 rounded-xl p-4 divide-y divide-neutral-100 dark:divide-white/5 animate-pulse space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center justify-between py-3">
                <div className="flex gap-3 w-3/4">
                  <div className="w-8 h-8 bg-neutral-200/50 dark:bg-neutral-800 rounded-lg" />
                  <div className="space-y-1.5 flex-1">
                    <div className="h-3.5 bg-neutral-200/50 dark:bg-neutral-800 rounded w-1/4" />
                    <div className="h-2.5 bg-neutral-200/50 dark:bg-neutral-800 rounded w-2/3" />
                  </div>
                </div>
                <div className="h-4 bg-neutral-200/50 dark:bg-neutral-800 rounded w-16" />
              </div>
            ))}
          </div>
        ) : comments.length === 0 ? (
          <div className="bg-white dark:bg-[#151518]/40 border border-neutral-200/40 dark:border-white/5 rounded-2xl flex flex-col items-center justify-center py-20 shadow-sm">
            <MessageSquare size={28} strokeWidth={1.5} className="text-neutral-350 dark:text-neutral-600 mb-3" />
            <p className="text-xs font-semibold text-neutral-800 dark:text-neutral-300">No comments found</p>
            <p className="text-[11px] text-neutral-400 mt-1">Comments will appear here once users respond to articles.</p>
          </div>
        ) : (
          /* Tabular comments row database list */
          <div className="bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 rounded-xl overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.01)]">
            <div className="min-w-full divide-y divide-neutral-200/50 dark:divide-white/5">
              {/* Columns Header Names */}
              <div className="bg-neutral-50/50 dark:bg-neutral-900/30 px-5 py-2.5 flex items-center text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
                <div className="w-[25%]">Commenter</div>
                <div className="w-[45%]">Comment Preview</div>
                <div className="w-[20%]">Associated Post</div>
                <div className="w-[10%] text-right">Actions</div>
              </div>

              {/* Rows */}
              <div className="divide-y divide-neutral-150 dark:divide-white/5">
                {comments.map((comment, idx) => (
                  <div
                    key={comment._id}
                    onClick={() => setSelectedComment(comment)}
                    className={`px-5 py-3.5 flex items-center hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors cursor-pointer text-xs ${
                      comment.isDeleted ? 'opacity-45' : ''
                    } ${selectedComment?._id === comment._id ? 'bg-neutral-100/60 dark:bg-white/5 font-medium' : ''}`}
                  >
                    {/* User profile details */}
                    <div className="w-[25%] flex items-center gap-3 pr-4 min-w-0">
                      <div className="w-8 h-8 rounded-lg overflow-hidden border border-neutral-200/50 dark:border-white/10 bg-neutral-100 flex items-center justify-center shrink-0">
                        {comment.avatar ? (
                          <img src={comment.avatar} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-neutral-100 dark:bg-[#18181b]">
                            <User size={12} className="text-neutral-400" />
                          </div>
                        )}
                      </div>
                      <div className="truncate min-w-0">
                        <span className="truncate font-semibold text-neutral-900 dark:text-white block">
                          {comment.name}
                        </span>
                        {comment.username && (
                          <span className="text-[9px] text-neutral-450 dark:text-neutral-500 truncate block">
                            @{comment.username}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Excerpt comment body */}
                    <div className="w-[45%] pr-6 min-w-0">
                      <p className={`truncate text-neutral-700 dark:text-neutral-350 ${comment.isDeleted ? 'italic' : ''}`} title={comment.comment}>
                        {comment.comment}
                      </p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap text-[8px] text-neutral-400 font-medium">
                        <span>{new Date(comment.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        {comment.replyCount > 0 && (
                          <span className="text-blue-600 dark:text-blue-400 font-semibold">• {comment.replyCount} {comment.replyCount === 1 ? 'reply' : 'replies'}</span>
                        )}
                        {comment.isDeleted && (
                          <span className="px-1 py-0.2 bg-red-500/10 border border-red-500/10 text-red-500 rounded text-[7px] font-bold">
                            DELETED
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Blog link name */}
                    <div className="w-[20%] pr-4 truncate text-neutral-400 dark:text-neutral-500 font-medium">
                      {comment.postTitle || 'No title reference'}
                    </div>

                    {/* Quick moderation action */}
                    <div className="w-[10%] text-right flex justify-end" onClick={(e) => e.stopPropagation()}>
                      {!comment.isDeleted ? (
                        <button
                          onClick={() => setDeleteTarget(comment)}
                          className="p-1.5 rounded hover:bg-red-500/10 text-neutral-450 hover:text-red-650 dark:hover:text-red-400 transition-colors"
                          title="Trash Comment"
                        >
                          <Trash2 size={13} />
                        </button>
                      ) : (
                        <span className="text-[10px] text-neutral-400 italic font-mono">—</span>
                      )}
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

      {/* Slide-over Comments Details Panel Inspector */}
      <AnimatePresence>
        {selectedComment && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedComment(null)}
              className="fixed inset-0 z-40 bg-black/30 dark:bg-black/60 backdrop-blur-[2px]"
            />

            {/* Slide pane */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-white dark:bg-[#151518] border-l border-neutral-200/50 dark:border-white/5 shadow-2xl flex flex-col justify-between overflow-hidden"
            >
              {/* Header drawer */}
              <div className="shrink-0 p-4 border-b border-neutral-200/50 dark:border-white/5 flex items-center justify-between">
                <span className="text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
                  Comment Thread Inspector
                </span>
                <button
                  onClick={() => setSelectedComment(null)}
                  className="p-1 rounded-lg hover:bg-neutral-100 dark:hover:bg-white/5 text-neutral-400 hover:text-neutral-750 dark:hover:text-white transition-colors"
                >
                  <X size={15} />
                </button>
              </div>

              {/* Scroll details content */}
              <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar text-xs">
                {/* Profile header card */}
                <div className="bg-neutral-50/50 dark:bg-[#1b1b1e]/50 border border-neutral-200/40 dark:border-white/5 rounded-xl p-4 flex items-center gap-3 shadow-sm">
                  <div className="w-10 h-10 rounded-xl overflow-hidden border border-neutral-200/50 dark:border-white/10 bg-neutral-150 flex items-center justify-center shrink-0">
                    {selectedComment.avatar ? (
                      <img src={selectedComment.avatar} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-neutral-100">
                        <User size={14} className="text-neutral-400" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-[12px] font-bold text-neutral-900 dark:text-white truncate">
                      {selectedComment.name}
                    </h2>
                    {selectedComment.username && (
                      <p className="text-[9px] text-neutral-400 dark:text-neutral-550 mt-0.5">@{selectedComment.username}</p>
                    )}
                  </div>
                </div>

                {/* Comment details scroll container */}
                <div className="space-y-2">
                  <span className="block text-[9px] font-semibold text-neutral-400 uppercase tracking-wider">
                    Full Comment Body
                  </span>
                  <div className="bg-neutral-50/50 dark:bg-[#1b1b1e]/30 border border-neutral-200/30 dark:border-white/5 rounded-xl p-4 max-h-[180px] overflow-y-auto custom-scrollbar font-sans text-neutral-800 dark:text-neutral-200 leading-relaxed break-words shadow-inner">
                    {selectedComment.isDeleted ? (
                      <p className="italic text-neutral-450 dark:text-neutral-500">
                        "{selectedComment.comment}"
                      </p>
                    ) : (
                      <p>"{selectedComment.comment}"</p>
                    )}
                  </div>
                </div>

                {/* Associated Blog info */}
                <div className="space-y-2">
                  <span className="block text-[9px] font-semibold text-neutral-400 uppercase tracking-wider">
                    Target Context
                  </span>
                  <div className="bg-neutral-50/50 dark:bg-[#1b1b1e]/30 border border-neutral-200/30 dark:border-white/5 rounded-xl p-3 space-y-2 font-medium text-neutral-500 dark:text-neutral-400">
                    <div className="flex items-center gap-2">
                      <LinkIcon size={12} className="text-neutral-400 shrink-0" />
                      <span className="truncate text-neutral-855 dark:text-neutral-350">{selectedComment.postTitle || 'No Title Referenced'}</span>
                    </div>
                    {selectedComment.postId && (
                      <div className="text-[9px] text-neutral-400 dark:text-neutral-500 font-mono truncate pl-5">
                        Post ID: {selectedComment.postId}
                      </div>
                    )}
                  </div>
                </div>

                {/* Technical meta info */}
                <div className="space-y-2">
                  <span className="block text-[9px] font-semibold text-neutral-400 uppercase tracking-wider">
                    Thread Status
                  </span>
                  <div className="bg-neutral-50/50 dark:bg-[#1b1b1e]/30 border border-neutral-200/30 dark:border-white/5 rounded-xl p-3 space-y-2 text-[10.5px] text-neutral-550 dark:text-neutral-400 font-medium">
                    <div className="flex items-center gap-2">
                      <Clock size={12} className="text-neutral-450 shrink-0" />
                      <span>Published: {new Date(selectedComment.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MessageCircle size={12} className="text-neutral-450 shrink-0" />
                      <span>Thread Replies: {selectedComment.replyCount || 0} active replies</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Administrative actions */}
              <div className="shrink-0 p-4 border-t border-neutral-200/50 dark:border-white/5 bg-neutral-50/50 dark:bg-neutral-900/30 flex justify-between gap-3">
                {!selectedComment.isDeleted ? (
                  <button
                    onClick={() => setDeleteTarget(selectedComment)}
                    className="flex-1 py-2 border border-red-500/20 text-red-650 dark:text-red-400 rounded-lg text-xs font-semibold bg-white dark:bg-[#18181b] hover:bg-red-500/10 transition-colors shadow-sm flex items-center justify-center gap-1.5"
                  >
                    <Trash2 size={12} />
                    Delete Comment
                  </button>
                ) : (
                  <div className="flex-1 py-2 text-center border border-neutral-200 dark:border-white/5 rounded-lg text-xs font-semibold text-neutral-400 bg-neutral-100 dark:bg-[#18181b] cursor-not-allowed">
                    Already Deleted
                  </div>
                )}
                <button
                  onClick={() => setSelectedComment(null)}
                  className="px-4 py-2 border border-neutral-200 dark:border-white/5 rounded-lg text-xs font-semibold text-neutral-500 hover:text-neutral-800 dark:hover:text-white bg-white dark:bg-[#18181b] hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors shadow-sm"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Confirm Deletion dialog */}
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
                      Delete Comment Thread
                    </h3>
                    <p className="text-[11px] text-neutral-400 leading-relaxed">
                      Delete comment by <strong className="text-neutral-800 dark:text-neutral-250">{deleteTarget.name}</strong>?
                    </p>
                  </div>
                </div>

                <div className="bg-neutral-50/50 dark:bg-[#18181a]/50 p-3 rounded-lg border border-neutral-200/40 dark:border-white/5 text-[10.5px] italic text-neutral-500 dark:text-neutral-400 leading-relaxed">
                  "{deleteTarget.comment.substring(0, 120)}..."
                </div>

                {deleteTarget.replyCount > 0 && (
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/10 text-amber-650 dark:text-amber-400 space-y-0.5">
                    <p className="text-[9px] font-bold uppercase tracking-wider flex items-center gap-1">
                      <AlertTriangle size={10} /> Active Replies Threaded
                    </p>
                    <p className="text-[10px] leading-relaxed">
                      This comment has {deleteTarget.replyCount} reply thread(s) nested under it.
                      Deleting it will delete the nested replies as well.
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
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="flex-1 py-2 rounded-lg text-xs font-semibold text-white bg-red-500 hover:bg-red-650 disabled:opacity-40 transition-colors shadow-sm flex items-center justify-center gap-1.5"
                  >
                    {isDeleting ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <>
                        <Trash2 size={12} />
                        Confirm
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
}
