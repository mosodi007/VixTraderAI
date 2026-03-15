import { useState, useEffect } from 'react';
import { DashboardLayout } from '../components/DashboardLayout';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Save, AlertCircle, CheckCircle } from 'lucide-react';

export function Settings() {
  const { user } = useAuth();
  const [mt5Login, setMt5Login] = useState('');
  const [server, setServer] = useState('Deriv-Demo');
  const [accountType, setAccountType] = useState('live');
  const [loading, setLoading] = useState(false);
  const [existingAccount, setExistingAccount] = useState<any>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadMt5Account();
  }, [user]);

  const loadMt5Account = async () => {
    if (!user) return;

    const { data } = await supabase
      .from('mt5_accounts')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (data) {
      setExistingAccount(data);
      setMt5Login(data.mt5_login);
      setServer(data.server);
      setAccountType(data.account_type);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      if (!user) throw new Error('Not authenticated');

      if (existingAccount) {
        const { error } = await supabase
          .from('mt5_accounts')
          .update({
            mt5_login: mt5Login,
            server,
            account_type: accountType,
          })
          .eq('id', existingAccount.id);

        if (error) throw error;
        setMessage({ type: 'success', text: 'MT5 account updated successfully' });
      } else {
        // Ensure profile exists (mt5_accounts.user_id references profiles.id)
        await supabase
          .from('profiles')
          .upsert(
            { id: user.id, email: user.email ?? '', updated_at: new Date().toISOString() },
            { onConflict: 'id' }
          );

        const { error } = await supabase
          .from('mt5_accounts')
          .insert({
            user_id: user.id,
            mt5_login: mt5Login,
            server,
            account_type: accountType,
          });

        if (error) throw error;
        setMessage({ type: 'success', text: 'MT5 account submitted for verification' });
        await loadMt5Account();
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to save MT5 account' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <ProtectedRoute>
      <DashboardLayout currentPage="settings">
        <div className="max-w-4xl mx-auto space-y-6">
          <div>
            <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Settings</h2>
            <p className="text-slate-600 dark:text-slate-400">Manage your MT5 account and preferences</p>
          </div>

          <div className="bg-white dark:bg-white dark:bg-slate-800/50 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-2xl p-8">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-6">MT5 Account Configuration</h3>

            {!existingAccount && (
              <div className="bg-emerald-600/10 border border-emerald-600/30 rounded-lg p-4 mb-6">
                <p className="text-sm text-emerald-400">
                  Don't have an MT5 account? <a href="#create-mt5" className="underline font-medium">Create one here</a> to access trading signals.
                </p>
              </div>
            )}

            {message && (
              <div className={`flex items-center gap-3 p-4 rounded-lg mb-6 ${
                message.type === 'success'
                  ? 'bg-emerald-500/10 border border-emerald-500/30'
                  : 'bg-red-500/10 border border-red-500/30'
              }`}>
                {message.type === 'success' ? (
                  <CheckCircle className="w-5 h-5 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-400" />
                )}
                <p className={`text-sm ${message.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {message.text}
                </p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  MT5 Login Number
                </label>
                <input
                  type="text"
                  value={mt5Login}
                  onChange={(e) => setMt5Login(e.target.value)}
                  required
                  className="w-full px-4 py-3 bg-slate-200 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  placeholder="Enter your MT5 login number"
                  disabled={existingAccount?.verified}
                />
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-2">
                  This is your MT5 account login number, not your email
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Server
                </label>
                <select
                  value={server}
                  onChange={(e) => setServer(e.target.value)}
                  required
                  className="w-full px-4 py-3 bg-slate-200 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  disabled={existingAccount?.verified}
                >
                  <option value="Deriv-Demo">Deriv-Demo</option>
                  <option value="Deriv-Server">Deriv-Server</option>
                  <option value="Deriv-Server-02">Deriv-Server-02</option>
                  <option value="Deriv-Server-03">Deriv-Server-03</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Account Type
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      value="live"
                      checked={accountType === 'live'}
                      onChange={(e) => setAccountType(e.target.value)}
                      className="w-4 h-4 text-emerald-600 focus:ring-emerald-500"
                      disabled={existingAccount?.verified}
                    />
                    <span className="text-slate-900 dark:text-white">Live</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      value="demo"
                      checked={accountType === 'demo'}
                      onChange={(e) => setAccountType(e.target.value)}
                      className="w-4 h-4 text-emerald-600 focus:ring-emerald-500"
                      disabled={existingAccount?.verified}
                    />
                    <span className="text-slate-900 dark:text-white">Demo</span>
                  </label>
                </div>
              </div>

              {existingAccount?.verified && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                  <p className="text-sm text-yellow-400">
                    Your account is verified. Contact support to make changes.
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || existingAccount?.verified}
                className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-slate-900 dark:text-white font-medium rounded-lg transition-colors"
              >
                <Save className="w-5 h-5" />
                {loading ? 'Saving...' : existingAccount ? 'Update Account' : 'Submit for Verification'}
              </button>
            </form>
          </div>

          {existingAccount && (
            <div className="bg-white dark:bg-white dark:bg-slate-800/50 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-2xl p-8">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Account Status</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-slate-600 dark:text-slate-400">Verification Status</span>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                    existingAccount.verification_status === 'verified'
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : existingAccount.verification_status === 'rejected'
                      ? 'bg-red-500/20 text-red-400'
                      : 'bg-yellow-500/20 text-yellow-400'
                  }`}>
                    {existingAccount.verification_status.charAt(0).toUpperCase() + existingAccount.verification_status.slice(1)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-600 dark:text-slate-400">Submitted On</span>
                  <span className="text-slate-900 dark:text-white">
                    {new Date(existingAccount.created_at).toLocaleDateString()}
                  </span>
                </div>
                {existingAccount.verified_at && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600 dark:text-slate-400">Verified On</span>
                    <span className="text-slate-900 dark:text-white">
                      {new Date(existingAccount.verified_at).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
