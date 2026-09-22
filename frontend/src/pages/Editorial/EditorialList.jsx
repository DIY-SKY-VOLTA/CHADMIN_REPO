import { useState, useEffect } from 'react';
import {
  FileText,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Search,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Loader2,
  Users,
  Inbox,
  PenLine
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import adminAPI from '@/api/adminAPI';
import ConfirmDialog from '@/components/UI/ConfirmDialog';

const getStatusConfig = (status) => ({
  pending:   { label: 'Pending',   icon: Clock,        color: '#d97706', bg: 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20' },
  approved:  { label: 'Approved',  icon: CheckCircle,  color: '#059669', bg: 'bg-emerald-55 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20' },
  rejected:  { label: 'Rejected',  icon: XCircle,      color: '#dc2626', bg: 'bg-red-50 dark:bg-red-550/10 border-red-200 dark:border-red-500/20' },
  draft:     { label: 'Draft',     icon: FileText,     color: '#737373', bg: 'bg-neutral-50 dark:bg-[#18181a] border-neutral-200 dark:border-white/5' },
})[status] || { label: status, icon: FileText, color: '#737373', bg: 'bg-neutral-50 dark:bg-[#18181a] border-neutral-200 dark:border-white/5' };

const tabs = [
  { key: 'pending',  label: 'Pending Review',  icon: Clock,       plural: 'awaiting review' },
  { key: 'approved', label: 'Approved Queue',  icon: CheckCircle, plural: 'approved posts' },
  { key: 'rejected', label: 'Rejected Queue',  icon: XCircle,     plural: 'rejected posts' },
];

const pageVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.03 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.23, 1, 0.32, 1] } },
};

