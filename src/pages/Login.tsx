import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import logoLight from '../assets/Vixai-logo.png';
import logoDark from '../assets/Vixai-logo-dark.png';
import { Eye, EyeOff } from 'lucide-react';
import { getEdgeFunctionHeaders, supabase } from '../lib/supabase';

export function Login() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn, signUp, signInWithGoogle } = useAuth();
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

  const handleGoogle = async () => {
    setError('');
    setLoading(true);
    try {
      const { error } = await signInWithGoogle();
      if (error) throw error;
      // Browser redirects to Google; if that fails we land in catch.
    } catch (err: any) {
      setError(err?.message || 'Google sign-in failed');
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/#reset-password`,
      });

      if (error) throw error;

      setSuccess('Password reset email sent! Check your inbox.');
      setTimeout(() => {
        setIsForgotPassword(false);
        setSuccess('');
      }, 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to send password reset email');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (isSignUp) {
        const result = await signUp(email, password, fullName);
        if (result.error) throw result.error;

        // Resend-based verification: send email immediately after sign-up.
        // If Supabase Auth is set to "confirm email", there may be no session yet — use anon key headers.
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken =
          result.session?.access_token ?? sessionData?.session?.access_token ?? null;

        try {
          const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email-verification`,
            {
              method: 'POST',
              headers: {
                ...getEdgeFunctionHeaders(accessToken),
              },
              body: JSON.stringify({ email: email.trim().toLowerCase() }),
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
          {isForgotPassword ? (
            <div className="mb-6">
              <button
                onClick={() => {
                  setIsForgotPassword(false);
                  setError('');
                  setSuccess('');
                }}
                className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline mb-4"
              >
                ← Back to Sign In
              </button>
              <h2 className="text-2xl font-bold text-black dark:text-white mb-2">Reset Password</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Enter your email and we'll send you a link to reset your password.
              </p>
            </div>
          ) : (
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
          )}

          {!isForgotPassword && (
            <button
              type="button"
              onClick={handleGoogle}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white font-medium hover:bg-slate-50 dark:hover:bg-slate-600/80 disabled:opacity-60 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden>
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Continue with Google
          </button>
          )}

          {!isForgotPassword && (
            <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200 dark:border-slate-600" />
            </div>
            <div className="relative flex justify-center text-xs uppercase tracking-wide">
              <span className="px-3 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400">or</span>
            </div>
          </div>
          )}

          <form onSubmit={isForgotPassword ? handleForgotPassword : handleSubmit} className="space-y-4">
            {isSignUp && !isForgotPassword && (
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

            {!isForgotPassword && (
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
            )}

            {error && (
              <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            {success && (
              <div className="bg-emerald-500/10 border border-emerald-500/50 rounded-lg p-3">
                <p className="text-sm text-emerald-600 dark:text-emerald-400">{success}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
            >
              {loading
                ? 'Please wait...'
                : isForgotPassword
                ? 'Send Reset Link'
                : isSignUp
                ? 'Sign up'
                : 'Sign In'}
            </button>

            {!isSignUp && !isForgotPassword && (
              <button
                type="button"
                onClick={() => {
                  setIsForgotPassword(true);
                  setError('');
                  setSuccess('');
                }}
                className="w-full text-sm text-emerald-600 dark:text-emerald-400 hover:underline"
              >
                Forgot password?
              </button>
            )}

            {!isForgotPassword && (
              <>
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
              </>
            )}
          </form>

          {isSignUp && !isForgotPassword && (
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
