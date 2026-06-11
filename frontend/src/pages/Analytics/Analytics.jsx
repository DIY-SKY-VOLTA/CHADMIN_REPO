import { useState, useEffect } from 'react';
import {
  BarChart3,
  FileText,
  MessageSquare,
  Users,
  Heart,
  Globe,
  Clock,
  RefreshCw,
  Activity,
  Star,
  Layers,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import adminAPI from '@/api/adminAPI';

const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.03 },
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

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hoveredBarIndex, setHoveredBarIndex] = useState(null);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    setIsLoading(true);
    try {
      const res = await adminAPI.get('/analytics/dashboard');
      if (res.success) setAnalytics(res.analytics);
    } catch {
      toast.error('Failed to load performance metrics');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    /* Premium Shimmer skeleton loaders */
    return (
      <div className="h-full flex flex-col bg-neutral-50/30 dark:bg-[#0d0d0f]/20 animate-pulse">
        {/* Header Shimmer */}
        <div className="shrink-0 px-6 py-5 border-b border-neutral-200/50 dark:border-white/5 bg-white/40 dark:bg-[#121214]/40 flex justify-between items-center">
          <div className="space-y-2">
            <div className="h-3 w-32 bg-neutral-200/50 dark:bg-neutral-800 rounded" />
            <div className="h-5 w-48 bg-neutral-200/50 dark:bg-neutral-800 rounded" />
          </div>
          <div className="h-8 w-28 bg-neutral-200/50 dark:bg-neutral-800 rounded-lg" />
        </div>

        {/* Content Shimmer */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Stats Grid Shimmer */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-28 bg-white dark:bg-[#111113]/50 border border-neutral-200/40 dark:border-white/5 rounded-2xl p-5" />
            ))}
          </div>

          {/* Chart Shimmer */}
          <div className="h-80 bg-white dark:bg-[#111113]/50 border border-neutral-200/40 dark:border-white/5 rounded-2xl p-5" />
        </div>
      </div>
    );
  }

  if (!analytics) return null;

  const statCards = [
    {
      label: 'Submitted Articles',
      value: analytics.submissions.total,
      icon: FileText,
      color: '#6366f1',
      description: `${analytics.submissions.pending} pending · ${analytics.submissions.approved} approved`,
    },
    {
      label: 'Monthly Submissions',
      value: analytics.submissions.thisMonth,
      icon: BarChart3,
      color: analytics.submissions.growth >= 0 ? '#10b981' : '#f04340',
      description: `${analytics.submissions.growth >= 0 ? '+' : ''}${analytics.submissions.growth}% compared to last month`,
      trend: analytics.submissions.growth >= 0 ? 'up' : 'down',
    },
    {
      label: 'Reader Comments',
      value: analytics.comments.total,
      icon: MessageSquare,
      color: '#f5a53a',
      description: `${analytics.comments.thisWeek} new comments this week`,
    },
    {
      label: 'Registered Accounts',
      value: analytics.users.total,
      icon: Users,
      color: '#8b5cf6',
      description: `${analytics.users.thisMonth} new profiles this month`,
    },
    {
      label: 'Article Likes',
      value: analytics.likes,
      icon: Heart,
      color: '#ec4899',
      description: 'Total user likes across all published posts',
    },
    {
      label: 'Active Contests',
      value: analytics.contests.active,
      icon: Globe,
      color: '#00f0ff',
      description: 'Writing contests currently open or upcoming',
    },
  ];

  return (
    <div className="h-full flex flex-col bg-neutral-50/30 dark:bg-[#0d0d0f]/20 selection:bg-neutral-200/50 dark:selection:bg-neutral-800/50">
      
      {/* Header Bar */}
      <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-neutral-200/50 dark:border-white/5 bg-white/40 dark:bg-[#121214]/40 backdrop-blur-sm">
        <div>
          <h1 className="text-base font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
            Platform Statistics
          </h1>
          <p className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-0.5">
            Monitor submissions volume, reader feedback, account updates, and engagement trends
          </p>
        </div>

        <button
          onClick={fetchAnalytics}
          className="p-1.5 rounded-lg border border-neutral-200/50 dark:border-white/5 bg-white dark:bg-[#18181b] hover:bg-neutral-50 dark:hover:bg-white/5 text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-all shadow-sm flex items-center gap-1.5 text-[11px] font-medium"
        >
          <RefreshCw size={12} />
          Refresh
        </button>
      </div>

      {/* Main Content Pane */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="space-y-6"
        >
          {/* Metrics summary grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {statCards.map((stat) => (
              <motion.div
                key={stat.label}
                variants={cardVariants}
                className="group bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.01)] hover:border-neutral-350 dark:hover:border-neutral-850 hover:shadow-md transition-all duration-300 flex flex-col justify-between min-h-[120px]"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-neutral-450 dark:text-neutral-500 uppercase tracking-wider">
                    {stat.label}
                  </span>
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center transition-transform group-hover:scale-105 border border-neutral-100 dark:border-white/5"
                    style={{
                      color: stat.color,
                      backgroundColor: stat.color + '10',
                      borderColor: stat.color + '20',
                    }}
                  >
                    <stat.icon size={14} strokeWidth={1.5} />
                  </div>
                </div>

                <div className="mt-3">
                  <div className="flex items-baseline gap-2">
                    <p className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-white leading-none">
                      {stat.value.toLocaleString()}
                    </p>
                    {stat.trend && (
                      <span className={`inline-flex items-center text-[9px] font-bold ${
                        stat.trend === 'up' ? 'text-emerald-600 dark:text-emerald-500' : 'text-red-655 dark:text-red-500'
                      }`}>
                        {stat.trend === 'up' ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                      </span>
                    )}
                  </div>
                  <p className="text-[10.5px] text-neutral-450 dark:text-neutral-400 mt-1">
                    {stat.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Stacked submissions bar chart */}
          <motion.div
            variants={cardVariants}
            className="bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.01)] relative"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
              <div className="flex items-center gap-2">
                <BarChart3 size={14} className="text-neutral-400 dark:text-neutral-550" />
                <span className="text-xs font-bold text-neutral-800 dark:text-white uppercase tracking-wider">
                  Submissions (Last 14 Days)
                </span>
              </div>
              
              {/* Interactive Tooltip status */}
              <div className="h-6 flex items-center font-mono">
                <AnimatePresence>
                  {hoveredBarIndex !== null ? (
                    <motion.div
                      initial={{ opacity: 0, y: 3 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 3 }}
                      className="text-[9.5px] bg-neutral-50 dark:bg-[#1e1e24]/80 border border-neutral-200/50 dark:border-white/5 px-2.5 py-1 rounded-lg flex items-center gap-2.5 shadow-sm backdrop-blur-md"
                    >
                      <span className="text-neutral-500 font-bold">
                        {new Date(analytics.submissions.perDay[hoveredBarIndex]._id + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                      <span className="text-amber-600 dark:text-amber-400 font-bold">
                        {analytics.submissions.perDay[hoveredBarIndex].total - analytics.submissions.perDay[hoveredBarIndex].approved - analytics.submissions.perDay[hoveredBarIndex].rejected} Pending
                      </span>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span className="text-emerald-600 dark:text-emerald-500 font-bold">
                        {analytics.submissions.perDay[hoveredBarIndex].approved} Approved
                      </span>
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                      <span className="text-red-655 dark:text-red-400 font-bold">
                        {analytics.submissions.perDay[hoveredBarIndex].rejected} Rejected
                      </span>
                    </motion.div>
                  ) : (
                    <span className="text-[10px] text-neutral-400 dark:text-neutral-500 italic">
                      Hover bars to view status details
                    </span>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Stacked Columns Chart */}
            <div className="flex items-end gap-2.5 h-64 pt-4 border-b border-neutral-200/40 dark:border-white/5 select-none">
              {analytics.submissions.perDay.map((day, idx) => {
                const maxVal = Math.max(...analytics.submissions.perDay.map(d => d.total), 1);
                const heightPct = (day.total / maxVal) * 100;
                
                return (
                  <div
                    key={day._id}
                    className="flex-1 h-full flex flex-col justify-end items-center group relative cursor-pointer"
                    onMouseEnter={() => setHoveredBarIndex(idx)}
                    onMouseLeave={() => setHoveredBarIndex(null)}
                  >
                    {/* Hover highlights */}
                    <div className="absolute inset-0 bg-neutral-100/30 dark:bg-white/[0.01] opacity-0 group-hover:opacity-100 transition-opacity rounded-t-lg" />

                    {/* Stacked container bar */}
                    <div
                      className="w-full max-w-[18px] sm:max-w-[26px] flex flex-col-reverse gap-0.5 transition-all duration-300 group-hover:scale-y-[1.02] origin-bottom overflow-hidden rounded-t-[3px]"
                      style={{ height: `${Math.max(heightPct, 5)}%` }}
                    >
                      {/* Rejected */}
                      {day.rejected > 0 && (
                        <div
                          className="w-full bg-red-500/85 hover:bg-red-500 transition-colors"
                          style={{ height: `${(day.rejected / day.total) * 100}%` }}
                        />
                      )}
                      {/* Approved */}
                      {day.approved > 0 && (
                        <div
                          className="w-full bg-emerald-500/85 hover:bg-emerald-500 transition-colors"
                          style={{ height: `${(day.approved / day.total) * 100}%` }}
                        />
                      )}
                      {/* Pending */}
                      {day.total - day.approved - day.rejected > 0 && (
                        <div
                          className="w-full bg-amber-500/85 hover:bg-amber-500 transition-colors"
                          style={{ height: `${((day.total - day.approved - day.rejected) / day.total) * 100}%` }}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Labels */}
            <div className="flex justify-between font-mono text-[9px] text-neutral-400 dark:text-neutral-500 pt-3 px-1">
              {analytics.submissions.perDay.map((day) => (
                <span key={day._id} className="w-[18px] sm:w-[26px] text-center overflow-visible whitespace-nowrap">
                  {new Date(day._id + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
              ))}
            </div>

            {/* Legends */}
            <div className="flex items-center gap-4 mt-6 pt-3 border-t border-neutral-100 dark:border-white/[0.03] text-[9.5px] text-neutral-500 dark:text-neutral-400">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-[3px] bg-amber-500/85" />
                <span>Pending Review</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-[3px] bg-emerald-500/85" />
                <span>Approved</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-[3px] bg-red-500/85" />
                <span>Rejected</span>
              </div>
            </div>
          </motion.div>

          {/* Bottom Grid Layout sections */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Popular Article Topics */}
            <motion.div
              variants={cardVariants}
              className="bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.01)]"
            >
              <div className="flex items-center gap-2 mb-5">
                <Star size={14} className="text-amber-500" />
                <span className="text-xs font-bold text-neutral-850 dark:text-white uppercase tracking-wider">
                  Popular Article Topics
                </span>
              </div>
              {analytics.topCategories.length === 0 ? (
                <p className="text-xs text-neutral-400 dark:text-neutral-500 py-8 text-center italic">No category tracking yet</p>
              ) : (
                <div className="space-y-4">
                  {analytics.topCategories.map((cat, idx) => {
                    const maxCount = analytics.topCategories[0]?.count || 1;
                    const barWidth = (cat.count / maxCount) * 100;
                    return (
                      <div key={cat._id} className="flex items-center gap-4 group text-xs text-neutral-700 dark:text-neutral-300">
                        <span className="font-semibold w-24 truncate">
                          {cat._id || 'Uncategorized'}
                        </span>
                        
                        {/* Notion-style rail track progress */}
                        <div className="flex-1 h-2 bg-neutral-100 dark:bg-neutral-800/50 rounded-full overflow-hidden border border-neutral-200/40 dark:border-white/[0.02]">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${barWidth}%` }}
                            transition={{ duration: 0.6, delay: idx * 0.03 }}
                            className="h-full bg-neutral-900 dark:bg-white rounded-full"
                          />
                        </div>
                        
                        <span className="text-[10px] font-mono font-bold text-neutral-450 dark:text-neutral-500 w-8 text-right">
                          {cat.count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>

            {/* Weekly Activity Summary */}
            <motion.div
              variants={cardVariants}
              className="bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.01)]"
            >
              <div className="flex items-center gap-2 mb-5">
                <Activity size={14} className="text-neutral-450 dark:text-neutral-550" />
                <span className="text-xs font-bold text-neutral-850 dark:text-white uppercase tracking-wider">
                  Weekly Activity Log
                </span>
              </div>
              
              <div className="space-y-2.5">
                {/* 1. Submissions this week */}
                <div className="flex items-center justify-between py-2.5 px-4 bg-neutral-50/50 dark:bg-neutral-900/10 rounded-xl border border-neutral-200/30 dark:border-white/5 hover:bg-neutral-100/50 dark:hover:bg-white/5 transition-colors text-xs">
                  <div className="flex items-center gap-2.5">
                    <div className="w-6 h-6 rounded-md bg-amber-500/10 flex items-center justify-center text-amber-600 dark:text-amber-550 border border-amber-500/10">
                      <Clock size={12} />
                    </div>
                    <span className="text-neutral-700 dark:text-neutral-350">Articles submitted this week</span>
                  </div>
                  <span className="font-mono font-bold text-neutral-900 dark:text-white">
                    {analytics.submissions.thisWeek}
                  </span>
                </div>

                {/* 2. Comments this week */}
                <div className="flex items-center justify-between py-2.5 px-4 bg-neutral-50/50 dark:bg-neutral-900/10 rounded-xl border border-neutral-200/30 dark:border-white/5 hover:bg-neutral-100/50 dark:hover:bg-white/5 transition-colors text-xs">
                  <div className="flex items-center gap-2.5">
                    <div className="w-6 h-6 rounded-md bg-purple-500/10 flex items-center justify-center text-purple-650 dark:text-purple-400 border border-purple-500/10">
                      <MessageSquare size={12} />
                    </div>
                    <span className="text-neutral-700 dark:text-neutral-350">Comments posted this week</span>
                  </div>
                  <span className="font-mono font-bold text-neutral-900 dark:text-white">
                    {analytics.comments.thisWeek}
                  </span>
                </div>

                {/* 3. New users this week */}
                <div className="flex items-center justify-between py-2.5 px-4 bg-neutral-50/50 dark:bg-neutral-900/10 rounded-xl border border-neutral-200/30 dark:border-white/5 hover:bg-neutral-100/50 dark:hover:bg-white/5 transition-colors text-xs">
                  <div className="flex items-center gap-2.5">
                    <div className="w-6 h-6 rounded-md bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-550 border border-indigo-500/10">
                      <Users size={12} />
                    </div>
                    <span className="text-neutral-700 dark:text-neutral-350">New user profiles this week</span>
                  </div>
                  <span className="font-mono font-bold text-neutral-900 dark:text-white">
                    {analytics.users.thisWeek}
                  </span>
                </div>

                {/* 4. Total likes */}
                <div className="flex items-center justify-between py-2.5 px-4 bg-neutral-50/50 dark:bg-neutral-900/10 rounded-xl border border-neutral-200/30 dark:border-white/5 hover:bg-neutral-100/50 dark:hover:bg-white/5 transition-colors text-xs">
                  <div className="flex items-center gap-2.5">
                    <div className="w-6 h-6 rounded-md bg-rose-500/10 flex items-center justify-center text-rose-650 dark:text-rose-500 border border-rose-500/10">
                      <Heart size={12} />
                    </div>
                    <span className="text-neutral-700 dark:text-neutral-350">Reader likes registered</span>
                  </div>
                  <span className="font-mono font-bold text-neutral-900 dark:text-white">
                    {analytics.likes.toLocaleString()}
                  </span>
                </div>
              </div>
            </motion.div>

          </div>

        </motion.div>
      </div>

    </div>
  );
}
