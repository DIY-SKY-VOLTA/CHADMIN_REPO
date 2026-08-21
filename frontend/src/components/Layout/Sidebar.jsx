import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  FileText, 
  LogOut, 
  Sun, 
  Moon, 
  X,
  List,
  Image as ImageIcon,
  Users,
  MessageSquare,
  Tag,
  Globe,
  BarChart3,
  Activity,
  Settings,
  ChevronsUpDown,
  AlertTriangle,
  Trophy,
  ScrollText,
  FileText as FileTextIcon,
  CalendarDays,
} from 'lucide-react';

const sections = [
  {
    label: 'Overview',
    items: [
      { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
      { icon: BarChart3, label: 'Analytics', path: '/analytics' },
      { icon: Activity, label: 'Activity Log', path: '/activity' },
    ],
  },
  {
    label: 'Publishing',
    items: [
      { icon: FileText, label: 'Editorial Queue', path: '/editorial', badgeKey: 'pending' },
      { icon: List, label: 'Submissions', path: '/posts' },
      { icon: Globe, label: 'Live Posts', path: '/published' },
    ],
  },
  {
    label: 'Management',
    items: [
      { icon: Trophy, label: 'Contests', path: '/contests', end: true },
      { icon: FileTextIcon, label: 'Contest Details', path: '/contests/details' },
      { icon: AlertTriangle, label: 'Contest Images', path: '/contests/images' },
      { icon: Tag, label: 'Categories', path: '/categories' },
      { icon: Trophy, label: 'Contest Categories', path: '/contest-categories' },
      { icon: CalendarDays, label: 'Events', path: '/events' },
      { icon: CalendarDays, label: 'Event Types', path: '/event-types' },
      { icon: Users, label: 'Writers', path: '/users' },
      { icon: ImageIcon, label: 'Media Library', path: '/images' },
      { icon: MessageSquare, label: 'Comments', path: '/comments' },
    ],
  },
  {
    label: 'Pipeline',
    items: [
      { icon: ScrollText, label: 'Prompts', path: '/prompts' },
    ],
  },
];

const Sidebar = ({ isDarkMode, onToggleTheme, onClose }) => {
  const adminUser = JSON.parse(localStorage.getItem('admin_user') || '{}');
  const [pendingCount, setPendingCount] = useState(null);
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    if (!token) return;

    const fetchPending = async () => {
      try {
        const { default: adminAPI } = await import('@/api/adminAPI');
        const res = await adminAPI.get('/blogs/dashboard/stats');
        if (res.success && res.stats) {
          setPendingCount(res.stats.pending);
        }
      } catch {
        // pending count is optional — ignore fetch failures
      }
    };
    fetchPending();
    const interval = setInterval(fetchPending, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    window.location.href = '/login';
  };

  return (
    <aside className="w-[220px] h-full flex flex-col bg-[#f9f9fb] dark:bg-[#111112] border-r border-neutral-200/60 dark:border-white/[0.04] text-neutral-800 dark:text-neutral-300 transition-colors duration-300 selection:bg-neutral-200 dark:selection:bg-neutral-800">
      
      {/* Workspace Switcher Header */}
      <div className="shrink-0 p-3 flex items-center justify-between">
        <div 
          onClick={() => setIsWorkspaceMenuOpen(!isWorkspaceMenuOpen)}
          className="flex-1 flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-neutral-200/50 dark:hover:bg-white/5 cursor-pointer transition-colors group"
        >
          <div className="w-5 h-5 rounded overflow-hidden shrink-0 border border-neutral-200/80 dark:border-white/10">
            <img 
              src={adminUser.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=Admin'} 
              alt="Avatar" 
              className="w-full h-full object-cover" 
            />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[13px] font-semibold text-neutral-850 dark:text-neutral-200 truncate leading-tight">
              {adminUser.username || 'Admin Workspace'}
            </h2>
          </div>
          <ChevronsUpDown size={14} className="text-neutral-400 group-hover:text-neutral-600 dark:group-hover:text-neutral-300 transition-colors shrink-0" />
        </div>
        
        {/* Mobile Close Button */}
        {onClose && (
          <button 
            onClick={onClose}
            className="p-1.5 ml-1 rounded hover:bg-neutral-200/50 dark:hover:bg-white/5 text-neutral-500 hover:text-neutral-800 dark:hover:text-white transition-colors lg:hidden"
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        )}
      </div>

      {/* Navigation Groups */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-3 py-2 space-y-5">
        {sections.map((section) => (
          <div key={section.label} className="flex flex-col gap-0.5">
            <span className="px-2 py-1 text-[11px] font-semibold tracking-[0.02em] text-neutral-500 dark:text-neutral-400 uppercase">
              {section.label}
            </span>
            
            <div className="flex flex-col gap-[1px]">
              {section.items.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.end}
                  onClick={onClose}
                  className={({ isActive }) => `
                    flex items-center gap-2.5 px-2 py-[5px] rounded-[5px] text-[13px] transition-colors group outline-none
                    ${isActive 
                      ? 'bg-neutral-200/70 dark:bg-white/[0.06] font-medium text-neutral-900 dark:text-neutral-100' 
                      : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200/40 dark:hover:bg-white/[0.03] hover:text-neutral-900 dark:hover:text-neutral-200'
                    }
                  `}
                >
                  {({ isActive }) => (
                    <>
                      <item.icon 
                        size={16} 
                        strokeWidth={1.5} 
                        className={`shrink-0 transition-colors ${
                          isActive 
                            ? 'text-neutral-900 dark:text-neutral-200' 
                            : 'text-neutral-500 dark:text-neutral-400 group-hover:text-neutral-700 dark:group-hover:text-neutral-300'
                        }`} 
                      />
                      <span className="truncate">{item.label}</span>
                      
                      {/* Notifications Badge */}
                      {item.badgeKey && pendingCount > 0 && (
                        <span className="ml-auto px-[5px] py-[1.5px] rounded bg-neutral-200 dark:bg-white/10 text-[10px] font-semibold text-neutral-650 dark:text-neutral-400 leading-none">
                          {pendingCount > 99 ? '99+' : pendingCount}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Minimal Footer */}
      <div className="shrink-0 p-3 pt-2">
        <div className="flex flex-col gap-[1px]">
          {/* Settings */}
          <NavLink
            to="/settings"
            onClick={onClose}
            className={({ isActive }) => `
              flex items-center gap-2.5 px-2 py-[5px] rounded-[5px] text-[13px] transition-colors group outline-none
              ${isActive 
                ? 'bg-neutral-200/70 dark:bg-white/[0.06] font-medium text-neutral-900 dark:text-neutral-100' 
                : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200/40 dark:hover:bg-white/[0.03] hover:text-neutral-900 dark:hover:text-neutral-200'
              }
            `}
          >
            {({ isActive }) => (
              <>
                <Settings 
                  size={16} 
                  strokeWidth={1.5} 
                  className={`shrink-0 transition-colors ${
                    isActive 
                      ? 'text-neutral-900 dark:text-neutral-200' 
                      : 'text-neutral-500 dark:text-neutral-400 group-hover:text-neutral-700 dark:group-hover:text-neutral-300'
                  }`} 
                />
                <span className="truncate">Settings</span>
              </>
            )}
          </NavLink>

          {/* Theme Toggle */}
          <button 
            type="button"
            onClick={() => onToggleTheme && onToggleTheme()}
            className="flex w-full items-center gap-2.5 px-2 py-[5px] rounded-[5px] text-[13px] text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200/40 dark:hover:bg-white/[0.03] hover:text-neutral-900 dark:hover:text-neutral-200 transition-colors group outline-none cursor-pointer"
          >
            {isDarkMode ? (
              <Sun size={16} strokeWidth={1.5} className="shrink-0 text-neutral-500 dark:text-neutral-400 group-hover:text-neutral-700 dark:group-hover:text-neutral-300 transition-colors" />
            ) : (
              <Moon size={16} strokeWidth={1.5} className="shrink-0 text-neutral-500 dark:text-neutral-400 group-hover:text-neutral-700 dark:group-hover:text-neutral-300 transition-colors" />
            )}
            <span className="truncate">{isDarkMode ? 'Light Mode' : 'Dark Mode'}</span>
          </button>

          {/* Logout */}
          <button 
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-2.5 px-2 py-[5px] rounded-[5px] text-[13px] text-neutral-600 dark:text-neutral-400 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 transition-colors group outline-none cursor-pointer"
          >
            <LogOut size={16} strokeWidth={1.5} className="shrink-0 text-neutral-500 dark:text-neutral-400 group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors" />
            <span className="truncate">Log Out</span>
          </button>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
