import { useState, useEffect } from 'react';
import { 
  FileText, 
  CheckCircle, 
  XCircle, 
  Clock,
  Search,
  ArrowUpRight,
  Filter
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import adminAPI from '@/api/adminAPI';

const statusConfig = {
  pending: { color: 'text-[#ffa502]', bg: 'bg-[#ffa502]/15', label: 'Pending', icon: Clock },
  approved: { color: 'text-[#2ed573]', bg: 'bg-[#2ed573]/15', label: 'Approved', icon: CheckCircle },
  rejected: { color: 'text-[#ff4757]', bg: 'bg-[#ff4757]/15', label: 'Rejected', icon: XCircle },
  draft: { color: 'text-[#a8b3cf]', bg: 'bg-[#a8b3cf]/15', label: 'Draft', icon: FileText },
};

const AllPosts = () => {
  const [submissions, setSubmissions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [pagination, setPagination] = useState({ page: 1, total: 0, pages: 1 });
  const navigate = useNavigate();

  const fetchAllPosts = async (page = pagination.page, status = statusFilter, search = searchQuery) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '50',
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

  // Fetch when filters change
  useEffect(() => {
    fetchAllPosts(pagination.page, statusFilter, searchQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, pagination.page]);

  const handleSearch = (e) => {
    e.preventDefault();
    fetchAllPosts(1, statusFilter, searchQuery);
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handleStatusChange = (status) => {
    setStatusFilter(status);
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const StatusBadge = ({ status }) => {
    const cfg = statusConfig[status] || statusConfig.draft;
    const Icon = cfg.icon;
    return (
      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[6px] text-[9px] font-bold uppercase ${cfg.color} ${cfg.bg}`}>
        <Icon size={10} />
        {cfg.label}
      </span>
    );
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-white/10">
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">All <span className="text-[#00f0ff]">Posts</span></h1>
          <p className="text-xs text-gray-500 dark:text-[#a8b3cf]">Manage every blog post across all statuses</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-gray-500 dark:text-[#a8b3cf]">{pagination.total} total</span>
        </div>
      </div>

      {/* Filters */}
      <div className="shrink-0 px-4 py-3 border-b border-gray-200 dark:border-white/10 space-y-3">
        {/* Search */}
        <form onSubmit={handleSearch} className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by title or author..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs bg-gray-100 dark:bg-[#0d0d0f] border border-gray-200 dark:border-white/10 rounded-[8px] text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-[#00f0ff]/50 transition-all"
          />
        </form>

        {/* Status Filter Tabs */}
        <div className="flex gap-1.5 flex-wrap">
          {['all', 'pending', 'approved', 'rejected', 'draft'].map((s) => (
            <button
              key={s}
              onClick={() => handleStatusChange(s)}
              className={`px-3 py-1.5 text-[10px] font-bold uppercase rounded-[6px] transition-all ${
                statusFilter === s
                  ? 'bg-[#00f0ff] text-[#0d0d0f]'
                  : 'bg-gray-100 dark:bg-[#18181a] text-gray-500 dark:text-[#a8b3cf] hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              {s === 'all' ? 'All' : statusConfig[s]?.label || s}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="h-full flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-[#00f0ff] border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : submissions.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 py-16">
            <FileText size={32} className="text-gray-400" />
            <p className="text-xs font-bold text-gray-500 dark:text-[#a8b3cf] uppercase">No posts found</p>
            {statusFilter !== 'all' && (
              <button onClick={() => handleStatusChange('all')} className="text-[10px] font-bold text-[#00f0ff] hover:underline">
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-black/5 dark:divide-white/5">
            {submissions.map((item, idx) => (
              <motion.div
                key={item._id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: idx * 0.02 }}
                onClick={() => navigate(`/editorial/${item._id}`)}
                className="flex items-center gap-3 px-4 py-3 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer transition-colors group"
              >
                {/* Thumbnail */}
                <div className="w-12 h-10 rounded-[6px] bg-gray-100 dark:bg-[#0d0d0f] overflow-hidden shrink-0">
                  {item.coverImage ? (
                    <img src={item.coverImage} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <FileText size={14} className="text-gray-400" />
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{item.title}</p>
                    <StatusBadge status={item.status} />
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-gray-500 dark:text-[#a8b3cf]">
                    <span>{item.author?.name || 'Unknown'}</span>
                    <span>·</span>
                    <span>{new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    {item.sanityUrl && (
                      <>
                        <span>·</span>
                        <span className="text-[#2ed573]">Published</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Arrow */}
                <ArrowUpRight size={14} className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Footer Pagination */}
      <div className="shrink-0 px-4 py-2 border-t border-gray-200 dark:border-white/10 flex items-center justify-between">
        <span className="text-[9px] text-gray-500 dark:text-[#a8b3cf]">
          Page {pagination.page} of {pagination.pages || 1}
        </span>
        <div className="flex gap-2">
          <button
            disabled={pagination.page <= 1}
            onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
            className="px-3 py-1 text-[10px] font-bold bg-gray-100 dark:bg-[#18181a] text-gray-700 dark:text-gray-300 rounded-[6px] disabled:opacity-30 hover:opacity-80 transition-all"
          >
            Prev
          </button>
          <button
            disabled={pagination.page >= pagination.pages}
            onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
            className="px-3 py-1 text-[10px] font-bold bg-gray-100 dark:bg-[#18181a] text-gray-700 dark:text-gray-300 rounded-[6px] disabled:opacity-30 hover:opacity-80 transition-all"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

export default AllPosts;
