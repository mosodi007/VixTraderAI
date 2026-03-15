import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { TrendingUp, TrendingDown, DollarSign, BarChart3, Package } from 'lucide-react';

interface Trade {
  id: string;
  mt5_login: string;
  symbol: string;
  direction: string;
  entry_price: number;
  exit_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  lot_size: number;
  profit_loss: number;
  status: string;
  opened_at: string;
  closed_at: string | null;
}

interface ActivePositionsProps {
  userId: string;
}

export function ActivePositions({ userId }: ActivePositionsProps) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTrades();

    const subscription = supabase
      .channel('trades')
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
  }, [userId]);

  const loadTrades = async () => {
    const { data } = await supabase
      .from('trades')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'open')
      .order('opened_at', { ascending: false });

    setTrades(data || []);
    setLoading(false);
  };

  const calculateUnrealizedPL = (trade: Trade, currentPrice: number = 0) => {
    if (!currentPrice) {
      currentPrice = trade.entry_price;
    }

    const priceDiff = trade.direction === 'BUY'
      ? currentPrice - trade.entry_price
      : trade.entry_price - currentPrice;

    return priceDiff * trade.lot_size * 100000;
  };

  const getPositionDuration = (openedAt: string) => {
    const opened = new Date(openedAt);
    const now = new Date();
    const diffMs = now.getTime() - opened.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 60) return `${diffMins}m`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d`;
  };

  const totalPL = trades.reduce((sum, trade) => sum + (trade.profit_loss || 0), 0);

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
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-cyan-600/20 rounded-lg flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-black dark:text-white">Active Positions</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">{trades.length} Open {trades.length === 1 ? 'Trade' : 'Trades'}</p>
          </div>
        </div>
        {trades.length > 0 && (
          <div className="text-right">
            <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">Total P/L</p>
            <p className={`text-lg font-bold ${totalPL >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
              {totalPL >= 0 ? '+' : ''}{totalPL.toFixed(2)} USD
            </p>
          </div>
        )}
      </div>

      {trades.length === 0 ? (
        <div className="bg-white dark:bg-slate-900/50 rounded-lg p-8 text-center border border-slate-300 dark:border-slate-700">
          <Package className="w-10 h-10 text-slate-600 dark:text-slate-500 mx-auto mb-3" />
          <p className="text-sm text-slate-600 dark:text-slate-400">
            No active positions. Trades will appear here when signals are executed.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {trades.map((trade) => (
            <div
              key={trade.id}
              className="bg-white dark:bg-slate-900/50 rounded-lg p-4 border border-slate-300 dark:border-slate-700 hover:border-slate-300 dark:border-slate-600 transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 ${trade.direction === 'BUY' ? 'bg-emerald-600/20' : 'bg-red-600/20'} rounded-lg flex items-center justify-center`}>
                    {trade.direction === 'BUY' ? (
                      <TrendingUp className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <TrendingDown className="w-5 h-5 text-red-600 dark:text-red-400" />
                    )}
                  </div>
                  <div>
                    <h4 className="text-black dark:text-white font-bold">{trade.symbol}</h4>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-xs font-medium ${trade.direction === 'BUY' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                        {trade.direction}
                      </span>
                      <span className="text-xs text-slate-600 dark:text-slate-500">
                        {trade.lot_size} lots
                      </span>
                      <span className="text-xs text-slate-600 dark:text-slate-500">
                        {getPositionDuration(trade.opened_at)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-1 text-slate-600 dark:text-slate-400 mb-1">
                    <DollarSign className="w-3.5 h-3.5" />
                    <span className="text-xs">P/L</span>
                  </div>
                  <p className={`text-lg font-bold ${trade.profit_loss >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                    {trade.profit_loss >= 0 ? '+' : ''}{trade.profit_loss.toFixed(2)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 text-xs">
                <div>
                  <p className="text-slate-600 dark:text-slate-400 mb-1">Entry</p>
                  <p className="text-black dark:text-white font-mono font-medium">{trade.entry_price.toFixed(5)}</p>
                </div>
                {trade.stop_loss && (
                  <div>
                    <p className="text-slate-600 dark:text-slate-400 mb-1">Stop Loss</p>
                    <p className="text-red-600 dark:text-red-400 font-mono font-medium">{trade.stop_loss.toFixed(5)}</p>
                  </div>
                )}
                {trade.take_profit && (
                  <div>
                    <p className="text-slate-600 dark:text-slate-400 mb-1">Take Profit</p>
                    <p className="text-emerald-600 dark:text-emerald-400 font-mono font-medium">{trade.take_profit.toFixed(5)}</p>
                  </div>
                )}
              </div>

              <div className="mt-3 pt-3 border-t border-slate-300 dark:border-slate-700 flex items-center justify-between text-xs">
                <span className="text-slate-600 dark:text-slate-500">MT5 #{trade.mt5_login}</span>
                <span className="text-slate-600 dark:text-slate-500">
                  Opened {new Date(trade.opened_at).toLocaleString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
