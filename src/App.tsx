import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { Login } from './pages/Login';
import { Landing } from './pages/Landing';
import { Dashboard } from './pages/Dashboard';
import { Signals } from './pages/Signals';
import { PastSignals } from './pages/PastSignals';
import { Performance } from './pages/Performance';
import { Settings } from './pages/Settings';
import { Debug } from './pages/Debug';
import { LiveAnalysis } from './pages/LiveAnalysis';
import { TermsOfService } from './pages/TermsOfService';
import { PrivacyPolicy } from './pages/PrivacyPolicy';
import { VerifyEmail } from './pages/VerifyEmail';
import { TawkWidget } from './components/TawkWidget';

function AppRoutes() {
  const { user, loading, profile } = useAuth();
  const isEmailConfirmed = !!profile?.email_verified_at;
  const [currentPage, setCurrentPage] = useState<
    | 'home'
    | 'signals'
    | 'past-signals'
    | 'performance'
    | 'settings'
    | 'debug'
    | 'live-analysis'
    | 'terms'
    | 'privacy'
    | 'verify-email'
  >('home');
  const [authHash, setAuthHash] = useState(() => window.location.hash.slice(1));
  const authHashBase = authHash.split('?')[0];

  useEffect(() => {
    const handleHashChange = () => {
      let hash = window.location.hash.slice(1);
      const base = hash.split('?')[0];
      setAuthHash(hash);
      if (hash === 'create-mt5') {
        window.location.hash = 'settings';
        hash = 'settings';
      }
      if (
        base === 'signals' ||
        base === 'past-signals' ||
        base === 'performance' ||
        base === 'settings' ||
        base === 'home' ||
        base === 'debug' ||
        base === 'live-analysis' ||
        base === 'terms' ||
        base === 'privacy' ||
        base === 'verify-email'
      ) {
        setCurrentPage(base as any);
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

  // Hard gate: users can't access the dashboard until their email is confirmed.
  // We do this at the app/router level so the VerifyEmail screen always appears.
  if (user && !isEmailConfirmed) {
    // Allow navigation away from the verification screen (e.g. "Back to login" or "#home")
    // while still preventing access to any authenticated dashboard views.
    if (authHashBase === 'login' || authHashBase === 'signup') return <Login />;
    if (authHashBase === 'terms') return <TermsOfService />;
    if (authHashBase === 'privacy') return <PrivacyPolicy />;
    if (authHashBase === 'home' || authHashBase === '') return <Landing />;

    if (authHashBase !== 'verify-email') window.location.hash = 'verify-email';
    return <VerifyEmail />;
  }

  if (!user) {
    if (authHashBase === 'login' || authHashBase === 'signup') return <Login />;
    if (authHashBase === 'terms') return <TermsOfService />;
    if (authHashBase === 'privacy') return <PrivacyPolicy />;
    if (authHashBase === 'verify-email') return <VerifyEmail />;
    return <Landing />;
  }

  switch (currentPage) {
    case 'terms':
      return <TermsOfService />;
    case 'privacy':
      return <PrivacyPolicy />;
    case 'verify-email':
      return <VerifyEmail />;
    case 'signals':
      return <Signals />;
    case 'past-signals':
      return <PastSignals />;
    case 'performance':
      return <Performance />;
    case 'settings':
      return <Settings />;
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
        <TawkWidget />
        <AppRoutes />
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
