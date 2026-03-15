import { useState, useEffect } from 'react';
import { DashboardLayout } from '../components/DashboardLayout';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { TrendingUp, TrendingDown, Target, XCircle, Clock, BarChart3, Award } from 'lucide-react';

interface PastSignal {
  id: string;
  symbol: string;
  mt5_symbol: string | null;
  direction: string;
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  order_type: string;
  confidence: number;
  confidence_percentage: number | null;
  outcome: string | null;
  accuracy_percentage: number | null;
  created_at: string;
  closed_at: string | null;
}

interface AccuracyStats {
  total: number;
  successful: number;
  failed: number;
  accuracy: number;
}

export function PastSignals() {
  const { user } = useAuth();
  const [signals, setSignals] = useState<PastSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<AccuracyStats>({
    total: 0,
    successful: 0,
    failed: 0,
    accuracy: 0,
  });

  useEffect(() => {
    loadPastSignals();
  }, [user]);

  const loadPastSignals = async () => {
    const { data } = await supabase
      .from('signals')
      .select('*')
      .not('outcome', 'is', null)
      .order('closed_at', { ascending: false })
      .limit(100);

    if (data) {
      setSignals(data);
      calculateStats(data);
    }
    setLoading(false);
  };

  const calculateStats = (signalsData: PastSignal[]) => {
    const total = signalsData.length;
    const successful = signalsData.filter((s) =>
      s.outcome === 'tp1_hit' || s.outcome === 'tp2_hit' || s.outcome === 'tp3_hit'
    ).length;
    const failed = signalsData.filter((s) => s.outcome === 'sl_hit').length;
    const accuracy = total > 0 ? (successful / total) * 100 : 0;

    setStats({ total, successful, failed, accuracy });
  };

  const getOutcomeBadge = (outcome: string | null) => {
    switch (outcome) {
      case 'tp1_hit':
      case 'tp2_hit':
      case 'tp3_hit':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-600/20 text-emerald-400 rounded-full text-xs font-semibold">
            <Target className="w-3 h-3" />
            TP Hit
          </span>
        );
      case 'sl_hit':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 bg-red-600/20 text-red-400 rounded-full text-xs font-semibold">
            <XCircle className="w-3 h-3" />
            SL Hit
          </span>
        );
      case 'expired':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 bg-slate-600/20 text-slate-600 dark:text-slate-400 rounded-full text-xs font-semibold">
            <Clock className="w-3 h-3" />
            Expired
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-3 py-1 bg-slate-600/20 text-slate-600 dark:text-slate-400 rounded-full text-xs font-semibold">
            Pending
          </span>
        );
    }
  };

  return (
    <ProtectedRoute>
      <DashboardLayout currentPage="past-signals">
        <div className="max-w-7xl mx-auto space-y-6">
          <div>
            <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Past Signals</h2>
            <p className="text-slate-600 dark:text-slate-400">Historical signal performance and accuracy tracking</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white dark:bg-white dark:bg-slate-800/50 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-cyan-600/20 rounded-lg flex items-center justify-center">
                  <BarChart3 className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Total Signals</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.total}</p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-white dark:bg-slate-800/50 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-emerald-600/20 rounded-lg flex items-center justify-center">
                  <Target className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Successful</p>
                  <p className="text-2xl font-bold text-emerald-400">{stats.successful}</p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-white dark:bg-slate-800/50 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-red-600/20 rounded-lg flex items-center justify-center">
                  <XCircle className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Failed</p>
                  <p className="text-2xl font-bold text-red-400">{stats.failed}</p>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-emerald-600/20 to-cyan-600/20 backdrop-blur-sm border border-emerald-600/30 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-emerald-600/30 rounded-lg flex items-center justify-center">
                  <Award className="w-5 h-5 text-emerald-300" />
                </div>
                <div>
                  <p className="text-sm text-emerald-300/80">Accuracy Rate</p>
                  <p className="text-2xl font-bold text-emerald-200">{stats.accuracy.toFixed(1)}%</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-white dark:bg-slate-800/50 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Signal History</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">All closed signals with outcomes</p>
            </div>

            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
              </div>
            ) : signals.length === 0 ? (
              <div className="p-12 text-center">
                <div className="w-16 h-16 bg-slate-200 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Clock className="w-8 h-8 text-slate-600 dark:text-slate-400" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">No Past Signals</h3>
                <p className="text-slate-600 dark:text-slate-400">
                  Closed signals will appear here once they reach TP or SL
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-100 dark:bg-slate-50 dark:bg-slate-900/50">
                      <th className="text-left px-6 py-4 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                        Asset
                      </th>
                      <th className="text-left px-6 py-4 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                        Direction
                      </th>
                      <th className="text-left px-6 py-4 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                        Order Type
                      </th>
                      <th className="text-right px-6 py-4 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                        Entry
                      </th>
                      <th className="text-right px-6 py-4 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                        Stop Loss
                      </th>
                      <th className="text-right px-6 py-4 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                        Take Profit
                      </th>
                      <th className="text-center px-6 py-4 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                        Confidence
                      </th>
                      <th className="text-center px-6 py-4 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                        Outcome
                      </th>
                      <th className="text-center px-6 py-4 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                        Signal Time
                      </th>
                      <th className="text-left px-6 py-4 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                        Closed At
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {signals.map((signal) => (
                      <tr key={signal.id} className="hover:bg-white/80 dark:bg-white dark:bg-slate-800/30 transition-colors">
                        <td className="px-6 py-4">
                          <div>
                            <div className="font-semibold text-slate-900 dark:text-white">{signal.mt5_symbol || signal.symbol}</div>
                            <div className="text-xs text-slate-600 dark:text-slate-500 font-mono">{signal.symbol}</div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {signal.direction === 'BUY' ? (
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 bg-emerald-400 rounded-full"></div>
                              <span className="text-emerald-400 font-semibold">BUY</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 bg-red-400 rounded-full"></div>
                              <span className="text-red-400 font-semibold">SELL</span>
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-slate-700 dark:text-slate-300">{signal.order_type || 'Market Execution'}</span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className="font-mono text-slate-900 dark:text-white text-sm">{signal.entry_price.toFixed(5)}</span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className="font-mono text-red-400 text-sm">{signal.stop_loss.toFixed(5)}</span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className="font-mono text-emerald-400 text-sm">
                            {signal.tp1 ? signal.tp1.toFixed(5) : signal.take_profit.toFixed(5)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="text-slate-700 dark:text-slate-300 text-sm font-medium">
                            {signal.confidence_percentage || signal.confidence}%
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          {getOutcomeBadge(signal.outcome)}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="text-sm text-slate-700 dark:text-slate-300">
                            {signal.created_at ? new Date(signal.created_at).toLocaleString() : '-'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-slate-600 dark:text-slate-400">
                            {signal.closed_at ? new Date(signal.closed_at).toLocaleString() : '-'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
