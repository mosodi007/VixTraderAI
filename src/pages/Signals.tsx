import { useState, useEffect, useRef, useCallback } from 'react';
import { DashboardLayout } from '../components/DashboardLayout';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { TrendingUp, TrendingDown, Clock, Target, Shield, Activity } from 'lucide-react';
import { SignalModal } from '../components/SignalModal';
import { DERIV_MT5_CREATE_URL } from '../constants/deriv';

interface Signal {
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
  created_at: string;
  is_active?: boolean;
  outcome?: string | null;
}

interface GroupedSignals {
  [key: string]: Signal[];
}

interface AnalysisLogEntry {
  timestamp: string;
  symbol: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

function LiveAnalysisConsoleInline() {
  const [, setResults] = useState<any | null>(null);
  const [logs, setLogs] = useState<AnalysisLogEntry[]>([]);
  const [nextScanTime, setNextScanTime] = useState<string | null>(null);
  const [timeUntilScan, setTimeUntilScan] = useState<string>('');
  const [autoScanEnabled] = useState<boolean>(true);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const hasRunInitialScan = useRef(false);

  const addLog = (symbol: string, message: string, type: AnalysisLogEntry['type'] = 'info') => {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
    setLogs((prev) => [...prev, { timestamp, symbol, type, message }]);
  };

  const fetchSchedule = async () => {
    try {
      const { data } = await supabase
        .from('scan_schedule')
        .select('next_scan_at, scan_interval_minutes')
        .eq('id', '00000000-0000-0000-0000-000000000001')
        .maybeSingle();

      if (data?.next_scan_at) {
        setNextScanTime(data.next_scan_at);
      }
    } catch (error) {
      console.error('[LIVE ANALYSIS] Failed to fetch schedule', error);
    }
  };

  const updateCountdown = () => {
    if (!nextScanTime) return;
    const now = new Date();
    const next = new Date(nextScanTime);
    const diff = next.getTime() - now.getTime();

    if (diff <= 0) {
      setTimeUntilScan('Scanning now...');
      if (autoScanEnabled && !isAnalyzing) {
        runAnalysis();
      }
      fetchSchedule();
    } else {
      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setTimeUntilScan(`${minutes}m ${seconds}s`);
    }
  };

  useEffect(() => {
    fetchSchedule();
    const interval = setInterval(fetchSchedule, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [nextScanTime, autoScanEnabled, isAnalyzing]);

  useEffect(() => {
    if (hasRunInitialScan.current) return;
    hasRunInitialScan.current = true;
    const t = setTimeout(() => runAnalysis(), 800);
    return () => clearTimeout(t);
  }, []);

  const runAnalysis = async () => {
    setIsAnalyzing(true);
    setLogs([]);
    setResults(null);

    addLog('SYSTEM', 'Starting automated signal analysis...', 'info');

    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        addLog('SYSTEM', 'Not authenticated. Please log in.', 'error');
        setIsAnalyzing(false);
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auto-generate-signals`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          }
        }
      );

      const data = await response.json();

      if (data.success) {
        addLog('SYSTEM', `Analysis complete! Found ${data.stats?.signals_generated ?? 0} signals`, 'success');
        setResults(data);

        if (Array.isArray(data.results)) {
          data.results.forEach((result: any) => {
            if (result.signalGenerated) {
              addLog(result.symbol, `✅ SIGNAL: ${result.direction} - ${result.confidence}% confidence`, 'success');
            } else {
              addLog(result.symbol, `❌ ${result.reason}`, 'warning');
            }
          });
        }

        if (Array.isArray(data.generatedSignals) && data.generatedSignals.length > 0) {
          addLog('SYSTEM', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'info');
          data.generatedSignals.forEach((signal: any) => {
            addLog(signal.symbol, `📊 Trade Setup:`, 'success');
            addLog(signal.symbol, `   Direction: ${signal.direction}`, 'info');
            addLog(signal.symbol, `   Entry: ${signal.entry_price}`, 'info');
            addLog(signal.symbol, `   TP: ${signal.tp1 ?? signal.take_profit}`, 'info');
            addLog(signal.symbol, `   SL: ${signal.stop_loss}`, 'info');
            addLog(signal.symbol, `   R:R: ${signal.risk_reward_ratio}:1`, 'info');
            addLog(signal.symbol, `   Triggers: ${signal.trigger_count}`, 'info');
          });
        }
      } else {
        addLog('SYSTEM', `Error: ${data.error}`, 'error');
      }
    } catch (error: any) {
      addLog('SYSTEM', `Failed: ${error.message}`, 'error');
    } finally {
      setIsAnalyzing(false);
      fetchSchedule();
    }
  };

  const getLogColor = (type: AnalysisLogEntry['type']) => {
    switch (type) {
      case 'success': return 'text-emerald-600 dark:text-emerald-400';
      case 'warning': return 'text-amber-600 dark:text-amber-400';
      case 'error': return 'text-red-600 dark:text-red-400';
      default: return 'text-slate-600 dark:text-slate-400';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-black dark:text-white mb-1">Live Analysis Console</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">Watch the AI analyze markets in real-time</p>
        </div>
        <div className="flex items-center gap-4">
          {nextScanTime && (
            <div className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-3">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                <span className="text-xs text-slate-600 dark:text-slate-400">Next Analysis In</span>
              </div>
              <p className="text-lg font-bold text-black dark:text-white">{timeUntilScan}</p>
            </div>
          )}
          {/* <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoScanEnabled}
              onChange={(e) => setAutoScanEnabled(e.target.checked)}
              className="w-4 h-4 text-emerald-600 bg-slate-100 border-slate-300 rounded focus:ring-emerald-500 dark:focus:ring-emerald-600 dark:ring-offset-slate-800 focus:ring-2 dark:bg-slate-700 dark:border-slate-600"
            />
            <span className="text-sm text-slate-600 dark:text-slate-400">Auto-scan</span>
          </label> */}
          {/* <button
            onClick={runAnalysis}
            disabled={isAnalyzing}
            className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-white font-medium rounded-lg transition-colors shadow-lg"
          >
            {isAnalyzing ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                Analyzing...
              </>
            ) : (
              <>
                <Play className="w-5 h-5" />
                Run Analysis
              </>
            )}
          </button> */}
        </div>
      </div>

      {/* {results && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-2">
              <h4 className="font-semibold text-black dark:text-white">Symbols Analyzed</h4>
            </div>
            <p className="text-3xl font-bold text-black dark:text-white">{results.stats?.total_scanned ?? 0}</p>
          </div>

          <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-300 dark:border-emerald-500/30 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-2">
              <h4 className="font-semibold text-emerald-700 dark:text-emerald-300">Signals Found</h4>
            </div>
            <p className="text-3xl font-bold text-emerald-700 dark:text-emerald-300">{results.stats?.signals_generated ?? 0}</p>
          </div>
        </div>
      )} */}

      <div className="bg-slate-900 dark:bg-slate-950 border border-slate-700 rounded-xl overflow-hidden shadow-xl">
        <div className="bg-slate-800 dark:bg-slate-900 px-4 py-3 border-b border-slate-700 flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500"></div>
          <div className="w-3 h-3 rounded-full bg-amber-500"></div>
          <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
          <span className="ml-4 text-sm font-mono text-slate-400">analysis.log</span>
        </div>

        <div className="p-6 font-mono text-sm space-y-2 max-h-[600px] overflow-y-auto">
          {logs.length === 0 ? (
            <div className="text-slate-500 text-center py-12">
              <Activity className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Starting automatic analysis...</p>
              <p className="text-xs mt-2 opacity-75">
                Scans also run every 5 min in the background. Enable Auto-scan to run again when the timer hits zero.
              </p>
            </div>
          ) : (
            logs.map((log, idx) => (
              <div key={idx} className="flex gap-3 hover:bg-slate-800/50 px-2 py-1 rounded">
                <span className="text-slate-500 text-xs">{log.timestamp}</span>
                <span className="text-sky-400 font-semibold min-w-[80px]">[{log.symbol}]</span>
                <span className={getLogColor(log.type)}>{log.message}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export function Signals() {
  const { user, hasActiveSubscription, profile, tradingMode, isTrialing } = useAuth();
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSignal, setSelectedSignal] = useState<Signal | null>(null);
  const previousSignalIdsRef = useRef<Set<string>>(new Set());
  const [showLiveAnalysis, setShowLiveAnalysis] = useState(false);
  const [mt5Connected, setMt5Connected] = useState<boolean | null>(null);
  const [isVerifiedMember, setIsVerifiedMember] = useState<boolean | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<string | null>(null);
  /** True when at least one symbol has a sent/open trade (we lock that symbol to that signal in the list) */
  const [hasPerSymbolTradeLock, setHasPerSymbolTradeLock] = useState(false);

  const checkMt5Connected = async () => {
    if (!user?.id) {
      setMt5Connected(false);
      return;
    }
    const { data } = await supabase
      .from('ea_connections')
      .select('status,last_ping')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(5);

    const rows = data || [];
    const now = Date.now();
    const isConnected = rows.some((r: any) => {
      if (String(r?.status || '').toLowerCase() !== 'online') return false;
      const lastPing = r?.last_ping ? new Date(r.last_ping).getTime() : 0;
      if (!lastPing) return false;
      return now - lastPing <= 5 * 60 * 1000; // 5 minutes
    });
    setMt5Connected(isConnected);
  };

  const checkVerifiedMember = async () => {
    if (!user?.id) {
      setIsVerifiedMember(false);
      setVerificationStatus(null);
      return;
    }
    const { data } = await supabase
      .from('mt5_accounts')
      .select('verified, verification_status, account_type')
      .eq('user_id', user.id)
      .limit(10);
    const rows = (data || []) as any[];
    const liveRows = rows.filter((r) => r && (r.account_type === 'real' || r.account_type === 'live'));
    const approved = liveRows.some((r) => r.verified === true || String(r.verification_status || '').toLowerCase() === 'verified' || String(r.verification_status || '').toLowerCase() === 'approved');
    const pending = liveRows.some((r) => !approved && String(r.verification_status || '').toLowerCase() === 'pending');
    const rejected = liveRows.some((r) => String(r.verification_status || '').toLowerCase() === 'rejected');
    setIsVerifiedMember(approved);
    setVerificationStatus(approved ? 'verified' : rejected ? 'rejected' : pending ? 'pending' : null);
  };

  const loadSignals = useCallback(async () => {
    const { data } = await supabase
      .from('signals')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    const raw = data || [];
    // One row per Deriv symbol: newest active signal, unless this user has a sent/open trade on that
    // symbol — then show only that trade's signal until TP/SL/close.
    const sorted = [...raw].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    const lockedBySymbol = new Map<string, string>();
    if (user?.id) {
      const { data: openTrades } = await supabase
        .from('trades')
        .select('signal_id')
        .eq('user_id', user.id)
        .in('status', ['sent', 'open'])
        .not('signal_id', 'is', null)
        .limit(100);
      const openIds = [...new Set((openTrades || []).map((t: { signal_id: string }) => String(t.signal_id)))];
      if (openIds.length > 0) {
        const { data: symRows } = await supabase.from('signals').select('id, symbol').in('id', openIds);
        for (const row of symRows || []) {
          const sym = String((row as { symbol?: string }).symbol || '').trim();
          const id = String((row as { id?: string }).id);
          if (sym && id) lockedBySymbol.set(sym, id);
        }
      }
    }

    const seen = new Set<string>();
    const list: Signal[] = [];
    for (const s of sorted) {
      const sym = String(s.symbol || '').trim();
      if (!sym) {
        list.push(s);
        continue;
      }
      const locked = lockedBySymbol.get(sym);
      if (locked && s.id !== locked) continue;
      if (seen.has(sym)) continue;
      seen.add(sym);
      list.push(s);
    }

    setHasPerSymbolTradeLock(lockedBySymbol.size > 0);
    const prevIds = previousSignalIdsRef.current;
    const newIds = new Set(list.map((s: Signal) => s.id));
    const isSubsequentLoad = prevIds.size > 0;
    const addedSignals = isSubsequentLoad ? list.filter((s: Signal) => !prevIds.has(s.id)) : [];
    previousSignalIdsRef.current = newIds;

    if (addedSignals.length > 0) {
      if ('Notification' in window && Notification.permission === 'granted') {
        addedSignals.forEach((s: Signal) => {
          new Notification('New Trading Signal!', {
            body: `${s.direction} ${s.symbol} at ${s.entry_price}`,
            icon: '/icon.png'
          });
        });
      }
    }

    setSignals(list);
    setLoading(false);
  }, [user]);

  const monitorSignalPrices = useCallback(async () => {
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/monitor-signal-outcomes`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const result = await response.json();
        if (result.closed > 0) {
          console.log(`[PRICE MONITOR] Closed ${result.closed} signals`);
          await loadSignals();
        }
      }
    } catch (error) {
      console.error('[PRICE MONITOR] Error:', error);
    }
  }, [loadSignals]);

