import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { TrendingUp, TrendingDown, DollarSign, Activity, Target, Award } from 'lucide-react';
import type { TradingMode } from '../contexts/AuthContext';

interface Trade {
  id: string;
  profit_loss: number;
  status: string;
  opened_at: string;
  closed_at: string | null;
}

interface PerformanceMetricsProps {
  userId: string;
  tradingMode: TradingMode;
}

export function PerformanceMetrics({ userId, tradingMode }: PerformanceMetricsProps) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTrades();

    const subscription = supabase
      .channel('performance_trades')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'trades',
        filter: `user_id=eq.${userId}`
      }, () => {
        loadTrades();
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [userId, tradingMode]);

  const loadModeLogins = async (): Promise<string[]> => {
    const { data } = await supabase
      .from('mt5_accounts')
      .select('mt5_login,account_type')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    const rows = (data as any[]) || [];
    const logins = rows
      .filter((r) => (tradingMode === 'demo' ? r?.account_type === 'demo' : r?.account_type === 'real' || r?.account_type === 'live'))
      .map((r) => String(r.mt5_login || '').trim())
      .filter(Boolean);
    return logins;
  };

  const loadTrades = async () => {
    const logins = await loadModeLogins();
    if (logins.length === 0) {
      setTrades([]);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from('trades')
      .select('id, profit_loss, status, opened_at, closed_at')
      .eq('user_id', userId)
      .in('mt5_login', logins)
      .order('opened_at', { ascending: false });

    setTrades(data || []);
    setLoading(false);
  };

  const calculateMetrics = () => {
    const closedTrades = trades.filter(t => t.status === 'closed');
    const totalTrades = closedTrades.length;

    if (totalTrades === 0) {
      return {
        totalPL: 0,
        winRate: 0,
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        avgWin: 0,
        avgLoss: 0,
      };
    }

    const totalPL = closedTrades.reduce((sum, t) => sum + t.profit_loss, 0);
    const winningTrades = closedTrades.filter(t => t.profit_loss > 0);
    const losingTrades = closedTrades.filter(t => t.profit_loss < 0);

    const winRate = (winningTrades.length / totalTrades) * 100;
    const avgWin = winningTrades.length > 0
      ? winningTrades.reduce((sum, t) => sum + t.profit_loss, 0) / winningTrades.length
      : 0;
    const avgLoss = losingTrades.length > 0
      ? Math.abs(losingTrades.reduce((sum, t) => sum + t.profit_loss, 0) / losingTrades.length)
      : 0;

    return {
      totalPL,
      winRate,
      totalTrades,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      avgWin,
      avgLoss,
    };
  };

  const metrics = calculateMetrics();

  if (loading) {
    return (
      <div className="bg-slate-50 dark:bg-slate-800/50 backdrop-blur-sm border border-slate-300 dark:border-slate-700 rounded-2xl p-6">
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-50 dark:bg-slate-800/50 backdrop-blur-sm border border-slate-300 dark:border-slate-700 rounded-2xl p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-amber-600/20 rounded-lg flex items-center justify-center">
          <Award className="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-black dark:text-white">Performance Metrics</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">Trading statistics</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white dark:bg-slate-900/50 rounded-lg p-4 border border-slate-300 dark:border-slate-700">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className={`w-4 h-4 ${metrics.totalPL >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`} />
            <span className="text-xs text-slate-600 dark:text-slate-400">Total P/L</span>
          </div>
          <p className={`text-2xl font-bold ${metrics.totalPL >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
            {metrics.totalPL >= 0 ? '+' : ''}{metrics.totalPL.toFixed(2)}
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-500 mt-1">USD</p>
        </div>

        <div className="bg-white dark:bg-slate-900/50 rounded-lg p-4 border border-slate-300 dark:border-slate-700">
          <div className="flex items-center gap-2 mb-2">
            <Target className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            <span className="text-xs text-slate-600 dark:text-slate-400">Win Rate</span>
          </div>
          <p className="text-2xl font-bold text-black dark:text-white">
            {metrics.winRate.toFixed(1)}%
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-500 mt-1">
            {metrics.winningTrades}W / {metrics.losingTrades}L
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900/50 rounded-lg p-4 border border-slate-300 dark:border-slate-700">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-xs text-slate-600 dark:text-slate-400">Avg Win</span>
          </div>
          <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
            +{metrics.avgWin.toFixed(2)}
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-500 mt-1">USD</p>
        </div>

        <div className="bg-white dark:bg-slate-900/50 rounded-lg p-4 border border-slate-300 dark:border-slate-700">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="w-4 h-4 text-red-600 dark:text-red-400" />
            <span className="text-xs text-slate-600 dark:text-slate-400">Avg Loss</span>
          </div>
          <p className="text-xl font-bold text-red-600 dark:text-red-400">
            -{metrics.avgLoss.toFixed(2)}
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-500 mt-1">USD</p>
        </div>

        <div className="col-span-2 bg-white dark:bg-slate-900/50 rounded-lg p-4 border border-slate-300 dark:border-slate-700">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-4 h-4 text-slate-600 dark:text-slate-400" />
            <span className="text-xs text-slate-600 dark:text-slate-400">Total Trades</span>
          </div>
          <p className="text-2xl font-bold text-black dark:text-white">
            {metrics.totalTrades}
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-500 mt-1">Closed positions</p>
        </div>
      </div>
    </div>
  );
}
