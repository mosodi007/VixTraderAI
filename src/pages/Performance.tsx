import { useState, useEffect } from 'react';
import { DashboardLayout } from '../components/DashboardLayout';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { TrendingUp, TrendingDown, DollarSign, Award, BarChart3, Calendar } from 'lucide-react';

interface TradeStats {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  totalProfit: number;
  winRate: number;
}

interface Trade {
  id: string;
  symbol: string;
  direction: string;
  entry_price: number;
  exit_price: number | null;
  profit_loss: number;
  status: string;
  opened_at: string;
  closed_at: string | null;
}

function tradeStatusLabel(status: string): string {
  const s = String(status || '').toLowerCase();
  if (s === 'sent') return 'dispatched';
  return s || 'unknown';
}

function tradeStatusBadgeClass(status: string): string {
  const s = String(status || '').toLowerCase();
  if (s === 'open') return 'bg-blue-500/20 text-blue-400';
  if (s === 'closed') return 'bg-slate-500/20 text-slate-600 dark:text-slate-400';
  if (s === 'sent') return 'bg-amber-500/20 text-amber-600 dark:text-amber-300';
  return 'bg-yellow-500/20 text-yellow-400';
}

export function Performance() {
  const { user, tradingMode } = useAuth();
  const [stats, setStats] = useState<TradeStats>({
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    totalProfit: 0,
    winRate: 0,
  });
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState<'7d' | '30d' | 'all'>('30d');

  useEffect(() => {
    loadPerformanceData();
  }, [user, timeframe, tradingMode]);

  const loadPerformanceData = async () => {
    if (!user) return;

    const { data: accounts } = await supabase
      .from('mt5_accounts')
      .select('mt5_login,account_type')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });
    const logins = ((accounts as any[]) || [])
      .filter((r) => (tradingMode === 'demo' ? r?.account_type === 'demo' : r?.account_type === 'real' || r?.account_type === 'live'))
      .map((r) => String(r.mt5_login || '').trim())
      .filter(Boolean);

    if (logins.length === 0) {
      setTrades([]);
      setStats({ totalTrades: 0, winningTrades: 0, losingTrades: 0, totalProfit: 0, winRate: 0 });
      setLoading(false);
      return;
    }

    let query = supabase
      .from('trades')
      .select('*')
      .eq('user_id', user.id)
      .in('mt5_login', logins)
      .order('opened_at', { ascending: false });

    if (timeframe !== 'all') {
      const days = timeframe === '7d' ? 7 : 30;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      query = query.gte('opened_at', cutoffDate.toISOString());
    }

    const { data } = await query;

    if (data) {
      setTrades(data);

      const closedTrades = data.filter((t) => t.status === 'closed');
      const winning = closedTrades.filter((t) => t.profit_loss > 0).length;
      const losing = closedTrades.filter((t) => t.profit_loss < 0).length;
      const totalProfit = closedTrades.reduce((sum, t) => sum + t.profit_loss, 0);
      const winRate = closedTrades.length > 0 ? (winning / closedTrades.length) * 100 : 0;

      setStats({
        totalTrades: closedTrades.length,
        winningTrades: winning,
        losingTrades: losing,
        totalProfit,
        winRate,
      });
    }

    setLoading(false);
  };

  const formatCurrency = (value: number) => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}$${value.toFixed(2)}`;
  };

  return (
    <ProtectedRoute>
      <DashboardLayout currentPage="performance">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-bold text-black dark:text-white mb-2">Performance Analytics</h2>
              <p className="text-slate-600 dark:text-slate-400">Track your trading performance</p>
            </div>
            <div className="flex gap-2">
              {(['7d', '30d', 'all'] as const).map((tf) => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={`px-4 py-2 rounded-lg font-medium transition-all ${
                    timeframe === tf
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-200 dark:bg-slate-700 text-black dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600'
                  }`}
                >
                  {tf === '7d' ? '7 Days' : tf === '30d' ? '30 Days' : 'All Time'}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-slate-50 dark:bg-slate-800/50 backdrop-blur-sm border border-slate-300 dark:border-slate-700 rounded-2xl p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-emerald-600/20 rounded-lg flex items-center justify-center">
                      <BarChart3 className="w-5 h-5 text-emerald-400" />
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Total Trades</p>
                  </div>
                  <p className="text-3xl font-bold text-black dark:text-white">{stats.totalTrades}</p>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/50 backdrop-blur-sm border border-slate-300 dark:border-slate-700 rounded-2xl p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-emerald-600/20 rounded-lg flex items-center justify-center">
                      <Award className="w-5 h-5 text-emerald-400" />
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Win Rate</p>
                  </div>
                  <p className="text-3xl font-bold text-black dark:text-white">{stats.winRate.toFixed(1)}%</p>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/50 backdrop-blur-sm border border-slate-300 dark:border-slate-700 rounded-2xl p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-emerald-600/20 rounded-lg flex items-center justify-center">
                      <DollarSign className="w-5 h-5 text-emerald-400" />
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Total Profit</p>
                  </div>
                  <p className={`text-3xl font-bold ${stats.totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {formatCurrency(stats.totalProfit)}
                  </p>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/50 backdrop-blur-sm border border-slate-300 dark:border-slate-700 rounded-2xl p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-emerald-600/20 rounded-lg flex items-center justify-center">
                      <TrendingUp className="w-5 h-5 text-emerald-400" />
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Win / Loss</p>
                  </div>
                  <p className="text-3xl font-bold text-black dark:text-white">
                    {stats.winningTrades} / {stats.losingTrades}
                  </p>
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/50 backdrop-blur-sm border border-slate-300 dark:border-slate-700 rounded-2xl p-6">
                <h3 className="text-xl font-bold text-black dark:text-white mb-2">Recent Trades</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
                  &quot;Dispatched&quot; means the instruction was returned to your EA on a poll — MT5 only opens after the EA runs the order. If it stays dispatched, check the EA Experts log (age filter, symbol name, AutoTrading).
                </p>
                {trades.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 bg-slate-200 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Calendar className="w-8 h-8 text-slate-600 dark:text-slate-400" />
                    </div>
                    <p className="text-slate-600 dark:text-slate-400">No trades yet</p>
                    <p className="text-sm text-slate-600 dark:text-slate-500 mt-2">Your trading history will appear here</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-slate-300 dark:border-slate-700">
                          <th className="text-left py-3 px-4 text-sm font-medium text-slate-600 dark:text-slate-400">Symbol</th>
                          <th className="text-left py-3 px-4 text-sm font-medium text-slate-600 dark:text-slate-400">Direction</th>
                          <th className="text-left py-3 px-4 text-sm font-medium text-slate-600 dark:text-slate-400">Entry</th>
                          <th className="text-left py-3 px-4 text-sm font-medium text-slate-600 dark:text-slate-400">Exit</th>
                          <th className="text-left py-3 px-4 text-sm font-medium text-slate-600 dark:text-slate-400">P&L</th>
                          <th className="text-left py-3 px-4 text-sm font-medium text-slate-600 dark:text-slate-400">Status</th>
                          <th className="text-left py-3 px-4 text-sm font-medium text-slate-600 dark:text-slate-400">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trades.map((trade) => (
                          <tr key={trade.id} className="border-b border-slate-300 dark:border-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700/30">
                            <td className="py-4 px-4 text-black dark:text-white font-medium">{trade.symbol}</td>
                            <td className="py-4 px-4">
                              <span className={`inline-flex items-center gap-1 ${
                                trade.direction === 'BUY' ? 'text-emerald-400' : 'text-red-400'
                              }`}>
                                {trade.direction === 'BUY' ? (
                                  <TrendingUp className="w-4 h-4" />
                                ) : (
                                  <TrendingDown className="w-4 h-4" />
                                )}
                                {trade.direction}
                              </span>
                            </td>
                            <td className="py-4 px-4 text-slate-700 dark:text-slate-300 font-mono text-sm">
                              {trade.entry_price.toFixed(5)}
                            </td>
                            <td className="py-4 px-4 text-slate-700 dark:text-slate-300 font-mono text-sm">
                              {trade.exit_price ? trade.exit_price.toFixed(5) : '-'}
                            </td>
                            <td className="py-4 px-4">
                              <span className={`font-bold ${
                                trade.profit_loss >= 0 ? 'text-emerald-400' : 'text-red-400'
                              }`}>
                                {formatCurrency(trade.profit_loss)}
                              </span>
                            </td>
                            <td className="py-4 px-4">
                              <span
                                className={`px-2 py-1 rounded-full text-xs font-medium ${tradeStatusBadgeClass(trade.status)}`}
                                title={
                                  String(trade.status).toLowerCase() === 'sent'
                                    ? 'Backend queued this for the EA; not yet an MT5 position'
                                    : undefined
                                }
                              >
                                {tradeStatusLabel(trade.status)}
                              </span>
                            </td>
                            <td className="py-4 px-4 text-slate-600 dark:text-slate-400 text-sm">
                              {new Date(trade.opened_at).toLocaleDateString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