  useEffect(() => {
    checkMt5Connected();
    checkVerifiedMember();

    const pollInterval = setInterval(() => {
      checkMt5Connected();
      checkVerifiedMember();
    }, 30000);

    const subscription = supabase
      .channel('signals')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'signals' }, () => {
        void loadSignals();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'signals' }, (payload) => {
        const updated = payload.new as Signal & { is_active?: boolean; outcome?: string | null };
        const closedOutcomes = ['tp1_hit', 'tp2_hit', 'tp3_hit', 'sl_hit', 'expired'];
        const outcomeClosed = updated?.outcome != null && closedOutcomes.includes(String(updated.outcome).toLowerCase());
        const isClosed = updated?.is_active === false || outcomeClosed;
        if (isClosed) {
          setSignals((prev) => prev.filter((s) => s.id !== updated.id));
          return;
        }
        setSignals((prev) =>
          prev.map((signal) => (signal.id === updated.id ? (updated as Signal) : signal))
        );
      })
      .subscribe();

    const priceMonitorInterval = setInterval(() => {
      void monitorSignalPrices();
    }, 60000);

    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    return () => {
      subscription.unsubscribe();
      clearInterval(priceMonitorInterval);
      clearInterval(pollInterval);
    };
  }, [user, loadSignals, monitorSignalPrices]);

  useEffect(() => {
    void loadSignals();
    void monitorSignalPrices();
  }, [loadSignals, monitorSignalPrices]);

  const groupSignalsByDate = (signals: Signal[]): GroupedSignals => {
    const grouped: GroupedSignals = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    signals.forEach((signal) => {
      const signalDate = new Date(signal.created_at);
      signalDate.setHours(0, 0, 0, 0);

      let key: string;
      if (signalDate.getTime() === today.getTime()) {
        key = 'Today';
      } else if (signalDate.getTime() === yesterday.getTime()) {
        key = 'Yesterday';
      } else {
        key = signalDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      }

      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(signal);
    });

    return grouped;
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  // Only show signals that are still active (defensive: never show closed in Active list)
  const activeSignalsList = signals.filter((s) => s.is_active !== false);
  const groupedSignals = groupSignalsByDate(activeSignalsList);

  const trialEndsAt = profile?.trial_ends_at ? new Date(profile.trial_ends_at) : null;
  const trialDaysLeft = trialEndsAt
    ? Math.max(0, Math.ceil((trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  const canAccessSignals = hasActiveSubscription || isTrialing;

  return (
    <ProtectedRoute>
      <DashboardLayout currentPage="signals">
        <div className="max-w-7xl mx-auto space-y-6">
          <div>
            <h2 className="text-3xl font-bold text-black dark:text-white mb-2">Trading Signals</h2>
            <p className="text-slate-600 dark:text-slate-400">AI-powered Volatility Index trading signals will appear here</p>
          </div>

          {/* Trial Banner for trialing users */}
          {isTrialing && !hasActiveSubscription && trialEndsAt && (
            <div className="bg-gradient-to-br from-emerald-800 to-emerald-900 rounded-2xl p-6 border border-emerald-700">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <h3 className="text-lg font-bold text-white mb-1">Your Trial Will Expire On {trialEndsAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</h3>
                  <p className="text-emerald-200 text-sm">
                    {trialDaysLeft === 0 ? 'Expires today' : `${trialDaysLeft} day${trialDaysLeft !== 1 ? 's' : ''} remaining`} - Upgrade now to continue accessing premium signals
                  </p>
                </div>
                <a
                  href="#pricing"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white hover:bg-slate-100 text-emerald-900 font-semibold rounded-lg transition-all shadow-lg"
                >
                  Upgrade Now
                </a>
              </div>
            </div>
          )}

          {/* Gate for inactive users */}
          {!canAccessSignals && (
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-8 text-center border border-slate-700">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-500/10 rounded-full mb-4">
                <Shield className="w-8 h-8 text-emerald-500" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">
                {profile?.subscription_status === 'inactive' ? 'Start Your Free Trial' : 'Trial Expired'}
              </h3>
              <p className="text-slate-300 mb-6">
                {profile?.subscription_status === 'inactive'
                  ? `Connect your ${tradingMode === 'live' ? 'Live' : 'Demo'} MT5 account to activate your 3-day free trial and start receiving signals.`
                  : 'Your free trial has ended. Subscribe to continue receiving trading signals.'}
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                {profile?.subscription_status === 'inactive' ? (
                  <a
                    href="#settings"
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-semibold rounded-lg transition-all shadow-lg"
                  >
                    Connect MT5 & Start Trial
                  </a>
                ) : (
                  <a
                    href="#pricing"
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-semibold rounded-lg transition-all shadow-lg"
                  >
                    View Pricing Plans
                  </a>
                )}
              </div>
            </div>
          )}

          {canAccessSignals && (
            <button
              type="button"
              onClick={() => setShowLiveAnalysis((prev) => !prev)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm font-medium text-slate-700 dark:text-slate-200 hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
            >
              <Activity className="w-4 h-4" />
              {showLiveAnalysis ? 'Hide Live Analysis Console' : 'Show Live Analysis Console'}
            </button>
          )}

          {canAccessSignals && (
            <div className="bg-slate-50 dark:bg-slate-800/50 backdrop-blur-sm border border-slate-300 dark:border-slate-700 rounded-2xl overflow-hidden shadow-lg dark:shadow-none">
              <div className="p-6 border-b border-slate-300 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-black dark:text-white">Active Signals</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400">{activeSignalsList.length} Signal{activeSignalsList.length !== 1 ? 's' : ''} Available</p>
                    {hasPerSymbolTradeLock && (
                      <p className="text-xs text-emerald-700 dark:text-emerald-400/90 mt-2 max-w-xl">
                        One active signal per symbol: symbols with a sent/open trade show that position until
                        TP/SL. Other symbols still show their latest signal.
                      </p>
                    )}
                  </div>
                  
                </div>
              </div>

              {loading ? (
                <div className="flex items-center justify-center h-64">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
                </div>
              ) : activeSignalsList.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="w-16 h-16 bg-emerald-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Activity className="w-8 h-8 text-emerald-600 dark:text-emerald-400 animate-pulse" />
                  </div>
                  <h3 className="text-xl font-bold text-black dark:text-white mb-2">AI is looking for trading opportunities...</h3>
                  <p className="text-slate-600 dark:text-slate-400">
                    New signals will appear here automatically when high-probability setups are detected
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-700">
                  {Object.entries(groupedSignals).map(([dateLabel, dateSignals]) => (
                    <div key={dateLabel} className="p-6">
                      <div className="flex items-center gap-2 mb-4">
                        <Clock className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{dateLabel}</h4>
                      </div>
                      <div className="space-y-3">
                        {dateSignals.map((signal) => (
                          <div
                            key={signal.id}
                            onClick={() => setSelectedSignal(signal)}
                            className="group bg-slate-50 dark:bg-slate-900/30 hover:bg-slate-100 dark:hover:bg-slate-900/50 border border-slate-300 dark:border-slate-700/50 hover:border-slate-300 dark:hover:border-slate-600 rounded-xl p-4 transition-all shadow-sm hover:shadow-md dark:shadow-none cursor-pointer"
                          >
                            <div className="flex flex-wrap items-center gap-3 text-sm">
                              <div className="flex items-center gap-2 min-w-[80px]">
                                <Clock className="w-4 h-4 text-slate-500" />
                                <span className="font-semibold text-black dark:text-white">{formatTime(signal.created_at)}</span>
                              </div>

                              <div className="h-4 w-px bg-slate-200 dark:bg-slate-700"></div>

                              <div className="min-w-[180px]">
                                <span className="font-semibold text-cyan-600 dark:text-cyan-400">{signal.mt5_symbol || signal.symbol}</span>
                              </div>

                              <div className="h-4 w-px bg-slate-200 dark:bg-slate-700"></div>

                              {signal.direction === 'BUY' ? (
                                <div className="flex items-center gap-2 min-w-[60px]">
                                  <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                                  <span className="font-bold text-emerald-600 dark:text-emerald-400">BUY</span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 min-w-[60px]">
                                  <TrendingDown className="w-4 h-4 text-red-600 dark:text-red-400" />
                                  <span className="font-bold text-red-600 dark:text-red-400">SELL</span>
                                </div>
                              )}

                              <div className="h-4 w-px bg-slate-200 dark:bg-slate-700"></div>

                              <div className="flex items-center gap-2">
                                <span className="text-slate-600 dark:text-slate-400">Entry:</span>
                                <span className="font-mono font-semibold text-black dark:text-white">{signal.entry_price.toFixed(2)}</span>
                              </div>

                              <div className="h-4 w-px bg-slate-200 dark:bg-slate-700"></div>

                              <div className="flex items-center gap-2">
                                <Target className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                                <span className="text-slate-600 dark:text-slate-400">TP:</span>
                                <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                                  {signal.tp1 ? signal.tp1.toFixed(2) : signal.take_profit.toFixed(2)}
                                </span>
                              </div>

                              <div className="h-4 w-px bg-slate-200 dark:bg-slate-700"></div>

                              <div className="flex items-center gap-2">
                                <Shield className="w-4 h-4 text-red-600 dark:text-red-400" />
                                <span className="text-slate-600 dark:text-slate-400">SL:</span>
                                <span className="font-mono font-semibold text-red-600 dark:text-red-400">{signal.stop_loss.toFixed(2)}</span>
                              </div>

                              <div className="ml-auto">
                                <span className="inline-flex items-center px-3 py-1 bg-emerald-600/20 text-emerald-600 dark:text-emerald-400 rounded-full text-xs font-bold">
                                  {signal.confidence_percentage || signal.confidence}% Confidence
                                </span>
                              </div>
                            </div>

                            {/* {(signal.tp2 || signal.tp3) && (
                              <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-300 dark:border-slate-700/50 flex items-center gap-4 text-xs">
                                <span className="text-slate-500">Additional Targets:</span>
                                {signal.tp2 && (
                                  <div className="flex items-center gap-1">
                                    <span className="text-slate-600 dark:text-slate-400">TP2:</span>
                                    <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">{signal.tp2.toFixed(2)}</span>
                                  </div>
                                )}
                                {signal.tp3 && (
                                  <div className="flex items-center gap-1">
                                    <span className="text-slate-600 dark:text-slate-400">TP3:</span>
                                    <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">{signal.tp3.toFixed(2)}</span>
                                  </div>
                                )}
                              </div>
                            )} */}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {showLiveAnalysis && <LiveAnalysisConsoleInline />}
        </div>

        {selectedSignal && (
          <SignalModal
            signal={selectedSignal}
            onClose={() => setSelectedSignal(null)}
          />
        )}
      </DashboardLayout>
    </ProtectedRoute>
  );
}
