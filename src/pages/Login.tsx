import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import logoLight from '../assets/Vixai-logo.png';
import logoDark from '../assets/Vixai-logo-dark.png';
import { Eye, EyeOff } from 'lucide-react';
import { supabase } from '../lib/supabase';

export function Login() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn, signUp } = useAuth();
  const { theme } = useTheme();

  useEffect(() => {
    const applyHashMode = () => {
      const hash = window.location.hash.slice(1);
      if (hash === 'signup') setIsSignUp(true);
      if (hash === 'login') setIsSignUp(false);
    };
    applyHashMode();
    window.addEventListener('hashchange', applyHashMode);
    return () => window.removeEventListener('hashchange', applyHashMode);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isSignUp) {
        const result = await signUp(email, password, fullName);
        if (result.error) throw result.error;

        // Resend-based verification: send email immediately after sign-up.
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData?.session?.access_token;

        if (!accessToken) {
          throw new Error('Unable to send verification email (missing session). Please sign in again.');
        }

        try {
          const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email-verification`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({}),
            },
          );

          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(data?.error || data?.message || 'Failed to send verification email.');
          }
        } catch (sendErr: any) {
          // Still route to verify screen; the user can resend from there.
          setError(sendErr?.message || 'Verification email could not be sent automatically.');
        }

        window.location.hash = 'verify-email';
      } else {
        const { error } = await signIn(email, password);
        if (error) throw error;
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gradient-to-br dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="mb-4 flex items-center justify-center">
            <img
              src={theme === 'dark' ? logoDark : logoLight}
              alt="VixAI"
              className="h-12 w-auto object-contain"
            />
          </div>
          {/* <h1 className="text-3xl font-bold text-black dark:text-white mb-2">VixAI Trader</h1> */}
          <p className="text-slate-600 dark:text-slate-400">AI-powered copy trading & signals platform for Volatility Indices</p>
        </div>

        <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-8 border border-slate-300 dark:border-slate-700">
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setIsSignUp(false)}
              className={`flex-1 py-2 rounded-lg font-medium transition-all ${
                !isSignUp
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-200 dark:bg-slate-700 text-black dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => setIsSignUp(true)}
              className={`flex-1 py-2 rounded-lg font-medium transition-all ${
                isSignUp
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-200 dark:bg-slate-700 text-black dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600'
              }`}
            >
              Sign Up
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <div>
                <label className="block text-sm font-medium text-black dark:text-slate-300 mb-2">
                  Full Name
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-4 py-3 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-black dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  placeholder="John Doe"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-black dark:text-slate-300 mb-2">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-black dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-black dark:text-slate-300 mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-4 py-3 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-black dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent pr-12"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
            >
              {loading ? 'Please wait...' : isSignUp ? 'Sign up' : 'Sign In'}
            </button>

            {!isSignUp ? (
              <p className="text-center text-xs text-slate-600 dark:text-slate-400 mt-2">
                By signing in, you agree to our{' '}
                <a href="#terms" className="underline">
                  Terms
                </a>{' '}
                and{' '}
                <a href="#privacy" className="underline">
                  Privacy Policy
                </a>
                .
              </p>
            ) : (
              <p className="text-center text-xs text-slate-600 dark:text-slate-400 mt-2">
                By signing up, you agree to our{' '}
                <a href="#terms" className="underline">
                  Terms
                </a>{' '}
                and{' '}
                <a href="#privacy" className="underline">
                  Privacy Policy
                </a>
                .
              </p>
            )}
          </form>

          {isSignUp && (
            <div className="mt-6 p-4 bg-emerald-600/10 border border-emerald-600/30 rounded-lg">
              <p className="text-sm text-emerald-600 dark:text-emerald-400">
                After signing up, connect or create your Deriv MT5 account on{' '}
                <a
                  href="https://track.deriv.com/_Yqc93056kqBnhKTx4PKacmNd7ZgqdRLk/143/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-medium"
                >
                  deriv.com
                </a>
                , then add your login in Settings.
              </p>
            </div>
          )}
        </div>

        <p className="text-center text-slate-600 dark:text-slate-400 text-sm mt-6">
          Powered by AI • Secure • Free to Use
        </p>
      </div>
    </div>
  );
}
