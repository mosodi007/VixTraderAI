import { useState, useEffect, useRef } from 'react';
import { DashboardLayout } from '../components/DashboardLayout';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { TrendingUp, TrendingDown, Clock, Target, Shield, Activity, Volume2, VolumeX } from 'lucide-react';
import { SignalModal } from '../components/SignalModal';
import { playNewSignalAlert, unlockAudio, unlockAudioSilent } from '../lib/soundAlert';

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
}

interface GroupedSignals {
  [key: string]: Signal[];
}

const SOUND_ALERTS_STORAGE_KEY = 'vix-signal-sound-alerts';

function getStoredSoundAlerts(): boolean {
  try {
    return localStorage.getItem(SOUND_ALERTS_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function Signals() {
  const { user } = useAuth();
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSignal, setSelectedSignal] = useState<Signal | null>(null);
  const [soundAlertsOn, setSoundAlertsOn] = useState(getStoredSoundAlerts());
  const soundAlertsOnRef = useRef(soundAlertsOn);
  const previousSignalIdsRef = useRef<Set<string>>(new Set());

  soundAlertsOnRef.current = soundAlertsOn;

  const handleSoundAlertsToggle = (on: boolean) => {
    setSoundAlertsOn(on);
    try {
      localStorage.setItem(SOUND_ALERTS_STORAGE_KEY, String(on));
    } catch {}
    if (on) unlockAudio();
  };

  useEffect(() => {
    // Re-unlock audio when user returns to tab (silent – no peep). Ensures playNewSignalAlert() works when a new signal arrives.
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && soundAlertsOnRef.current) {
        unlockAudioSilent();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    loadSignals();
    monitorSignalPrices();

    // Poll for new signals every 30s so list updates when signals are created from Live Analysis (Realtime can miss or be disabled)
    const pollInterval = setInterval(loadSignals, 30000);

    // Real-time subscription for new signals (show all; backend controls quality)
    const subscription = supabase
      .channel('signals')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'signals' }, (payload) => {
        const newSignal = payload.new as Signal;
        setSignals((prev) => [newSignal, ...prev]);

        // Show notification
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('New Trading Signal!', {
            body: `${newSignal.direction} ${newSignal.symbol} at ${newSignal.entry_price}`,
            icon: '/icon.png'
          });
        }

        // Sound alert for new signal (only if user has enabled it)
        if (soundAlertsOnRef.current) playNewSignalAlert();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'signals' }, (payload) => {
        setSignals((prev) =>
          prev.map(signal => signal.id === payload.new.id ? payload.new as Signal : signal)
        );
      })
      .subscribe();

    // Monitor signal prices every 60 seconds
    const priceMonitorInterval = setInterval(() => {
      monitorSignalPrices();
    }, 60000);

    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      subscription.unsubscribe();
      clearInterval(priceMonitorInterval);
      clearInterval(pollInterval);
    };
  }, [user]);

  const monitorSignalPrices = async () => {
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
  };

  const loadSignals = async () => {
    const { data } = await supabase
      .from('signals')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    const list = data || [];
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
      if (soundAlertsOnRef.current) {
        playNewSignalAlert();
      }
    }

    setSignals(list);
    setLoading(false);
  };

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

  const groupedSignals = groupSignalsByDate(signals);

  return (
    <ProtectedRoute>
      <DashboardLayout currentPage="signals">
        <div className="max-w-7xl mx-auto space-y-6">
          <div>
            <h2 className="text-3xl font-bold text-black dark:text-white mb-2">Deriv Live Signals</h2>
            <p className="text-slate-600 dark:text-slate-400">AI-powered trading signals appear here automatically</p>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/50 backdrop-blur-sm border border-slate-300 dark:border-slate-700 rounded-2xl overflow-hidden shadow-lg dark:shadow-none">
            <div className="p-6 border-b border-slate-300 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-black dark:text-white">Active Signals</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">{signals.length} Signal{signals.length !== 1 ? 's' : ''} Available</p>
                </div>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                    <span className="text-sm text-slate-600 dark:text-slate-400">Sound alert</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={soundAlertsOn}
                      onClick={() => handleSoundAlertsToggle(!soundAlertsOn)}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${
                        soundAlertsOn ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-600'
                      }`}
                    >
                      <span className="sr-only">Toggle sound alerts</span>
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform ${
                          soundAlertsOn ? 'translate-x-5' : 'translate-x-1'
                        }`}
                      />
                    </button>
                    {soundAlertsOn ? (
                      <Volume2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <VolumeX className="w-4 h-4 text-slate-400" />
                    )}
                  </label>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
              </div>
            ) : signals.length === 0 ? (
              <div className="p-12 text-center">
                <div className="w-16 h-16 bg-emerald-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Activity className="w-8 h-8 text-emerald-600 dark:text-emerald-400 animate-pulse" />
                </div>
                <h3 className="text-xl font-bold text-black dark:text-white mb-2">No Active Signals</h3>
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

                          {(signal.tp2 || signal.tp3) && (
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
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
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
