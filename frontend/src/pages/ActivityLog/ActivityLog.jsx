import { useState, useEffect } from 'react';
import {
  Activity,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  User,
  Clock,
  FileText,
  MessageSquare,
  Image,
  Shield,
  BadgeCheck,
  Trash2,
  CheckCircle,
  XCircle,
  Eye,
  Lock,
  Settings,
  LogIn,
  Loader2,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';
import adminAPI from '@/api/adminAPI';

const actionConfig = {
  approve_blog:      { label: 'Blog Approved',     icon: CheckCircle,  color: '#10b981' },
  reject_blog:       { label: 'Blog Rejected',     icon: XCircle,      color: '#ef4444' },
  batch_approve:     { label: 'Batch Approve',     icon: CheckCircle,  color: '#059669' },
  batch_reject:      { label: 'Batch Reject',      icon: XCircle,      color: '#dc2626' },
  save_blog_edit:    { label: 'Blog Edited',       icon: FileText,     color: '#6366f1' },
  delete_comment:    { label: 'Comment Deleted',   icon: MessageSquare,color: '#f59e0b' },
  toggle_admin:      { label: 'Admin Toggle',      icon: Shield,       color: '#8b5cf6' },
  toggle_verified:   { label: 'Verification Toggle',icon: BadgeCheck,  color: '#06b6d4' },
  delete_image:      { label: 'Image Deleted',     icon: Image,        color: '#ec4899' },
  force_delete_image:{ label: 'Image Force Deleted',icon: Trash2,      color: '#ef4444' },
  unpublish_blog:    { label: 'Blog Unpublished',  icon: Eye,          color: '#f97316' },
  update_published:  { label: 'Blog Updated',      icon: FileText,     color: '#6366f1' },
  change_password:   { label: 'Password Changed',  icon: Lock,         color: '#64748b' },
  update_profile:    { label: 'Profile Updated',   icon: Settings,     color: '#64748b' },
  login:             { label: 'Admin Login',       icon: LogIn,        color: '#22c55e' },
};

const ActivityLog = () => {
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchLogs();
    fetchStats();
  }, [page]);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '30' });
      if (actionFilter) params.set('action', actionFilter);
      const res = await adminAPI.get(`/activity?${params}`);
      if (res.success) {
        setLogs(res.logs);
        setPagination(res.pagination);
      }
    } catch {
      toast.error('Failed to load activity log');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await adminAPI.get('/activity/stats');
      if (res.success) setStats(res.stats);
    } catch {}
  };

  const formatTime = (date) => {
    const d = new Date(date);
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="h-full flex flex-col bg-neutral-50/30 dark:bg-[#0d0d0f]/20 selection:bg-neutral-200/50 dark:selection:bg-neutral-400/40">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-neutral-200/50 dark:border-white/5 bg-white/40 dark:bg-[#121214]/40 backdrop-blur-sm">
        <div>
          <h1 className="text-base font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
            Activity Log
          </h1>
          <p className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-0.5">
            Audit trail of all admin actions across the platform
          </p>
        </div>
        <button
          onClick={() => { fetchLogs(); fetchStats(); }}
          className="p-1.5 rounded-lg border border-neutral-200/50 dark:border-white/5 bg-white dark:bg-[#18181b] hover:bg-neutral-50 dark:hover:bg-white/5 text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-all shadow-sm flex items-center gap-1.5 text-[11px] font-medium"
        >
          <RefreshCw size={12} />
          Refresh
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="shrink-0 px-6 py-4 grid grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 p-4 rounded-xl flex items-center justify-between">
            <div>
              <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Total Events</span>
              <p className="text-xl font-bold text-neutral-800 dark:text-neutral-100 mt-1">{stats.totalLogs}</p>
            </div>
            <Activity size={16} className="text-neutral-400" />
          </div>
          <div className="bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 p-4 rounded-xl flex items-center justify-between">
            <div>
              <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Last 24h</span>
              <p className="text-xl font-bold text-neutral-800 dark:text-neutral-100 mt-1">{stats.recentToday}</p>
            </div>
            <Clock size={16} className="text-neutral-400" />
          </div>
          <div className="bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 p-4 rounded-xl flex items-center justify-between">
            <div>
              <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Unique Actions</span>
              <p className="text-xl font-bold text-neutral-800 dark:text-neutral-100 mt-1">{stats.byAction?.length || 0}</p>
            </div>
            <Activity size={16} className="text-neutral-400" />
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="shrink-0 px-6 pb-4 flex flex-wrap items-center gap-3">
        <div className="flex p-0.5 bg-neutral-200/50 dark:bg-neutral-950/60 border border-neutral-200/40 dark:border-white/5 rounded-lg gap-0.5 shadow-inner overflow-x-auto">
          <button
            onClick={() => { setActionFilter(''); setPage(1); }}
            className={`px-3 py-1 text-[11px] font-medium rounded-md whitespace-nowrap transition-all ${!actionFilter ? 'bg-white dark:bg-[#1b1b1e] text-neutral-900 dark:text-white shadow-sm' : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-750'}`}
          >
            All
          </button>
          {['approve_blog', 'reject_blog', 'delete_comment', 'toggle_admin', 'delete_image', 'login'].map((key) => (
            <button
              key={key}
              onClick={() => { setActionFilter(key); setPage(1); }}
              className={`px-3 py-1 text-[11px] font-medium rounded-md whitespace-nowrap transition-all ${actionFilter === key ? 'bg-white dark:bg-[#1b1b1e] text-neutral-900 dark:text-white shadow-sm' : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-750'}`}
            >
              {actionConfig[key]?.label || key}
            </button>
          ))}
        </div>
      </div>

      {/* Log list */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {isLoading ? (
          <div className="space-y-2 animate-pulse">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-16 bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 rounded-xl" />
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="bg-white dark:bg-[#151518]/40 border border-neutral-200/40 dark:border-white/5 rounded-2xl flex flex-col items-center justify-center py-20">
            <Activity size={28} className="text-neutral-350 dark:text-neutral-600 mb-3" />
            <p className="text-xs font-semibold text-neutral-800 dark:text-neutral-300">No activity recorded</p>
            <p className="text-[11px] text-neutral-400 mt-1">Admin actions will appear here once you start moderating.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => {
              const config = actionConfig[log.action] || { label: log.action, icon: Activity, color: '#737373' };
              const Icon = config.icon;
              return (
                <div
                  key={log._id}
                  className="bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 rounded-xl px-4 py-3 flex items-center gap-3 hover:border-neutral-300 dark:hover:border-neutral-800 transition-all shadow-sm"
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${config.color}15`, color: config.color }}
                  >
                    <Icon size={14} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-neutral-800 dark:text-neutral-200">
                        {config.label}
                      </span>
                      <span className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate max-w-[400px]">
                        {log.description}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-[10px] text-neutral-400">
                      <span className="flex items-center gap-1">
                        <User size={9} />
                        {log.adminName}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock size={9} />
                        {formatTime(log.createdAt)}
                      </span>
                    </div>
                  </div>

                  {log.targetType && (
                    <span className="px-2 py-0.5 rounded text-[8px] font-bold uppercase text-neutral-500 bg-neutral-100 dark:bg-white/5 border border-neutral-200/30 dark:border-white/5 shrink-0">
                      {log.targetType}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {pagination && pagination.pages > 1 && (
          <div className="flex items-center justify-center gap-3 px-4 py-6">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1.5 rounded-lg border border-neutral-200/60 dark:border-white/5 bg-white dark:bg-[#151518] text-neutral-500 hover:text-neutral-900 dark:hover:text-white disabled:opacity-30 transition-all shadow-sm"
            >
              <ChevronLeft size={13} />
            </button>
            <span className="text-[11px] font-medium text-neutral-500">Page {pagination.page} of {pagination.pages}</span>
            <button
              onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
              disabled={page >= pagination.pages}
              className="p-1.5 rounded-lg border border-neutral-200/60 dark:border-white/5 bg-white dark:bg-[#151518] text-neutral-500 hover:text-neutral-900 dark:hover:text-white disabled:opacity-30 transition-all shadow-sm"
            >
              <ChevronRight size={13} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ActivityLog;
