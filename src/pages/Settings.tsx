import { useState, useEffect } from 'react';
import { DashboardLayout } from '../components/DashboardLayout';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Save, AlertCircle, CheckCircle, BarChart3 } from 'lucide-react';
import { DERIV_MT5_CREATE_URL } from '../constants/deriv';

// Keep in sync with `supabase/functions/auto-generate-signals/index.ts` monitored symbols.
const SYMBOLS = ['R_25', 'R_50', 'R_75', 'R_100', '1HZ10V', '1HZ30V', '1HZ75V', '1HZ100V'] as const;
// Only trade/configure this symbol for now.
const ACTIVE_LOTS_SYMBOL = '1HZ30V' as (typeof SYMBOLS)[number];

const SYMBOL_NAMES: Record<(typeof SYMBOLS)[number], string> = {
  'R_25': 'Volatility 25 Index',
  'R_50': 'Volatility 50 Index',
  'R_75': 'Volatility 75 Index',
  'R_100': 'Volatility 100 Index',
  '1HZ10V': 'Volatility 10 (1s) Index',
  '1HZ30V': 'Volatility 30 (1s) Index',
  '1HZ75V': 'Volatility 75 (1s) Index',
  '1HZ100V': 'Volatility 100 (1s) Index',
};

// Per-symbol lot constraints (Deriv MT5). EA still enforces broker min/max/step at execution time.
const SYMBOL_MIN_LOT: Record<(typeof SYMBOLS)[number], number> = {
  'R_25': 0.5,
  'R_50': 4,
  'R_75': 0.001,
  'R_100': 1,
  '1HZ10V': 0.5,
  '1HZ30V': 0.2,
  '1HZ75V': 0.05,
  '1HZ100V': 1,
};

const SYMBOL_MAX_LOT: Record<(typeof SYMBOLS)[number], number> = {
  'R_25': 400,
  'R_50': 3700,
  'R_75': 50,
  'R_100': 220,
  '1HZ10V': 400,
  '1HZ30V': 120,
  '1HZ75V': 80,
  '1HZ100V': 330,
};

const SYMBOL_LOT_STEP: Record<(typeof SYMBOLS)[number], number> = {
  'R_25': 0.01,
  'R_50': 0.01,
  'R_75': 0.001,
  'R_100': 0.01,
  '1HZ10V': 0.01,
  '1HZ30V': 0.01,
  '1HZ75V': 0.01,
  '1HZ100V': 0.01,
};

/** Maps UI account type to Deriv MT5 server (required for verification API). */
const MT5_PRODUCT_TO_SERVER: Record<string, string> = {
  MT5_STD: 'Deriv-Server',
  MT5_SWF: 'Deriv-Server-02',
  MT5_ZRS: 'Deriv-Server-03',
};

const SERVER_TO_MT5_PRODUCT = (server: string): string => {
  const s = String(server || '').trim();
  if (s === 'Deriv-Server-02') return 'MT5_SWF';
  if (s === 'Deriv-Server-03') return 'MT5_ZRS';
  if (s === 'Deriv-Server' || s.startsWith('Deriv-Server')) return 'MT5_STD';
  return 'MT5_STD';
};

/** TP points = 3× SL points (1:3 R:R). */
const DEFAULT_POINTS: Record<string, { slPoints: number; tpPoints: number }> = {
  R_10: { slPoints: 8000, tpPoints: 24000 },
  R_50: { slPoints: 8000, tpPoints: 24000 },
  R_100: { slPoints: 800, tpPoints: 2400 },
  '1HZ10V': { slPoints: 800, tpPoints: 2400 },
  '1HZ30V': { slPoints: 40000, tpPoints: 120000 },
  '1HZ75V': { slPoints: 40000, tpPoints: 120000 },
  '1HZ50V': { slPoints: 400000, tpPoints: 1200000 },
  '1HZ90V': { slPoints: 200000, tpPoints: 600000 },
  '1HZ100V': { slPoints: 4000, tpPoints: 12000 },
  stpRNG: { slPoints: 80, tpPoints: 240 },
  JD25: { slPoints: 80000, tpPoints: 240000 },
  STPIDX: { slPoints: 80, tpPoints: 240 },
};

function isLiveMt5Row(a: { account_type?: string }) {
  return a.account_type === 'real' || a.account_type === 'live';
}

/** MT5 login/server are editable only until the account is approved. */
function isMt5AccountApproved(a: { verified?: boolean; verification_status?: string } | null): boolean {
  if (!a) return false;
  if (a.verified === true) return true;
  const s = String(a.verification_status || '').toLowerCase();
  return s === 'verified' || s === 'approved';
}

function formatMt5SaveError(err: { code?: string; message?: string } | null | undefined): string {
  if (!err) return 'Something went wrong';
  if (err.code === '23505') return 'MT5 login already exists';
  const msg = String(err.message || '');
  if (/duplicate key|unique constraint/i.test(msg) && /mt5_login/i.test(msg)) {
    return 'MT5 login already exists';
  }
  return msg || 'Something went wrong';
}

