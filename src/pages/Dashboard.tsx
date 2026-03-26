import { useState, useEffect } from 'react';
import { DashboardLayout } from '../components/DashboardLayout';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { AlertCircle, CheckCircle, Clock, ExternalLink } from 'lucide-react';
import { DERIV_MT5_CREATE_URL } from '../constants/deriv';
import { EAConnectionStatus } from '../components/EAConnectionStatus';
import { RecentTradeActivity } from '../components/RecentTradeActivity';
import { PerformanceMetrics } from '../components/PerformanceMetrics';
import { AccountLiveMetrics } from '../components/AccountLiveMetrics';
import { LiveMT5Positions } from '../components/LiveMT5Positions';

export function Dashboard() {
  const { user, tradingMode, hasActiveSubscription, isTrialing, profile } = useAuth();
  const [mt5Account, setMt5Account] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMt5Account();
  }, [user, tradingMode]);

  const loadMt5Account = async () => {
    if (!user) return;

    const { data } = await supabase
      .from('mt5_accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('account_type', tradingMode === 'live' ? 'real' : 'demo')
      .maybeSingle();

    setMt5Account(data);
    setLoading(false);
  };

  const getStatusBadge = () => {
    if (!mt5Account) return null;

    const statusConfig = {
      pending: {
        icon: Clock,
        text: 'Pending Verification',
        className: 'bg-yellow-50 dark:bg-yellow-500/10 border-yellow-300 dark:border-yellow-500/30 text-yellow-700 dark:text-yellow-400',
      },
      verified: {
        icon: CheckCircle,
        text: 'Verified',
        className: 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400',
      },
      approved: {
        icon: CheckCircle,
        text: 'Verified',
        className: 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400',
      },
      rejected: {
        icon: AlertCircle,
        text: 'Rejected',
        className: 'bg-red-50 dark:bg-red-500/10 border-red-300 dark:border-red-500/30 text-red-700 dark:text-red-400',
      },
    };

    const config = statusConfig[mt5Account.verification_status as keyof typeof statusConfig] || statusConfig.pending;
    const Icon = config.icon;

    return (
      <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border ${config.className}`}>
        <Icon className="w-4 h-4" />
        <span className="font-medium">{config.text}</span>
      </div>
    );
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <DashboardLayout currentPage="home">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
          </div>
        </DashboardLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <DashboardLayout currentPage="home">
        <div className="max-w-6xl mx-auto space-y-6">
          <div>
            <h2 className="text-3xl font-bold text-black dark:text-white mb-2">Welcome Back</h2>
            {/* <p className="text-slate-600 dark:text-slate-400">Manage your AI-powered trading account</p> */}
          </div>

          {!mt5Account ? (
            <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-2xl p-8 shadow-xl">
              <div className="max-w-2xl">
                <h3 className="text-2xl font-bold text-white mb-4">
                  Start Your Free 3-Day Trial
                </h3>
                <p className="text-emerald-100 mb-6">
                  Connect your {tradingMode === 'live' ? 'Live' : 'Demo'} MT5 account to activate your free trial and start receiving AI-powered trading signals.
                </p>
                <div className="bg-white/10 border border-white/20 rounded-lg p-4 mb-6">
                  <p className="text-white font-medium mb-2">What you'll get:</p>
                  <ul className="space-y-2 text-emerald-50">
                    <li>✓ Real-time AI trading signals</li>
                    <li>✓ Multi-timeframe analysis</li>
                    <li>✓ Automated signal execution via EA</li>
                    <li>✓ Performance tracking & analytics</li>
                  </ul>
                </div>
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-3">
                    <a
                      href="#settings"
                      className="inline-flex items-center gap-2 px-6 py-3 bg-white hover:bg-slate-50 text-emerald-700 font-semibold rounded-lg transition-colors shadow-lg"
                    >
                      Connect {tradingMode === 'live' ? 'Live' : 'Demo'} MT5 & Start Trial
                    </a>
                    <a
                      href={DERIV_MT5_CREATE_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-800 hover:bg-emerald-900 text-white font-medium rounded-lg transition-colors"
                    >
                      Create MT5 on Deriv
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                  <p className="text-emerald-50 text-sm">
                    MT5 accounts are only created on Deriv — use the button above, then submit your login in Settings.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6">
              <div className="bg-slate-50 dark:bg-slate-800/50 backdrop-blur-sm border border-slate-300 dark:border-slate-700 rounded-2xl p-6 shadow-sm dark:shadow-none">
                <h3 className="text-xl font-bold text-black dark:text-white mb-4">
                  {tradingMode === 'live' ? 'Live MT5 Account Status' : 'Demo MT5 Account Status'}
                </h3>
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Status</p>
                    {getStatusBadge()}
                  </div>
                  <div>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">MT5 Login</p>
                    <p className="text-black dark:text-white font-mono">{mt5Account.mt5_login}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Account type</p>
                    <p className="text-black dark:text-white">
                      {mt5Account.account_type === 'demo' || String(mt5Account.server || '').includes('Demo')
                        ? 'Demo (Deriv-Demo)'
                        : mt5Account.server === 'Deriv-Server'
                          ? 'Standard (MT5 STD)'
                          : mt5Account.server === 'Deriv-Server-02'
                            ? 'Swap-Free (MT5 SWF)'
                            : mt5Account.server === 'Deriv-Server-03'
                              ? 'Zero Spread (MT5 ZRS)'
                              : mt5Account.server}
                    </p>
                  </div>
                  {mt5Account.verification_status === 'rejected' && mt5Account.rejected_reason && (
                    <div className="bg-red-50 dark:bg-red-500/10 border border-red-300 dark:border-red-500/30 rounded-lg p-4">
                      <p className="text-sm text-red-700 dark:text-red-400">
                        <strong>Rejection Reason:</strong> {mt5Account.rejected_reason}
                      </p>
                    </div>
                  )}
                  {!mt5Account.verified &&
                    mt5Account.verification_status !== 'rejected' && (
                      <div className="bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/25 rounded-lg p-4">
                        <p className="text-sm text-sky-800 dark:text-sky-200 leading-relaxed">
                          We are reviewing your account, we will notify you via email when we are done.
                        </p>
                      </div>
                    )}
                </div>
              </div>
            </div>
          )}

          {mt5Account?.verified && user && (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <EAConnectionStatus userId={user.id} tradingMode={tradingMode} />
                <PerformanceMetrics userId={user.id} tradingMode={tradingMode} />
                {/* <AccountLiveMetrics userId={user.id} /> */}
              </div>


                {/* <LiveMT5Positions userId={user.id} /> */}

              <RecentTradeActivity userId={user.id} tradingMode={tradingMode} />
            </>
          )}
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
