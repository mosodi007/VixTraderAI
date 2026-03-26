import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { TrendingUp, TrendingDown, Clock } from 'lucide-react';

interface Mt5PositionRow {
  id: string;
  mt5_login: string;
  ticket: string;
  symbol: string;
  direction: 'BUY' | 'SELL';
  volume: number;
  price_open: number;
  price_current: number;
  stop_loss: number | null;
  take_profit: number | null;
  profit: number;
  opened_at: string;
  last_updated: string;
}

interface LiveMT5PositionsProps {
  userId: string;
}

export function LiveMT5Positions({ userId }: LiveMT5PositionsProps) {
  const [positions, setPositions] = useState<Mt5PositionRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data } = await supabase
      .from('mt5_positions')
      .select('*')
      .eq('user_id', userId)
      .order('opened_at', { ascending: false });
    setPositions((data as any) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel('mt5_positions_live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mt5_positions', filter: `user_id=eq.${userId}` },
        () => load(),
      )
      .subscribe();
    return () => channel.unsubscribe();
  }, [userId]);

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
        <div>
          <h3 className="text-lg font-bold text-black dark:text-white">Open Positions (Live)</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">{positions.length} Position{positions.length !== 1 ? 's' : ''}</p>
        </div>
        {positions[0]?.last_updated && (
          <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
            <Clock className="w-3.5 h-3.5" />
            Updated {new Date(positions[0].last_updated).toLocaleTimeString()}
          </div>
        )}
      </div>

      {positions.length === 0 ? (
        <div className="bg-white dark:bg-slate-900/50 rounded-lg p-8 text-center border border-slate-300 dark:border-slate-700">
          <p className="text-sm text-slate-600 dark:text-slate-400">No open positions. The EA will stream them here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {positions.map((p) => (
            <div
              key={p.id}
              className="bg-white dark:bg-slate-900/50 rounded-lg p-4 border border-slate-300 dark:border-slate-700"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 ${p.direction === 'BUY' ? 'bg-emerald-600/20' : 'bg-red-600/20'} rounded-lg flex items-center justify-center`}>
                    {p.direction === 'BUY' ? (
                      <TrendingUp className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <TrendingDown className="w-5 h-5 text-red-600 dark:text-red-400" />
                    )}
                  </div>
                  <div>
                    <h4 className="text-black dark:text-white font-bold">{p.symbol}</h4>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      {p.direction} • {p.volume} lots • Ticket {p.ticket} • MT5 #{p.mt5_login}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">Floating P/L</p>
                  <p className={`text-lg font-bold ${p.profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                    {p.profit >= 0 ? '+' : ''}{Number(p.profit || 0).toFixed(2)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div>
                  <p className="text-slate-600 dark:text-slate-400 mb-1">Entry</p>
                  <p className="text-black dark:text-white font-mono font-medium">{Number(p.price_open).toFixed(5)}</p>
                </div>
                <div>
                  <p className="text-slate-600 dark:text-slate-400 mb-1">Current</p>
                  <p className="text-black dark:text-white font-mono font-medium">{Number(p.price_current).toFixed(5)}</p>
                </div>
                {p.stop_loss != null && (
                  <div>
                    <p className="text-slate-600 dark:text-slate-400 mb-1">SL</p>
                    <p className="text-red-600 dark:text-red-400 font-mono font-medium">{Number(p.stop_loss).toFixed(5)}</p>
                  </div>
                )}
                {p.take_profit != null && (
                  <div>
                    <p className="text-slate-600 dark:text-slate-400 mb-1">TP</p>
                    <p className="text-emerald-600 dark:text-emerald-400 font-mono font-medium">{Number(p.take_profit).toFixed(5)}</p>
                  </div>
                )}
              </div>

              <div className="mt-3 pt-3 border-t border-slate-300 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-400">
                Opened {new Date(p.opened_at).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

