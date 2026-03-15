import { useState } from 'react';
import { DashboardLayout } from '../components/DashboardLayout';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { CheckCircle, AlertCircle, Loader2, Shield, TrendingUp } from 'lucide-react';

export function CreateMT5() {
  const { user } = useAuth();
  const [step, setStep] = useState<'form' | 'creating' | 'success' | 'error'>('form');
  const [accountType, setAccountType] = useState<'demo' | 'real'>('demo');
  const [leverage, setLeverage] = useState(100);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [error, setError] = useState('');
  const [mt5Account, setMt5Account] = useState<any>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (!acceptTerms) {
      setError('You must accept the terms and conditions');
      return;
    }

    setStep('creating');

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-mt5-account`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          account_type: accountType,
          email: user?.email,
          leverage: leverage,
          mainPassword: password,
          name: fullName,
          mt5_account_type: 'financial',
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to create MT5 account');
      }

      const { data: accountData } = result;

      // Ensure profile exists (mt5_accounts.user_id references profiles.id)
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert(
          {
            id: user!.id,
            email: user!.email ?? '',
            full_name: fullName || null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        );

      if (profileError) throw new Error(`Profile error: ${profileError.message}`);

      const { error: dbError } = await supabase
        .from('mt5_accounts')
        .insert({
          user_id: user!.id,
          mt5_login: accountData.login,
          server: accountData.server,
          account_type: accountType,
          verified: true,
          verification_status: 'verified',
          verified_at: new Date().toISOString(),
        });

      if (dbError) throw dbError;

      setMt5Account(accountData);
      setStep('success');
    } catch (err: any) {
      setError(err.message || 'Failed to create MT5 account');
      setStep('error');
    }
  };

  if (step === 'creating') {
    return (
      <ProtectedRoute>
        <DashboardLayout currentPage="settings">
          <div className="max-w-2xl mx-auto">
            <div className="bg-white dark:bg-white dark:bg-slate-800/50 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-2xl p-12 text-center">
              <div className="w-16 h-16 bg-emerald-600/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">Creating Your MT5 Account</h2>
              <p className="text-slate-600 dark:text-slate-400">Please wait while we set up your trading account...</p>
            </div>
          </div>
        </DashboardLayout>
      </ProtectedRoute>
    );
  }

  if (step === 'success') {
    return (
      <ProtectedRoute>
        <DashboardLayout currentPage="settings">
          <div className="max-w-2xl mx-auto">
            <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-2xl p-8 shadow-2xl text-center">
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="w-10 h-10 text-slate-900 dark:text-white" />
              </div>
              <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">Account Created Successfully!</h2>
              <p className="text-emerald-100 mb-8">Your MT5 account is ready for trading</p>

              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 mb-6 text-left">
                <h3 className="text-slate-900 dark:text-white font-bold mb-4">Your MT5 Credentials</h3>
                <div className="space-y-3">
                  <div>
                    <p className="text-emerald-100 text-sm mb-1">Login</p>
                    <p className="text-slate-900 dark:text-white font-mono text-lg">{mt5Account?.login}</p>
                  </div>
                  <div>
                    <p className="text-emerald-100 text-sm mb-1">Server</p>
                    <p className="text-slate-900 dark:text-white font-mono text-lg">{mt5Account?.server}</p>
                  </div>
                  <div>
                    <p className="text-emerald-100 text-sm mb-1">Balance</p>
                    <p className="text-slate-900 dark:text-white font-mono text-lg">{mt5Account?.balance} {mt5Account?.currency}</p>
                  </div>
                </div>
              </div>

              <div className="bg-yellow-500/20 border border-yellow-500/30 rounded-lg p-4 mb-6">
                <p className="text-sm text-yellow-100">
                  <strong>Important:</strong> Save your login credentials. You'll need them to access your MT5 account.
                </p>
              </div>

              <div className="flex gap-4">
                <a
                  href="#home"
                  className="flex-1 px-6 py-3 bg-white hover:bg-slate-100 text-emerald-700 font-medium rounded-lg transition-colors"
                >
                  Go to Dashboard
                </a>
                <a
                  href="#signals"
                  className="flex-1 px-6 py-3 bg-emerald-800 hover:bg-emerald-900 text-slate-900 dark:text-white font-medium rounded-lg transition-colors"
                >
                  View Signals
                </a>
              </div>
            </div>
          </div>
        </DashboardLayout>
      </ProtectedRoute>
    );
  }

  if (step === 'error') {
    return (
      <ProtectedRoute>
        <DashboardLayout currentPage="settings">
          <div className="max-w-2xl mx-auto">
            <div className="bg-white dark:bg-white dark:bg-slate-800/50 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-2xl p-12 text-center">
              <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertCircle className="w-8 h-8 text-red-400" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">Account Creation Failed</h2>
              <p className="text-slate-700 dark:text-slate-300 mb-6">{error}</p>
              <div className="flex gap-4 justify-center">
                <button
                  onClick={() => setStep('form')}
                  className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-slate-900 dark:text-white font-medium rounded-lg transition-colors"
                >
                  Try Again
                </button>
                <a
                  href="https://track.deriv.com/_Yqc93056kqBnhKTx4PKacmNd7ZgqdRLk/143/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-6 py-3 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-900 dark:text-white font-medium rounded-lg transition-colors"
                >
                  Create via Website
                </a>
              </div>
            </div>
          </div>
        </DashboardLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <DashboardLayout currentPage="settings">
        <div className="max-w-3xl mx-auto space-y-6">
          <div>
            <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Create MT5 Account</h2>
            <p className="text-slate-600 dark:text-slate-400">Set up your trading account in minutes</p>
          </div>

          <div className="bg-white dark:bg-white dark:bg-slate-800/50 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-2xl p-8">
            <div className="flex items-start gap-4 mb-6 p-4 bg-emerald-600/10 border border-emerald-600/30 rounded-lg">
              <Shield className="w-6 h-6 text-emerald-400 flex-shrink-0 mt-1" />
              <div>
                <p className="text-emerald-400 font-medium mb-1">Secure Account Creation</p>
                <p className="text-sm text-emerald-300">
                  Your MT5 account will be created through Deriv's official API. All credentials are encrypted and secure.
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                  Account Type
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => setAccountType('demo')}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      accountType === 'demo'
                        ? 'border-emerald-600 bg-emerald-600/10'
                        : 'border-slate-200 dark:border-slate-700 bg-slate-200 dark:bg-slate-700/30 hover:border-slate-300 dark:border-slate-600'
                    }`}
                  >
                    <div className="text-left">
                      <p className="text-slate-900 dark:text-white font-medium mb-1">Demo Account</p>
                      <p className="text-sm text-slate-600 dark:text-slate-400">Practice with virtual funds</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAccountType('real')}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      accountType === 'real'
                        ? 'border-emerald-600 bg-emerald-600/10'
                        : 'border-slate-200 dark:border-slate-700 bg-slate-200 dark:bg-slate-700/30 hover:border-slate-300 dark:border-slate-600'
                    }`}
                  >
                    <div className="text-left">
                      <p className="text-slate-900 dark:text-white font-medium mb-1">Real Account</p>
                      <p className="text-sm text-slate-600 dark:text-slate-400">Trade with real money</p>
                    </div>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Full Name
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  className="w-full px-4 py-3 bg-slate-200 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  placeholder="John Doe"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Leverage
                </label>
                <select
                  value={leverage}
                  onChange={(e) => setLeverage(Number(e.target.value))}
                  className="w-full px-4 py-3 bg-slate-200 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                >
                  <option value={1}>1:1</option>
                  <option value={50}>1:50</option>
                  <option value={100}>1:100</option>
                  <option value={200}>1:200</option>
                  <option value={500}>1:500</option>
                  <option value={1000}>1:1000</option>
                </select>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-2">
                  Higher leverage increases both potential profits and losses
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Master Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full px-4 py-3 bg-slate-200 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  placeholder="••••••••"
                />
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-2">
                  Must be at least 8 characters
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full px-4 py-3 bg-slate-200 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  placeholder="••••••••"
                />
              </div>

              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="terms"
                  checked={acceptTerms}
                  onChange={(e) => setAcceptTerms(e.target.checked)}
                  className="mt-1 w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                />
                <label htmlFor="terms" className="text-sm text-slate-700 dark:text-slate-300">
                  I agree to the{' '}
                  <a href="https://deriv.com/terms-and-conditions/" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline">
                    Terms and Conditions
                  </a>{' '}
                  and understand the risks involved in trading
                </label>
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3">
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={!acceptTerms}
                className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-slate-900 dark:text-white font-medium rounded-lg transition-colors"
              >
                <TrendingUp className="w-5 h-5" />
                Create MT5 Account
              </button>
            </form>
          </div>

          <div className="text-center">
            <p className="text-slate-600 dark:text-slate-400 text-sm">
              Already have an account?{' '}
              <a href="#settings" className="text-emerald-400 hover:underline">
                Submit your credentials here
              </a>
            </p>
          </div>
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