const EditorialList = () => {
  const [submissions, setSubmissions] = useState([]);
  const [stats, setStats] = useState(null);
  const [activeTab, setActiveTab] = useState('pending');
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  // Pending permanent delete — { _id, title } renders the typed-confirmation dialog
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  // Pending rejection — { _id, title } renders the feedback dialog (required by the API)
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectFeedback, setRejectFeedback] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchSubmissions();
    fetchStats();
  }, [activeTab, page]);

  const fetchSubmissions = async () => {
    setIsLoading(true);
    try {
      const res = await adminAPI.get(`/blogs/${activeTab}?page=${page}&limit=30`);
      if (res.success) {
        const rawSubmissions = res.submissions || [];

        // Detect duplicates based on identical titles (case-insensitive)
        const titleCounts = {};
        rawSubmissions.forEach(sub => {
          const t = (sub.title || '').trim().toLowerCase();
          titleCounts[t] = (titleCounts[t] || 0) + 1;
        });

        const flaggedSubmissions = rawSubmissions.map(sub => {
          const t = (sub.title || '').trim().toLowerCase();
          const isDuplicate = t ? titleCounts[t] > 1 : false;
          return { ...sub, isDuplicate };
        });

        setSubmissions(flaggedSubmissions);
        setPagination(res.pagination || null);
      }
    } catch {
      toast.error('Failed to load submissions');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await adminAPI.get('/blogs/dashboard/stats');
      if (res.success) setStats(res.stats);
    } catch {
      // stats are optional — the queue works without them
    }
  };

  const handleQuickAction = async (id, action) => {
    if (action === 'reject') {
      // The API requires feedback for rejections — collect it in a dialog
      setRejectTarget(submissions.find(s => s._id === id) || null);
      setRejectFeedback('');
      return;
    }
    try {
      await adminAPI.post(`/blogs/submissions/${id}/${action}`, {});
      toast.success('Approved and published');
      fetchSubmissions();
      fetchStats();
    } catch (err) {
      toast.error(err?.message || 'Action failed');
    }
  };

  const handleRejectConfirm = async () => {
    if (!rejectTarget) return;
    setIsRejecting(true);
    try {
      const res = await adminAPI.post(`/blogs/submissions/${rejectTarget._id}/reject`, {
        feedback: rejectFeedback.trim(),
      });
      toast.success(res.message || 'Rejected with feedback');
      setRejectTarget(null);
      setRejectFeedback('');
      setExpandedId(null);
      fetchSubmissions();
      fetchStats();
    } catch (err) {
      toast.error(err?.message || 'Rejection failed');
    } finally {
      setIsRejecting(false);
    }
  };

  // Permanent delete — wipes the MongoDB record outright (test drafts and
  // rejected junk). The backend refuses approved/live posts; unpublish those
  // from Live Posts first. adminAPI's interceptor rejects with the response
  // body, so the server's reason is at err.message directly.
  const handleDeleteSubmission = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await adminAPI.delete(`/blogs/submissions/${deleteTarget._id}`);
      toast.success(res.message || 'Submission permanently deleted');
      setDeleteTarget(null);
      setExpandedId(null);
      fetchSubmissions();
      fetchStats();
    } catch (err) {
      toast.error(err?.message || 'Delete failed');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setPage(1);
  };

  const filteredSubmissions = submissions.filter(sub => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    return (
      (sub.title || '').toLowerCase().includes(query) ||
      (sub.author?.name || '').toLowerCase().includes(query) ||
      (sub.category || '').toLowerCase().includes(query)
    );
  });

  const activeTabMeta = tabs.find(t => t.key === activeTab);
  const statCards = stats ? [
    { label: 'Awaiting Review', value: stats.pending,  icon: Inbox,        tone: 'text-amber-600 dark:text-amber-500 bg-amber-500/10', tab: 'pending' },
    { label: 'Approved Posts',  value: stats.approved, icon: CheckCircle,  tone: 'text-emerald-600 dark:text-emerald-500 bg-emerald-500/10', tab: 'approved' },
    { label: 'Rejected Posts',  value: stats.rejected, icon: XCircle,      tone: 'text-red-600 dark:text-red-500 bg-red-500/10', tab: 'rejected' },
    { label: 'Contributors',    value: stats.authors,  icon: Users,        tone: 'text-blue-600 dark:text-blue-500 bg-blue-500/10', tab: null },
  ] : null;

  return (
    <div className="h-full flex flex-col bg-neutral-50/30 dark:bg-[#0d0d0f]/20 selection:bg-neutral-200/50 dark:selection:bg-neutral-400/40">

      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-neutral-200/50 dark:border-white/5 bg-white/40 dark:bg-[#121214]/40 backdrop-blur-sm">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
            Editorial Queue
          </h1>
          <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5">
            {stats?.pending > 0
              ? `${stats.pending} ${stats.pending === 1 ? 'submission' : 'submissions'} awaiting review`
              : 'Audit submissions, check duplicates, and process editorial actions'}
          </p>
        </div>

        <button
          onClick={() => navigate('/posts')}
          className="p-2 rounded-lg border border-neutral-200/50 dark:border-white/5 bg-white dark:bg-[#18181b] hover:bg-neutral-50 dark:hover:bg-white/5 text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-all shadow-sm flex items-center gap-1.5 text-xs font-medium"
        >
          <BookOpen size={13} />
          View All Posts
        </button>
      </div>

      {/* Stat cards — live counts from the dashboard stats endpoint */}
      {statCards && (
        <div className="shrink-0 p-6 pb-0 grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map(({ label, value, icon: Icon, tone, tab }) => (
            <button
              key={label}
              type="button"
              onClick={() => tab && handleTabChange(tab)}
              disabled={!tab}
              className={`bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 p-4 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex items-center justify-between transition-all text-left ${
                tab ? 'hover:border-neutral-300 dark:hover:border-neutral-800' : 'cursor-default'
              } ${activeTab === tab ? 'border-neutral-400 dark:border-neutral-700 ring-1 ring-neutral-900/5 dark:ring-white/5' : ''}`}
            >
              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">{label}</span>
                <p className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100 leading-none">{value}</p>
              </div>
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${tone}`}>
                <Icon size={16} strokeWidth={1.5} />
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Search & Segmented Filter Bar */}
      <div className="shrink-0 px-6 py-4 bg-white dark:bg-[#151518]/20 border-b border-neutral-200/50 dark:border-white/5 flex flex-col sm:flex-row gap-4 items-center justify-between">

        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by title, author, category…"
            className="w-full pl-9 pr-4 py-2 bg-white dark:bg-[#151518] border border-neutral-200/60 dark:border-white/5 focus:border-neutral-400 dark:focus:border-white/20 focus:ring-2 focus:ring-neutral-900/5 dark:focus:ring-white/5 focus:outline-none rounded-lg text-[13px] text-neutral-900 dark:text-white placeholder-neutral-400 transition-colors shadow-[0_1px_2px_rgba(0,0,0,0.01)]"
          />
        </div>

        {/* Tab Controls */}
        <div className="flex p-0.5 bg-neutral-200/50 dark:bg-neutral-950/60 rounded-lg border border-neutral-200/40 dark:border-white/5 w-full sm:w-auto overflow-x-auto shrink-0 shadow-inner">
          {tabs.map((tab) => {
            const StatusIcon = tab.icon;
            const isActive = activeTab === tab.key;
            const count = stats ? stats[tab.key] : null;
            return (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                  isActive
                    ? 'bg-white dark:bg-[#1b1b1e] text-neutral-900 dark:text-white shadow-sm'
                    : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                <StatusIcon size={12} strokeWidth={1.5} className={isActive ? 'text-neutral-800 dark:text-white' : 'text-neutral-400'} />
                {tab.label}
                {count != null && count > 0 && (
                  <span className={`px-1.5 py-px rounded text-[10px] font-bold leading-4 ${
                    isActive
                      ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900'
                      : 'bg-neutral-200/80 dark:bg-white/10 text-neutral-500 dark:text-neutral-400'
                  }`}>
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* List Container */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="space-y-3 animate-pulse">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 rounded-2xl p-4" />
            ))}
          </div>
        ) : filteredSubmissions.length === 0 ? (
          <div className="bg-white dark:bg-[#151518]/40 border border-neutral-200/40 dark:border-white/5 rounded-2xl flex flex-col items-center justify-center py-20 shadow-sm">
            <FileText size={32} strokeWidth={1.5} className="text-neutral-350 dark:text-neutral-600 mb-3" />
            <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-300">
              {searchQuery
                ? 'No matching submissions'
                : activeTab === 'pending'
                ? 'Queue is clear'
                : `No ${activeTabMeta?.plural || 'posts'} yet`}
            </p>
            <p className="text-xs text-neutral-400 mt-1">
              {searchQuery
                ? 'Try a different search term.'
                : activeTab === 'pending'
                ? 'New submissions from writers will appear here for review.'
                : activeTab === 'approved'
                ? 'Approved posts move to Live Posts once published.'
                : 'Rejected submissions are kept here with feedback.'}
            </p>
          </div>
        ) : (
          <>
            <motion.div
              className="space-y-3"
              variants={pageVariants}
              initial="hidden"
              animate="visible"
            >
              <AnimatePresence mode="popLayout">
                {filteredSubmissions.map((item) => {
                  const config = getStatusConfig(item.status);
                  const isExpanded = expandedId === item._id;
                  return (
                    <motion.div
                      key={item._id}
                      layout
                      variants={itemVariants}
                      exit={{ opacity: 0, y: -8 }}
                      className={`group bg-white dark:bg-[#151518]/70 border rounded-2xl overflow-hidden transition-all duration-300 shadow-[0_1px_3px_rgba(0,0,0,0.01)] ${
                        isExpanded
                          ? 'border-neutral-300 dark:border-neutral-800'
                          : 'border-neutral-200/40 dark:border-white/5 hover:border-neutral-350 dark:hover:border-neutral-850'
                      }`}
                    >
                      <div
                        onClick={() => setExpandedId(isExpanded ? null : item._id)}
                        className="flex items-center gap-4 px-5 py-3.5 cursor-pointer select-none"
                      >
                        {/* Cover Thumbnail */}
                        <div className="w-12 h-9 rounded bg-neutral-50 dark:bg-black/25 overflow-hidden shrink-0 border border-neutral-200/50 dark:border-white/5">
                          {item.coverImage ? (
                            <img src={item.coverImage} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <FileText size={13} className="text-neutral-400 dark:text-neutral-605" />
                            </div>
                          )}
                        </div>

                        {/* Title / Author */}
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-[13px] font-semibold text-neutral-900 dark:text-neutral-200 truncate group-hover:text-neutral-950 dark:group-hover:text-white transition-colors">
                              {item.title}
                            </p>

                            {/* Duplicate Detection Alert Badge */}
                            {item.isDuplicate && activeTab === 'pending' && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-550/20 text-[9px] font-bold text-amber-600 dark:text-amber-500 uppercase tracking-wider font-mono">
                                <AlertTriangle size={9} />
                                Possible Duplicate
                              </span>
                            )}

                            {/* Editorial transparency — content was adjusted during approval */}
                            {item.adminEdits?.edited && (
                              <span
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-[9px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider"
                                title={`${item.adminEdits.summary || 'Content adjusted'} — by ${item.adminEdits.adminName || 'admin'}${item.adminEdits.editedAt ? `, ${new Date(item.adminEdits.editedAt).toLocaleDateString()}` : ''}`}
                              >
                                <PenLine size={9} />
                                Edited by Admin
                              </span>
                            )}
                          </div>
                          <p className="text-[11.5px] text-neutral-400 dark:text-neutral-500 mt-0.5">
                            by <span className="font-semibold text-neutral-500 dark:text-neutral-400">{item.author?.name || 'Unknown author'}</span>
                            <span className="mx-1.5 text-neutral-300 dark:text-neutral-700">·</span>
                            {new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          </p>
                        </div>

                        {/* Status badge */}
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase shrink-0 border border-neutral-200/40 dark:border-white/5 ${config.bg}`}
                          style={{ color: config.color }}
                        >
                          {config.label}
                        </span>

                        <ChevronRight size={14} className={`text-neutral-400 dark:text-neutral-600 transition-transform duration-300 ${isExpanded ? 'rotate-90' : ''} shrink-0`} />
                      </div>

                      {/* Expandable details drawer pane */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="px-5 pb-4"
                          >
                            <div className="ml-16 p-4 bg-neutral-50 dark:bg-[#0c0c0e]/30 rounded-xl border border-neutral-200/50 dark:border-white/5 space-y-3.5">
                              {item.excerpt && (
                                <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed font-normal">
                                  {item.excerpt}
                                </p>
                              )}

                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10.5px] font-mono text-neutral-400 dark:text-neutral-500 pt-2 border-t border-neutral-200/40 dark:border-white/[0.03]">
                                {item.readTime && <span>🕒 {item.readTime}</span>}
                                {item.category && <span>📂 {item.category}</span>}
                                {item.slug && <span>🔗 /{item.slug}</span>}
                              </div>

                              <div className="flex flex-wrap gap-2.5 pt-1">
                                <button
                                  onClick={(e) => { e.stopPropagation(); navigate(`/editorial/${item._id}`); }}
                                  className="px-3.5 py-2 text-xs font-semibold bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-50 active:scale-[0.98] rounded-lg transition-all shadow-sm"
                                >
                                  Review
                                </button>

                                {activeTab === 'pending' && (
                                  <>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleQuickAction(item._id, 'approve'); }}
                                      className="px-3.5 py-2 text-xs font-semibold bg-emerald-600 dark:bg-emerald-500 text-white hover:bg-emerald-700 dark:hover:bg-emerald-400 active:scale-[0.98] rounded-lg flex items-center gap-1.5 transition-all shadow-sm"
                                    >
                                      <CheckCircle size={12} />
                                      Approve
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleQuickAction(item._id, 'reject'); }}
                                      className="px-3.5 py-2 text-xs font-semibold bg-red-655 dark:bg-red-500 text-white hover:bg-red-700 dark:hover:bg-red-400 active:scale-[0.98] rounded-lg flex items-center gap-1.5 transition-all shadow-sm"
                                    >
                                      <XCircle size={12} />
                                      Reject
                                    </button>
                                  </>
                                )}

                                {/* Permanent delete — destructive, lives last */}
                                <button
                                  onClick={(e) => { e.stopPropagation(); setDeleteTarget({ _id: item._id, title: item.title }); }}
                                  disabled={isDeleting}
                                  className="px-3.5 py-2 text-xs font-semibold text-red-600 dark:text-red-400 bg-red-500/[0.06] border border-red-500/25 hover:bg-red-500/10 hover:border-red-500/40 active:scale-[0.98] rounded-lg flex items-center gap-1.5 transition-all disabled:opacity-40 ml-auto"
                                  title="Permanently remove this submission from the database"
                                >
                                  {isDeleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                                  Delete
                                </button>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </motion.div>

            {/* Pagination Footer */}
            {pagination && pagination.pages > 1 && (
              <div className="flex items-center justify-center gap-3 px-4 py-6">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  className="p-1.5 rounded-lg border border-neutral-200/60 dark:border-white/5 bg-white dark:bg-[#151518] text-neutral-500 hover:text-neutral-900 dark:hover:text-white disabled:opacity-30 transition-all shadow-sm"
                >
                  <ChevronLeft size={13} />
                </button>
                <span className="text-[11px] font-medium text-neutral-500">
                  Page {pagination.page} of {pagination.pages}
                </span>
                <button
                  disabled={page >= pagination.pages}
                  onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
                  className="p-1.5 rounded-lg border border-neutral-200/60 dark:border-white/5 bg-white dark:bg-[#151518] text-neutral-500 hover:text-neutral-900 dark:hover:text-white disabled:opacity-30 transition-all shadow-sm"
                >
                  <ChevronRight size={13} />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Rejection feedback dialog — the API requires a reason */}
      <ConfirmDialog
        open={!!rejectTarget}
        onClose={() => { if (!isRejecting) setRejectTarget(null); }}
        onConfirm={handleRejectConfirm}
        title={rejectTarget ? `Reject "${rejectTarget.title}"?` : ''}
        intent="warn"
        actionIcon="suspend"
        confirmLabel="Reject"
        inputLabel="Feedback (required — sent to the writer)"
        inputPlaceholder="e.g. needs more original research and sources"
        busy={isRejecting}
      >
        The writer is notified with your feedback. They can revise and resubmit — nothing is deleted.
      </ConfirmDialog>

      {/* Permanent delete confirmation — requires typing DELETE */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => { if (!isDeleting) setDeleteTarget(null); }}
        onConfirm={handleDeleteSubmission}
        title={deleteTarget ? `Permanently delete "${deleteTarget.title}"?` : ''}
        intent="danger"
        actionIcon="delete"
        confirmLabel="Delete forever"
        requireText="DELETE"
        busy={isDeleting}
      >
        This wipes the submission and its content from the database for good — no undo, no trash. If it was already approved, the live copy is removed too.
      </ConfirmDialog>

    </div>
  );
};

export default EditorialList;
