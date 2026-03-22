import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Activity, Wifi, WifiOff, Clock, RefreshCw, AlertTriangle, Power, Download } from 'lucide-react';
import type { TradingMode } from '../contexts/AuthContext';

interface EAConnection {
  id: string;
  mt5_login: string;
  status: string;
  last_ping: string;
  version: string | null;
  created_at: string;
  updated_at: string;
}

interface EAConnectionStatusProps {
  userId: string;
  tradingMode: TradingMode;
}

/** Match MT5 logins when one side has leading zeros (EA vs saved login). */
function normalizeMt5Login(s: string): string {
  const t = String(s || '').trim();
  return t.replace(/^0+/, '') || t;
}

export function EAConnectionStatus({ userId, tradingMode }: EAConnectionStatusProps) {
  const [connections, setConnections] = useState<EAConnection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadConnections();

    const subscription = supabase
      .channel('ea_connections')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'ea_connections',
        filter: `user_id=eq.${userId}`
      }, () => {
        loadConnections();
      })
      .subscribe();

    const interval = setInterval(() => {
      loadConnections();
    }, 30000);

    return () => {
      subscription.unsubscribe();
      clearInterval(interval);
    };
  }, [userId, tradingMode]);

  /** Accounts for current trading mode (raw mt5_login as stored in DB). */
  const loadModeAccounts = async (): Promise<{ raw: string }[]> => {
    const { data } = await supabase
      .from('mt5_accounts')
      .select('mt5_login,account_type')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    const rows = (data as any[]) || [];
    return rows
      .filter((r) => (tradingMode === 'demo' ? r?.account_type === 'demo' : r?.account_type === 'real' || r?.account_type === 'live'))
      .map((r) => ({ raw: String(r.mt5_login || '').trim() }))
      .filter((a) => a.raw.length > 0);
  };

  const loadConnections = async () => {
    const accounts = await loadModeAccounts();
    if (accounts.length === 0) {
      setConnections([]);
      setLoading(false);
      return;
    }

    const normSet = new Set(accounts.map((a) => normalizeMt5Login(a.raw)));

    const { data: allRows } = await supabase
      .from('ea_connections')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    // Match heartbeats to mode accounts even if ea_connections.mt5_login differs by leading zeros from mt5_accounts.
    const matched = (allRows || []).filter((c) => normSet.has(normalizeMt5Login(String(c.mt5_login || ''))));

    setConnections(matched);
    setLoading(false);
  };

  const getConnectionHealth = (connection: EAConnection) => {
    const lastPing = new Date(connection.last_ping);
    const now = new Date();
    const minutesSinceLastPing = Math.floor((now.getTime() - lastPing.getTime()) / 60000);

    if (connection.status === 'offline') {
      return { status: 'offline', color: 'text-slate-600 dark:text-slate-400', bgColor: 'bg-slate-600/20', message: 'Offline' };
    }

    if (minutesSinceLastPing > 5) {
      return { status: 'warning', color: 'text-yellow-400', bgColor: 'bg-yellow-600/20', message: 'Connection Lost' };
    }

    if (minutesSinceLastPing > 2) {
      return { status: 'degraded', color: 'text-amber-400', bgColor: 'bg-amber-600/20', message: 'Unstable' };
    }

    return { status: 'online', color: 'text-emerald-600 dark:text-emerald-400', bgColor: 'bg-emerald-600/20', message: 'Online' };
  };

  const getTimeSinceLastPing = (lastPing: string) => {
    const ping = new Date(lastPing);
    const now = new Date();
    const diffMs = now.getTime() - ping.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins === 1) return '1 minute ago';
    if (diffMins < 60) return `${diffMins} minutes ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours === 1) return '1 hour ago';
    if (diffHours < 24) return `${diffHours} hours ago`;

    const diffDays = Math.floor(diffHours / 24);
    return diffDays === 1 ? '1 day ago' : `${diffDays} days ago`;
  };

  const handleDisconnect = async (connectionId: string) => {
    await supabase
      .from('ea_connections')
      .update({ status: 'offline' })
      .eq('id', connectionId);

    loadConnections();
  };

  if (loading) {
    return (
      <div className="bg-slate-50 dark:bg-slate-800/50 backdrop-blur-sm border border-slate-300 dark:border-slate-700 rounded-2xl p-6">
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
        </div>
      </div>
    );
  }

  if (connections.length === 0) {
    return (
      <div className="bg-slate-50 dark:bg-slate-800/50 backdrop-blur-sm border border-slate-300 dark:border-slate-700 rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-slate-200 dark:bg-slate-700 rounded-lg flex items-center justify-center">
            <Activity className="w-5 h-5 text-slate-600 dark:text-slate-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-black dark:text-white">EA Connections</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">No connections detected</p>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900/50 rounded-lg p-6 text-center border border-slate-300 dark:border-slate-700">
          <WifiOff className="w-8 h-8 text-slate-600 dark:text-slate-500 mx-auto mb-3" />
          <p className="text-sm text-slate-600 dark:text-slate-400">
            No Expert Advisors are currently connected. Install and run the EA on your MT5 platform to begin.
          </p>
          <div className="mt-5 pt-5 border-t border-slate-200 dark:border-slate-700">
            <p className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Download EA</p>
            {tradingMode === 'demo' ? (
              <div className="inline-flex flex-col items-center gap-2">
                <a
                  href="/VixAi-Trader-Demo.ex5"
                  download
                  className="inline-flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-medium rounded-lg transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Download Demo EA
                </a>
                <a
                  href="/EA-Instructions.pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-900 dark:text-white font-medium rounded-lg transition-colors"
                >
                  EA Instructions
                </a>
              </div>
            ) : (
              <div className="inline-flex flex-col items-center gap-2">
                <a
                  href="/VixAi-Trader-Live.ex5"
                  download
                  className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Download Live EA
                </a>
                <a
                  href="/EA-Instructions.pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-900 dark:text-white font-medium rounded-lg transition-colors"
                >
                  EA Instructions
                </a>
              </div>
            )}
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-3">
              Save this file into <span className="font-mono">MQL5/Experts</span>, then restart MT5 and attach the EA to a chart.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const anyOnline = connections.some((c) => getConnectionHealth(c).status === 'online');

  return (
    <div className="bg-slate-50 dark:bg-slate-800/50 backdrop-blur-sm border border-slate-300 dark:border-slate-700 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-600/20 rounded-lg flex items-center justify-center">
            <Activity className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-black dark:text-white">EA Connections</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">{connections.length} Active {connections.length === 1 ? 'Account' : 'Accounts'}</p>
          </div>
        </div>
        <button
          onClick={loadConnections}
          className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4 text-slate-600 dark:text-slate-400" />
        </button>
      </div>

      {!anyOnline && (
        <div className="mb-4 bg-white dark:bg-slate-900/50 rounded-lg p-4 border border-slate-300 dark:border-slate-700">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">EA not connected</p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Download and install the EA, then attach it to a chart to start heartbeats.
              </p>
            </div>
            {tradingMode === 'demo' ? (
              <div className="inline-flex flex-col items-end gap-2">
                <a
                  href="/VixAi-Trader-Demo.ex5"
                  download
                  className="inline-flex items-center gap-2 px-3 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Demo EA
                </a>
                <a
                  href="/EA-Instructions.pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-900 dark:text-white text-sm font-medium rounded-lg transition-colors"
                >
                  EA Instructions
                </a>
              </div>
            ) : (
              <div className="inline-flex flex-col items-end gap-2">
                <a
                  href="/VixAi-Trader-Live.ex5"
                  download
                  className="inline-flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Live EA
                </a>
                <a
                  href="/EA-Instructions.pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-900 dark:text-white text-sm font-medium rounded-lg transition-colors"
                >
                  EA Instructions
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="space-y-3">
        {connections.map((connection) => {
          const health = getConnectionHealth(connection);

          return (
            <div
              key={connection.id}
              className="bg-white dark:bg-slate-900/50 rounded-lg p-4 border border-slate-300 dark:border-slate-700 hover:border-slate-300 dark:border-slate-600 transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 ${health.bgColor} rounded-lg flex items-center justify-center`}>
                    {health.status === 'online' ? (
                      <Wifi className={`w-5 h-5 ${health.color}`} />
                    ) : health.status === 'offline' ? (
                      <WifiOff className={`w-5 h-5 ${health.color}`} />
                    ) : (
                      <AlertTriangle className={`w-5 h-5 ${health.color}`} />
                    )}
                  </div>
                  <div>
                    <h4 className="text-black dark:text-white font-bold">MT5 #{connection.mt5_login}</h4>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-xs font-medium ${health.color}`}>
                        {health.message}
                      </span>
                      {connection.version && (
                        <span className="text-xs text-slate-600 dark:text-slate-500">
                          v{connection.version}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {connection.status === 'online' && (
                  <button
                    onClick={() => handleDisconnect(connection.id)}
                    className="p-2 hover:bg-red-600/20 rounded-lg transition-colors group"
                    title="Force Disconnect"
                  >
                    <Power className="w-4 h-4 text-slate-600 dark:text-slate-400 group-hover:text-red-600 dark:text-red-400" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 mb-1">
                    <Clock className="w-3.5 h-3.5" />
                    <span className="text-xs">Last Heartbeat</span>
                  </div>
                  <p className="text-black dark:text-white font-medium">
                    {getTimeSinceLastPing(connection.last_ping)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">Connected Since</p>
                  <p className="text-black dark:text-white font-medium">
                    {new Date(connection.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {health.status === 'warning' && (
                <div className="mt-3 pt-3 border-t border-slate-300 dark:border-slate-700">
                  <div className="flex items-start gap-2 text-xs text-yellow-400">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <p>No heartbeat received in over 5 minutes. Check your MT5 connection.</p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
