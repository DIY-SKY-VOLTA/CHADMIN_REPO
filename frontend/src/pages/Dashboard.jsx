import { useState, useEffect } from 'react';
import {
  FileText,
  CheckCircle,
  XCircle,
  Clock,
  Users,
  RefreshCw,
  Calendar,
  Layers,
  ChevronRight,
  BookOpen,
  TrendingUp,
  TrendingDown,
  Minus
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import adminAPI from '@/api/adminAPI';

const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.04 },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: [0.23, 1, 0.32, 1] },
  },
};

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [recentPending, setRecentPending] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [expandedId, setExpandedId] = useState(null);
  
  const navigate = useNavigate();

  // Clock tick
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setIsRefreshing(true);
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
      toast.error('Failed to load dashboard metrics');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleQuickAction = async (e, id, action) => {
    e.stopPropagation();
    try {
      await adminAPI.post(`/blogs/submissions/${id}/${action}`, {});
      toast.success(action === 'approve' ? 'Post Approved!' : 'Post Rejected');
      fetchDashboardData();
    } catch {
      toast.error('Could not update submission');
    }
  };

  const statConfigs = stats ? [
    { 
      label: 'Needs Review', 
      value: stats.pending, 
      icon: Clock, 
      color: '#d97706', 
      bg: 'bg-amber-50 dark:bg-amber-500/10 border-amber-200/40 dark:border-amber-500/20',
      description: 'Submitted posts awaiting editorial audit',
      path: '/editorial',
      // Pending is a stock — its weekly motion is the flow of NEW submissions
      delta: stats.deltas?.pending,
      deltaLabel: 'new this week',
      deltaTooltip: `${stats.deltas?.newSubsThisWeek ?? 0} new submissions this week vs ${stats.deltas?.newSubsLastWeek ?? 0} the week before`,
    },
    { 
      label: 'Published Posts', 
      value: stats.approved, 
      icon: CheckCircle, 
      color: '#059669', 
      bg: 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200/40 dark:border-emerald-500/20',
      description: 'Live articles accessible on platform',
      path: '/published',
      delta: stats.deltas?.approved,
      deltaLabel: 'this week',
      deltaTooltip: `${stats.deltas?.approvedThisWeek ?? 0} published this week vs ${stats.deltas?.approvedLastWeek ?? 0} the week before`,
    },
    { 
      label: 'Rejected Reviews', 
      value: stats.rejected, 
      icon: XCircle, 
      color: '#dc2626', 
      bg: 'bg-red-50 dark:bg-red-500/10 border-red-200/40 dark:border-red-500/20',
      description: 'Submissions flagged or denied approval',
      path: '/editorial',
      delta: stats.deltas?.rejected,
      deltaLabel: 'this week',
      deltaTooltip: `${stats.deltas?.rejectedThisWeek ?? 0} rejected this week vs ${stats.deltas?.rejectedLastWeek ?? 0} the week before`,
    },
    { 
      label: 'Active Authors', 
      value: stats.authors, 
      icon: Users, 
      color: '#0284c7', 
      bg: 'bg-sky-50 dark:bg-sky-500/10 border-sky-200/40 dark:border-sky-500/20',
      description: 'Registered writers contributing content',
      path: '/users',
      delta: stats.deltas?.authors,
      deltaLabel: 'new this week',
      deltaTooltip: `${stats.deltas?.newAuthorsThisWeek ?? 0} first-time authors this week vs ${stats.deltas?.newAuthorsLastWeek ?? 0} the week before`,
    },
  ] : [];

  return (
    <div className="h-full flex flex-col bg-neutral-50/30 dark:bg-[#0d0d0f]/20">
      
      {/* Header bar */}
      <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-neutral-200/50 dark:border-white/5 bg-white/40 dark:bg-[#121214]/40 backdrop-blur-sm z-20">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="flex h-1.5 w-1.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-550"></span>
            </span>
            <p className="text-[10px] font-bold tracking-wider uppercase text-neutral-400 dark:text-neutral-500 font-mono">
              System Active
            </p>
          </div>
          <h1 className="text-base font-semibold text-neutral-900 dark:text-neutral-100 mt-0.5">
            Dashboard Overview
          </h1>
        </div>

        {/* Clock & Refresh */}
        <div className="flex items-center gap-3 font-mono">
          <div className="hidden sm:flex items-center gap-2 bg-white dark:bg-[#18181b] border border-neutral-200/60 dark:border-white/5 px-3 py-1.5 rounded-lg text-[11px] shadow-sm">
            <Calendar size={12} className="text-neutral-400" />
            <span className="text-neutral-500 dark:text-neutral-400 font-medium">
              {currentTime.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
            </span>
            <span className="text-neutral-300 dark:text-neutral-800">|</span>
            <span className="text-neutral-800 dark:text-neutral-200 font-bold">
              {currentTime.toLocaleTimeString()}
            </span>
          </div>

          <button 
            onClick={fetchDashboardData}
            disabled={isRefreshing}
            className="flex items-center justify-center p-2 rounded-lg bg-white dark:bg-[#18181b] border border-neutral-200/60 dark:border-white/5 hover:bg-neutral-50 dark:hover:bg-white/5 text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-all shadow-sm group"
          >
            <RefreshCw size={12} className={`${isRefreshing ? 'animate-spin' : 'group-hover:rotate-45'} transition-transform`} />
          </button>
        </div>
      </div>

      {/* Scrollable container */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        
        {isLoading ? (
          /* Custom Shimmer loaders */
          <div className="space-y-6 animate-pulse">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-28 bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 rounded-2xl" />
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 h-[400px] bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 rounded-2xl" />
              <div className="h-[400px] bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 rounded-2xl" />
            </div>
          </div>
        ) : (
          <motion.div 
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="space-y-6"
          >
            
            {/* Stats Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {statConfigs.map((stat) => (
                <motion.div
                  key={stat.label}
                  variants={cardVariants}
                  onClick={() => stat.path && navigate(stat.path)}
                  className={`
                    group bg-white dark:bg-[#151518]/70 rounded-2xl p-5 border border-neutral-200/40 dark:border-white/5 
                    hover:border-neutral-350 dark:hover:border-neutral-850 transition-all duration-300 flex flex-col justify-between min-h-[120px] shadow-[0_1px_3px_rgba(0,0,0,0.01)]
                    ${stat.path ? 'cursor-pointer' : 'cursor-default'}
                  `}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold tracking-wider text-neutral-450 uppercase font-mono">
                      {stat.label}
                    </span>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${stat.bg}`}>
                      <stat.icon size={14} style={{ color: stat.color }} />
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="flex items-baseline gap-2">
                      <p className="text-3xl font-extrabold tracking-tight font-mono text-neutral-800 dark:text-neutral-100">
                        {stat.value}
                      </p>
                      {stat.delta !== undefined && stat.delta !== null && Number.isFinite(stat.delta) && (
                        <span
                          title={stat.deltaTooltip}
                          className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold font-mono ${
                            stat.delta > 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : stat.delta < 0
                                ? 'text-red-500 dark:text-red-400'
                                : 'text-neutral-400 dark:text-neutral-500'
                          }`}
                        >
                          {stat.delta > 0 ? <TrendingUp size={9} /> : stat.delta < 0 ? <TrendingDown size={9} /> : <Minus size={9} />}
                          {stat.delta > 0 ? `+${stat.delta}` : stat.delta}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-neutral-450 dark:text-neutral-500 mt-1">
                      {stat.deltaLabel && stat.delta !== undefined && stat.delta !== null && Number.isFinite(stat.delta)
                        ? `${stat.deltaLabel} · ${stat.description}`
                        : stat.description}
                    </p>
                    {stat.deltaTooltip && (
                      <p className="sr-only">{stat.deltaTooltip}</p>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Content grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Submission review queue */}
              <motion.div 
                variants={cardVariants}
                className="lg:col-span-2 bg-white dark:bg-[#151518]/70 rounded-2xl border border-neutral-200/40 dark:border-white/5 flex flex-col min-h-[400px] overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.01)]"
              >
                {/* Panel Header */}
                <div className="px-5 py-4 border-b border-neutral-200/40 dark:border-white/5 flex items-center justify-between bg-neutral-50/20 dark:bg-white/[0.01]">
                  <div>
                    <h3 className="text-xs font-bold text-neutral-800 dark:text-white uppercase tracking-wider">
                      Submissions Review Queue
                    </h3>
                    <p className="text-[10.5px] text-neutral-450 mt-0.5">
                      Review drafts and authorize publish actions
                    </p>
                  </div>
                  <span className="bg-amber-500/10 text-amber-600 dark:text-amber-500 px-2 py-0.5 rounded-full text-[9px] font-bold font-mono border border-amber-500/10">
                    {recentPending.length} Pending
                  </span>
                </div>

                {/* Submissions List */}
                <div className="flex-1 divide-y divide-neutral-200/50 dark:divide-white/[0.03] overflow-y-auto">
                  {recentPending.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center p-8 text-center min-h-[300px]">
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/10 flex items-center justify-center mb-3 text-emerald-600 dark:text-emerald-500">
                        <CheckCircle size={18} />
                      </div>
                      <p className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                        Queue Cleared
                      </p>
                      <p className="text-[10px] text-neutral-450 mt-1 max-w-[200px] mx-auto">
                        No submissions currently require review
                      </p>
                    </div>
                  ) : (
                    recentPending.map((item) => (
                      <div 
                        key={item._id}
                        className="group flex flex-col hover:bg-neutral-50/40 dark:hover:bg-white/[0.01] transition-all duration-200"
                      >
                        <div 
                          onClick={() => setExpandedId(expandedId === item._id ? null : item._id)}
                          className="flex items-center gap-4 p-4 cursor-pointer"
                        >
                          {/* Thumbnail */}
                          <div className="w-12 h-9 rounded bg-neutral-100 dark:bg-[#0d0d0f] overflow-hidden shrink-0 border border-neutral-200/50 dark:border-white/5 relative">
                            {item.coverImage ? (
                              <img src={item.coverImage} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <FileText size={13} className="text-neutral-400" />
                              </div>
                            )}
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <h4 className="text-xs font-bold text-neutral-800 dark:text-neutral-200 truncate group-hover:text-neutral-950 dark:group-hover:text-white transition-colors">
                              {item.title}
                            </h4>
                            <p className="text-[10px] text-neutral-400 dark:text-neutral-550 mt-0.5">
                              by <span className="font-semibold text-neutral-500 dark:text-neutral-400">{item.author?.name || 'Anonymous Author'}</span>
                            </p>
                          </div>

                          <div className="flex items-center gap-3">
                            <span className="text-[10px] text-neutral-400 dark:text-neutral-500 font-mono hidden sm:inline-block">
                              {new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                            </span>
                            <ChevronRight 
                              size={13} 
                              className={`text-neutral-400 dark:text-neutral-600 transition-transform ${expandedId === item._id ? 'rotate-90' : ''}`} 
                            />
                          </div>
                        </div>

                        {/* Collapsible details pane */}
                        <AnimatePresence>
                          {expandedId === item._id && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="px-4 pb-4 overflow-hidden"
                            >
                              <div className="p-4 rounded-xl bg-neutral-50 dark:bg-[#0c0c0e]/30 border border-neutral-200/50 dark:border-white/5 space-y-3.5">
                                {item.excerpt && (
                                  <p className="text-[10.5px] leading-relaxed text-neutral-500 dark:text-neutral-400 font-normal">
                                    {item.excerpt}
                                  </p>
                                )}
                                
                                <div className="flex items-center gap-3 text-[9.5px] font-mono text-neutral-400 dark:text-neutral-500 pt-2 border-t border-neutral-200/40 dark:border-white/[0.03]">
                                  {item.category && (
                                    <span className="font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-450 bg-neutral-100 dark:bg-white/5 px-2 py-0.5 rounded border border-neutral-200/20 dark:border-white/5">
                                      {item.category}
                                    </span>
                                  )}
                                  <span>🕒 {new Date(item.createdAt).toLocaleDateString()}</span>
                                </div>

                                <div className="flex gap-2.5 pt-1">
                                  <button
                                    onClick={() => navigate(`/editorial/${item._id}`)}
                                    className="flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-50 transition-colors shadow-sm"
                                  >
                                    Review & Edit
                                  </button>
                                  <button
                                    onClick={(e) => handleQuickAction(e, item._id, 'approve')}
                                    className="px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase bg-emerald-600 dark:bg-emerald-500 hover:bg-emerald-700 text-white flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                                  >
                                    <CheckCircle size={11} /> Approve
                                  </button>
                                  <button
                                    onClick={(e) => handleQuickAction(e, item._id, 'reject')}
                                    className="px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase bg-red-655 dark:bg-red-500 hover:bg-red-700 text-white flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                                  >
                                    <XCircle size={11} /> Reject
                                  </button>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>

              {/* Navigation Shortcuts */}
              <motion.div variants={cardVariants} className="space-y-4">
                <div className="bg-white dark:bg-[#151518]/70 rounded-2xl p-5 border border-neutral-200/40 dark:border-white/5 shadow-[0_1px_3px_rgba(0,0,0,0.01)]">
                  <h3 className="text-[10px] font-bold font-mono uppercase tracking-wider text-neutral-400 mb-4">
                    Quick Navigation
                  </h3>
                  
                  <div className="flex flex-col gap-3">
                    {/* Review queue */}
                    <div 
                      onClick={() => navigate('/editorial')}
                      className="group p-3.5 bg-neutral-50/40 dark:bg-[#0c0c0e]/10 rounded-xl border border-neutral-200/50 dark:border-white/5 hover:border-neutral-350 dark:hover:border-neutral-850 hover:shadow-[0_1px_3px_rgba(0,0,0,0.01)] transition-all duration-300 cursor-pointer flex items-center gap-3.5"
                    >
                      <div className="w-9 h-9 rounded-lg bg-neutral-100 dark:bg-[#18181b] border border-neutral-200/20 dark:border-white/5 flex items-center justify-center text-neutral-500 group-hover:text-neutral-900 dark:group-hover:text-white transition-colors">
                        <Clock size={15} />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-neutral-805 dark:text-neutral-200 group-hover:text-neutral-950 dark:group-hover:text-white transition-colors">
                          Review Queue
                        </h4>
                        <p className="text-[9px] text-neutral-450 dark:text-neutral-500 mt-0.5">
                          Audit and sign off on pending drafts
                        </p>
                      </div>
                    </div>

                    {/* Manage categories */}
                    <div 
                      onClick={() => navigate('/categories')}
                      className="group p-3.5 bg-neutral-50/40 dark:bg-[#0c0c0e]/10 rounded-xl border border-neutral-200/50 dark:border-white/5 hover:border-neutral-350 dark:hover:border-neutral-850 hover:shadow-[0_1px_3px_rgba(0,0,0,0.01)] transition-all duration-300 cursor-pointer flex items-center gap-3.5"
                    >
                      <div className="w-9 h-9 rounded-lg bg-neutral-100 dark:bg-[#18181b] border border-neutral-200/20 dark:border-white/5 flex items-center justify-center text-neutral-500 group-hover:text-neutral-900 dark:group-hover:text-white transition-colors">
                        <Layers size={15} />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-neutral-855 dark:text-neutral-200 group-hover:text-neutral-950 dark:group-hover:text-white transition-colors">
                          Category Manager
                        </h4>
                        <p className="text-[9px] text-neutral-450 dark:text-neutral-500 mt-0.5">
                          Configure article classification scopes
                        </p>
                      </div>
                    </div>

                    {/* Manage writers */}
                    <div 
                      onClick={() => navigate('/users')}
                      className="group p-3.5 bg-neutral-50/40 dark:bg-[#0c0c0e]/10 rounded-xl border border-neutral-200/50 dark:border-white/5 hover:border-neutral-350 dark:hover:border-neutral-850 hover:shadow-[0_1px_3px_rgba(0,0,0,0.01)] transition-all duration-300 cursor-pointer flex items-center gap-3.5"
                    >
                      <div className="w-9 h-9 rounded-lg bg-neutral-100 dark:bg-[#18181b] border border-neutral-200/20 dark:border-white/5 flex items-center justify-center text-neutral-500 group-hover:text-neutral-900 dark:group-hover:text-white transition-colors">
                        <Users size={15} />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-neutral-855 dark:text-neutral-200 group-hover:text-neutral-950 dark:group-hover:text-white transition-colors">
                          Writers Registry
                        </h4>
                        <p className="text-[9px] text-neutral-450 dark:text-neutral-500 mt-0.5">
                          View details and manage staff rights
                        </p>
                      </div>
                    </div>

                    {/* Image Library */}
                    <div 
                      onClick={() => navigate('/images')}
                      className="group p-3.5 bg-neutral-50/40 dark:bg-[#0c0c0e]/10 rounded-xl border border-neutral-200/50 dark:border-white/5 hover:border-neutral-350 dark:hover:border-neutral-850 hover:shadow-[0_1px_3px_rgba(0,0,0,0.01)] transition-all duration-300 cursor-pointer flex items-center gap-3.5"
                    >
                      <div className="w-9 h-9 rounded-lg bg-neutral-100 dark:bg-[#18181b] border border-neutral-200/20 dark:border-white/5 flex items-center justify-center text-neutral-500 group-hover:text-neutral-900 dark:group-hover:text-white transition-colors">
                        <BookOpen size={15} />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-neutral-855 dark:text-neutral-200 group-hover:text-neutral-950 dark:group-hover:text-white transition-colors">
                          Media Library
                        </h4>
                        <p className="text-[9px] text-neutral-450 dark:text-neutral-500 mt-0.5">
                          Browse and clear uploaded assets
                        </p>
                      </div>
                    </div>

                  </div>
                </div>
              </motion.div>
            </div>

          </motion.div>
        )}
      </div>

    </div>
  );
};

export default Dashboard;
