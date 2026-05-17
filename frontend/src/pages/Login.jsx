import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Mail, ShieldCheck, ArrowRight, Eye, EyeOff, Loader2, Moon, Sun } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import adminAPI from '@/api/adminAPI';
import logo from '../assets/logo.webp';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem('admin_theme') !== 'light';
  });
  const navigate = useNavigate();

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('admin_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('admin_theme', 'light');
    }
  }, [isDarkMode]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await adminAPI.post('/auth/login', { email, password });
      
      if (response.success && response.user?.isAdmin) {
        localStorage.setItem('admin_token', response.token);
        localStorage.setItem('admin_user', JSON.stringify(response.user));
        toast.success(`Welcome, ${response.user.username}`);
        navigate('/dashboard');
      } else {
        toast.error('Privileged access required');
      }
    } catch (error) {
      toast.error(error.message || 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6 transition-colors duration-500 relative overflow-hidden">
      {/* Subtle Background Detail */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-20 dark:opacity-[0.03]">
        <div className="absolute top-[-10%] left-[-5%] w-[40%] h-[40%] bg-primary blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[-10%] right-[-5%] w-[40%] h-[40%] bg-blue-500 blur-[120px] rounded-full"></div>
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-[420px] relative z-10"
      >
        {/* Logo Section */}
        <div className="text-center mb-10">
          <motion.img 
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            src={logo} 
            alt="ContestHopper" 
            className="h-12 mx-auto mb-6 dark:invert-0 invert transition-all" 
          />
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Admin Portal</h1>
          <p className="text-sm text-muted-foreground mt-2 font-medium">Enter your credentials to manage the platform</p>
        </div>

        {/* Login Card */}
        <div className="bg-card border border-border rounded-3xl p-8 auth-card-shadow relative overflow-hidden group">
          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <label className="text-[13px] font-semibold text-foreground/70 ml-1 uppercase tracking-wider">Email Address</label>
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" size={18} />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-secondary/50 border border-border rounded-2xl py-3.5 pl-12 pr-4 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-muted-foreground/50"
                  placeholder="admin@contesthopper.live"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[13px] font-semibold text-foreground/70 ml-1 uppercase tracking-wider">Security Key</label>
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" size={18} />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-secondary/50 border border-border rounded-2xl py-3.5 pl-12 pr-12 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-muted-foreground/50"
                  placeholder="••••••••"
                />
                <button 
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 bg-primary text-primary-foreground rounded-2xl font-bold text-sm flex items-center justify-center gap-3 hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 mt-6 shadow-xl shadow-primary/10"
            >
              {isLoading ? (
                <Loader2 className="animate-spin" size={20} />
              ) : (
                <>
                  Sign In to Control Center
                  <ArrowRight size={18} className="opacity-70" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="mt-8 flex flex-col items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="h-[1px] w-12 bg-border"></div>
            <ShieldCheck className="text-muted-foreground" size={16} />
            <div className="h-[1px] w-12 bg-border"></div>
          </div>
          <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.2em] text-center">
            Secured by ContestHopper Infrastructure
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default Login;
