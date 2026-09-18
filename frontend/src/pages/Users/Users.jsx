import { useState, useEffect } from 'react';
import {
  Search,
  Shield,
  ShieldOff,
  BadgeCheck,
  BadgeX,
  Users,
  ChevronLeft,
  ChevronRight,
  X,
  Loader2,
  Star,
  Mail,
  Calendar,
  Globe,
  RefreshCw,
  Clock,
  BookOpen,
  ArrowRight,
  Download,
  Ban,
  PlayCircle,
  UserX,
  AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import adminAPI from '@/api/adminAPI';

const tierConfig = {
  new:      { label: 'New Writer',      color: 'text-neutral-500 dark:text-neutral-400 bg-neutral-100 dark:bg-white/5 border-neutral-250 dark:border-white/5', hint: 'Every post goes to the review queue' },
  verified: { label: 'Verified Writer', color: 'text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/10', hint: 'Auto-publishes · 25% spot-checked' },
  trusted:  { label: 'Trusted Writer',  color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/10', hint: 'Auto-publishes, no spot-checks' },
};

// Tier behavior explainer shown under the tier pill
const TierPill = ({ tier }) => {
  const cfg = tierConfig[tier] || tierConfig.new;
  return (
    <span
      className={`px-2 py-0.5 rounded text-[8px] font-bold border cursor-help ${cfg.color}`}
      title={cfg.hint}
    >
      {cfg.label}
    </span>
  );
};

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedUser, setSelectedUser] = useState(null);
  const [isActionLoading, setIsActionLoading] = useState(false);

  // Redesign states
  const [roleFilter, setRoleFilter] = useState('all'); // 'all' | 'admins' | 'verified' | 'writers'
  const [sortBy, setSortBy] = useState('newest'); // 'newest' | 'oldest' | 'alphabetical'

  useEffect(() => {
    fetchUsers();
  }, [page, roleFilter]);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const res = await adminAPI.get(`/users?page=${page}&limit=50&search=${encodeURIComponent(search)}&role=${roleFilter}`);
      if (res.success) {
        setUsers(res.users);
        setPagination(res.pagination);
      }
    } catch {
      toast.error('Failed to load users');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = (e) => {
    if (e) e.preventDefault();
    setPage(1);
    fetchUsers();
  };

  const handleResetSearch = () => {
    setSearch('');
    setPage(1);
  };

  // Manual trust-tier override — '' clears back to automatic. Mirrors the
  // backend: override wins, clearDemotion also lifts a rejection demotion.
  const handleSetTier = async (userId, tier, clearDemotion = false) => {
    setIsActionLoading(true);
    try {
      const res = await adminAPI.put(`/users/${userId}/writer-tier`, { tier, clearDemotion });
      if (res.success) {
        toast.success(res.message);
        setUsers(prev => prev.map(u => u._id === userId ? {
          ...u,
          writerTierOverride: tier,
          writerDemoted: clearDemotion ? false : u.writerDemoted,
        } : u));
        if (selectedUser?._id === userId) {
          setSelectedUser(prev => ({
            ...prev,
            writerTierOverride: tier,
            writerDemoted: clearDemotion ? false : prev.writerDemoted,
          }));
          // Re-pull so the effective tier reflects the new override
          openUserDetail(prevUser => prevUser);
        }
      }
    } catch {
      toast.error('Failed to set writer tier');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleToggleAdmin = async (userId) => {
    setIsActionLoading(true);
    try {
      const res = await adminAPI.post(`/users/${userId}/toggle-admin`);
      if (res.success) {
        toast.success(res.message);
        setUsers(prev => prev.map(u => u._id === userId ? { ...u, isAdmin: !u.isAdmin } : u));
        if (selectedUser?._id === userId) {
          setSelectedUser(prev => ({ ...prev, isAdmin: !prev.isAdmin }));
        }
      }
    } catch {
      toast.error('Failed to toggle admin status');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleToggleVerified = async (userId) => {
    setIsActionLoading(true);
    try {
      const res = await adminAPI.post(`/users/${userId}/toggle-verified`);
      if (res.success) {
        toast.success(res.message);
        setUsers(prev => prev.map(u => u._id === userId ? { ...u, isVerified: !u.isVerified } : u));
        if (selectedUser?._id === userId) {
          setSelectedUser(prev => ({ ...prev, isVerified: !prev.isVerified }));
        }
      }
    } catch {
      toast.error('Failed to toggle verification');
    } finally {
      setIsActionLoading(false);
    }
  };

  // Ban / suspend / restore. Mirrors setAccountStatus guards: admins and
  // self are refused server-side; the UI hides the controls for them too.
  const handleSetStatus = async (userId, status, reason = '') => {
    setIsActionLoading(true);
    try {
      const res = await adminAPI.put(`/users/${userId}/status`, { status, reason });
      if (res.success) {
        toast.success(res.message);
        setUsers(prev => prev.map(u => u._id === userId
          ? { ...u, accountStatus: status, statusReason: status === 'active' ? '' : reason }
          : u));
        if (selectedUser?._id === userId) {
          setSelectedUser(prev => ({
            ...prev,
            accountStatus: status,
            statusReason: status === 'active' ? '' : reason,
            statusChangedAt: new Date().toISOString(),
          }));
        }
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to update account status');
    } finally {
      setIsActionLoading(false);
    }
  };

  // Soft delete with typed confirmation. The user keeps their posts and
  // comments (backend enforces this), but disappears from all lists and
  // can never log in again.
  const handleDeleteUser = async (user) => {
    const typed = window.prompt(
      `Permanently delete "${user.username}"?\n\n` +
      `Their ${user.writerStats?.approved ?? 0} published article(s) and comments stay online for the record, ` +
      `but they are removed from all lists and can never log in again.\n\n` +
      `Type DELETE to confirm.`
    );
    if (typed !== 'DELETE') {
      if (typed !== null) toast.error('Confirmation did not match — deletion cancelled');
      return;
    }
    setIsActionLoading(true);
    try {
      const res = await adminAPI.delete(`/users/${user._id}`);
      if (res.success) {
        toast.success(res.message);
        setSelectedUser(null);
        setUsers(prev => prev.filter(u => u._id !== user._id));
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to delete user');
    } finally {
      setIsActionLoading(false);
    }
  };

  const openUserDetail = async (user) => {
    try {
      const res = await adminAPI.get(`/users/${user._id}`);
      if (res.success) setSelectedUser(res.user);
    } catch {
      toast.error('Failed to load user details');
    }
  };

  // Sorting (filtering is now done server-side)
  const sortedUsers = [...users].sort((a, b) => {
    if (sortBy === 'newest') {
      return new Date(b.createdAt) - new Date(a.createdAt);
    }
    if (sortBy === 'oldest') {
      return new Date(a.createdAt) - new Date(b.createdAt);
    }
    if (sortBy === 'alphabetical') {
      return a.username.localeCompare(b.username);
    }
    return 0;
  });

  // Calculate stats from current page users
  const adminCount = users.filter(u => u.isAdmin).length;
  const verifiedCount = users.filter(u => u.isVerified).length;
  const trustedCount = users.filter(u => u.writerStats?.tier === 'trusted').length;

  return (
    <div className="h-full flex flex-col bg-neutral-50/30 dark:bg-[#0d0d0f]/20 selection:bg-neutral-200/50 dark:selection:bg-neutral-400/40">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-neutral-200/50 dark:border-white/5 bg-white/40 dark:bg-[#121214]/40 backdrop-blur-sm">
        <div>
          <h1 className="text-base font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
            Writers & Admins
          </h1>
          <p className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-0.5">
            {pagination ? `Showing ${users.length} of ${pagination.total} registered users` : 'Manage platform users, roles, and writers'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              try {
                const res = await adminAPI.get(`/export/users?${new URLSearchParams({ role: roleFilter })}`, { responseType: 'blob' });
                const blob = new Blob([res], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url; a.download = `users-${new Date().toISOString().split('T')[0]}.csv`;
                a.click(); URL.revokeObjectURL(url);
                toast.success('Users exported');
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
              fetchUsers();
              toast.success('User database reloaded');
            }}
            className="p-1.5 rounded-lg border border-neutral-200/50 dark:border-white/5 bg-white dark:bg-[#18181b] hover:bg-neutral-50 dark:hover:bg-white/5 text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-all shadow-sm flex items-center gap-1.5 text-[11px] font-medium"
          >
            <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
            Reload
          </button>
        </div>
      </div>

      {/* Reactive stats cards */}
      <div className="shrink-0 p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Registered */}
        <div className="bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 p-4 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex items-center justify-between group hover:border-neutral-300 dark:hover:border-neutral-800 transition-all">
          <div className="space-y-1">
            <span className="text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Total Members</span>
            <p className="text-xl font-bold text-neutral-800 dark:text-neutral-100 leading-none">{pagination ? pagination.total : users.length}</p>
          </div>
          <div className="w-8 h-8 rounded-lg bg-neutral-100 dark:bg-neutral-800/50 flex items-center justify-center text-neutral-550">
            <Users size={15} strokeWidth={1.5} />
          </div>
        </div>

        {/* Admins Count */}
        <div className="bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 p-4 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex items-center justify-between group hover:border-neutral-300 dark:hover:border-neutral-800 transition-all">
          <div className="space-y-1">
            <span className="text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Admin Staff</span>
            <p className="text-xl font-bold text-neutral-800 dark:text-neutral-100 leading-none">{adminCount}</p>
          </div>
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-500">
            <Shield size={15} strokeWidth={1.5} />
          </div>
        </div>

        {/* Verified Count */}
        <div className="bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 p-4 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex items-center justify-between group hover:border-neutral-300 dark:hover:border-neutral-800 transition-all">
          <div className="space-y-1">
            <span className="text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Verified Writers</span>
            <p className="text-xl font-bold text-neutral-800 dark:text-neutral-100 leading-none">{verifiedCount}</p>
          </div>
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-500">
            <BadgeCheck size={15} strokeWidth={1.5} />
          </div>
        </div>

        {/* Trusted Count */}
        <div className="bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 p-4 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex items-center justify-between group hover:border-neutral-300 dark:hover:border-neutral-800 transition-all">
          <div className="space-y-1">
            <span className="text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Trusted Tier</span>
            <p className="text-xl font-bold text-neutral-800 dark:text-neutral-100 leading-none">{trustedCount}</p>
          </div>
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-600 dark:text-amber-500">
            <Star size={15} strokeWidth={1.5} />
          </div>
        </div>
      </div>

      {/* Control Bar */}
      <div className="shrink-0 px-6 pb-4 flex flex-col md:flex-row gap-4 items-center justify-between">
        {/* Search Input */}
        <form onSubmit={handleSearch} className="w-full md:w-80 flex gap-2">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-neutral-550" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by username or email..."
              className="w-full pl-9 pr-8 py-1.5 bg-white dark:bg-[#151518] border border-neutral-200/60 dark:border-white/5 rounded-lg text-xs text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:border-neutral-400 dark:focus:border-neutral-700 transition-all shadow-[0_1px_2px_rgba(0,0,0,0.01)]"
            />
            {search && (
              <button
                type="button"
                onClick={handleResetSearch}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 dark:hover:text-white"
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

        {/* Filters and sorting */}
        <div className="w-full md:w-auto flex flex-wrap items-center gap-3 justify-end">
          {/* Role filter segmented control */}
          <div className="p-0.5 rounded-lg bg-neutral-200/50 dark:bg-neutral-950/60 border border-neutral-200/40 dark:border-white/5 flex gap-0.5 shadow-inner">
            <button
              onClick={() => setRoleFilter('all')}
              className={`px-3 py-1 text-[11px] font-medium rounded-md transition-all ${
                roleFilter === 'all'
                  ? 'bg-white dark:bg-[#1b1b1e] text-neutral-900 dark:text-white shadow-sm'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-750 dark:hover:text-neutral-350'
              }`}
            >
              All Users
            </button>
            <button
              onClick={() => setRoleFilter('admins')}
              className={`px-3 py-1 text-[11px] font-medium rounded-md transition-all ${
                roleFilter === 'admins'
                  ? 'bg-white dark:bg-[#1b1b1e] text-neutral-900 dark:text-white shadow-sm'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-750 dark:hover:text-neutral-350'
              }`}
            >
              Admins
            </button>
            <button
              onClick={() => setRoleFilter('verified')}
              className={`px-3 py-1 text-[11px] font-medium rounded-md transition-all ${
                roleFilter === 'verified'
                  ? 'bg-white dark:bg-[#1b1b1e] text-neutral-900 dark:text-white shadow-sm'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-750 dark:hover:text-neutral-350'
              }`}
            >
              Verified
            </button>
            <button
              onClick={() => setRoleFilter('writers')}
              className={`px-3 py-1 text-[11px] font-medium rounded-md transition-all ${
                roleFilter === 'writers'
                  ? 'bg-white dark:bg-[#1b1b1e] text-neutral-900 dark:text-white shadow-sm'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-750 dark:hover:text-neutral-350'
              }`}
            >
              Writers
            </button>
            <button
              onClick={() => setRoleFilter('banned')}
              className={`px-3 py-1 text-[11px] font-medium rounded-md transition-all ${
                roleFilter === 'banned'
                  ? 'bg-white dark:bg-[#1b1b1e] text-neutral-900 dark:text-white shadow-sm'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-750 dark:hover:text-neutral-350'
              }`}
            >
              Restricted
            </button>
          </div>

          {/* Sort By Dropdown */}
          <div className="relative flex items-center gap-1 bg-white dark:bg-[#151518] border border-neutral-200/60 dark:border-white/5 rounded-lg px-2.5 py-1 shadow-sm">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-transparent text-[11px] font-medium text-neutral-600 dark:text-neutral-350 focus:outline-none border-none pr-1 py-0.5 cursor-pointer"
            >
              <option value="newest" className="dark:bg-[#151518]">Newest Joint</option>
              <option value="oldest" className="dark:bg-[#151518]">Oldest Joint</option>
              <option value="alphabetical" className="dark:bg-[#151518]">Username A-Z</option>
            </select>
          </div>
        </div>
      </div>

      {/* User listing body */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {isLoading ? (
          /* Pulse Row Loading */
          <div className="bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 rounded-xl p-4 divide-y divide-neutral-100 dark:divide-white/5 animate-pulse space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3 w-1/2">
                  <div className="w-9 h-9 bg-neutral-200/50 dark:bg-neutral-800 rounded-lg" />
                  <div className="space-y-1.5 flex-1">
                    <div className="h-3.5 bg-neutral-200/50 dark:bg-neutral-800 rounded w-1/3" />
                    <div className="h-2.5 bg-neutral-200/50 dark:bg-neutral-800 rounded w-1/2" />
                  </div>
                </div>
                <div className="h-3 bg-neutral-200/50 dark:bg-neutral-800 rounded w-24" />
                <div className="h-6 bg-neutral-200/50 dark:bg-neutral-800 rounded w-16" />
              </div>
            ))}
          </div>
        ) : users.length === 0 ? (
          <div className="bg-white dark:bg-[#151518]/40 border border-neutral-200/40 dark:border-white/5 rounded-2xl flex flex-col items-center justify-center py-20 shadow-sm">
            <Users size={28} strokeWidth={1.5} className="text-neutral-350 dark:text-neutral-600 mb-3" />
            <p className="text-xs font-semibold text-neutral-800 dark:text-neutral-300">No users found</p>
            <p className="text-[11px] text-neutral-400 mt-1">Try adapting your filters or searching another parameter.</p>
          </div>
        ) : (
          /* Notion tabular list layout */
          <div className="bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 rounded-xl overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.01)]">
            <div className="min-w-full divide-y divide-neutral-200/50 dark:divide-white/5">
              {/* Header column names */}
              <div className="bg-neutral-50/50 dark:bg-neutral-900/30 px-5 py-2 flex items-center text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
                <div className="w-[35%]">User Details</div>
                <div className="w-[30%]">Email Address</div>
                <div className="w-[15%]">Role & Verification</div>
                <div className="w-[20%] text-right">Date Joined</div>
              </div>

              {/* Rows */}
              <div className="divide-y divide-neutral-150 dark:divide-white/5">
                {sortedUsers.map((user) => (
                  <div
                    key={user._id}
                    onClick={() => openUserDetail(user)}
                    className={`px-5 py-3 flex items-center hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors cursor-pointer text-xs text-neutral-700 dark:text-neutral-350 ${
                      selectedUser?._id === user._id ? 'bg-neutral-100/60 dark:bg-white/5 font-medium' : ''
                    }`}
                  >
                    {/* User profile details */}
                    <div className="w-[35%] flex items-center gap-3 pr-4 min-w-0">
                      <div className="w-8 h-8 rounded-lg overflow-hidden border border-neutral-200/50 dark:border-white/10 bg-neutral-100 shrink-0">
                        <img
                          src={user.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user.username)}`}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="truncate min-w-0">
                        <span className="truncate font-semibold text-neutral-900 dark:text-white leading-snug">
                          {user.username}
                        </span>
                        {/* Render writer stats tier pill locally if available */}
                        {user.writerStats && (
                          <span className={`ml-2 inline-flex px-1.5 py-0.5 rounded text-[8px] font-bold border ${tierConfig[user.writerStats.tier]?.color || 'text-neutral-400 bg-neutral-150'}`}>
                            {tierConfig[user.writerStats.tier]?.label || 'New'}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Email */}
                    <div className="w-[30%] truncate pr-2 text-neutral-500 dark:text-neutral-400">
                      {user.email}
                    </div>

                    {/* Role / Verification */}
                    <div className="w-[15%] pr-2 flex items-center gap-2">
                      {user.isAdmin && (
                        <span className="px-1.5 py-0.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/10 rounded text-[9px] font-bold">
                          ADMIN
                        </span>
                      )}
                      {user.accountStatus === 'banned' && (
                        <span className="px-1.5 py-0.5 bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/10 rounded text-[9px] font-bold">
                          BANNED
                        </span>
                      )}
                      {user.accountStatus === 'suspended' && (
                        <span className="px-1.5 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/10 rounded text-[9px] font-bold">
                          SUSPENDED
                        </span>
                      )}
                      {user.isVerified ? (
                        <BadgeCheck size={14} className="text-emerald-500 shrink-0" title="Email verified" />
                      ) : (
                        <BadgeX size={14} className="text-neutral-400 shrink-0" title="Email unverified" />
                      )}
                    </div>

                    {/* Joined Date */}
                    <div className="w-[20%] text-right text-neutral-400 font-medium">
                      {new Date(user.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Pagination controls */}
        {pagination && pagination.pages > 1 && (
          <div className="flex items-center justify-center gap-3 px-4 py-6">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1.5 rounded-lg border border-neutral-200/60 dark:border-white/5 bg-white dark:bg-[#151518] text-neutral-500 hover:text-neutral-900 dark:hover:text-white disabled:opacity-30 transition-all shadow-sm"
            >
              <ChevronLeft size={13} />
            </button>
            <span className="text-[11px] font-medium text-neutral-500">
              Page {pagination.page} of {pagination.pages}
            </span>
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

      {/* Slide-over User Detail Panel */}
      <AnimatePresence>
        {selectedUser && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedUser(null)}
              className="fixed inset-0 z-40 bg-black/30 dark:bg-black/60 backdrop-blur-[2px]"
            />

            {/* Panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-white dark:bg-[#151518] border-l border-neutral-200/50 dark:border-white/5 shadow-2xl flex flex-col justify-between overflow-hidden"
            >
              {/* Drawer Header */}
              <div className="shrink-0 p-4 border-b border-neutral-200/50 dark:border-white/5 flex items-center justify-between">
                <span className="text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
                  User Account Inspector
                </span>
                <button
                  onClick={() => setSelectedUser(null)}
                  className="p-1 rounded-lg hover:bg-neutral-100 dark:hover:bg-white/5 text-neutral-400 hover:text-neutral-750 dark:hover:text-white transition-colors"
                >
                  <X size={15} />
                </button>
              </div>

              {/* Scrollable details area */}
              <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar text-xs">
                {/* Profile card summary */}
                <div className="bg-neutral-50/50 dark:bg-[#1b1b1e]/50 border border-neutral-200/40 dark:border-white/5 rounded-xl p-4 text-center space-y-3 shadow-sm">
                  <div className="w-16 h-16 rounded-xl overflow-hidden border border-neutral-200/50 dark:border-white/10 mx-auto shadow-sm bg-neutral-100">
                    <img
                      src={selectedUser.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(selectedUser.username)}`}
                      alt="Avatar"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-neutral-900 dark:text-white leading-tight">
                      {selectedUser.username}
                    </h2>
                    <p className="text-[10px] text-neutral-400 dark:text-neutral-550 mt-1">{selectedUser.email}</p>
                  </div>
                  {selectedUser.bio ? (
                    <p className="text-[10px] text-neutral-500 dark:text-neutral-400 leading-relaxed max-w-[200px] mx-auto italic">
                      "{selectedUser.bio}"
                    </p>
                  ) : (
                    <p className="text-[10px] text-neutral-400 dark:text-neutral-550 italic">No bio written</p>
                  )}
                </div>

                {/* Writer stats metrics grid */}
                {selectedUser.writerStats && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 text-neutral-400 uppercase tracking-wider text-[9px] font-semibold">
                      <Star size={11} className="text-amber-500" />
                      <span>Writer Status & Statistics</span>
                    </div>
                    <div className="bg-neutral-50/50 dark:bg-[#1b1b1e]/30 border border-neutral-200/30 dark:border-white/5 rounded-xl p-3 space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] text-neutral-500">Tier Status:</span>
                        <span className="flex items-center gap-1.5">
                          {selectedUser.writerStats.demoted && (
                            <span className="px-2 py-0.5 rounded text-[8px] font-bold border text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/10" title="Demoted after repeated rejections — all posts go to review">
                              Demoted
                            </span>
                          )}
                          {selectedUser.writerStats.override && (
                            <span className="px-2 py-0.5 rounded text-[8px] font-bold border text-purple-600 dark:text-purple-400 bg-purple-500/10 border-purple-500/10" title="Tier manually set by an admin — wins over the automatic calculation">
                              Override
                            </span>
                          )}
                          <TierPill tier={selectedUser.writerStats.tier} />
                        </span>
                      </div>

                      {/* Manual tier override control */}
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-neutral-200/40 dark:border-white/5">
                        <span className="text-[9px] text-neutral-400 uppercase tracking-wider font-semibold">Admin Override</span>
                        <div className="flex items-center gap-1">
                          {[['new', 'New'], ['verified', 'Verified'], ['trusted', 'Trusted'], ['', 'Auto']].map(([val, label]) => {
                            const active = (selectedUser.writerStats.override || '') === (val || '')
                              && (val !== '' || selectedUser.writerStats.override === null || selectedUser.writerStats.override === '');
                            const isAuto = val === '';
                            return (
                              <button
                                key={label}
                                type="button"
                                disabled={isActionLoading || !!selectedUser.isAdmin}
                                onClick={() => handleSetTier(selectedUser._id, val, false)}
                                title={
                                  isAuto
                                    ? 'Clear override — tier computed automatically from approved/rejected history'
                                    : `Force tier: ${tierConfig[val]?.hint}`
                                }
                                className={`px-2 py-1 rounded-md text-[9px] font-semibold border transition-all disabled:opacity-40 ${
                                  active
                                    ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 border-neutral-900 dark:border-white shadow-sm'
                                    : 'bg-white dark:bg-[#151518] text-neutral-500 dark:text-neutral-400 border-neutral-200/60 dark:border-white/10 hover:border-neutral-400 dark:hover:border-neutral-600'
                                }`}
                              >
                                {label}
                              </button>
                            );
                          })}
                          {selectedUser.writerStats.demoted && (
                            <button
                              type="button"
                              disabled={isActionLoading}
                              onClick={() => handleSetTier(selectedUser._id, '', true)}
                              className="px-2 py-1 rounded-md text-[9px] font-semibold border bg-white dark:bg-[#151518] text-red-500 hover:text-red-600 dark:hover:text-red-400 border-neutral-200/60 dark:border-white/10 hover:border-red-400 transition-all disabled:opacity-40"
                              title="Clear the rejection demotion — writer returns to the automatic tier"
                            >
                              Clear Demotion
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-1">
                        <div className="text-center p-1.5 bg-white dark:bg-[#151518] border border-neutral-200/50 dark:border-white/5 rounded-lg shadow-sm">
                          <p className="text-xs font-bold text-emerald-600 dark:text-emerald-500">{selectedUser.writerStats.approved}</p>
                          <p className="text-[8px] text-neutral-400 uppercase font-medium mt-0.5">Approved</p>
                        </div>
                        <div className="text-center p-1.5 bg-white dark:bg-[#151518] border border-neutral-200/50 dark:border-white/5 rounded-lg shadow-sm">
                          <p className="text-xs font-bold text-amber-500">{selectedUser.writerStats.pending}</p>
                          <p className="text-[8px] text-neutral-400 uppercase font-medium mt-0.5">Pending</p>
                        </div>
                        <div className="text-center p-1.5 bg-white dark:bg-[#151518] border border-neutral-200/50 dark:border-white/5 rounded-lg shadow-sm">
                          <p className="text-xs font-bold text-red-500">{selectedUser.writerStats.rejected}</p>
                          <p className="text-[8px] text-neutral-400 uppercase font-medium mt-0.5">Rejected</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Recent submissions list (Up to 20 recent posts) */}
                {selectedUser.submissions && selectedUser.submissions.length > 0 && (
                  <div className="space-y-2">
                    <span className="block text-[9px] font-semibold text-neutral-400 uppercase tracking-wider">
                      Recent Submissions ({selectedUser.submissions.length})
                    </span>
                    <div className="bg-neutral-50/30 dark:bg-[#1b1b1e]/20 border border-neutral-200/35 dark:border-white/5 rounded-xl overflow-hidden max-h-[220px] overflow-y-auto custom-scrollbar">
                      <div className="divide-y divide-neutral-100 dark:divide-white/5">
                        {selectedUser.submissions.map(post => (
                          <div key={post._id} className="p-2.5 flex items-center justify-between hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors gap-3">
                            <div className="min-w-0 flex-1 space-y-0.5">
                              <p className="text-[10.5px] font-medium text-neutral-800 dark:text-neutral-200 truncate leading-snug">
                                {post.title}
                              </p>
                              <p className="text-[8px] text-neutral-400">
                                {new Date(post.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </p>
                            </div>
                            <span className={`shrink-0 px-1.5 py-0.5 rounded text-[7px] font-bold ${
                              post.status === 'approved'
                                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-500'
                                : post.status === 'rejected'
                                ? 'bg-red-500/15 text-red-600 dark:text-red-500'
                                : 'bg-amber-500/15 text-amber-600 dark:text-amber-500'
                            }`}>
                              {post.status.toUpperCase()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Account details panel */}
                <div className="space-y-2">
                  <span className="block text-[9px] font-semibold text-neutral-400 uppercase tracking-wider">
                    Registration Information
                  </span>
                  <div className="bg-neutral-50/50 dark:bg-[#1b1b1e]/30 border border-neutral-200/30 dark:border-white/5 rounded-xl p-3 space-y-2 text-[10.5px] text-neutral-500 dark:text-neutral-400 font-medium">
                    <div className="flex items-center gap-2">
                      <Mail size={12} className="text-neutral-400 shrink-0" />
                      <span className="truncate">{selectedUser.email}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar size={12} className="text-neutral-400 shrink-0" />
                      <span>Joined: {new Date(selectedUser.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                    </div>
                    {selectedUser.country && (
                      <div className="flex items-center gap-2">
                        <Globe size={12} className="text-neutral-400 shrink-0" />
                        <span>Origin: {selectedUser.country}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Account moderation status */}
                {selectedUser.accountStatus && selectedUser.accountStatus !== 'active' && (
                  <div className={`rounded-xl p-3 space-y-1.5 border ${
                    selectedUser.accountStatus === 'banned'
                      ? 'bg-red-500/5 border-red-500/20'
                      : 'bg-amber-500/5 border-amber-500/20'
                  }`}>
                    <div className="flex items-center gap-1.5">
                      <AlertTriangle size={12} className={selectedUser.accountStatus === 'banned' ? 'text-red-500' : 'text-amber-500'} />
                      <span className={`text-[10px] font-bold uppercase tracking-wider ${
                        selectedUser.accountStatus === 'banned' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'
                      }`}>
                        Account {selectedUser.accountStatus}
                      </span>
                    </div>
                    {selectedUser.statusReason && (
                      <p className="text-[10px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
                        Reason: {selectedUser.statusReason}
                      </p>
                    )}
                    {selectedUser.statusChangedAt && (
                      <p className="text-[9px] text-neutral-400">
                        Changed {new Date(selectedUser.statusChangedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    )}
                    <p className="text-[9px] text-neutral-400 leading-relaxed">
                      They cannot log in, and token refreshes are rejected — the block lands within ~15 minutes even with an open session.
                    </p>
                  </div>
                )}
              </div>

              {/* Administrative actions in footer drawer */}
              <div className="shrink-0 p-4 border-t border-neutral-200/50 dark:border-white/5 bg-neutral-50/50 dark:bg-neutral-900/30 space-y-2.5">
                <span className="block text-[9px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
                  Admin Control panel
                </span>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => handleToggleAdmin(selectedUser._id)}
                    disabled={isActionLoading}
                    className="flex-1 py-2 px-3 border border-neutral-200/60 dark:border-white/5 rounded-lg text-xs font-semibold text-neutral-700 dark:text-neutral-350 bg-white dark:bg-[#18181b] hover:bg-neutral-50 dark:hover:bg-white/5 disabled:opacity-40 shadow-sm transition-all flex items-center justify-center gap-1.5"
                  >
                    {isActionLoading ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : selectedUser.isAdmin ? (
                      <>
                        <ShieldOff size={12} className="text-red-500" />
                        Revoke Admin
                      </>
                    ) : (
                      <>
                        <Shield size={12} className="text-blue-500" />
                        Make Admin
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => handleToggleVerified(selectedUser._id)}
                    disabled={isActionLoading}
                    className="flex-1 py-2 px-3 border border-neutral-200/60 dark:border-white/5 rounded-lg text-xs font-semibold text-neutral-700 dark:text-neutral-350 bg-white dark:bg-[#18181b] hover:bg-neutral-50 dark:hover:bg-white/5 disabled:opacity-40 shadow-sm transition-all flex items-center justify-center gap-1.5"
                  >
                    {isActionLoading ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : selectedUser.isVerified ? (
                      <>
                        <BadgeX size={12} className="text-amber-500" />
                        Unverify User
                      </>
                    ) : (
                      <>
                        <BadgeCheck size={12} className="text-emerald-500" />
                        Verify User
                      </>
                    )}
                  </button>
                </div>

                {/* Moderation row — hidden for admins (backend refuses them) */}
                {!selectedUser.isAdmin && (
                  <div className="grid grid-cols-2 gap-3">
                    {selectedUser.accountStatus === 'active' ? (
                      <>
                        <button
                          onClick={() => {
                            const reason = window.prompt(`Suspend "${selectedUser.username}"?\nThey cannot log in until you restore access.\n\nReason (shown to you in the activity log, optional):`);
                            if (reason === null) return;
                            handleSetStatus(selectedUser._id, 'suspended', reason);
                          }}
                          disabled={isActionLoading}
                          className="py-2 px-3 border border-amber-500/30 rounded-lg text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/5 hover:bg-amber-500/10 disabled:opacity-40 shadow-sm transition-all flex items-center justify-center gap-1.5"
                          title="Temporarily block login — reversible"
                        >
                          <Clock size={12} />
                          Suspend
                        </button>
                        <button
                          onClick={() => {
                            const reason = window.prompt(`Ban "${selectedUser.username}" permanently?\nThey can never log in again with this account.\n\nReason (optional):`);
                            if (reason === null) return;
                            handleSetStatus(selectedUser._id, 'banned', reason);
                          }}
                          disabled={isActionLoading}
                          className="py-2 px-3 border border-red-500/30 rounded-lg text-xs font-semibold text-red-600 dark:text-red-400 bg-red-500/5 hover:bg-red-500/10 disabled:opacity-40 shadow-sm transition-all flex items-center justify-center gap-1.5"
                          title="Permanently block login"
                        >
                          <Ban size={12} />
                          Ban
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => handleSetStatus(selectedUser._id, 'active')}
                          disabled={isActionLoading}
                          className="py-2 px-3 border border-emerald-500/30 rounded-lg text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/5 hover:bg-emerald-500/10 disabled:opacity-40 shadow-sm transition-all flex items-center justify-center gap-1.5"
                          title="Restore login access"
                        >
                          <PlayCircle size={12} />
                          Restore Access
                        </button>
                        {selectedUser.accountStatus === 'suspended' && (
                          <button
                            onClick={() => {
                              const reason = window.prompt(`Ban "${selectedUser.username}" permanently?\n\nReason (optional):`);
                              if (reason === null) return;
                              handleSetStatus(selectedUser._id, 'banned', reason);
                            }}
                            disabled={isActionLoading}
                            className="py-2 px-3 border border-red-500/30 rounded-lg text-xs font-semibold text-red-600 dark:text-red-400 bg-red-500/5 hover:bg-red-500/10 disabled:opacity-40 shadow-sm transition-all flex items-center justify-center gap-1.5"
                          >
                            <Ban size={12} />
                            Ban
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Delete — the destructive action lives alone, last */}
                {!selectedUser.isAdmin && (
                  <button
                    onClick={() => handleDeleteUser(selectedUser)}
                    disabled={isActionLoading}
                    className="w-full py-2 px-3 rounded-lg text-xs font-semibold text-neutral-500 dark:text-neutral-450 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/5 border border-transparent hover:border-red-500/20 disabled:opacity-40 transition-all flex items-center justify-center gap-1.5"
                    title="Remove from all lists and block login; posts and comments are kept"
                  >
                    <UserX size={12} />
                    Delete Account
                  </button>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
