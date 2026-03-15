import { X, TrendingUp, TrendingDown, Target, Shield, Clock, Sparkles, Activity, BarChart3 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

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
  timeframe?: string;
  signal_type?: string;
  market_context?: string;
  reasoning?: string;
  technical_indicators?: any;
  risk_reward_ratio?: number;
  pip_stop_loss?: number;
  pip_take_profit?: number;
}

interface SignalModalProps {
  signal: Signal;
  onClose: () => void;
}

export function SignalModal({ signal, onClose }: SignalModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [marketAnalysis, setMarketAnalysis] = useState<any>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    document.addEventListener('mousedown', handleClickOutside);
    document.body.style.overflow = 'hidden';

    loadMarketAnalysis();

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = 'unset';
    };
  }, [onClose]);

  const loadMarketAnalysis = async () => {
    const { data } = await supabase
      .from('market_analysis_history')
      .select('*')
      .eq('symbol', signal.mt5_symbol || signal.symbol)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      setMarketAnalysis(data);
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const calculateRiskReward = () => {
    const risk = Math.abs(signal.entry_price - signal.stop_loss);
    const reward = Math.abs(signal.take_profit - signal.entry_price);
    return (reward / risk).toFixed(2);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div
        ref={modalRef}
        className="relative w-full max-w-6xl max-h-[90vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
      >
        <div className="flex items-center justify-between p-6 border-b border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 ${signal.direction === 'BUY' ? 'bg-emerald-600/20' : 'bg-red-600/20'} rounded-xl flex items-center justify-center`}>
              {signal.direction === 'BUY' ? (
                <TrendingUp className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <TrendingDown className="w-6 h-6 text-red-600 dark:text-red-400" />
              )}
            </div>
            <div>
              <h2 className="text-2xl font-bold text-black dark:text-white">
                {signal.mt5_symbol || signal.symbol}
              </h2>
              <div className="flex items-center gap-3 mt-1">
                <span className={`text-sm font-bold ${signal.direction === 'BUY' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                  {signal.direction} {signal.order_type}
                </span>
                <div className="h-4 w-px bg-slate-300 dark:bg-slate-600"></div>
                <div className="flex items-center gap-1 text-sm text-slate-600 dark:text-slate-400">
                  <Clock className="w-3.5 h-3.5" />
                  {formatTime(signal.created_at)}
                </div>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X className="w-6 h-6 text-slate-600 dark:text-slate-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
            <div className="space-y-6">
              <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-xl p-6">
                <h3 className="text-lg font-bold text-black dark:text-white mb-4">Signal Metrics</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white dark:bg-slate-900/50 rounded-lg p-4 border border-slate-300 dark:border-slate-700">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      <span className="text-xs text-slate-600 dark:text-slate-400">AI Confidence</span>
                    </div>
                    <p className="text-2xl font-bold text-black dark:text-white">
                      {signal.confidence_percentage || signal.confidence}%
                    </p>
                  </div>
                  <div className="bg-white dark:bg-slate-900/50 rounded-lg p-4 border border-slate-300 dark:border-slate-700">
                    <div className="flex items-center gap-2 mb-2">
                      <Target className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                      <span className="text-xs text-slate-600 dark:text-slate-400">Risk:Reward</span>
                    </div>
                    <p className="text-2xl font-bold text-black dark:text-white">
                      1:{signal.risk_reward_ratio?.toFixed(2) || calculateRiskReward()}
                    </p>
                  </div>
                  <div className="bg-white dark:bg-slate-900/50 rounded-lg p-4 border border-slate-300 dark:border-slate-700">
                    <div className="flex items-center gap-2 mb-2">
                      <Activity className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                      <span className="text-xs text-slate-600 dark:text-slate-400">Signal Type</span>
                    </div>
                    <p className="text-sm font-bold text-black dark:text-white capitalize">
                      {signal.signal_type || 'Trend'}
                    </p>
                  </div>
                </div>
              </div>

              {marketAnalysis && (
                <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <BarChart3 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                    <h3 className="text-lg font-bold text-black dark:text-white">Technical Indicators</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">RSI</p>
                      <p className="text-lg font-bold text-black dark:text-white">
                        {marketAnalysis.rsi?.toFixed(1) || 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">MACD</p>
                      <p className="text-lg font-bold text-black dark:text-white">
                        {marketAnalysis.macd_value?.toFixed(4) || 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">Trend</p>
                      <p className="text-sm font-bold text-black dark:text-white capitalize">
                        {marketAnalysis.trend || 'Neutral'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">Volatility</p>
                      <p className="text-sm font-bold text-black dark:text-white capitalize">
                        {marketAnalysis.volatility || 'Medium'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {(signal.reasoning || signal.market_context) && (
                <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800/50 dark:to-slate-900/50 border border-slate-300 dark:border-slate-700 rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                    <h3 className="font-bold text-black dark:text-white">AI Analysis</h3>
                  </div>
                  <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed mb-3">
                    {signal.reasoning || signal.market_context}
                  </p>
                  {marketAnalysis?.analysis_text && (
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      {marketAnalysis.analysis_text}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-4">
                  Trade Details
                </h3>
                <div className="space-y-4">
                  <div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">Entry Price</p>
                    <p className="text-xl font-bold font-mono text-black dark:text-white">
                      {signal.entry_price.toFixed(5)}
                    </p>
                  </div>

                  <div className="h-px bg-slate-300 dark:bg-slate-700"></div>

                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Target className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <p className="text-xs text-slate-600 dark:text-slate-400">Take Profit Levels</p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-600 dark:text-slate-400">TP:</span>
                        <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                          {(signal.tp1 ?? signal.take_profit).toFixed(5)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="h-px bg-slate-300 dark:bg-slate-700"></div>

                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Shield className="w-4 h-4 text-red-600 dark:text-red-400" />
                      <p className="text-xs text-slate-600 dark:text-slate-400">Stop Loss</p>
                    </div>
                    <p className="font-mono font-semibold text-red-600 dark:text-red-400">
                      {signal.stop_loss.toFixed(5)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-xl p-5 text-white">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-5 h-5" />
                  <h3 className="font-bold">AI-Powered Signal</h3>
                </div>
                <p className="text-sm text-emerald-50 leading-relaxed">
                  This signal is generated using advanced AI analysis combining technical indicators,
                  market sentiment, and historical patterns.
                </p>
              </div>

              <div className="bg-amber-600/10 border border-amber-600/30 rounded-xl p-4">
                <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                  <strong>Risk Warning:</strong> Trading involves substantial risk. Always use proper
                  risk management and never invest more than you can afford to lose.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
