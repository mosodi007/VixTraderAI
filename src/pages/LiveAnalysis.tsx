import { useState, useEffect, useRef } from 'react';
import { DashboardLayout } from '../components/DashboardLayout';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { supabase } from '../lib/supabase';
import { Play, Activity, TrendingUp, TrendingDown, Minus, Clock } from 'lucide-react';

interface AnalysisLog {
  timestamp: string;
  symbol: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

interface ScanSchedule {
  next_scan_at: string;
  last_scan_at: string;
  scan_interval_minutes: number;
  is_active: boolean;
}

export function LiveAnalysis() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [logs, setLogs] = useState<AnalysisLog[]>([]);
  const [results, setResults] = useState<any>(null);
  const [nextScanTime, setNextScanTime] = useState<Date | null>(null);
  const [timeUntilScan, setTimeUntilScan] = useState<string>('');
  const [autoScanEnabled, setAutoScanEnabled] = useState(true);
  const hasRunInitialScan = useRef(false);

  const addLog = (symbol: string, message: string, type: AnalysisLog['type'] = 'info') => {
    setLogs(prev => [...prev, {
      timestamp: new Date().toLocaleTimeString(),
      symbol,
      message,
      type
    }]);
  };

  const fetchSchedule = async () => {
    try {
      const { data, error } = await supabase
        .from('scan_schedule')
        .select('*')
        .single();

      if (data && !error) {
        setNextScanTime(new Date(data.next_scan_at));
      }
    } catch (error) {
      console.error('Error fetching schedule:', error);
    }
  };

  const updateCountdown = () => {
    if (!nextScanTime) return;

    const now = new Date();
    const diff = nextScanTime.getTime() - now.getTime();

    if (diff <= 0) {
      setTimeUntilScan('Scanning now...');
      if (autoScanEnabled && !isAnalyzing) {
        runAnalysis();
      }
      fetchSchedule(); // Refresh to get next scan time
    } else {
      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setTimeUntilScan(`${minutes}m ${seconds}s`);
    }
  };

  useEffect(() => {
    fetchSchedule();
    const interval = setInterval(fetchSchedule, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [nextScanTime, autoScanEnabled, isAnalyzing]);

  // Run one analysis automatically when the page loads (no click required)
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
        addLog('SYSTEM', `Scan complete! Generated ${data.stats.signals_generated} signals`, 'success');
        setResults(data);

        // Show detailed results for each symbol
        data.results.forEach((result: any) => {
          if (result.signalGenerated) {
            addLog(result.symbol, `✅ SIGNAL: ${result.direction} - ${result.confidence}% confidence`, 'success');
          } else {
            addLog(result.symbol, `❌ ${result.reason}`, 'warning');
          }
        });

        // Show generated signal details
        if (data.generatedSignals && data.generatedSignals.length > 0) {
          addLog('SYSTEM', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'info');
          data.generatedSignals.forEach((signal: any) => {
            addLog(signal.symbol, `📊 Trade Setup:`, 'success');
            addLog(signal.symbol, `   Direction: ${signal.direction}`, 'info');
            addLog(signal.symbol, `   Entry: ${signal.entry_price}`, 'info');
            addLog(signal.symbol, `   TP1: ${signal.tp1}`, 'info');
            addLog(signal.symbol, `   TP2: ${signal.tp2}`, 'info');
            addLog(signal.symbol, `   TP3: ${signal.tp3}`, 'info');
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
      fetchSchedule(); // Refresh schedule after analysis
    }
  };

  const getLogIcon = (type: string) => {
    switch (type) {
      case 'success': return '✅';
      case 'warning': return '⚠️';
      case 'error': return '❌';
      default: return '📍';
    }
  };

  const getLogColor = (type: string) => {
    switch (type) {
      case 'success': return 'text-emerald-600 dark:text-emerald-400';
      case 'warning': return 'text-amber-600 dark:text-amber-400';
      case 'error': return 'text-red-600 dark:text-red-400';
      default: return 'text-slate-600 dark:text-slate-400';
    }
  };

  return (
    <ProtectedRoute>
      <DashboardLayout currentPage="signals">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-bold text-black dark:text-white mb-2">Live Analysis Console</h2>
              <p className="text-slate-600 dark:text-slate-400">Watch the AI analyze markets in real-time</p>
            </div>
            <div className="flex items-center gap-4">
              {nextScanTime && (
                <div className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                    <span className="text-xs text-slate-600 dark:text-slate-400">Next Scan In</span>
                  </div>
                  <p className="text-lg font-bold text-black dark:text-white">{timeUntilScan}</p>
                </div>
              )}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoScanEnabled}
                  onChange={(e) => setAutoScanEnabled(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 bg-slate-100 border-slate-300 rounded focus:ring-emerald-500 dark:focus:ring-emerald-600 dark:ring-offset-slate-800 focus:ring-2 dark:bg-slate-700 dark:border-slate-600"
                />
                <span className="text-sm text-slate-600 dark:text-slate-400">Auto-scan</span>
              </label>
              <button
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
              </button>
            </div>
          </div>

          {results && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="font-semibold text-black dark:text-white">Symbols Analyzed</h3>
                </div>
                <p className="text-3xl font-bold text-black dark:text-white">{results.stats.total_scanned}</p>
              </div>

              <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-300 dark:border-emerald-500/30 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="font-semibold text-emerald-700 dark:text-emerald-300">Signals Found</h3>
                </div>
                <p className="text-3xl font-bold text-emerald-700 dark:text-emerald-300">{results.stats.signals_generated}</p>
              </div>

              {/* <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-2">
                  <Minus className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                  <h3 className="font-semibold text-black dark:text-white">Skipped</h3>
                </div>
                <p className="text-3xl font-bold text-black dark:text-white">{results.stats.signals_skipped}</p>
              </div> */}
            </div>
          )}

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
                  <p className="text-xs mt-2 opacity-75">Scans also run every 1 min in the background. Enable Auto-scan to run again when the timer hits zero.</p>
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

          {/* <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-xl p-6">
            <h3 className="font-semibold text-black dark:text-white mb-3">How It Works</h3>
            <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
              <li className="flex gap-2">
                <span className="text-emerald-600 dark:text-emerald-400">•</span>
                <span>Analyzes 10 symbols (R_10, R_50, R_100, 1HZ10V, 1HZ30V, 1HZ50V, 1HZ90V, 1HZ100V, stpRNG, JD25) simultaneously</span>
              </li>
              <li className="flex gap-2">
                <span className="text-emerald-600 dark:text-emerald-400">•</span>
                <span>Fetches 200 historical ticks from Deriv API for each symbol</span>
              </li>
              <li className="flex gap-2">
                <span className="text-emerald-600 dark:text-emerald-400">•</span>
                <span>Runs advanced technical analysis (RSI, MACD, Bollinger Bands, EMAs, patterns)</span>
              </li>
              <li className="flex gap-2">
                <span className="text-emerald-600 dark:text-emerald-400">•</span>
                <span>Generates signals only when quality thresholds are met (3+ confirming indicators, 50%+ confidence, 1.5:1 R:R)</span>
              </li>
              <li className="flex gap-2">
                <span className="text-emerald-600 dark:text-emerald-400">•</span>
                <span>One signal per asset rule enforced to prevent conflicts</span>
              </li>
            </ul>
          </div> */}
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
