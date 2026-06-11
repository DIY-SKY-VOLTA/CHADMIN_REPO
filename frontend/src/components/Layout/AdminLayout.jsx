import { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import { Menu } from 'lucide-react';

const AdminLayout = ({ children }) => {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem('admin_theme') !== 'light';
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('admin_theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
  };

  return (
    <div className={`flex h-screen overflow-hidden transition-colors duration-300 ${isDarkMode ? 'bg-[#0d0d0f] text-white' : 'bg-white text-gray-900'}`}>
      {/* Premium background gradient for dark mode */}
      {isDarkMode && (
        <div className="fixed inset-0 pointer-events-none z-0" aria-hidden="true">
          <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[50%] bg-[#00f0ff]/[0.015] blur-[120px] rounded-full" />
          <div className="absolute bottom-[-15%] right-[-10%] w-[50%] h-[40%] bg-purple-500/[0.01] blur-[100px] rounded-full" />
        </div>
      )}

      {/* Mobile Sidebar Backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/80 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
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
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative z-10">
        <header className="lg:hidden h-12 shrink-0 border-b border-gray-200 dark:border-white/10 bg-gray-100 dark:bg-[#18181a] flex items-center justify-between px-3 transition-colors duration-300 relative z-10">
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-[6px] text-gray-500 dark:text-[#a8b3cf] hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-white/5 lg:hidden"
            >
              <Menu size={18} />
            </button>
          </div>
        </header>
        
        {/* Content */}
        <main className="flex-1 overflow-hidden relative z-10">
          {children}
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
