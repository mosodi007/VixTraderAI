import { ReactNode, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { TrendingUp, Home, Settings, BarChart3, Wifi, LogOut, Menu, X, History, Sun, Moon, Activity, Bell, BellRing } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { playNewSignalAlert, unlockAudio } from '../lib/soundAlert';

interface DashboardLayoutProps {
  children: ReactNode;
  currentPage: 'home' | 'signals' | 'past-signals' | 'performance' | 'settings' | 'live-analysis';
}

export function DashboardLayout({ children, currentPage }: DashboardLayoutProps) {
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);

  const navigation = [
    { name: 'Dashboard', icon: Home, page: 'home' },
    { name: 'Live Signals', icon: TrendingUp, page: 'signals' },
    { name: 'Past Signals', icon: History, page: 'past-signals' },
    { name: 'Performance', icon: BarChart3, page: 'performance' },
    { name: 'Settings', icon: Settings, page: 'settings' },
  ];

  // Subscribe globally to new signals to drive the notification badge
  useEffect(() => {
    const channel = supabase
      .channel('header-signal-notifications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'signals' },
        (payload) => {
          const newSignal = payload.new as any;
          if (newSignal && newSignal.is_active) {
            setNotificationCount((prev) => prev + 1);
            // Attempt to play sound when a new signal notification arrives
            playNewSignalAlert();
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="min-h-screen bg-white dark:bg-gradient-to-br dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      <div className="lg:flex">
        <div className={`
          lg:w-64 lg:fixed lg:h-screen bg-white dark:bg-slate-800/50 backdrop-blur-sm border-r border-slate-300 dark:border-slate-700
          ${mobileMenuOpen ? 'fixed inset-0 z-50' : 'hidden lg:block'}
        `}>
          <div className="flex items-center justify-between p-6 border-b border-slate-300 dark:border-slate-700">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-600 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-black dark:text-white font-bold">VixAI Trader</h1>
                <p className="text-xs text-slate-600 dark:text-slate-400">Trading Platform</p>
              </div>
            </div>
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="lg:hidden text-black dark:text-slate-400 hover:text-slate-600 dark:hover:text-white"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <nav className="p-4 space-y-2">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = currentPage === item.page;
              return (
                <a
                  key={item.name}
                  href={`#${item.page}`}
                  className={`
                    flex items-center gap-3 px-4 py-3 rounded-lg transition-all
                    ${isActive
                      ? 'bg-emerald-600 text-white'
                      : 'text-black dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700/50 hover:text-black dark:hover:text-white'
                    }
                  `}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Icon className="w-5 h-5" />
                  <span className="font-medium">{item.name}</span>
                </a>
              );
            })}
          </nav>

          <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-300 dark:border-slate-700">
            <div className="px-4 py-3 bg-slate-100 dark:bg-slate-700/50 rounded-lg mb-3">
              <p className="text-xs text-slate-600 dark:text-slate-400">Signed in as</p>
              <p className="text-sm text-black dark:text-white truncate">{user?.email}</p>
            </div>
            <button
              onClick={toggleTheme}
              className="w-full flex items-center gap-3 px-4 py-3 mb-2 text-black dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700/50 hover:text-black dark:hover:text-white rounded-lg transition-all"
            >
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              <span className="font-medium">{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
            </button>
            <button
              onClick={() => signOut()}
              className="w-full flex items-center gap-3 px-4 py-3 text-black dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700/50 hover:text-black dark:hover:text-white rounded-lg transition-all"
            >
              <LogOut className="w-5 h-5" />
              <span className="font-medium">Sign Out</span>
            </button>
          </div>
        </div>

        <div className="lg:ml-64 flex-1">
          <header className="bg-white dark:bg-slate-800/30 backdrop-blur-sm border-b border-slate-300 dark:border-slate-700 sticky top-0 z-40">
            <div className="flex items-center justify-between px-6 py-4">
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="lg:hidden text-black dark:text-slate-300 hover:text-slate-600 dark:hover:text-white"
              >
                <Menu className="w-6 h-6" />
              </button>
              <div className="flex items-center gap-4 ml-auto">
                <button
                  type="button"
                  onClick={() => {
                    setNotificationCount(0);
                    // User interaction: unlock audio for future alerts
                    unlockAudio();
                    window.location.hash = '#signals';
                  }}
                  className="relative inline-flex items-center justify-center rounded-full p-2 text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors"
                  aria-label="Notifications"
                >
                  {notificationCount > 0 ? (
                    <BellRing className="w-5 h-5" />
                  ) : (
                    <Bell className="w-5 h-5" />
                  )}
                  {notificationCount > 0 && (
                    <span className="absolute -top-1 -right-1 inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-500 text-white">
                      {notificationCount > 9 ? '9+' : notificationCount}
                    </span>
                  )}
                </button>
                <div className="hidden sm:flex items-center gap-2 px-3 py-2 bg-emerald-600/10 border border-emerald-600/30 rounded-lg">
                  <Wifi className="w-4 h-4 text-emerald-500" />
                  <span className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">Connected</span>
                </div>
              </div>
            </div>
          </header>

          <main className="p-6">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
