import { ReactNode, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { TrendingUp, Home, Settings, BarChart3, Wifi, LogOut, Menu, X, Sun, Moon, Bell, BellRing, MessageCircle, History } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { playNewSignalAlert, unlockAudio } from '../lib/soundAlert';
import logoLight from '../assets/Vixai-logo.png';
import logoDark from '../assets/Vixai-logo-dark.png';

interface DashboardLayoutProps {
  children: ReactNode;
  currentPage: 'home' | 'signals' | 'past-signals' | 'performance' | 'settings' | 'live-analysis';
}

export function DashboardLayout({ children, currentPage }: DashboardLayoutProps) {
  const { user, signOut, tradingMode, setTradingMode } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);

  const navigation = [
    { name: 'Dashboard', icon: Home, page: 'home' },
    { name: 'Live Signals', icon: TrendingUp, page: 'signals' },
    // { name: 'Past Signals', icon: History, page: 'past-signals' },
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
              <img
                src={theme === 'dark' ? logoDark : logoLight}
                alt="VixAI"
                className="h-9 w-auto rounded-lg object-contain"
              />
              
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
                <div className="hidden sm:inline-flex items-center rounded-full border border-slate-300 dark:border-slate-700 bg-white/60 dark:bg-slate-900/30 p-1">
                  <button
                    type="button"
                    onClick={() => setTradingMode('demo')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-colors ${
                      tradingMode === 'demo'
                        ? 'bg-emerald-600 text-white'
                        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                    }`}
                    aria-pressed={tradingMode === 'demo'}
                  >
                    Demo
                  </button>
                  <button
                    type="button"
                    onClick={() => setTradingMode('live')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-colors ${
                      tradingMode === 'live'
                        ? 'bg-emerald-600 text-white'
                        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                    }`}
                    aria-pressed={tradingMode === 'live'}
                  >
                    Live
                  </button>
                </div>
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
                <button
                  type="button"
                  onClick={() => setChatOpen(true)}
                  className="relative inline-flex items-center justify-center rounded-full p-2 text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors"
                  aria-label="Open chat help"
                >
                  <MessageCircle className="w-5 h-5" />
                </button>
                <div className="hidden sm:flex items-center gap-2 px-3 py-2 bg-emerald-600/10 border border-emerald-600/30 rounded-lg">
                  <Wifi className="w-4 h-4 text-emerald-500" />
                  <span className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">Connected</span>
                </div>
              </div>
            </div>
            <div className="sm:hidden px-6 pb-3">
              <div className="inline-flex items-center rounded-full border border-slate-300 dark:border-slate-700 bg-white/60 dark:bg-slate-900/30 p-1">
                <button
                  type="button"
                  onClick={() => setTradingMode('demo')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-colors ${
                    tradingMode === 'demo'
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                  }`}
                  aria-pressed={tradingMode === 'demo'}
                >
                  Demo
                </button>
                <button
                  type="button"
                  onClick={() => setTradingMode('live')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-colors ${
                    tradingMode === 'live'
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                  }`}
                  aria-pressed={tradingMode === 'live'}
                >
                  Live
                </button>
              </div>
            </div>
          </header>

          <main className="p-6">
            {/* <TradingModeBanner /> */}
            {children}
          </main>
        </div>
      </div>
      {chatOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-4xl h-[80vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Help Chat</h3>
              <button
                type="button"
                onClick={() => setChatOpen(false)}
                className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Close chat"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <iframe
              title="Tawk chat"
              src="https://tawk.to/chat/69bd93521f2eee1c3a8ff055/1jk68euv3"
              className="w-full h-[calc(80vh-49px)] border-0"
              allow="clipboard-write; microphone; camera"
            />
          </div>
        </div>
      )}
    </div>
  );
}
