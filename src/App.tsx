import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Signals } from './pages/Signals';
import { PastSignals } from './pages/PastSignals';
import { Performance } from './pages/Performance';
import { Settings } from './pages/Settings';
import { CreateMT5 } from './pages/CreateMT5';
import { Debug } from './pages/Debug';
import { LiveAnalysis } from './pages/LiveAnalysis';

function AppRoutes() {
  const { user, loading } = useAuth();
  const [currentPage, setCurrentPage] = useState<'home' | 'signals' | 'past-signals' | 'performance' | 'settings' | 'create-mt5' | 'debug' | 'live-analysis'>('home');

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1);
      if (hash === 'signals' || hash === 'past-signals' || hash === 'performance' || hash === 'settings' || hash === 'home' || hash === 'create-mt5' || hash === 'debug' || hash === 'live-analysis') {
        setCurrentPage(hash);
      }
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gradient-to-br dark:from-slate-900 dark:to-slate-800">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
          <p className="mt-4 text-black dark:text-slate-300">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  switch (currentPage) {
    case 'signals':
      return <Signals />;
    case 'past-signals':
      return <PastSignals />;
    case 'performance':
      return <Performance />;
    case 'settings':
      return <Settings />;
    case 'create-mt5':
      return <CreateMT5 />;
    case 'debug':
      return <Debug />;
    case 'live-analysis':
      return <LiveAnalysis />;
    default:
      return <Dashboard />;
  }
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
