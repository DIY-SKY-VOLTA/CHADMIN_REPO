import { useState, useEffect } from 'react';
import { 
  FileText, 
  CheckCircle, 
  XCircle, 
  Clock,
  Search,
  ArrowUpRight,
  Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import adminAPI from '@/api/adminAPI';

const getStatusConfig = (status) => ({
  pending: { bg: 'bg-[#ffa502]/15', text: 'text-[#ffa502]', label: 'Pending', icon: Clock },
  approved: { bg: 'bg-[#2ed573]/15', text: 'text-[#2ed573]', label: 'Approved', icon: CheckCircle },
  rejected: { bg: 'bg-[#ff4757]/15', text: 'text-[#ff4757]', label: 'Rejected', icon: XCircle },
  draft: { bg: 'bg-[#a8b3cf]/15', text: 'text-[#a8b3cf]', label: 'Draft', icon: FileText },
})[status] || { bg: 'bg-gray-500/15', text: 'text-gray-500', label: status, icon: FileText };

const tabs = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
];

const EditorialList = () => {
  const [submissions, setSubmissions] = useState([]);
  const [activeTab, setActiveTab] = useState('pending');
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchSubmissions();
  }, [activeTab]);

  const fetchSubmissions = async () => {
    setIsLoading(true);
    try {
      const res = await adminAPI.get(`/blogs/${activeTab}`);
      if (res.success) {
        // Filter out parent-level fields from each submission
        const cleanSubmissions = (res.submissions || []).map(sub => ({
          ...sub,
          // Ensure we don't leak __v or other internal fields
        }));
        setSubmissions(cleanSubmissions);
      }
    } catch {
      toast.error('Failed to load');
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

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-white/10">
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Editorial <span className="text-[#00f0ff]">Review</span></h1>
          <p className="text-xs text-gray-500 dark:text-[#a8b3cf]">Manage submissions</p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => navigate('/posts')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-transparent border border-gray-200 dark:border-white/10 rounded-[8px] text-[10px] font-bold text-gray-700 dark:text-gray-300 hover:opacity-80 transition-all"
          >
            <FileText size={12} />
            All Posts
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="shrink-0 px-4 py-3 border-b border-gray-200 dark:border-white/10">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-[10px] font-bold uppercase rounded-[8px] transition-all ${
                activeTab === tab.key
                  ? 'bg-[#00f0ff] text-[#0d0d0f]'
                  : 'text-gray-500 dark:text-[#a8b3cf] hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="h-full flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-[#00f0ff] border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : submissions.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center py-16">
            <CheckCircle size={32} className="text-[#2ed573]/30" />
            <p className="text-xs font-bold text-gray-500 dark:text-[#a8b3cf] uppercase mt-3">All caught up</p>
            <p className="text-[10px] text-gray-400 mt-1">No {activeTab} submissions</p>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            <div className="divide-y divide-black/5 dark:divide-white/5">
              {submissions.map((item, idx) => (
                <motion.div
                  key={item._id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ delay: idx * 0.02 }}
                  className="group"
                >
                  <div 
                    onClick={() => setExpandedId(expandedId === item._id ? null : item._id)}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer transition-colors"
                  >
                    <div className="w-10 h-8 rounded-[6px] bg-gray-100 dark:bg-[#0d0d0f] overflow-hidden shrink-0">
                      {item.coverImage ? (
                        <img src={item.coverImage} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <FileText size={12} className="text-gray-400" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-900 dark:text-white truncate">{item.title}</p>
                      <p className="text-[9px] text-gray-500 dark:text-[#a8b3cf]">{item.author?.name}</p>
                    </div>
                    <span className="text-[9px] text-gray-500 dark:text-[#a8b3cf] shrink-0">
                      {new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    <ArrowUpRight size={12} className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </div>

                  {/* Expanded details */}
                  {expandedId === item._id && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="px-4 pb-3 pt-0"
                    >
                      <div className="ml-[3.25rem] p-3 bg-gray-50 dark:bg-[#0d0d0f] rounded-[8px] space-y-2">
                        {item.excerpt && (
                          <p className="text-[10px] text-gray-600 dark:text-gray-400 line-clamp-2">{item.excerpt}</p>
                        )}
                        <div className="flex items-center gap-3 text-[9px] text-gray-500">
                          {item.readTime && <span>{item.readTime}</span>}
                          {item.category && <span>{item.category}</span>}
                          {item.slug && <span className="font-mono">/{item.slug}</span>}
                        </div>
                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); navigate(`/editorial/${item._id}`); }}
                            className="px-3 py-1 text-[9px] font-bold uppercase bg-[#00f0ff] text-[#0d0d0f] rounded-[6px] hover:opacity-90 transition-all"
                          >
                            Review
                          </button>
                          {activeTab === 'pending' && (
                            <>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleQuickAction(item._id, 'approve'); }}
                                className="px-3 py-1 text-[9px] font-bold uppercase bg-[#2ed573] text-white rounded-[6px] hover:opacity-90 transition-all"
                              >
                                <Zap size={10} className="inline mr-1" />
                                Approve
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleQuickAction(item._id, 'reject'); }}
                                className="px-3 py-1 text-[9px] font-bold uppercase bg-[#ff4757] text-white rounded-[6px] hover:opacity-90 transition-all"
                              >
                                Reject
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              ))}
            </div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
};

export default EditorialList;