export function Settings() {
  const { user, tradingMode } = useAuth();
  const [demoAccount, setDemoAccount] = useState<any>(null);
  const [liveAccount, setLiveAccount] = useState<any>(null);
  const [demoLogin, setDemoLogin] = useState('');
  const [liveLogin, setLiveLogin] = useState('');
  const [liveProduct, setLiveProduct] = useState('MT5_STD');
  const [demoLoading, setDemoLoading] = useState(false);
  const [liveLoading, setLiveLoading] = useState(false);
  const [demoMessage, setDemoMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [liveMessage, setLiveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [symbolPoints, setSymbolPoints] = useState<Record<string, { slPoints: number; tpPoints: number }>>({});
  const [pointsLoading, setPointsLoading] = useState(false);
  const [pointsMessage, setPointsMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  type LotMode = 'fixed' | 'percent_balance';
  type SymbolTradeSettings = {
    tradeEnabled: boolean;
    lotMode: LotMode;
    fixedLot: number;
    percent: number;
  };

  const [mt5Accounts, setMt5Accounts] = useState<any[]>([]);
  const [selectedMt5Login, setSelectedMt5Login] = useState<string>('');
  const [symbolTradeSettings, setSymbolTradeSettings] = useState<Record<string, SymbolTradeSettings>>({});
  const [tradeSettingsLoading, setTradeSettingsLoading] = useState(false);
  const [tradeSettingsMessage, setTradeSettingsMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [minAiConfidencePercent, setMinAiConfidencePercent] = useState<number>(50);
  const [minAiConfidenceLoading, setMinAiConfidenceLoading] = useState(false);
  const [minAiConfidenceMessage, setMinAiConfidenceMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [emailSignalsEnabled, setEmailSignalsEnabled] = useState(false);
  const [emailSignalsLoading, setEmailSignalsLoading] = useState(false);
  const [emailSignalsMessage, setEmailSignalsMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadDemoAndLiveAccounts();
    loadMt5Accounts();
    loadSymbolPoints();
    loadMinAiConfidence();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    if (!selectedMt5Login) return;
    loadSymbolTradeSettings(selectedMt5Login);
  }, [user, selectedMt5Login]);

  const loadDemoAndLiveAccounts = async () => {
    if (!user) return;
    const { data: all } = await supabase
      .from('mt5_accounts')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });
    const rows = all || [];
    let d = rows.find((r: any) => r.account_type === 'demo') ?? null;
    const l =
      rows.find((r: any) => r.account_type === 'real' || r.account_type === 'live') ?? null;

    // Demo accounts are auto-approved (no manual verification required)
    if (d && !isMt5AccountApproved(d)) {
      const nowIso = new Date().toISOString();
      const { data: updated } = await supabase
        .from('mt5_accounts')
        .update({
          verification_status: 'verified',
          verified: true,
          verified_at: nowIso,
          rejected_reason: null,
        })
        .eq('id', d.id)
        .select('*')
        .maybeSingle();
      if (updated) d = updated as any;
    }

    setDemoAccount(d);
    setLiveAccount(l);
    setDemoLogin(d?.mt5_login ?? '');
    setLiveLogin(l?.mt5_login ?? '');
    setLiveProduct(l ? SERVER_TO_MT5_PRODUCT(String(l.server || 'Deriv-Server')) : 'MT5_STD');
  };

  const loadMt5Accounts = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('mt5_accounts')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    setMt5Accounts(data || []);
  };

  const loadMinAiConfidence = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('profiles')
      .select('ai_min_confidence_percent,email_signals_enabled')
      .eq('id', user.id)
      .maybeSingle();
    if (error) return;
    const v = Number((data as any)?.ai_min_confidence_percent);
    if (Number.isFinite(v)) setMinAiConfidencePercent(Math.max(0, Math.min(100, Math.round(v))));
    setEmailSignalsEnabled((data as any)?.email_signals_enabled === true);
  };

  const handleSaveEmailSignals = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setEmailSignalsLoading(true);
    setEmailSignalsMessage(null);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          email_signals_enabled: emailSignalsEnabled,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);
      if (error) throw error;
      setEmailSignalsMessage({
        type: 'success',
        text: emailSignalsEnabled ? 'Email signals enabled.' : 'Email signals disabled.',
      });
    } catch (error: any) {
      setEmailSignalsMessage({ type: 'error', text: error.message || 'Failed to save email signal setting' });
    } finally {
      setEmailSignalsLoading(false);
    }
  };

  const accountsForMode = mt5Accounts.filter((a) =>
    tradingMode === 'demo' ? a.account_type === 'demo' : isLiveMt5Row(a),
  );

  useEffect(() => {
    const list = accountsForMode;
    if (list.length === 0) {
      setSelectedMt5Login('');
      return;
    }
    const ok = list.some((a) => String(a.mt5_login) === selectedMt5Login);
    if (!ok) setSelectedMt5Login(String(list[0].mt5_login || ''));
  }, [tradingMode, mt5Accounts]);

  const loadSymbolPoints = async () => {
    const { data } = await supabase.from('symbol_sl_tp_config').select('symbol, sl_points, tp_points');
    const next: Record<string, { slPoints: number; tpPoints: number }> = {};
    SYMBOLS.forEach((sym) => {
      next[sym] = DEFAULT_POINTS[sym] ?? { slPoints: 800, tpPoints: 2400 };
    });
    if (data?.length) {
      data.forEach((row: { symbol: string; sl_points: number; tp_points: number }) => {
        const sl = Math.max(1, Math.round(Number(row.sl_points) || next[row.symbol]?.slPoints || 400));
        next[row.symbol] = { slPoints: sl, tpPoints: sl * 3 };
      });
    }
    setSymbolPoints(next);
  };

  const loadSymbolTradeSettings = async (mt5_login: string) => {
    if (!user) return;
    setTradeSettingsMessage(null);

    const base: Record<string, SymbolTradeSettings> = {};
    SYMBOLS.forEach((sym) => {
      base[sym] = { tradeEnabled: true, lotMode: 'fixed', fixedLot: SYMBOL_MIN_LOT[sym] ?? 0.01, percent: 0 };
    });

    const { data, error } = await supabase
      .from('mt5_symbol_settings')
      .select('symbol, trade_enabled, lot_mode, fixed_lot, percent')
      .eq('user_id', user.id)
      .eq('mt5_login', mt5_login);

    if (error) {
      setTradeSettingsMessage({ type: 'error', text: error.message || 'Failed to load per-symbol trading settings' });
      setSymbolTradeSettings(base);
      return;
    }

    const next = { ...base };
    (data || []).forEach((row: any) => {
      const sym = String(row.symbol || '');
      if (!sym) return;
      const symKey = sym as (typeof SYMBOLS)[number];
      const minLot = SYMBOL_MIN_LOT[symKey] ?? 0;
      const maxLot = SYMBOL_MAX_LOT[symKey] ?? Number.POSITIVE_INFINITY;
      next[sym] = {
        tradeEnabled: row.trade_enabled !== false,
        lotMode: (row.lot_mode === 'percent_balance' ? 'percent_balance' : 'fixed') as LotMode,
        fixedLot: Math.min(maxLot, Math.max(minLot, Number(row.fixed_lot) || minLot || 0.01)),
        percent: Math.max(0, Math.min(100, Number(row.percent) || 0)),
      };
    });
    setSymbolTradeSettings(next);
  };

  const setPointsForSymbol = (symbol: string, value: number) => {
    const sl = Math.max(1, Math.round(Number(value)) || 1);
    setSymbolPoints((prev) => ({
      ...prev,
      [symbol]: {
        ...(prev[symbol] ?? DEFAULT_POINTS[symbol] ?? { slPoints: 400, tpPoints: 1200 }),
        slPoints: sl,
        tpPoints: sl * 3,
      },
    }));
  };

  const setTradeSettingForSymbol = (symbol: string, patch: Partial<SymbolTradeSettings>) => {
    setSymbolTradeSettings((prev) => ({
      ...prev,
      [symbol]: {
        ...(prev[symbol] ?? { tradeEnabled: true, lotMode: 'fixed', fixedLot: 0.01, percent: 0 }),
        ...patch,
      },
    }));
  };

  const handleSaveSymbolPoints = async (e: React.FormEvent) => {
    e.preventDefault();
    setPointsLoading(true);
    setPointsMessage(null);

    try {
      for (const symbol of SYMBOLS) {
        const pts = symbolPoints[symbol] ?? DEFAULT_POINTS[symbol] ?? { slPoints: 400, tpPoints: 1200 };
        const sl = Math.max(1, Math.round(Number(pts.slPoints)) || 400);
        const tp = sl * 3;

        const { error } = await supabase
          .from('symbol_sl_tp_config')
          .upsert(
            { symbol, sl_points: sl, tp_points: tp, updated_at: new Date().toISOString() },
            { onConflict: 'symbol' }
          );

        if (error) throw error;
      }

      setPointsMessage({
        type: 'success',
        text: 'SL points saved. TP is always 3× SL (1:3 R:R). New signals use these distances.',
      });
    } catch (error: any) {
      setPointsMessage({ type: 'error', text: error.message || 'Failed to save symbol points' });
    } finally {
      setPointsLoading(false);
    }
  };

  const handleSaveSymbolTradeSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setTradeSettingsMessage({ type: 'error', text: 'Not authenticated' });
      return;
    }
    if (!selectedMt5Login) {
      setTradeSettingsMessage({ type: 'error', text: 'Select an MT5 login first' });
      return;
    }

    setTradeSettingsLoading(true);
    setTradeSettingsMessage(null);

    try {
      for (const symbol of [ACTIVE_LOTS_SYMBOL]) {
        const s = symbolTradeSettings[symbol] ?? { tradeEnabled: true, lotMode: 'fixed' as LotMode, fixedLot: 0.01, percent: 0 };
        const trade_enabled = !!s.tradeEnabled;
        const lot_mode: LotMode = s.lotMode === 'percent_balance' ? 'percent_balance' : 'fixed';
        const minLot = SYMBOL_MIN_LOT[symbol] ?? 0;
        const maxLot = SYMBOL_MAX_LOT[symbol] ?? Number.POSITIVE_INFINITY;
        const step = SYMBOL_LOT_STEP[symbol] ?? 0.01;
        const decimals = step === 0.001 ? 3 : 2;
        const factor = Math.pow(10, decimals);
        const fixed_lot_raw = Math.round(Math.max(0, Number(s.fixedLot) || 0) * factor) / factor;
        const fixed_lot = Math.min(maxLot, Math.max(minLot, fixed_lot_raw));
        const percent = Math.round(Math.max(0, Math.min(100, Number(s.percent) || 0)) * 100) / 100;

        const { error } = await supabase
          .from('mt5_symbol_settings')
          .upsert(
            {
              user_id: user.id,
              mt5_login: selectedMt5Login,
              symbol,
              trade_enabled,
              lot_mode,
              fixed_lot: fixed_lot || 0,
              percent: lot_mode === 'percent_balance' ? percent : 0,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id,mt5_login,symbol' }
          );
        if (error) throw error;
      }

      setTradeSettingsMessage({ type: 'success', text: 'Trading lots settings saved.' });
    } catch (error: any) {
      setTradeSettingsMessage({ type: 'error', text: error.message || 'Failed to save trading lots settings' });
    } finally {
      setTradeSettingsLoading(false);
    }
  };

  const handleSaveMinAiConfidence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setMinAiConfidenceMessage({ type: 'error', text: 'Not authenticated' });
      return;
    }
    const next = Math.max(0, Math.min(100, Math.round(Number(minAiConfidencePercent) || 0)));
    setMinAiConfidenceLoading(true);
    setMinAiConfidenceMessage(null);
    const { error } = await supabase
      .from('profiles')
      .update({ ai_min_confidence_percent: next })
      .eq('id', user.id);
    if (error) {
      setMinAiConfidenceMessage({ type: 'error', text: error.message || 'Failed to save setting' });
    } else {
      setMinAiConfidencePercent(next);
      setMinAiConfidenceMessage({ type: 'success', text: 'Minimum AI confidence saved.' });
    }
    setMinAiConfidenceLoading(false);
  };

  const ensureProfile = async () => {
    if (!user) return;
    await supabase
      .from('profiles')
      .upsert(
        { id: user.id, email: user.email ?? '', updated_at: new Date().toISOString() },
        { onConflict: 'id' }
      );
  };

  const handleDemoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setDemoLoading(true);
    setDemoMessage(null);
    try {
      await ensureProfile();
      const nowIso = new Date().toISOString();
      if (demoAccount) {
        if (isMt5AccountApproved(demoAccount)) {
          setDemoMessage({ type: 'error', text: 'Approved demo account cannot be changed here. Contact support if needed.' });
          return;
        }
        const { error } = await supabase
          .from('mt5_accounts')
          .update({
            mt5_login: demoLogin.trim(),
            server: 'Deriv-Demo',
            account_type: 'demo',
            verification_status: 'verified',
            verified: true,
            verified_at: nowIso,
            rejected_reason: null,
          })
          .eq('id', demoAccount.id);
        if (error) {
          setDemoMessage({ type: 'error', text: formatMt5SaveError(error) });
          return;
        }
        setDemoMessage({ type: 'success', text: 'Demo MT5 connected.' });
      } else {
        const { error } = await supabase.from('mt5_accounts').insert({
          user_id: user.id,
          mt5_login: demoLogin.trim(),
          server: 'Deriv-Demo',
          account_type: 'demo',
          verification_status: 'verified',
          verified: true,
          verified_at: nowIso,
          rejected_reason: null,
        });
        if (error) {
          setDemoMessage({ type: 'error', text: formatMt5SaveError(error) });
          return;
        }
        setDemoMessage({ type: 'success', text: 'Demo MT5 connected.' });
      }
      await loadDemoAndLiveAccounts();
      await loadMt5Accounts();
    } catch (err: any) {
      setDemoMessage({ type: 'error', text: formatMt5SaveError(err) || err.message || 'Failed to save demo account' });
    } finally {
      setDemoLoading(false);
    }
  };

  const handleLiveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLiveLoading(true);
    setLiveMessage(null);
    try {
      await ensureProfile();
      const server = MT5_PRODUCT_TO_SERVER[liveProduct] || 'Deriv-Server';
      if (liveAccount) {
        if (isMt5AccountApproved(liveAccount)) {
          setLiveMessage({ type: 'error', text: 'Approved live account cannot be changed here. Contact support if needed.' });
          return;
        }
        const { error } = await supabase
          .from('mt5_accounts')
          .update({
            mt5_login: liveLogin.trim(),
            server,
            account_type: 'real',
            verification_status: 'pending',
            verified: false,
            verified_at: null,
            rejected_reason: null,
          })
          .eq('id', liveAccount.id);
        if (error) {
          setLiveMessage({ type: 'error', text: formatMt5SaveError(error) });
          return;
        }
        setLiveMessage({ type: 'success', text: 'Live MT5 account updated.' });
      } else {
        const { error } = await supabase.from('mt5_accounts').insert({
          user_id: user.id,
          mt5_login: liveLogin.trim(),
          server,
          account_type: 'real',
        });
        if (error) {
          setLiveMessage({ type: 'error', text: formatMt5SaveError(error) });
          return;
        }
        setLiveMessage({ type: 'success', text: 'Live MT5 login submitted for verification.' });
      }
      await loadDemoAndLiveAccounts();
      await loadMt5Accounts();
    } catch (err: any) {
      setLiveMessage({ type: 'error', text: formatMt5SaveError(err) || err.message || 'Failed to save live account' });
    } finally {
      setLiveLoading(false);
    }
  };

  return (
    <ProtectedRoute>
      <DashboardLayout currentPage="settings">
        <div className="max-w-4xl mx-auto space-y-6">
          <div>
            <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Settings</h2>
            <p className="text-slate-600 dark:text-slate-400">
              {tradingMode === 'live'
                ? 'Live mode — manage your live MT5 account and preferences'
                : 'Demo mode — manage your demo MT5 account and preferences'}
            </p>
          </div>

          {/* Demo MT5 — only in Demo mode */}
          {tradingMode === 'demo' && (
          <div className="bg-white dark:bg-slate-800/50 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-2xl p-8 border-l-4 border-l-sky-500">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Demo MT5 account</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
              For practice and demo-mode features. Uses <span className="font-mono">Deriv-Demo</span>.
            </p>
            <div className="bg-emerald-600/10 border border-emerald-600/30 rounded-lg p-4 mb-6">
              <p className="text-sm text-emerald-700 dark:text-emerald-400">
                Need a demo login?{' '}
                <a
                  href={DERIV_MT5_CREATE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-medium"
                >
                  Create demo MT5 in Deriv
                </a>
              </p>
            </div>
            {demoMessage && (
              <div
                className={`flex items-center gap-3 p-4 rounded-lg mb-6 ${
                  demoMessage.type === 'success'
                    ? 'bg-emerald-500/10 border border-emerald-500/30'
                    : 'bg-red-500/10 border border-red-500/30'
                }`}
              >
                {demoMessage.type === 'success' ? (
                  <CheckCircle className="w-5 h-5 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-400" />
                )}
                <p
                  className={`text-sm ${demoMessage.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}
                >
                  {demoMessage.text}
                </p>
              </div>
            )}
            <form onSubmit={handleDemoSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Demo MT5 login number
                </label>
                <input
                  type="text"
                  value={demoLogin}
                  onChange={(e) => setDemoLogin(e.target.value)}
                  required
                  className="w-full px-4 py-3 bg-slate-200 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  placeholder="Demo MT5 login"
                  disabled={isMt5AccountApproved(demoAccount)}
                />
              </div>
              {demoAccount && isMt5AccountApproved(demoAccount) && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                  <p className="text-sm text-yellow-700 dark:text-yellow-300">
                    This demo account is approved. Contact support to change the login.
                  </p>
                </div>
              )}
              {demoAccount && !isMt5AccountApproved(demoAccount) && (
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  You can update your demo MT5 login until the account is approved.
                </p>
              )}
              <button
                type="submit"
                disabled={demoLoading || isMt5AccountApproved(demoAccount)}
                className="flex items-center gap-2 px-6 py-3 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
              >
                <Save className="w-5 h-5" />
                {demoLoading ? 'Saving...' : demoAccount ? 'Update demo account' : 'Save demo MT5 login'}
              </button>
            </form>
          </div>
          )}

          {/* Live MT5 — only in Live mode */}
          {tradingMode === 'live' && (
          <div className="bg-white dark:bg-slate-800/50 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-2xl p-8 border-l-4 border-l-emerald-600">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Live MT5 account</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
              Real-money account. Submit for verification to unlock live features.
            </p>
            {liveMessage && (
              <div
                className={`flex items-center gap-3 p-4 rounded-lg mb-6 ${
                  liveMessage.type === 'success'
                    ? 'bg-emerald-500/10 border border-emerald-500/30'
                    : 'bg-red-500/10 border border-red-500/30'
                }`}
              >
                {liveMessage.type === 'success' ? (
                  <CheckCircle className="w-5 h-5 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-400" />
                )}
                <p
                  className={`text-sm ${liveMessage.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}
                >
                  {liveMessage.text}
                </p>
              </div>
            )}
            <form onSubmit={handleLiveSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Live MT5 login number
                </label>
                <input
                  type="text"
                  value={liveLogin}
                  onChange={(e) => setLiveLogin(e.target.value)}
                  required
                  className="w-full px-4 py-3 bg-slate-200 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  placeholder="Live MT5 login"
                  disabled={isMt5AccountApproved(liveAccount)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Account type
                </label>
                <select
                  value={liveProduct}
                  onChange={(e) => setLiveProduct(e.target.value)}
                  required
                  className="w-full px-4 py-3 bg-slate-200 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  disabled={isMt5AccountApproved(liveAccount)}
                >
                  <option value="MT5_STD">Standard (MT5 STD)</option>
                  <option value="MT5_SWF">Swap-Free (MT5 SWF)</option>
                  <option value="MT5_ZRS">Zero Spread (MT5 ZRS)</option>
                </select>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-2">
                  Must match your Deriv live MT5 account type.
                </p>
              </div>
              {liveAccount && isMt5AccountApproved(liveAccount) && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                  <p className="text-sm text-yellow-700 dark:text-yellow-300">
                    This live account is approved. Contact support to change the login.
                  </p>
                </div>
              )}
              {liveAccount && !isMt5AccountApproved(liveAccount) && (
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  You can change your live MT5 login and account type until verification succeeds. After an update, verify again from your dashboard if required.
                </p>
              )}
              <button
                type="submit"
                disabled={liveLoading || isMt5AccountApproved(liveAccount)}
                className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
              >
                <Save className="w-5 h-5" />
                {liveLoading ? 'Saving...' : liveAccount ? 'Update live account' : 'Submit for verification'}
              </button>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                If your Deriv MT5 account is rejected, create a new Standard (MT5 STD), Swap-Free (MT5 SWF) or Zero Spread
                (MT5 ZRS) via{' '}
                <a
                  href={DERIV_MT5_CREATE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-600 dark:text-emerald-400 underline font-medium"
                >
                  Create Live MT5 on Deriv
                </a>{' '}
                and submit your new login here.
              </p>
            </form>
          </div>
          )}

          {/* <div className="bg-white dark:bg-slate-800/50 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-2xl p-8">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-emerald-500" />
              Symbol SL/TP Points
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
              Set Stop Loss and Take Profit in points per symbol. Each symbol has its own scale; adjust these to find what works. Used by automated signal generation.
            </p>

            {pointsMessage && (
              <div className={`flex items-center gap-3 p-4 rounded-lg mb-6 ${
                pointsMessage.type === 'success'
                  ? 'bg-emerald-500/10 border border-emerald-500/30'
                  : 'bg-red-500/10 border border-red-500/30'
              }`}>
                {pointsMessage.type === 'success' ? (
                  <CheckCircle className="w-5 h-5 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-400" />
                )}
                <p className={`text-sm ${pointsMessage.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {pointsMessage.text}
                </p>
              </div>
            )}

            <form onSubmit={handleSaveSymbolPoints} className="space-y-6">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-600">
                      <th className="py-3 px-2 text-sm font-medium text-slate-700 dark:text-slate-300">Symbol</th>
                      <th className="py-3 px-2 text-sm font-medium text-slate-700 dark:text-slate-300">SL (points)</th>
                      <th className="py-3 px-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                        TP (points){' '}
                        <span className="font-normal text-slate-500 dark:text-slate-400">= 3× SL</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {SYMBOLS.map((symbol) => {
                      const pts = symbolPoints[symbol] ?? DEFAULT_POINTS[symbol] ?? { slPoints: 800, tpPoints: 2400 };
                      return (
                        <tr key={symbol} className="border-b border-slate-100 dark:border-slate-700/50">
                          <td className="py-2 px-2 text-slate-900 dark:text-white">
                            <div className="font-mono">{symbol}</div>
                            <div className="text-xs text-slate-600 dark:text-slate-400">{SYMBOL_NAMES[symbol]}</div>
                          </td>
                          <td className="py-2 px-2">
                            <input
                              type="number"
                              min={1}
                              step={1}
                              value={pts.slPoints}
                              onChange={(e) => setPointsForSymbol(symbol, Number(e.target.value) || 1)}
                              className="w-28 px-3 py-2 bg-slate-200 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                          </td>
                          <td className="py-2 px-2 text-slate-700 dark:text-slate-300 font-mono tabular-nums">
                            {pts.slPoints * 3}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <button
                type="submit"
                disabled={pointsLoading}
                className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
              >
                <Save className="w-5 h-5" />
                {pointsLoading ? 'Saving...' : 'Save Symbol Points'}
              </button>
            </form>
          </div> */}

          <div className="bg-white dark:bg-slate-800/50 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-2xl p-8">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Trade filters</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
              This controls the minimum AI confidence the EA will trade.
            </p>

            {minAiConfidenceMessage && (
              <div className={`flex items-center gap-3 p-4 rounded-lg mb-6 ${
                minAiConfidenceMessage.type === 'success'
                  ? 'bg-emerald-500/10 border border-emerald-500/30'
                  : 'bg-red-500/10 border border-red-500/30'
              }`}>
                {minAiConfidenceMessage.type === 'success' ? (
                  <CheckCircle className="w-5 h-5 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-400" />
                )}
                <p className={`text-sm ${minAiConfidenceMessage.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {minAiConfidenceMessage.text}
                </p>
              </div>
            )}

            <form onSubmit={handleSaveMinAiConfidence} className="space-y-4">
              <div className="flex items-end gap-4 flex-wrap">
                <div className="flex-1 min-w-[260px]">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Minimum AI confidence level to trade
                  </label>
                  <input
                    type="range"
                    min={20}
                    max={100}
                    step={1}
                    value={minAiConfidencePercent}
                    onChange={(e) => setMinAiConfidencePercent(Number(e.target.value) || 0)}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mt-1">
                    <span>20%</span>
                    <span>100%</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Value (%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={minAiConfidencePercent}
                    onChange={(e) => setMinAiConfidencePercent(Number(e.target.value) || 0)}
                    className="w-28 px-4 py-3 bg-slate-200 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={minAiConfidenceLoading}
                className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
              >
                <Save className="w-5 h-5" />
                {minAiConfidenceLoading ? 'Saving...' : 'Save AI Confidence Settings'}
              </button>
            </form>

            <div className="mt-8 pt-8 border-t border-slate-200 dark:border-slate-700">
              <h4 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Email signals</h4>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                Receive email alerts when new live signals are generated.
              </p>

              {emailSignalsMessage && (
                <div className={`flex items-center gap-3 p-4 rounded-lg mb-4 ${
                  emailSignalsMessage.type === 'success'
                    ? 'bg-emerald-500/10 border border-emerald-500/30'
                    : 'bg-red-500/10 border border-red-500/30'
                }`}>
                  {emailSignalsMessage.type === 'success' ? (
                    <CheckCircle className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-red-400" />
                  )}
                  <p className={`text-sm ${emailSignalsMessage.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                    {emailSignalsMessage.text}
                  </p>
                </div>
              )}

              <form onSubmit={handleSaveEmailSignals} className="space-y-4">
                <label className="inline-flex items-center gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={emailSignalsEnabled}
                    onChange={(e) => setEmailSignalsEnabled(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-300">Enable signal emails</span>
                </label>

                <button
                  type="submit"
                  disabled={emailSignalsLoading}
                  className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
                >
                  <Save className="w-5 h-5" />
                  {emailSignalsLoading ? 'Saving...' : 'Save Email Settings'}
                </button>
              </form>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800/50 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-2xl p-8">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Trading Lots Settings</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
              Enable/disable trading per symbol and set lot sizing. Percent mode uses: <span className="font-mono">lot = (balance × percent/100) / 1000</span>.
            </p>

            {accountsForMode.length === 0 ? (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                <p className="text-sm text-yellow-700 dark:text-yellow-300">
                  {tradingMode === 'demo'
                    ? 'Add a demo MT5 account above to configure per-symbol trading settings.'
                    : 'Add a live MT5 account above to configure per-symbol trading settings.'}
                </p>
              </div>
            ) : (
              <>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    MT5 Login ({tradingMode === 'demo' ? 'Demo' : 'Live'})
                  </label>
                  <select
                    value={selectedMt5Login}
                    onChange={(e) => setSelectedMt5Login(e.target.value)}
                    className="w-full max-w-xs px-4 py-3 bg-slate-200 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  >
                    {accountsForMode.map((a) => (
                      <option key={String(a.mt5_login)} value={String(a.mt5_login)}>
                        {String(a.mt5_login)}
                      </option>
                    ))}
                  </select>
                </div>

                {tradeSettingsMessage && (
                  <div className={`flex items-center gap-3 p-4 rounded-lg mb-6 ${
                    tradeSettingsMessage.type === 'success'
                      ? 'bg-emerald-500/10 border border-emerald-500/30'
                      : 'bg-red-500/10 border border-red-500/30'
                  }`}>
                    {tradeSettingsMessage.type === 'success' ? (
                      <CheckCircle className="w-5 h-5 text-emerald-400" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-red-400" />
                    )}
                    <p className={`text-sm ${tradeSettingsMessage.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                      {tradeSettingsMessage.text}
                    </p>
                  </div>
                )}

                <form onSubmit={handleSaveSymbolTradeSettings} className="space-y-6">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-600">
                          <th className="py-3 px-2 text-sm font-medium text-slate-700 dark:text-slate-300">Symbol</th>
                          {/* <th className="py-3 px-2 text-sm font-medium text-slate-700 dark:text-slate-300">Enabled</th> */}
                          <th className="py-3 px-2 text-sm font-medium text-slate-700 dark:text-slate-300">Lot mode</th>
                          <th className="py-3 px-2 text-sm font-medium text-slate-700 dark:text-slate-300">Fixed lot</th>
                          <th className="py-3 px-2 text-sm font-medium text-slate-700 dark:text-slate-300">% balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[ACTIVE_LOTS_SYMBOL].map((symbol) => {
                          const s = symbolTradeSettings[symbol] ?? { tradeEnabled: true, lotMode: 'fixed' as LotMode, fixedLot: 0.01, percent: 0 };
                          const isPercent = s.lotMode === 'percent_balance';
                          const minLot = SYMBOL_MIN_LOT[symbol] ?? 0;
                          const maxLot = SYMBOL_MAX_LOT[symbol] ?? 1000000;
                          const lotStep = SYMBOL_LOT_STEP[symbol] ?? 0.01;
                          return (
                            <tr key={symbol} className="border-b border-slate-100 dark:border-slate-700/50">
                              <td className="py-2 px-2 text-slate-900 dark:text-white">
                                <div className="font-mono">{symbol}</div>
                                <div className="text-xs text-slate-600 dark:text-slate-400">{SYMBOL_NAMES[symbol]}</div>
                              </td>
                              {/* <td className="py-2 px-2">
                                <input
                                  type="checkbox"
                                  checked={!!s.tradeEnabled}
                                  onChange={(e) => setTradeSettingForSymbol(symbol, { tradeEnabled: e.target.checked })}
                                  className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                                />
                              </td> */}
                              <td className="py-2 px-2">
                                <select
                                  value={s.lotMode}
                                  onChange={(e) => setTradeSettingForSymbol(symbol, { lotMode: (e.target.value === 'percent_balance' ? 'percent_balance' : 'fixed') as LotMode })}
                                  className="px-3 py-2 bg-slate-200 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                >
                                  <option value="fixed">Fixed</option>
                                  <option value="percent_balance">% Balance</option>
                                </select>
                              </td>
                              <td className="py-2 px-2">
                                <input
                                  type="number"
                                  min={minLot}
                                  max={maxLot}
                                  step={lotStep}
                                  value={s.fixedLot}
                                  onChange={(e) => setTradeSettingForSymbol(symbol, { fixedLot: Number(e.target.value) || 0 })}
                                  disabled={isPercent}
                                  className="w-28 px-3 py-2 bg-slate-200 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
                                />
                                <div className="mt-1 text-[11px] text-slate-600 dark:text-slate-400">
                                  Min {minLot} / Max {maxLot}
                                </div>
                              </td>
                              <td className="py-2 px-2">
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  step={0.01}
                                  value={s.percent}
                                  onChange={(e) => setTradeSettingForSymbol(symbol, { percent: Number(e.target.value) || 0 })}
                                  disabled={!isPercent}
                                  className="w-28 px-3 py-2 bg-slate-200 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <button
                    type="submit"
                    disabled={tradeSettingsLoading}
                    className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
                  >
                    <Save className="w-5 h-5" />
                    {tradeSettingsLoading ? 'Saving...' : 'Save Lot Size Settings'}
                  </button>
                </form>
              </>
            )}
          </div>

          {((tradingMode === 'demo' && demoAccount) || (tradingMode === 'live' && liveAccount)) && (
            <div className="bg-white dark:bg-slate-800/50 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-2xl p-8">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-6">Account status</h3>
              <div className="grid gap-6 md:grid-cols-2">
                {tradingMode === 'demo' && demoAccount && (
                  <div className="rounded-xl border border-slate-200 dark:border-slate-600 p-4">
                    <p className="text-sm font-semibold text-sky-600 dark:text-sky-400 mb-3">Demo MT5</p>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-600 dark:text-slate-400">Login</span>
                        <span className="font-mono text-slate-900 dark:text-white">{demoAccount.mt5_login}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600 dark:text-slate-400">Status</span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            demoAccount.verification_status === 'verified'
                              ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                              : demoAccount.verification_status === 'rejected'
                                ? 'bg-red-500/20 text-red-600 dark:text-red-400'
                                : 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400'
                          }`}
                        >
                          {String(demoAccount.verification_status || 'pending')}
                        </span>
                      </div>
                      {!isMt5AccountApproved(demoAccount) &&
                        demoAccount.verification_status !== 'rejected' && (
                          <p className="text-xs text-slate-600 dark:text-slate-400 pt-3 mt-2 border-t border-slate-200 dark:border-slate-600 leading-relaxed">
                            We are reviewing your account, we will notify you via email when we are done.
                          </p>
                        )}
                    </div>
                  </div>
                )}
                {tradingMode === 'live' && liveAccount && (
                  <div className="rounded-xl border border-slate-200 dark:border-slate-600 p-4">
                    <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 mb-3">Live MT5</p>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-600 dark:text-slate-400">Login</span>
                        <span className="font-mono text-slate-900 dark:text-white">{liveAccount.mt5_login}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600 dark:text-slate-400">Status</span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            liveAccount.verification_status === 'verified'
                              ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                              : liveAccount.verification_status === 'rejected'
                                ? 'bg-red-500/20 text-red-600 dark:text-red-400'
                                : 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400'
                          }`}
                        >
                          {String(liveAccount.verification_status || 'pending')}
                        </span>
                      </div>
                      {liveAccount.rejected_reason && liveAccount.verification_status === 'rejected' && (
                        <p className="text-xs text-red-600 dark:text-red-400 pt-2 border-t border-slate-200 dark:border-slate-600">
                          {liveAccount.rejected_reason}
                        </p>
                      )}
                      {!isMt5AccountApproved(liveAccount) &&
                        liveAccount.verification_status !== 'rejected' && (
                          <p className="text-xs text-slate-600 dark:text-slate-400 pt-3 mt-2 border-t border-slate-200 dark:border-slate-600 leading-relaxed">
                            We are reviewing your account, we will notify you via email when we are done.
                          </p>
                        )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
