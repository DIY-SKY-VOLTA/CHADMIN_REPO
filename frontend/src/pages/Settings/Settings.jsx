import { useState, useEffect } from 'react';
import {
  Settings,
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Save,
  Loader2,
  Shield,
  RefreshCw,
  CheckCircle,
  Image,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';
import adminAPI from '@/api/adminAPI';

const SettingsPage = () => {
  const adminUser = JSON.parse(localStorage.getItem('admin_user') || '{}');

  const [activeTab, setActiveTab] = useState('profile');
  const [isSaving, setIsSaving] = useState(false);

  // Profile form
  const [username, setUsername] = useState(adminUser.username || '');
  const [email, setEmail] = useState(adminUser.email || '');
  const [avatar, setAvatar] = useState(adminUser.avatar || '');
  const [bio, setBio] = useState('');

  // Password form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const res = await adminAPI.get(`/users/${adminUser.id}`);
      if (res.success && res.user) {
        setUsername(res.user.username || '');
        setEmail(res.user.email || '');
        setAvatar(res.user.avatar || '');
        setBio(res.user.bio || '');
      }
    } catch {}
  };

  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await adminAPI.put('/auth/update-profile', { username, email, avatar, bio });
      if (res.success) {
        const updatedUser = { ...adminUser, username: res.user.username, email: res.user.email, avatar: res.user.avatar };
        localStorage.setItem('admin_user', JSON.stringify(updatedUser));
        toast.success('Profile updated');
      }
    } catch (err) {
      toast.error(err.message || 'Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('New password must be at least 6 characters');
      return;
    }
    setIsSaving(true);
    try {
      await adminAPI.post('/auth/change-password', { currentPassword, newPassword });
      toast.success('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      toast.error(err.message || 'Failed to change password');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-neutral-50/30 dark:bg-[#0d0d0f]/20 selection:bg-neutral-200/50 dark:selection:bg-neutral-400/40">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-neutral-200/50 dark:border-white/5 bg-white/40 dark:bg-[#121214]/40 backdrop-blur-sm">
        <div>
          <h1 className="text-base font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
            Admin Settings
          </h1>
          <p className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-0.5">
            Manage your account profile and security
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Tabs */}
          <div className="flex p-0.5 bg-neutral-200/50 dark:bg-neutral-950/60 border border-neutral-200/40 dark:border-white/5 rounded-lg gap-0.5 shadow-inner w-fit">
            <button
              onClick={() => setActiveTab('profile')}
              className={`px-4 py-1.5 text-[11px] font-medium rounded-md transition-all ${activeTab === 'profile' ? 'bg-white dark:bg-[#1b1b1e] text-neutral-900 dark:text-white shadow-sm' : 'text-neutral-500 dark:text-neutral-400'}`}
            >
              <div className="flex items-center gap-1.5">
                <User size={12} />
                Profile
              </div>
            </button>
            <button
              onClick={() => setActiveTab('security')}
              className={`px-4 py-1.5 text-[11px] font-medium rounded-md transition-all ${activeTab === 'security' ? 'bg-white dark:bg-[#1b1b1e] text-neutral-900 dark:text-white shadow-sm' : 'text-neutral-500 dark:text-neutral-400'}`}
            >
              <div className="flex items-center gap-1.5">
                <Lock size={12} />
                Security
              </div>
            </button>
          </div>

          {activeTab === 'profile' ? (
            <form onSubmit={handleProfileUpdate} className="bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 rounded-2xl p-6 space-y-5">
              {/* Avatar */}
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-xl overflow-hidden border border-neutral-200/50 dark:border-white/10 bg-neutral-100 shrink-0">
                  <img src={avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(username)}`} alt="" className="w-full h-full object-cover" />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Avatar URL</label>
                  <input
                    type="text"
                    value={avatar}
                    onChange={(e) => setAvatar(e.target.value)}
                    placeholder="https://example.com/avatar.jpg"
                    className="w-full mt-1 px-3 py-1.5 bg-neutral-50 dark:bg-[#18181b] border border-neutral-200/60 dark:border-white/5 rounded-lg text-xs text-neutral-800 dark:text-white focus:outline-none focus:border-neutral-400 dark:focus:border-white/20 transition-colors"
                  />
                </div>
              </div>

              {/* Username */}
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Username</label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-50 dark:bg-[#18181b] border border-neutral-200/60 dark:border-white/5 rounded-lg text-xs text-neutral-800 dark:text-white focus:outline-none focus:border-neutral-400 dark:focus:border-white/20 transition-colors"
                />
              </div>

              {/* Email */}
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-50 dark:bg-[#18181b] border border-neutral-200/60 dark:border-white/5 rounded-lg text-xs text-neutral-800 dark:text-white focus:outline-none focus:border-neutral-400 dark:focus:border-white/20 transition-colors"
                />
              </div>

              {/* Bio */}
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Bio</label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 bg-neutral-50 dark:bg-[#18181b] border border-neutral-200/60 dark:border-white/5 rounded-lg text-xs text-neutral-800 dark:text-white focus:outline-none focus:border-neutral-400 dark:focus:border-white/20 transition-colors resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-lg text-xs font-bold hover:opacity-90 disabled:opacity-50 transition-all shadow-sm flex items-center gap-2"
              >
                {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                Save Profile
              </button>
            </form>
          ) : (
            <form onSubmit={handlePasswordChange} className="bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 rounded-2xl p-6 space-y-5">
              <div className="flex items-center gap-2 text-neutral-400 mb-2">
                <Shield size={14} />
                <span className="text-[10px] font-semibold uppercase tracking-wider">Change Password</span>
              </div>

              {/* Current Password */}
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Current Password</label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-50 dark:bg-[#18181b] border border-neutral-200/60 dark:border-white/5 rounded-lg text-xs text-neutral-800 dark:text-white focus:outline-none focus:border-neutral-400 dark:focus:border-white/20 transition-colors"
                />
              </div>

              {/* New Password */}
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">New Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3 py-2 bg-neutral-50 dark:bg-[#18181b] border border-neutral-200/60 dark:border-white/5 rounded-lg text-xs text-neutral-800 dark:text-white focus:outline-none focus:border-neutral-400 dark:focus:border-white/20 transition-colors pr-10"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600">
                    {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Confirm New Password</label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-50 dark:bg-[#18181b] border border-neutral-200/60 dark:border-white/5 rounded-lg text-xs text-neutral-800 dark:text-white focus:outline-none focus:border-neutral-400 dark:focus:border-white/20 transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-lg text-xs font-bold hover:opacity-90 disabled:opacity-50 transition-all shadow-sm flex items-center gap-2"
              >
                {isSaving ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
                Update Password
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
