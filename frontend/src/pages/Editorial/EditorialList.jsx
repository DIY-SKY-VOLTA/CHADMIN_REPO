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
  ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import adminAPI from '@/api/adminAPI';

const getStatusConfig = (status) => ({
  pending:   { label: 'Pending',   icon: Clock,        color: '#d97706', bg: 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20' },
  approved:  { label: 'Approved',  icon: CheckCircle,  color: '#059669', bg: 'bg-emerald-55 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20' },
  rejected:  { label: 'Rejected',  icon: XCircle,      color: '#dc2626', bg: 'bg-red-50 dark:bg-red-550/10 border-red-200 dark:border-red-500/20' },
  draft:     { label: 'Draft',     icon: FileText,     color: '#737373', bg: 'bg-neutral-50 dark:bg-[#18181a] border-neutral-200 dark:border-white/5' },
})[status] || { label: status, icon: FileText, color: '#737373', bg: 'bg-neutral-50 dark:bg-[#18181a] border-neutral-200 dark:border-white/5' };

const tabs = [
  { key: 'pending',  label: 'Pending Review',  icon: Clock },
  { key: 'approved', label: 'Approved Queue', icon: CheckCircle },
  { key: 'rejected', label: 'Rejected Queue', icon: XCircle },
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
  const [activeTab, setActiveTab] = useState('pending');
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchSubmissions();
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

  const handleQuickAction = async (id, action) => {
    try {
      await adminAPI.post(`/blogs/submissions/${id}/${action}`, {});
      toast.success(action === 'approve' ? 'Approved!' : 'Rejected');
      fetchSubmissions();
    } catch {
      toast.error('Action failed');
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

  return (
    <div className="h-full flex flex-col bg-neutral-50/30 dark:bg-[#0d0d0f]/20 select-none">
      
      {/* Header bar */}
      <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-neutral-200/50 dark:border-white/5 bg-white/40 dark:bg-[#121214]/40 backdrop-blur-sm">
        <div>
          <h1 className="text-base font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
            Review Submissions
          </h1>
          <p className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-0.5">
            Audit draft articles in the submission queue, check duplicates, and process editorial actions
          </p>
        </div>
        
        <button 
          onClick={() => navigate('/posts')}
          className="p-1.5 rounded-lg border border-neutral-200/50 dark:border-white/5 bg-white dark:bg-[#18181b] hover:bg-neutral-50 dark:hover:bg-white/5 text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-all shadow-sm flex items-center gap-1.5 text-[11px] font-medium"
        >
          <BookOpen size={12} />
          View All Posts
        </button>
      </div>

      {/* Search & Segmented Filter Bar */}
      <div className="shrink-0 px-6 py-4 bg-white dark:bg-[#151518]/20 border-b border-neutral-200/50 dark:border-white/5 flex flex-col sm:flex-row gap-4 items-center justify-between">
        
        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by title, writer, category..."
            className="w-full pl-8 pr-4 py-2 bg-neutral-100 dark:bg-[#18181b] border border-neutral-200/60 dark:border-white/5 focus:border-neutral-400 dark:focus:border-white/20 focus:outline-none rounded-lg text-xs text-neutral-900 dark:text-white placeholder-neutral-400/80 transition-colors shadow-inner"
          />
        </div>

        {/* Tab Controls */}
        <div className="flex p-0.5 bg-neutral-100 dark:bg-black/20 rounded-lg border border-neutral-200/30 dark:border-white/[0.02] w-full sm:w-auto overflow-x-auto shrink-0">
          {tabs.map((tab) => {
            const StatusIcon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase rounded-md transition-all ${
                  isActive
                    ? 'bg-white dark:bg-[#1d1d22] text-neutral-900 dark:text-white shadow-sm border border-neutral-200/40 dark:border-white/5'
                    : 'text-neutral-550 hover:text-neutral-900 dark:hover:text-white border border-transparent'
                }`}
              >
                <StatusIcon size={11} className={isActive ? 'text-neutral-800 dark:text-white' : 'text-neutral-450'} />
                {tab.label}
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
          </div>          ) : (
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
                  return (
                    <motion.div
                      key={item._id}
                      layout
                      variants={itemVariants}
                      exit={{ opacity: 0, y: -8 }}
                      className="group bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 hover:border-neutral-350 dark:hover:border-neutral-850 rounded-2xl overflow-hidden transition-all duration-300 shadow-[0_1px_3px_rgba(0,0,0,0.01)]"
                    >
                      <div 
                        onClick={() => setExpandedId(expandedId === item._id ? null : item._id)}
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
                            <p className="text-xs font-bold text-neutral-800 dark:text-neutral-200 truncate group-hover:text-neutral-950 dark:group-hover:text-white transition-colors">
                              {item.title}
                            </p>
                            
                            {/* Duplicate Detection Alert Badge */}
                            {item.isDuplicate && activeTab === 'pending' && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-550/20 text-[8.5px] font-bold text-amber-600 dark:text-amber-500 uppercase tracking-wider font-mono">
                                <AlertTriangle size={9} />
                                Possible Duplicate
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-neutral-400 dark:text-neutral-500 mt-0.5">
                            by <span className="font-semibold text-neutral-500 dark:text-neutral-400">{item.author?.name || 'Unknown Writer'}</span>
                          </p>
                        </div>

                        {/* Status badge */}
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wide uppercase shrink-0 border border-neutral-200/40 dark:border-white/5 ${config.bg}`}
                          style={{ color: config.color }}
                        >
                          {config.label}
                        </span>

                        {/* Date */}
                        <span className="text-[10px] font-mono text-neutral-450 dark:text-neutral-550 shrink-0 hidden sm:block">
                          {new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </span>

                        <ChevronRight size={13} className={`text-neutral-400 dark:text-neutral-600 transition-transform duration-300 ${expandedId === item._id ? 'rotate-90' : ''} shrink-0`} />
                      </div>

                      {/* Expandable details drawer pane */}
                      <AnimatePresence>
                        {expandedId === item._id && (
                          <motion.div 
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="px-5 pb-4"
                          >
                            <div className="ml-16 p-4 bg-neutral-50 dark:bg-[#0c0c0e]/30 rounded-xl border border-neutral-200/50 dark:border-white/5 space-y-3.5">
                              {item.excerpt && (
                                <p className="text-[10.5px] text-neutral-500 dark:text-neutral-400 leading-relaxed font-normal">
                                  {item.excerpt}
                                </p>
                              )}
                              
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[9px] font-mono text-neutral-400 dark:text-neutral-500 pt-2 border-t border-neutral-200/40 dark:border-white/[0.03]">
                                {item.readTime && <span>🕒 {item.readTime}</span>}
                                {item.category && <span>📂 {item.category}</span>}
                                {item.slug && <span>🔗 /{item.slug}</span>}
                              </div>

                              <div className="flex gap-2.5 pt-1">
                                <button
                                  onClick={(e) => { e.stopPropagation(); navigate(`/editorial/${item._id}`); }}
                                  className="px-3.5 py-1.5 text-[10px] font-bold uppercase bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-50 rounded-lg transition-colors shadow-sm"
                                >
                                  Review & Edit
                                </button>
                                
                                {activeTab === 'pending' && (
                                  <>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleQuickAction(item._id, 'approve'); }}
                                      className="px-3.5 py-1.5 text-[10px] font-bold uppercase bg-emerald-600 dark:bg-emerald-500 text-white rounded-lg flex items-center gap-1.5 transition-colors shadow-sm"
                                    >
                                      <CheckCircle size={11} />
                                      Approve
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleQuickAction(item._id, 'reject'); }}
                                      className="px-3.5 py-1.5 text-[10px] font-bold uppercase bg-red-655 dark:bg-red-500 text-white rounded-lg flex items-center gap-1.5 transition-colors shadow-sm"
                                    >
                                      <XCircle size={11} />
                                      Reject
                                    </button>
                                  </>
                                )}
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
              <div className="shrink-0 px-4 py-4 border-t border-neutral-200/50 dark:border-white/5 bg-white/40 dark:bg-[#121214]/40 backdrop-blur-sm flex items-center justify-between transition-colors text-xs font-medium rounded-b-2xl mt-4">
                <span className="text-[10px] font-semibold text-neutral-450 dark:text-neutral-550 font-mono">
                  Page {pagination.page} of {pagination.pages}
                </span>
                
                <div className="flex items-center gap-2">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    className="p-1.5 rounded-lg bg-white dark:bg-[#18181b] border border-neutral-200/50 dark:border-white/5 text-neutral-550 hover:text-neutral-800 dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-neutral-50 dark:hover:bg-white/5 transition-all shadow-sm"
                  >
                    <ChevronLeft size={13} />
                  </button>
                  
                  <button
                    disabled={page >= pagination.pages}
                    onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
                    className="p-1.5 rounded-lg bg-white dark:bg-[#18181b] border border-neutral-200/50 dark:border-white/5 text-neutral-550 hover:text-neutral-800 dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-neutral-50 dark:hover:bg-white/5 transition-all shadow-sm"
                  >
                    <ChevronRight size={13} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

    </div>
  );
};

export default EditorialList;
