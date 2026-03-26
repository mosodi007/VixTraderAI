import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Wallet, Gauge, Coins, Shield } from 'lucide-react';

interface Mt5AccountMetrics {
  mt5_login: string;
  balance: number;
  equity: number;
  margin: number;
  free_margin: number;
  margin_level: number;
  currency: string;
  leverage: number;
  last_sync: string | null;
}

interface AccountLiveMetricsProps {
  userId: string;
}

export function AccountLiveMetrics({ userId }: AccountLiveMetricsProps) {
  const [data, setData] = useState<Mt5AccountMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data: row } = await supabase
      .from('mt5_accounts')
      .select('mt5_login,balance,equity,margin,free_margin,margin_level,currency,leverage,last_sync')
      .eq('user_id', userId)
      .maybeSingle();
    setData((row as any) || null);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel('mt5_account_metrics')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mt5_accounts', filter: `user_id=eq.${userId}` },
        () => load(),
      )
      .subscribe();
    return () => {
      channel.unsubscribe();
    };
  }, [userId]);

  if (loading) {
    return (
      <div className="bg-slate-50 dark:bg-slate-800/50 backdrop-blur-sm border border-slate-300 dark:border-slate-700 rounded-2xl p-6">
        <div className="flex items-center justify-center h-24">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-slate-50 dark:bg-slate-800/50 backdrop-blur-sm border border-slate-300 dark:border-slate-700 rounded-2xl p-6">
        <p className="text-sm text-slate-600 dark:text-slate-400">No account metrics yet. Start the EA to stream data.</p>
      </div>
    );
  }

  const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '0.00');
  const currency = data.currency || 'USD';

  return (
    <div className="bg-slate-50 dark:bg-slate-800/50 backdrop-blur-sm border border-slate-300 dark:border-slate-700 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-lg font-bold text-black dark:text-white">Account (Live)</h3>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            MT5 #{data.mt5_login} {data.last_sync ? `• Updated ${new Date(data.last_sync).toLocaleTimeString()}` : ''}
          </p>
        </div>
        <div className="text-xs text-slate-600 dark:text-slate-400">
          Leverage 1:{data.leverage || 0}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-slate-900/50 rounded-lg p-4 border border-slate-300 dark:border-slate-700">
          <div className="flex items-center gap-2 mb-2">
            <Wallet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-xs text-slate-600 dark:text-slate-400">Balance</span>
          </div>
          <p className="text-xl font-bold text-black dark:text-white">{fmt(data.balance)} {currency}</p>
        </div>

        <div className="bg-white dark:bg-slate-900/50 rounded-lg p-4 border border-slate-300 dark:border-slate-700">
          <div className="flex items-center gap-2 mb-2">
            <Gauge className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            <span className="text-xs text-slate-600 dark:text-slate-400">Equity</span>
          </div>
          <p className="text-xl font-bold text-black dark:text-white">{fmt(data.equity)} {currency}</p>
        </div>

        <div className="bg-white dark:bg-slate-900/50 rounded-lg p-4 border border-slate-300 dark:border-slate-700">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <span className="text-xs text-slate-600 dark:text-slate-400">Margin</span>
          </div>
          <p className="text-xl font-bold text-black dark:text-white">{fmt(data.margin)} {currency}</p>
        </div>

        <div className="bg-white dark:bg-slate-900/50 rounded-lg p-4 border border-slate-300 dark:border-slate-700">
          <div className="flex items-center gap-2 mb-2">
            <Coins className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-xs text-slate-600 dark:text-slate-400">Free / Level</span>
          </div>
          <p className="text-xl font-bold text-black dark:text-white">{fmt(data.free_margin)} {currency}</p>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{fmt(data.margin_level)}%</p>
        </div>
      </div>
    </div>
  );
}

