import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  FileText, 
  LogOut, 
  ChevronRight, 
  User, 
  Sun, 
  Moon, 
  X,
  List
} from 'lucide-react';
import logoMini from '../../assets/logo-mini.webp';

const Sidebar = ({ isDarkMode, onToggleTheme, onClose }) => {
  const adminUser = JSON.parse(localStorage.getItem('admin_user') || '{}');

  const menuItems = [
    { icon: LayoutDashboard, label: 'Overview', path: '/dashboard' },
    { icon: FileText, label: 'Editorial', path: '/editorial' },
    { icon: List, label: 'All Posts', path: '/posts' },
  ];

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    window.location.href = '/login';
  };

  return (
    <aside className="w-56 h-full border-r border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#18181a] flex flex-col transition-colors duration-300">
      {/* Brand */}
      <div className="h-12 flex items-center justify-between px-4 border-b border-gray-200 dark:border-white/5">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-[6px] flex items-center justify-center overflow-hidden">
            <img src={logoMini} alt="Contest Hopper Logo" className="w-full h-full object-cover" />
          </div>
          <span className="font-bold text-sm text-gray-900 dark:text-white uppercase">Admin</span>
        </div>
        {onClose && (
          <button 
            onClick={onClose}
            className="p-1 rounded-[6px] hover:bg-gray-200 dark:hover:bg-white/5 text-gray-500 dark:text-[#a8b3cf] hover:text-gray-900 dark:hover:text-white lg:hidden"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {menuItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => `
              flex items-center justify-between px-3 py-2.5 rounded-[8px] transition-all
              ${isActive 
                ? 'bg-[#00f0ff]/10 text-[#00f0ff]' 
                : 'text-gray-600 dark:text-[#a8b3cf] hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-white/5'
              }
            `}
          >
            {({ isActive }) => (
              <>
                <div className="flex items-center gap-2.5">
                  <item.icon size={16} />
                  <span className="text-xs font-medium uppercase">{item.label}</span>
                </div>
                {isActive && <ChevronRight size={12} className="opacity-50" />}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Theme Toggle */}
      <div className="p-2 border-t border-gray-200 dark:border-white/5">
        <button 
          type="button"
          onClick={() => onToggleTheme && onToggleTheme()}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-[8px] text-gray-600 dark:text-[#a8b3cf] hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-white/5 transition-all"
        >
          {isDarkMode ? <Sun size={16} className="text-amber-400" /> : <Moon size={16} className="text-blue-400" />}
          <span className="text-xs font-medium">{isDarkMode ? 'Light Mode' : 'Dark Mode'}</span>
        </button>
      </div>

      {/* Admin Profile */}
      <div className="p-2 border-t border-gray-200 dark:border-white/5">
        <div className="flex items-center gap-2 p-2 rounded-[8px] bg-gray-100 dark:bg-[#0d0d0f] border border-gray-200 dark:border-white/5">
          <img 
            src={adminUser.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=Admin'} 
            alt="" 
            className="w-8 h-8 rounded-[6px] border border-gray-200 dark:border-white/10" 
          />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">{adminUser.username || 'Admin'}</p>
            <p className="text-[8px] text-gray-500 dark:text-[#a8b3cf]">Superuser</p>
          </div>
          <button 
            onClick={handleLogout}
            className="p-1.5 rounded-[6px] text-gray-500 dark:text-[#a8b3cf] hover:text-[#ff4757] hover:bg-[#ff4757]/10 transition-all"
            title="Sign out"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
