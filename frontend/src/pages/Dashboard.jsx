import { useState, useEffect } from 'react';
import { 
  FileText, 
  CheckCircle, 
  XCircle, 
  Clock,
  ArrowUpRight,
  Users,
  TrendingUp,
  Eye,
  Zap
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import adminAPI from '@/api/adminAPI';

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [recentPending, setRecentPending] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setIsLoading(true);
    try {
      const [statsRes, pendingRes] = await Promise.all([
        adminAPI.get('/blogs/dashboard/stats'),
        adminAPI.get('/blogs/pending'),
      ]);

      if (statsRes.success) {
        setStats(statsRes.stats);
      }
      if (pendingRes.success) {
        setRecentPending(pendingRes.submissions.slice(0, 6));
      }
    } catch {
      toast.error('Failed to load');
    } finally {
      setIsLoading(false);
    }
  };

  const statCards = stats ? [
    { 
      label: 'Pending', 
      value: stats.pending, 
      icon: Clock, 
      color: 'text-[#ffa502]', 
      bgColor: 'bg-[#ffa502]/15',
      border: 'border-[#ffa502]/20',
      path: '/editorial',
      tab: 'pending'
    },
    { 
      label: 'Published', 
      value: stats.approved, 
      icon: CheckCircle, 
      color: 'text-[#2ed573]', 
      bgColor: 'bg-[#2ed573]/15',
      border: 'border-[#2ed573]/20',
      path: '/editorial',
      tab: 'approved'
    },
    { 
      label: 'Rejected', 
      value: stats.rejected, 
      icon: XCircle, 
      color: 'text-[#ff4757]', 
      bgColor: 'bg-[#ff4757]/15',
      border: 'border-[#ff4757]/20',
      path: '/editorial',
      tab: 'rejected'
    },
    { 
      label: 'Authors', 
      value: stats.authors, 
      icon: Users, 
      color: 'text-[#00f0ff]', 
      bgColor: 'bg-[#00f0ff]/15',
      border: 'border-[#00f0ff]/20',
      path: null
    },
  ] : [];

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#00f0ff] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-white/10">
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Command <span className="text-[#00f0ff]">Center</span></h1>
          <p className="text-xs text-gray-500 dark:text-[#a8b3cf]">Platform overview</p>
        </div>
      </div>

      {/* Content - Scrollable */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {statCards.map((stat, idx) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                onClick={() => stat.path && navigate(stat.path)}
                className={`
                  bg-white dark:bg-[#18181a] rounded-[10px] p-4 border border-gray-200 dark:${stat.border} 
                  hover:border-[#00f0ff]/30 transition-all cursor-pointer
                  ${stat.path ? '' : 'cursor-default'}
                `}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className={`w-9 h-9 rounded-[8px] ${stat.bgColor} flex items-center justify-center`}>
                    <stat.icon size={18} className={stat.color} />
                  </div>
                  {stat.path && <ArrowUpRight size={14} className="text-[#a8b3cf]" />}
                </div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white transition-colors">{stat.value}</p>
                <p className="text-[9px] font-bold text-gray-500 dark:text-[#a8b3cf] uppercase mt-1 transition-colors">{stat.label}</p>
              </motion.div>
            ))}
          </div>

          {/* Quick Actions Row */}
          <div className="flex gap-3">
            <button 
              onClick={() => navigate('/editorial')}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#00f0ff] text-[#0d0d0f] rounded-[8px] text-xs font-bold uppercase hover:opacity-90"
            >
              <Zap size={14} />
              Review Pending
            </button>
            <button 
              onClick={() => navigate('/editorial')}
              className="flex items-center gap-2 px-4 py-2.5 border border-black/10 dark:border-white/10 rounded-[8px] text-xs font-bold uppercase text-gray-700 dark:text-gray-200 hover:bg-black/5 dark:hover:bg-white/5 transition-all"
            >
              <Eye size={14} />
              View All
            </button>
          </div>

          {/* Pending Submissions */}
          <div className="bg-white dark:bg-[#18181a] rounded-[10px] border border-gray-200 dark:border-white/10 overflow-hidden transition-all">
            <div className="flex items-center justify-between px-4 py-3 border-b border-black/5 dark:border-white/5 transition-colors">
              <div className="flex items-center gap-2">
                <Clock size={14} className="text-[#ffa502]" />
                <span className="text-xs font-bold text-gray-900 dark:text-white uppercase transition-colors">Pending Review</span>
              </div>
              <span className="text-[9px] text-gray-500 dark:text-[#a8b3cf] transition-colors">{recentPending.length} items</span>
            </div>

            <div className="divide-y divide-black/5 dark:divide-white/5 transition-colors">
              {recentPending.length === 0 ? (
                <div className="py-12 text-center">
                  <div className="w-10 h-10 mx-auto mb-2 bg-[#0d0d0f] rounded-[8px] flex items-center justify-center">
                    <CheckCircle size={18} className="text-[#2ed573]/30" />
                  </div>
                  <p className="text-xs font-bold text-[#a8b3cf] uppercase">All caught up</p>
                </div>
              ) : (
                recentPending.map((item, idx) => (
                  <motion.div
                    key={item._id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: idx * 0.03 }}
                    onClick={() => navigate(`/editorial/${item._id}`)}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer transition-colors"
                  >
                    <div className="w-10 h-8 rounded-[6px] bg-gray-100 dark:bg-[#0d0d0f] overflow-hidden shrink-0 transition-colors">
                      {item.coverImage ? (
                        <img src={item.coverImage} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <FileText size={12} className="text-gray-400 dark:text-[#a8b3cf]/30" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-900 dark:text-white truncate transition-colors">{item.title}</p>
                      <p className="text-[9px] text-gray-500 dark:text-[#a8b3cf] transition-colors">{item.author?.name}</p>
                    </div>
                    <span className="text-[9px] text-gray-500 dark:text-[#a8b3cf] shrink-0 transition-colors">
                      {new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </motion.div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="shrink-0 px-4 py-2 border-t border-gray-200 dark:border-white/10 flex justify-between">
        <span className="text-[9px] text-gray-500 dark:text-[#a8b3cf]">Last updated: just now</span>
      </div>
    </div>
  );
};

export default Dashboard;