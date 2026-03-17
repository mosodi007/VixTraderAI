import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ArrowUpRight, ArrowDownRight, Clock } from 'lucide-react';

interface TradeRow {
  id: string;
  mt5_login: string;
  symbol: string;
  direction: string;
  lot_size: number;
  entry_price: number;
  exit_price: number | null;
  profit_loss: number;
  status: string;
  opened_at: string;
  closed_at: string | null;
}

interface RecentTradeActivityProps {
  userId: string;
}

export function RecentTradeActivity({ userId }: RecentTradeActivityProps) {
  const [rows, setRows] = useState<TradeRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data } = await supabase
      .from('trades')
      .select('id,mt5_login,symbol,direction,lot_size,entry_price,exit_price,profit_loss,status,opened_at,closed_at')
      .eq('user_id', userId)
      .order('opened_at', { ascending: false })
      .limit(20);
    setRows((data as any) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel('recent_trade_activity')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trades', filter: `user_id=eq.${userId}` }, () => load())
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
          <h3 className="text-lg font-bold text-black dark:text-white">Recent Activity</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">Latest opened/closed trades</p>
        </div>
        <div className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-2">
          <Clock className="w-3.5 h-3.5" />
          Live updates
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white dark:bg-slate-900/50 rounded-lg p-8 text-center border border-slate-300 dark:border-slate-700">
          <p className="text-sm text-slate-600 dark:text-slate-400">No trade activity yet. Start the EA to stream updates.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((t) => {
            const closed = t.status === 'closed' || t.closed_at;
            const pl = Number(t.profit_loss || 0);
            const statusLower = String(t.status || '').toLowerCase();
            const statusLabel =
              statusLower === 'sent' ? 'OPEN' :
              statusLower === 'open' ? 'OPEN' :
              statusLower === 'closed' ? 'CLOSED' :
              statusLower ? statusLower.toUpperCase() : 'UNKNOWN';
            return (
              <div
                key={t.id}
                className="bg-white dark:bg-slate-900/50 rounded-lg p-4 border border-slate-300 dark:border-slate-700 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${t.direction === 'BUY' ? 'bg-emerald-600/20' : 'bg-red-600/20'}`}>
                    {t.direction === 'BUY' ? (
                      <ArrowUpRight className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <ArrowDownRight className="w-4 h-4 text-red-600 dark:text-red-400" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-black dark:text-white">
                      {t.direction} {t.symbol} {t.lot_size} lots
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      MT5 #{t.mt5_login} • Opened {new Date(t.opened_at).toLocaleString()}
                      {closed && t.closed_at ? ` • Closed ${new Date(t.closed_at).toLocaleString()}` : ''}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">{closed ? 'Realized P/L' : 'Status'}</p>
                  {closed ? (
                    <p className={`text-sm font-bold ${pl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                      {pl >= 0 ? '+' : ''}{pl.toFixed(2)}
                    </p>
                  ) : (
                    <p className={`text-sm font-bold ${statusLower === 'sent' ? 'text-cyan-600 dark:text-cyan-400' : 'text-amber-600 dark:text-amber-400'}`}>
                      {statusLabel}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

