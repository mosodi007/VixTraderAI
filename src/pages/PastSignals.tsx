import { useState, useEffect } from 'react';
import { DashboardLayout } from '../components/DashboardLayout';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Target, XCircle, Clock, BarChart3, Award } from 'lucide-react';

/** One row per closed trade (user-specific SL/TP), joined with signal metadata for display. */
interface PastSignal {
  id: string;
  trade_id: string;
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
  trigger_count?: number | null;
  outcome: string | null;
  accuracy_percentage: number | null;
  created_at: string;
  closed_at: string | null;
  profit_loss?: number | null;
}

function deriveOutcomeFromTrade(
  profitLoss: number | null | undefined,
  exitPrice: number | null | undefined,
  entry: number,
  sl: number,
  tp: number,
  direction: string,
): string | null {
  const pl = profitLoss != null ? Number(profitLoss) : NaN;
  if (Number.isFinite(pl)) {
    if (pl > 0) return 'tp1_hit';
    if (pl < 0) return 'sl_hit';
    return 'breakeven';
  }
  const exit = exitPrice != null ? Number(exitPrice) : NaN;
  const dir = String(direction || '').toUpperCase();
  if (!Number.isFinite(exit) || !Number.isFinite(sl) || !Number.isFinite(tp) || !Number.isFinite(entry)) {
    return null;
  }
  if (dir === 'BUY') {
    if (tp > entry && exit >= tp) return 'tp1_hit';
    if (sl < entry && exit <= sl) return 'sl_hit';
  } else if (dir === 'SELL') {
    if (tp < entry && exit <= tp) return 'tp1_hit';
    if (sl > entry && exit >= sl) return 'sl_hit';
  }
  return null;
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
    if (!user?.id) {
      setSignals([]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('trades')
      .select(
        `
        id,
        entry_price,
        stop_loss,
        take_profit,
        direction,
        signal_id,
        exit_price,
        profit_loss,
        closed_at,
        opened_at,
        created_at,
        signals (
          signal_type,
          symbol,
          mt5_symbol,
          tp1,
          tp2,
          tp3,
          take_profit,
          order_type,
          confidence,
          confidence_percentage,
          trigger_count,
          created_at
        )
      `,
      )
      .eq('user_id', user.id)
      .eq('status', 'closed')
      .not('signal_id', 'is', null)
      .order('closed_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('[PastSignals]', error);
      setSignals([]);
      setStats({ total: 0, successful: 0, failed: 0, accuracy: 0 });
      setLoading(false);
      return;
    }

    const rows = (data || []) as Array<{
      id: string;
      entry_price: number;
      stop_loss: number | null;
      take_profit: number | null;
      direction: string;
      exit_price: number | null;
      profit_loss: number | null;
      closed_at: string | null;
      created_at: string;
      signals: Record<string, unknown> | null;
    }>;

    const mapped: PastSignal[] = rows.map((t) => {
      const sig = (t.signals || {}) as Record<string, unknown>;
      const entry = Number(t.entry_price) || 0;
      const sl = Number(t.stop_loss ?? 0);
      const tp = Number(t.take_profit ?? sig.take_profit ?? 0);
      const outcome = deriveOutcomeFromTrade(
        t.profit_loss,
        t.exit_price,
        entry,
        sl,
        tp,
        t.direction,
      );
      return {
        id: t.id,
        trade_id: t.id,
        symbol: String(sig.symbol ?? ''),
        mt5_symbol: sig.mt5_symbol != null ? String(sig.mt5_symbol) : null,
        direction: String(t.direction || ''),
        entry_price: entry,
        stop_loss: sl,
        take_profit: tp,
        tp1: sig.tp1 != null ? Number(sig.tp1) : null,
        tp2: sig.tp2 != null ? Number(sig.tp2) : null,
        tp3: sig.tp3 != null ? Number(sig.tp3) : null,
        order_type: String(sig.order_type ?? 'MARKET'),
        confidence: Number(sig.confidence ?? 0),
        confidence_percentage:
          sig.confidence_percentage != null ? Number(sig.confidence_percentage) : null,
        trigger_count: sig.trigger_count != null ? Number(sig.trigger_count) : null,
        outcome,
        accuracy_percentage: null,
        created_at: String(sig.created_at ?? t.created_at),
        closed_at: t.closed_at,
        profit_loss: t.profit_loss,
      };
    });

    setSignals(mapped);
    calculateStats(mapped);
    setLoading(false);
  };

  const calculateStats = (signalsData: PastSignal[]) => {
    const total = signalsData.length;
    const successful = signalsData.filter((s) => {
      const o = String(s.outcome || '').toLowerCase();
      if (o === 'tp1_hit' || o === 'tp2_hit' || o === 'tp3_hit') return true;
      const pl = s.profit_loss != null ? Number(s.profit_loss) : NaN;
      return Number.isFinite(pl) && pl > 0;
    }).length;
    const failed = signalsData.filter((s) => {
      const o = String(s.outcome || '').toLowerCase();
      if (o === 'sl_hit') return true;
      const pl = s.profit_loss != null ? Number(s.profit_loss) : NaN;
      return Number.isFinite(pl) && pl < 0;
    }).length;
    const decided = successful + failed;
    const accuracy = decided > 0 ? (successful / decided) * 100 : 0;

    setStats({ total, successful, failed, accuracy });
  };

  const getOutcomeBadge = (outcome: string | null) => {
    switch (outcome) {
      case 'tp1_hit':
      case 'tp2_hit':
      case 'tp3_hit':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-600/15 text-emerald-700 dark:text-emerald-400 dark:bg-emerald-500/20 rounded-full text-xs font-semibold">
            <Target className="w-3 h-3" />
            TP Hit
          </span>
        );
      case 'sl_hit':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 bg-red-600/15 text-red-700 dark:text-red-400 dark:bg-red-500/20 rounded-full text-xs font-semibold">
            <XCircle className="w-3 h-3" />
            SL Hit
          </span>
        );
      case 'expired':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 bg-slate-500/15 text-slate-700 dark:text-slate-300 dark:bg-slate-500/20 rounded-full text-xs font-semibold">
            <Clock className="w-3 h-3" />
            Expired
          </span>
        );
      case 'breakeven':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 bg-amber-500/15 text-amber-800 dark:text-amber-300 dark:bg-amber-500/20 rounded-full text-xs font-semibold">
            <Target className="w-3 h-3" />
            Breakeven
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-3 py-1 bg-slate-500/15 text-slate-700 dark:text-slate-300 dark:bg-slate-500/20 rounded-full text-xs font-semibold">
            Pending
          </span>
        );
    }
  };

  const formatShortDate = (iso: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <ProtectedRoute>
      <DashboardLayout currentPage="past-signals">
        <div className="max-w-7xl mx-auto w-full px-3 sm:px-4 md:px-6 space-y-4 sm:space-y-6 pb-6">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mb-1 sm:mb-2">
              Past Signals
            </h2>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400">
              Your closed trades from signals (your SL/TP and results)
            </p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
            <div className="bg-white dark:bg-slate-800/60 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-sm dark:shadow-none min-w-0">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <div className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 bg-cyan-600/20 dark:bg-cyan-500/15 rounded-lg flex items-center justify-center">
                  <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-600 dark:text-cyan-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 truncate">Total</p>
                  <p className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                    {stats.total}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800/60 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-sm dark:shadow-none min-w-0">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <div className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 bg-emerald-600/20 dark:bg-emerald-500/15 rounded-lg flex items-center justify-center">
                  <Target className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 truncate">Wins</p>
                  <p className="text-xl sm:text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {stats.successful}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800/60 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-sm dark:shadow-none min-w-0">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <div className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 bg-red-600/20 dark:bg-red-500/15 rounded-lg flex items-center justify-center">
                  <XCircle className="w-4 h-4 sm:w-5 sm:h-5 text-red-600 dark:text-red-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 truncate">Losses</p>
                  <p className="text-xl sm:text-2xl font-bold text-red-600 dark:text-red-400 tabular-nums">
                    {stats.failed}
                  </p>
                </div>
              </div>
            </div>

            <div className="col-span-2 lg:col-span-1 bg-gradient-to-br from-emerald-600/15 to-cyan-600/15 dark:from-emerald-900/40 dark:to-cyan-900/30 backdrop-blur-sm border border-emerald-600/25 dark:border-emerald-500/25 rounded-xl sm:rounded-2xl p-4 sm:p-6">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 bg-emerald-600/25 dark:bg-emerald-500/20 rounded-lg flex items-center justify-center">
                  <Award className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-700 dark:text-emerald-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm text-emerald-800/80 dark:text-emerald-400/90">Accuracy</p>
                  <p className="text-xl sm:text-2xl font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
                    {stats.accuracy.toFixed(1)}%
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800/60 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-xl sm:rounded-2xl overflow-hidden shadow-sm dark:shadow-none">
            <div className="px-4 py-4 sm:p-6 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">Signal History</h3>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                Closed trades linked to signals — outcomes use your levels and P/L
              </p>
            </div>

            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-2 border-slate-200 dark:border-slate-600 border-t-emerald-500 dark:border-t-emerald-400" />
              </div>
            ) : signals.length === 0 ? (
              <div className="p-8 sm:p-12 text-center">
                <div className="w-16 h-16 bg-slate-200 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Clock className="w-8 h-8 text-slate-600 dark:text-slate-400" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">No Past Signals</h3>
                <p className="text-slate-600 dark:text-slate-400">
                  Closed trades will appear here after your EA reports a close or the monitor resolves TP/SL
                </p>
              </div>
            ) : (
              <>
                {/* Mobile & tablet: stacked cards */}
                <ul className="lg:hidden divide-y divide-slate-200 dark:divide-slate-700">
                  {signals.map((signal) => (
                    <li
                      key={signal.id}
                      className="px-4 py-4 sm:px-5 space-y-3 active:bg-slate-50 dark:active:bg-slate-800/50"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-slate-900 dark:text-white truncate">
                            {signal.mt5_symbol || signal.symbol}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">{signal.symbol}</p>
                        </div>
                        {getOutcomeBadge(signal.outcome)}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                        {signal.direction === 'BUY' ? (
                          <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold text-sm">
                            <span className="w-2 h-2 bg-emerald-400 rounded-full shrink-0" />
                            BUY
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-red-600 dark:text-red-400 font-semibold text-sm">
                            <span className="w-2 h-2 bg-red-400 rounded-full shrink-0" />
                            SELL
                          </span>
                        )}
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {signal.order_type || 'Market'}
                        </span>
                        <span className="text-xs text-slate-600 dark:text-slate-300 ml-auto">
                          {(signal.confidence_percentage ?? signal.confidence)}% conf.
                        </span>
                      </div>
                      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                        <div>
                          <dt className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                            Entry
                          </dt>
                          <dd className="font-mono text-slate-900 dark:text-white text-xs sm:text-sm mt-0.5 break-all">
                            {signal.entry_price.toFixed(5)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                            SL
                          </dt>
                          <dd className="font-mono text-red-600 dark:text-red-400 text-xs sm:text-sm mt-0.5 break-all">
                            {signal.stop_loss.toFixed(5)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                            Trigger
                          </dt>
                          <dd className="font-mono text-slate-900 dark:text-white text-xs sm:text-sm mt-0.5 break-all">
                            {signal.trigger_count == null ? '—' : signal.trigger_count}
                          </dd>
                        </div>
                        <div className="col-span-2 sm:col-span-1">
                          <dt className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                            TP
                          </dt>
                          <dd className="font-mono text-emerald-600 dark:text-emerald-400 text-xs sm:text-sm mt-0.5 break-all">
                            {(signal.tp1 ?? signal.take_profit).toFixed(5)}
                          </dd>
                        </div>
                      </dl>
                      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-1 sm:gap-x-4 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-700/80 pt-3">
                        <span>
                          <span className="text-slate-400 dark:text-slate-500">Opened </span>
                          {formatShortDate(signal.created_at)}
                        </span>
                        <span>
                          <span className="text-slate-400 dark:text-slate-500">Closed </span>
                          {formatShortDate(signal.closed_at)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>

                {/* Desktop: full table */}
                <div className="hidden lg:block overflow-x-auto -mx-px">
                  <table className="w-full min-w-[960px]">
                    <thead>
                      <tr className="bg-slate-100 dark:bg-slate-900/70">
                        <th className="text-left px-4 xl:px-6 py-3 xl:py-4 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                          Asset
                        </th>
                        <th className="text-left px-4 xl:px-6 py-3 xl:py-4 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                          Dir
                        </th>
                        <th className="text-left px-4 xl:px-6 py-3 xl:py-4 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                          Type
                        </th>
                        <th className="text-right px-4 xl:px-6 py-3 xl:py-4 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                          Entry
                        </th>
                        <th className="text-right px-4 xl:px-6 py-3 xl:py-4 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                          SL
                        </th>
                        <th className="text-right px-4 xl:px-6 py-3 xl:py-4 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                          TP
                        </th>
                        <th className="text-center px-4 xl:px-6 py-3 xl:py-4 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                          Conf
                        </th>
                        <th className="text-center px-4 xl:px-6 py-3 xl:py-4 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                          Outcome
                        </th>
                        <th className="text-center px-4 xl:px-6 py-3 xl:py-4 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                          Trigger
                        </th>
                        <th className="text-center px-4 xl:px-6 py-3 xl:py-4 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                          Opened
                        </th>
                        <th className="text-left px-4 xl:px-6 py-3 xl:py-4 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                          Closed
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                      {signals.map((signal) => (
                        <tr
                          key={signal.id}
                          className="hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors"
                        >
                          <td className="px-4 xl:px-6 py-3 xl:py-4">
                            <div>
                              <div className="font-semibold text-slate-900 dark:text-white text-sm">
                                {signal.mt5_symbol || signal.symbol}
                              </div>
                              <div className="text-xs text-slate-600 dark:text-slate-500 font-mono">
                                {signal.symbol}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 xl:px-6 py-3 xl:py-4 whitespace-nowrap">
                            {signal.direction === 'BUY' ? (
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-emerald-400 rounded-full shrink-0" />
                                <span className="text-emerald-600 dark:text-emerald-400 font-semibold text-sm">
                                  BUY
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-red-400 rounded-full shrink-0" />
                                <span className="text-red-600 dark:text-red-400 font-semibold text-sm">
                                  SELL
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="px-4 xl:px-6 py-3 xl:py-4 max-w-[120px]">
                            <span className="text-sm text-slate-700 dark:text-slate-300 line-clamp-2">
                              {signal.order_type || 'Market'}
                            </span>
                          </td>
                          <td className="px-4 xl:px-6 py-3 xl:py-4 text-right whitespace-nowrap">
                            <span className="font-mono text-slate-900 dark:text-white text-sm">
                              {signal.entry_price.toFixed(5)}
                            </span>
                          </td>
                          <td className="px-4 xl:px-6 py-3 xl:py-4 text-right whitespace-nowrap">
                            <span className="font-mono text-red-600 dark:text-red-400 text-sm">
                              {signal.stop_loss.toFixed(5)}
                            </span>
                          </td>
                          <td className="px-4 xl:px-6 py-3 xl:py-4 text-right whitespace-nowrap">
                            <span className="font-mono text-emerald-600 dark:text-emerald-400 text-sm">
                              {signal.tp1 ? signal.tp1.toFixed(5) : signal.take_profit.toFixed(5)}
                            </span>
                          </td>
                          <td className="px-4 xl:px-6 py-3 xl:py-4 text-center">
                            <span className="text-slate-700 dark:text-slate-300 text-sm font-medium tabular-nums">
                              {signal.confidence_percentage || signal.confidence}%
                            </span>
                          </td>
                          <td className="px-4 xl:px-6 py-3 xl:py-4 text-center">
                            {getOutcomeBadge(signal.outcome)}
                          </td>
                          <td className="px-4 xl:px-6 py-3 xl:py-4 text-center">
                            <span className="text-sm text-slate-700 dark:text-slate-300 whitespace-nowrap">
                              {signal.trigger_count == null ? '—' : signal.trigger_count}
                            </span>
                          </td>
                          <td className="px-4 xl:px-6 py-3 xl:py-4 text-center">
                            <span className="text-sm text-slate-700 dark:text-slate-300 whitespace-nowrap">
                              {signal.created_at
                                ? new Date(signal.created_at).toLocaleString(undefined, {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })
                                : '—'}
                            </span>
                          </td>
                          <td className="px-4 xl:px-6 py-3 xl:py-4">
                            <span className="text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap">
                              {signal.closed_at
                                ? new Date(signal.closed_at).toLocaleString(undefined, {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })
                                : '—'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
