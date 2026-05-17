import { useState, useEffect } from 'react';
import { 
  CheckCircle, 
  XCircle, 
  Clock,
  FileText,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import adminAPI from '@/api/adminAPI';

const EditorialList = () => {
  const [activeTab, setActiveTab] = useState('pending');
  const [submissions, setSubmissions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [writerTiers, setWriterTiers] = useState({});
  const [expandedId, setExpandedId] = useState(null);
  const navigate = useNavigate();

  const tabs = [
    { key: 'pending', label: 'Pending' },
    { key: 'approved', label: 'Published' },
    { key: 'rejected', label: 'Rejected' },
  ];

  useEffect(() => {
    fetchSubmissions();
  }, [activeTab]);

  const fetchSubmissions = async () => {
    setIsLoading(true);
    try {
      const endpoint = activeTab === 'pending' ? '/blogs/pending' : activeTab === 'approved' ? '/blogs/approved' : '/blogs/rejected';
      const response = await adminAPI.get(endpoint);
      if (response.success) {
        setSubmissions(response.submissions);
        const authorIds = [...new Set(response.submissions.map(s => s.author?.userId).filter(Boolean))];
        const tiers = {};
        await Promise.all(authorIds.map(async (userId) => {
          try {
            const tierRes = await adminAPI.get(`/blogs/writer/${userId}/tier`);
            if (tierRes.success) tiers[userId] = tierRes.tier;
          } catch {}
        }));
        setWriterTiers(tiers);
      }
    } catch {
      toast.error('Failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickAction = async (e, id, action) => {
    e.stopPropagation();
    try {
      await adminAPI.post(`/blogs/submissions/${id}/${action}`, { feedback: action === 'approve' ? 'Quick' : 'Rejected' });
      toast.success(action === 'approve' ? 'Published' : 'Rejected');
      setSubmissions(prev => prev.filter(s => s._id !== id));
    } catch {
      toast.error('Failed');
    }
  };

  const getTierConfig = (tier) => {
    const c = { new: { bg: 'bg-[#ff4757]/15', text: 'text-[#ff4757]', l: 'New' }, verified: { bg: 'bg-[#ffa502]/15', text: 'text-[#ffa502]', l: 'Verified' }, trusted: { bg: 'bg-[#00f0ff]/15', text: 'text-[#00f0ff]', l: 'Trusted' } };
    return c[tier] || c.new;
  };

  const getStatusConfig = (s) => {
    const c = { pending: { i: Clock, c: 'text-[#ffa502]', l: 'Pending' }, approved: { i: CheckCircle, c: 'text-[#2ed573]', l: 'Published' }, rejected: { i: XCircle, c: 'text-[#ff4757]', l: 'Rejected' } };
    return c[s] || c.pending;
  };

  return (
    <div className="h-full flex flex-col transition-colors duration-300">
      {/* Header - Responsive padding and alignment */}
      <div className="shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0 px-5 py-4 border-b border-gray-200 dark:border-white/10 transition-colors bg-white dark:bg-[#0d0d0f]">
        <h1 className="text-lg font-bold text-gray-900 dark:text-white transition-colors">Editorial <span className="text-[#00f0ff]">Queue</span></h1>
        <div className="flex flex-wrap items-center gap-1 p-1 bg-gray-100 dark:bg-[#18181a] rounded-[10px] w-full sm:w-auto transition-colors">
          {tabs.map((tab) => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={`flex-1 sm:flex-none text-center px-4 py-2 rounded-[8px] text-[10px] sm:text-xs font-bold uppercase transition-all ${activeTab === tab.key ? 'bg-[#00f0ff] text-[#0d0d0f]' : 'text-gray-500 dark:text-[#a8b3cf] hover:text-gray-900 dark:hover:text-white'}`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content - Scrollable */}
      <div className="flex-1 overflow-y-auto p-4">
<div className="space-y-2">
              <AnimatePresence mode="popLayout">
                {isLoading ? (
                  Array(4).fill(0).map((_, i) => <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-20 bg-gray-100 dark:bg-[#18181a] rounded-[10px] animate-pulse" />)
                ) : submissions.length === 0 ? (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-20 text-center">
                    <div className="w-14 h-14 mx-auto mb-3 bg-gray-100 dark:bg-[#18181a] rounded-[10px] flex items-center justify-center"><FileText size={24} className="text-gray-400 dark:text-[#a8b3cf]/30" /></div>
                    <p className="text-sm font-bold text-gray-500 dark:text-[#a8b3cf] uppercase">No {activeTab}</p>
                  </motion.div>
            ) : (
              submissions.map((item) => {
                const isExpanded = expandedId === item._id;
                const StatusIcon = getStatusConfig(item.status).i;
                const tier = getTierConfig(writerTiers[item.author?.userId]);
                const status = getStatusConfig(item.status);
                
                return (
                  <motion.div key={item._id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-white dark:bg-[#18181a] rounded-[10px] border border-gray-200 dark:border-white/10 hover:border-gray-300 dark:hover:border-white/20 transition-all duration-300">
                    <div onClick={() => navigate(`/editorial/${item._id}`)} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 p-4 cursor-pointer">
                      <div className="flex items-center gap-3 min-w-0 w-full sm:w-auto">
                        <div className="w-14 h-11 sm:w-16 sm:h-12 rounded-[8px] bg-gray-100 dark:bg-[#0d0d0f] overflow-hidden shrink-0">
                          {item.coverImage ? <img src={item.coverImage} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><FileText size={16} className="text-gray-400 dark:text-[#a8b3cf]/30" /></div>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5 sm:mb-1">
                            <span className="text-[9px] font-bold text-[#00f0ff] uppercase">{item.category || 'General'}</span>
                            <span className="text-[9px] text-gray-500 dark:text-[#a8b3cf] transition-colors">{new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                          </div>
                          <p className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white truncate transition-colors">{item.title}</p>
                        </div>
                      </div>
                      
                      {/* Meta information & badges - wraps on mobile */}
                      <div className="flex flex-wrap sm:flex-nowrap items-center justify-between sm:justify-end gap-2.5 sm:gap-4 ml-0 sm:ml-auto w-full sm:w-auto border-t border-black/5 sm:border-t-0 pt-2 sm:pt-0">
                        <div className="flex items-center gap-2.5">
                          <img src={item.author?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${item.author?.name}`} alt="" className="w-7 h-7 sm:w-8 sm:h-8 rounded-full shrink-0" />
                          <span className={`px-2.5 py-0.5 rounded text-[8px] sm:text-[9px] font-bold uppercase shrink-0 ${tier.bg} ${tier.text}`}>{tier.l}</span>
                          <span className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[8px] sm:text-[9px] font-bold uppercase shrink-0 ${status.c}`}><StatusIcon size={9} strokeWidth={3} />{status.l}</span>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          {activeTab === 'pending' && (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button onClick={(e) => { e.stopPropagation(); handleQuickAction(e, item._id, 'approve') }} className="p-1.5 sm:p-2 rounded-[8px] bg-[#2ed573]/15 text-[#2ed573] hover:bg-[#2ed573] hover:text-[#0d0d0f] transition-all">
                                <CheckCircle size={14} className="sm:w-4 sm:h-4" />
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); handleQuickAction(e, item._id, 'reject') }} className="p-1.5 sm:p-2 rounded-[8px] bg-[#ff4757]/15 text-[#ff4757] hover:bg-[#ff4757] hover:text-white transition-all">
                                <XCircle size={14} className="sm:w-4 sm:h-4" />
                              </button>
                            </div>
                          )}
                          <button onClick={(e) => { e.stopPropagation(); setExpandedId(isExpanded ? null : item._id); }} className="p-1.5 sm:p-2 rounded-[8px] text-gray-500 dark:text-[#a8b3cf] hover:text-gray-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-all">
                            {isExpanded ? <ChevronDown size={14} className="sm:w-4 sm:h-4" /> : <ChevronRight size={14} className="sm:w-4 sm:h-4" />}
                          </button>
                        </div>
                      </div>
                    </div>
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="border-t border-white/5 p-4">
                          <div className="flex gap-6">
                            <div className="flex-1">
                              <p className="text-[9px] font-bold text-[#a8b3cf] uppercase mb-1.5">Excerpt</p>
                              <p className="text-xs text-[#a8b3cf]/70 line-clamp-2">{item.excerpt || 'No excerpt'}</p>
                            </div>
                            <div className="w-32 shrink-0">
                              <p className="text-[9px] font-bold text-[#a8b3cf] uppercase mb-1.5">Details</p>
                              <p className="text-xs text-white/60">{item.readTime || '5 min read'}</p>
                              <p className="text-[10px] text-white/40 font-mono truncate mt-1">{item.slug}</p>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Footer */}
      <div className="shrink-0 px-5 py-3 border-t border-gray-200 dark:border-white/10 flex justify-between bg-white dark:bg-[#0d0d0f]">
        <span className="text-xs font-medium text-gray-500 dark:text-[#a8b3cf]">{submissions.length} {activeTab}</span>
      </div>
    </div>
  );
};

export default EditorialList;