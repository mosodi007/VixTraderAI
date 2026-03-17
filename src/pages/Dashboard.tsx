import { useState, useEffect } from 'react';
import { DashboardLayout } from '../components/DashboardLayout';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { AlertCircle, CheckCircle, Clock, ExternalLink } from 'lucide-react';
import { EAConnectionStatus } from '../components/EAConnectionStatus';
import { PerformanceMetrics } from '../components/PerformanceMetrics';
import { LiveMT5Positions } from '../components/LiveMT5Positions';
import { RecentTradeActivity } from '../components/RecentTradeActivity';

export function Dashboard() {
  const { user } = useAuth();
  const [mt5Account, setMt5Account] = useState<any>(null);
  const [loading, setLoading] = useState(true);

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
            <p className="text-slate-600 dark:text-slate-400">Manage your AI-powered trading account</p>
          </div>

          {!mt5Account ? (
            <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-2xl p-8 shadow-xl">
              <div className="max-w-2xl">
                <h3 className="text-2xl font-bold text-white mb-4">Get Started with AI Trading</h3>
                <p className="text-emerald-50 mb-6 leading-relaxed">
                  To access AI-generated trading signals, you need to create an MT5 account through our partner link.
                  This gives you free access to our advanced AI trading strategies.
                </p>
                <div className="space-y-4">
                  <div className="flex gap-3">
                    <a
                      href="#create-mt5"
                      className="inline-flex items-center gap-2 px-6 py-3 bg-white hover:bg-slate-50 text-emerald-700 font-medium rounded-lg transition-colors shadow-lg"
                    >
                      Create MT5 Account
                    </a>
                    <a
                      href="https://track.deriv.com/_Yqc93056kqBnhKTx4PKacmNd7ZgqdRLk/143/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-800 hover:bg-emerald-900 text-white font-medium rounded-lg transition-colors"
                    >
                      Or Create via Website
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                  <p className="text-emerald-50 text-sm">
                    Already have an account? <a href="#settings" className="underline font-medium">Submit your MT5 login</a>
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6">
              <div className="bg-slate-50 dark:bg-slate-800/50 backdrop-blur-sm border border-slate-300 dark:border-slate-700 rounded-2xl p-6 shadow-sm dark:shadow-none">
                <h3 className="text-xl font-bold text-black dark:text-white mb-4">MT5 Account Status</h3>
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
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Server</p>
                    <p className="text-black dark:text-white">{mt5Account.server}</p>
                  </div>
                  {mt5Account.verification_status === 'rejected' && mt5Account.rejected_reason && (
                    <div className="bg-red-50 dark:bg-red-500/10 border border-red-300 dark:border-red-500/30 rounded-lg p-4">
                      <p className="text-sm text-red-700 dark:text-red-400">
                        <strong>Rejection Reason:</strong> {mt5Account.rejected_reason}
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
                <EAConnectionStatus userId={user.id} />
                <PerformanceMetrics userId={user.id} />
              </div>

              {/* <LiveMT5Positions userId={user.id} /> */}

              <RecentTradeActivity userId={user.id} />
            </>
          )}
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
