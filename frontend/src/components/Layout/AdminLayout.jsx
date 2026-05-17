import { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import { Menu, X } from 'lucide-react';

const AdminLayout = ({ children }) => {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem('admin_theme') !== 'light';
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    console.log('useEffect running, isDarkMode:', isDarkMode);
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('admin_theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  const toggleTheme = () => {
    const newValue = !isDarkMode;
    console.log('Toggle clicked, current:', isDarkMode, 'new:', newValue);
    setIsDarkMode(newValue);
  };

  return (
    <div className={`flex h-screen overflow-hidden transition-colors duration-300 ${isDarkMode ? 'bg-[#0d0d0f] text-white' : 'bg-white text-gray-900'}`}>
      {/* Mobile Sidebar Backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/80 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - Fixed on mobile, slides in */}
      <div className={`
        fixed lg:relative inset-y-0 left-0 z-50 
        transition-transform duration-300 ease-in-out shrink-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <Sidebar 
          isDarkMode={isDarkMode} 
          onToggleTheme={toggleTheme}
          onClose={() => setSidebarOpen(false)} 
        />
      </div>
      
      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Header */}
        <header className="h-12 shrink-0 border-b border-gray-200 dark:border-white/10 bg-gray-100 dark:bg-[#18181a] flex items-center justify-between px-3 lg:px-4 transition-colors duration-300">
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-[6px] text-gray-500 dark:text-[#a8b3cf] hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-white/5 lg:hidden"
            >
              <Menu size={18} />
            </button>
            <span className="text-xs font-bold text-gray-400 dark:text-white/50 uppercase tracking-wider hidden sm:block">Admin Panel</span>
          </div>
        </header>
        
        {/* Content */}
        <main className="flex-1 overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;