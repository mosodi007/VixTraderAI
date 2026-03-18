import { TechnicalAnalyzer, TickData, Candle, TechnicalIndicators } from './technical-indicators.ts';
import { getPointSize } from './symbol-sl-tp.ts';

export interface SignalTrigger {
  indicatorName: string;
  indicatorValue: number;
  triggerCondition: string;
  timeframe: string;
}

export interface CandlePattern {
  name: string;
  type: 'bullish' | 'bearish';
  confidence: number;
  description: string;
}

export interface SignalDetectionResult {
  shouldGenerateSignal: boolean;
  direction: 'BUY' | 'SELL' | null;
  triggers: SignalTrigger[];
  patterns: CandlePattern[];
  confidence: number;
  riskRewardRatio: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  tp1?: number;
  reasoning: string;
  /** For ICT refinement: support/resistance from structure (when direction is set) */
  supportLevels?: number[];
  resistanceLevels?: number[];
  /** ATR for ICT refiner (when direction is set) */
  atr?: number;
  /** Filter context for observability */
  filters?: {
    realizedVolPercentile: number;
    realizedVol: number;
    volatilityRegime: 'high' | 'medium' | 'low';
    trendEma: 'bullish' | 'bearish' | 'neutral';
    trendStructure: 'bullish' | 'bearish' | 'neutral';
    trendStrength: number;
    /** Path length / |net move| on recent closes; high ≈ zig-zag, low ≈ trend */
    chopRatio: number;
    closeReversals: number;
    swingMarketOk: boolean;
    allowed: boolean;
    blockedReasons: string[];
  };
}

/** Config: use points (per-symbol) when set; otherwise ATR multipliers. */
export interface SignalDetectorConfig {
  slPoints?: number;
  tpPoints?: number;
  atrSlMultiplier?: number;
  atrTpMultiplier?: number;
  /** Realized-vol percentile threshold for allowing signals */
  /** Vol percentile above this = "high"; band below down to (this - 0.25) = "medium" (also tradable). */
  highVolPercentile?: number;
  /** Trend strength threshold above which fading the EMA trend is blocked */
  strongTrendStrength?: number;
  /** Require EMA direction alignment with signal direction */
  requireTrendAlignment?: boolean;
  /** Require structure direction alignment with signal direction */
  requireStructureAlignment?: boolean;
  /** Only allow signals when market is swinging (chop), not efficient trend */
  requireSwingMarket?: boolean;
  /** Min path/net on recent candle closes (default ~1.75) */
  minChopRatio?: number;
  /** Min close-to-close direction flips in lookback */
  minSwingReversals?: number;
  /** Number of 1m candles for swing metrics */
  swingLookbackCandles?: number;
}

export class AdvancedSignalDetector {
  private analyzer: TechnicalAnalyzer;
  // Tuned for low symbol count (1HZ30V/1HZ75V): be less strict on signal *frequency*,
  // while keeping the trend/structure + strong-trend guards to avoid fighting trend.
  private minTriggers: number = 3;
  private minConfidence: number = 50;
  private minRiskReward: number = 1.5;
  private atrSlMultiplier: number;
  private atrTpMultiplier: number;
  private slPoints: number | null = null;
  private tpPoints: number | null = null;
  private highVolPercentile: number;
  private strongTrendStrength: number;
  private requireTrendAlignment: boolean;
  private requireStructureAlignment: boolean;
  private requireSwingMarket: boolean;
  private minChopRatio: number;
  private minSwingReversals: number;
  private swingLookbackCandles: number;

  constructor(ticks: TickData[], config?: SignalDetectorConfig) {
    this.analyzer = new TechnicalAnalyzer(ticks);
    this.atrSlMultiplier = config?.atrSlMultiplier ?? 2.5;
    this.atrTpMultiplier = config?.atrTpMultiplier ?? 4.5;
    this.highVolPercentile = config?.highVolPercentile ?? 0.55;
    this.strongTrendStrength = config?.strongTrendStrength ?? 1.2;
    this.requireTrendAlignment = config?.requireTrendAlignment ?? true;
    this.requireStructureAlignment = config?.requireStructureAlignment ?? true;
    this.requireSwingMarket = config?.requireSwingMarket ?? true;
    this.minChopRatio = config?.minChopRatio ?? 1.75;
    this.minSwingReversals = config?.minSwingReversals ?? 7;
    this.swingLookbackCandles = Math.max(15, Math.min(120, config?.swingLookbackCandles ?? 40));
    if (config?.slPoints != null && config?.tpPoints != null && config.slPoints > 0 && config.tpPoints > 0) {
      this.slPoints = config.slPoints;
      this.tpPoints = config.tpPoints;
    }
  }

  private ticksToCandles(ticks: TickData[], interval: number = 60): Candle[] {
    if (ticks.length === 0) return [];

    const candles: Candle[] = [];
    let currentCandle: Candle | null = null;

    for (const tick of ticks) {
      const candleTime = Math.floor(tick.epoch / interval) * interval;

      if (!currentCandle || currentCandle.time !== candleTime) {
        if (currentCandle) {
          candles.push(currentCandle);
        }
        currentCandle = {
          open: tick.quote,
          high: tick.quote,
          low: tick.quote,
          close: tick.quote,
          time: candleTime,
        };
      } else {
        currentCandle.high = Math.max(currentCandle.high, tick.quote);
        currentCandle.low = Math.min(currentCandle.low, tick.quote);
        currentCandle.close = tick.quote;
      }
    }

    if (currentCandle) {
      candles.push(currentCandle);
    }

    return candles;
  }

  private detectCandlePatterns(candles: Candle[]): CandlePattern[] {
    if (candles.length < 5) return [];

    const patterns: CandlePattern[] = [];
    const recent = candles.slice(-5);
    const current = recent[recent.length - 1];
    const prev = recent[recent.length - 2];
    const prev2 = recent[recent.length - 3];

    const bodySize = Math.abs(current.close - current.open);
    const totalRange = current.high - current.low;
    const upperWick = current.high - Math.max(current.open, current.close);
    const lowerWick = Math.min(current.open, current.close) - current.low;

    // Bullish Engulfing
    if (prev.close < prev.open && current.close > current.open &&
        current.open < prev.close && current.close > prev.open &&
        bodySize > Math.abs(prev.close - prev.open)) {
      patterns.push({
        name: 'Bullish Engulfing',
        type: 'bullish',
        confidence: 85,
        description: 'Strong bullish reversal pattern detected'
      });
    }

    // Bearish Engulfing
    if (prev.close > prev.open && current.close < current.open &&
        current.open > prev.close && current.close < prev.open &&
        bodySize > Math.abs(prev.close - prev.open)) {
      patterns.push({
        name: 'Bearish Engulfing',
        type: 'bearish',
        confidence: 85,
        description: 'Strong bearish reversal pattern detected'
      });
    }

    // Hammer (Bullish)
    if (lowerWick > bodySize * 2 && upperWick < bodySize * 0.3 && bodySize > 0) {
      patterns.push({
        name: 'Hammer',
        type: 'bullish',
        confidence: 75,
        description: 'Bullish hammer pattern indicating potential reversal'
      });
    }

    // Shooting Star (Bearish)
    if (upperWick > bodySize * 2 && lowerWick < bodySize * 0.3 && bodySize > 0) {
      patterns.push({
        name: 'Shooting Star',
        type: 'bearish',
        confidence: 75,
        description: 'Bearish shooting star pattern indicating potential reversal'
      });
    }

    // Doji (Indecision)
    if (bodySize < totalRange * 0.1) {
      const dojiType = upperWick > lowerWick ? 'bearish' : 'bullish';
      patterns.push({
        name: 'Doji',
        type: dojiType,
        confidence: 60,
        description: 'Doji pattern showing market indecision'
      });
    }

    // Morning Star (Bullish)
    if (recent.length >= 3) {
      const first = prev2;
      const middle = prev;
      const last = current;

      if (first.close < first.open &&
          Math.abs(middle.close - middle.open) < (first.high - first.low) * 0.3 &&
          last.close > last.open &&
          last.close > (first.open + first.close) / 2) {
        patterns.push({
          name: 'Morning Star',
          type: 'bullish',
          confidence: 90,
          description: 'Strong bullish morning star reversal pattern'
        });
      }
    }

    // Evening Star (Bearish)
    if (recent.length >= 3) {
      const first = prev2;
      const middle = prev;
      const last = current;

      if (first.close > first.open &&
          Math.abs(middle.close - middle.open) < (first.high - first.low) * 0.3 &&
          last.close < last.open &&
          last.close < (first.open + first.close) / 2) {
        patterns.push({
          name: 'Evening Star',
          type: 'bearish',
          confidence: 90,
          description: 'Strong bearish evening star reversal pattern'
        });
      }
    }

    return patterns;
  }

  private checkIndicatorTriggers(
    indicators: TechnicalIndicators,
    currentPrice: number,
    timeframe: string
  ): SignalTrigger[] {
    const triggers: SignalTrigger[] = [];

    // RSI Oversold/Overbought
    if (indicators.rsi < 30) {
      triggers.push({
        indicatorName: 'RSI',
        indicatorValue: indicators.rsi,
        triggerCondition: 'RSI below 30 (Oversold - Bullish signal)',
        timeframe
      });
    } else if (indicators.rsi > 70) {
      triggers.push({
        indicatorName: 'RSI',
        indicatorValue: indicators.rsi,
        triggerCondition: 'RSI above 70 (Overbought - Bearish signal)',
        timeframe
      });
    }

    // MACD Crossover
    if (indicators.macd.histogram > 0 && indicators.macd.macd > indicators.macd.signal) {
      triggers.push({
        indicatorName: 'MACD',
        indicatorValue: indicators.macd.histogram,
        triggerCondition: 'MACD bullish crossover (Histogram positive)',
        timeframe
      });
    } else if (indicators.macd.histogram < 0 && indicators.macd.macd < indicators.macd.signal) {
      triggers.push({
        indicatorName: 'MACD',
        indicatorValue: indicators.macd.histogram,
        triggerCondition: 'MACD bearish crossover (Histogram negative)',
        timeframe
      });
    }

    // EMA Crossover (relaxed threshold 0.25% so trend confirmation fires more often)
    if (indicators.ema12 > indicators.ema26) {
      const crossoverStrength = ((indicators.ema12 - indicators.ema26) / indicators.ema26) * 100;
      if (crossoverStrength > 0.25) {
        triggers.push({
          indicatorName: 'EMA Crossover',
          indicatorValue: crossoverStrength,
          triggerCondition: 'EMA12 above EMA26 (Bullish crossover)',
          timeframe
        });
      }
    } else if (indicators.ema12 < indicators.ema26) {
      const crossoverStrength = ((indicators.ema26 - indicators.ema12) / indicators.ema26) * 100;
      if (crossoverStrength > 0.25) {
        triggers.push({
          indicatorName: 'EMA Crossover',
          indicatorValue: crossoverStrength,
          triggerCondition: 'EMA12 below EMA26 (Bearish crossover)',
          timeframe
        });
      }
    }

    // Trend Confirmation
    if (indicators.trend === 'bullish') {
      triggers.push({
        indicatorName: 'Trend',
        indicatorValue: 1,
        triggerCondition: 'Bullish trend confirmed',
        timeframe
      });
    } else if (indicators.trend === 'bearish') {
      triggers.push({
        indicatorName: 'Trend',
        indicatorValue: -1,
        triggerCondition: 'Bearish trend confirmed',
        timeframe
      });
    }

    return triggers;
  }

  private calculateStopLossAndTakeProfit(
    direction: 'BUY' | 'SELL',
    entryPrice: number,
    atr: number,
    supportLevels: number[],
    resistanceLevels: number[],
    _symbol: string
  ): { stopLoss: number; takeProfit: number; tp1: number; rr: number } {
    const atrSafe = Math.max(atr, entryPrice * 0.001);
    const symbol = _symbol?.trim() || '';
    // When using points: convert Deriv "points" (display units) to price distance via point size.
    const pointSize = getPointSize(symbol);
    let slDistance = this.slPoints != null && this.tpPoints != null
      ? this.slPoints * pointSize
      : atrSafe * this.atrSlMultiplier;
    let tpDistance = this.slPoints != null && this.tpPoints != null
      ? this.tpPoints * pointSize
      : atrSafe * this.atrTpMultiplier;

    // Cap point-based distances so SL/TP stay valid (no negative or extreme levels)
    if (this.slPoints != null && this.tpPoints != null) {
      const maxSl = entryPrice * 0.5;
      const maxTp = entryPrice * 2;
      if (direction === 'BUY') {
        slDistance = Math.min(slDistance, maxSl);
        tpDistance = Math.min(tpDistance, maxTp);
      } else {
        slDistance = Math.min(slDistance, maxTp);
        tpDistance = Math.min(tpDistance, maxSl);
      }
    }

    let stopLoss: number;
    let tp1: number;

    const useFixedPoints = this.slPoints != null && this.tpPoints != null;

    if (direction === 'BUY') {
      stopLoss = entryPrice - slDistance;
      tp1 = entryPrice + tpDistance;

      if (!useFixedPoints) {
        if (supportLevels.length > 0) {
          const nearestSupport = supportLevels
            .filter(s => s < entryPrice && s > stopLoss)
            .sort((a, b) => b - a)[0];
          if (nearestSupport) {
            const candidateSL = nearestSupport - (atrSafe * 0.5);
            if (candidateSL < entryPrice && entryPrice - candidateSL >= slDistance * 0.5) {
              stopLoss = candidateSL;
            }
          }
        }
        if (resistanceLevels.length > 0) {
          const nearestResistance = resistanceLevels
            .filter(r => r > entryPrice && r <= entryPrice + tpDistance * 1.5)
            .sort((a, b) => a - b)[0];
          if (nearestResistance) {
            tp1 = Math.min(nearestResistance - (atrSafe * 0.3), entryPrice + tpDistance * 1.5);
          }
        }
      }
      stopLoss = Math.max(0.01, Math.min(stopLoss, entryPrice - 0.01));
      tp1 = Math.max(entryPrice + 0.01, tp1);
    } else {
      stopLoss = entryPrice + slDistance;
      tp1 = entryPrice - tpDistance;

      if (!useFixedPoints) {
        if (resistanceLevels.length > 0) {
          const nearestResistance = resistanceLevels
            .filter(r => r > entryPrice && r < stopLoss)
            .sort((a, b) => a - b)[0];
          if (nearestResistance) {
            const candidateSL = nearestResistance + (atrSafe * 0.5);
            if (candidateSL > entryPrice && candidateSL - entryPrice >= slDistance * 0.5) {
              stopLoss = candidateSL;
            }
          }
        }
        if (supportLevels.length > 0) {
          const nearestSupport = supportLevels
            .filter(s => s < entryPrice && s >= entryPrice - tpDistance * 1.5)
            .sort((a, b) => b - a)[0];
          if (nearestSupport) {
            tp1 = Math.max(nearestSupport + (atrSafe * 0.3), entryPrice - tpDistance * 1.5);
          }
        }
      }
      tp1 = Math.max(0.01, Math.min(tp1, entryPrice - 0.01));
      stopLoss = Math.max(entryPrice + 0.01, stopLoss);
    }

    const riskReward = Math.abs(tp1 - entryPrice) / Math.abs(stopLoss - entryPrice);

    return {
      stopLoss: parseFloat(stopLoss.toFixed(2)),
      takeProfit: parseFloat(tp1.toFixed(2)),
      tp1: parseFloat(tp1.toFixed(2)),
      rr: parseFloat(riskReward.toFixed(2))
    };
  }

  /**
   * Zig-zag / swing regime: high path-to-net ratio + many close reversals.
   * Uses 5s bars from ticks so a typical tick-history window yields enough samples.
   */
  private computeSwingMarketMetricsFromTicks(ticks: TickData[]): {
    chopRatio: number;
    closeReversals: number;
    swingMarketOk: boolean;
  } {
    const candles = this.ticksToCandles(ticks, 5);
    const recent = candles.slice(-this.swingLookbackCandles);
    const minBars = 18;
    if (recent.length < minBars) {
      return {
        chopRatio: 0,
        closeReversals: 0,
        swingMarketOk: !this.requireSwingMarket,
      };
    }
    const closes = recent.map((c) => c.close);
    const last = closes[closes.length - 1];
    const eps = Math.max(Math.abs(last) * 1e-9, 1e-12);

    let path = 0;
    for (let i = 1; i < closes.length; i++) {
      path += Math.abs(closes[i] - closes[i - 1]);
    }
    const net = Math.abs(closes[closes.length - 1] - closes[0]);
    const chopRatio = net < eps ? 50 : path / net;

    let closeReversals = 0;
    for (let i = 2; i < closes.length; i++) {
      const d0 = closes[i - 1] - closes[i - 2];
      const d1 = closes[i] - closes[i - 1];
      if (Math.abs(d0) < eps || Math.abs(d1) < eps) continue;
      if (Math.sign(d0) !== Math.sign(d1)) closeReversals++;
    }

    const swingMarketOk =
      !this.requireSwingMarket ||
      (chopRatio >= this.minChopRatio && closeReversals >= this.minSwingReversals);

    return {
      chopRatio: parseFloat(chopRatio.toFixed(3)),
      closeReversals,
      swingMarketOk,
    };
  }

  detectSignal(symbol: string, timeframe: string = 'M1'): SignalDetectionResult {
    try {
      const indicators = this.analyzer.calculateIndicators();
      const ticks = (this.analyzer as any).ticks as TickData[];
      const prices = ticks.map(t => t.quote);
      const currentPrice = prices[prices.length - 1];

      const swing = this.computeSwingMarketMetricsFromTicks(ticks);

      const candles = this.ticksToCandles(ticks, 60);
      const patterns = this.detectCandlePatterns(candles);
      const triggers = this.checkIndicatorTriggers(indicators, currentPrice, timeframe);

      // Analyze market context
      const analysis = this.analyzer.analyzeMarket(symbol);

      // Determine signal direction based on triggers
      let bullishSignals = 0;
      let bearishSignals = 0;

      triggers.forEach(trigger => {
        if (trigger.triggerCondition.includes('Bullish') ||
            trigger.triggerCondition.includes('Oversold') ||
            trigger.triggerCondition.includes('below')) {
          bullishSignals++;
        } else if (trigger.triggerCondition.includes('Bearish') ||
                   trigger.triggerCondition.includes('Overbought') ||
                   trigger.triggerCondition.includes('above')) {
          bearishSignals++;
        }
      });

      // Add pattern signals
      patterns.forEach(pattern => {
        if (pattern.type === 'bullish') {
          bullishSignals += (pattern.confidence / 50);
        } else {
          bearishSignals += (pattern.confidence / 50);
        }
      });

      const direction: 'BUY' | 'SELL' | null =
        bullishSignals > bearishSignals && bullishSignals >= 1 ? 'BUY' :
        bearishSignals > bullishSignals && bearishSignals >= 1 ? 'SELL' :
        null;

      if (!direction) {
        return {
          shouldGenerateSignal: false,
          direction: null,
          triggers,
          patterns,
          confidence: 0,
          riskRewardRatio: 0,
          entryPrice: currentPrice,
          stopLoss: 0,
          takeProfit: 0,
          reasoning: 'Not enough data for analysis - wait for the next round...',
          filters: {
            realizedVolPercentile: indicators.realized_vol_percentile ?? 0.5,
            realizedVol: indicators.realized_vol ?? 0,
            volatilityRegime: (indicators.realized_vol_percentile ?? 0.5) >= 0.7 ? 'high' : (indicators.realized_vol_percentile ?? 0.5) >= 0.45 ? 'medium' : 'low',
            trendEma: indicators.trend_ema ?? 'neutral',
            trendStructure: indicators.trend_structure ?? 'neutral',
            trendStrength: indicators.trend_strength ?? 0,
            chopRatio: swing.chopRatio,
            closeReversals: swing.closeReversals,
            swingMarketOk: swing.swingMarketOk,
            allowed: false,
            blockedReasons: ['no_direction'],
          },
        };
      }

      // Calculate SL/TP
      const slTp = this.calculateStopLossAndTakeProfit(
        direction,
        currentPrice,
        indicators.atr,
        analysis.supportLevels,
        analysis.resistanceLevels,
        symbol
      );

      // Calculate confidence
      const maxSignals = Math.max(bullishSignals, bearishSignals);
      const totalPossibleSignals = 5; // RSI, MACD, EMA, Trend, Patterns
      const confidence = Math.min(Math.round((maxSignals / totalPossibleSignals) * 100), 99);

      // Filters: only trade on high activity + aligned trend (EMA + structure)
      const blockedReasons: string[] = [];
      const rvPct = indicators.realized_vol_percentile ?? 0.5;
      const volatilityRegime: 'high' | 'medium' | 'low' = rvPct >= this.highVolPercentile ? 'high' : rvPct >= Math.max(0.1, this.highVolPercentile - 0.25) ? 'medium' : 'low';
      // Tradable when high or medium; only block the calmest bucket (low).
      if (volatilityRegime === 'low') blockedReasons.push('low_activity');

      const emaTrend = indicators.trend_ema ?? 'neutral';
      const structTrend = indicators.trend_structure ?? 'neutral';
      const emaAligned = (direction === 'BUY' && emaTrend === 'bullish') || (direction === 'SELL' && emaTrend === 'bearish');
      const structAligned = (direction === 'BUY' && structTrend === 'bullish') || (direction === 'SELL' && structTrend === 'bearish');
      const strength = indicators.trend_strength ?? 0;
      const strongTrend = strength >= this.strongTrendStrength;

      // Reduce counter-trend strictness:
      // Only enforce EMA alignment when the trend is strong; in chop/transition, allow signals through.
      if (this.requireTrendAlignment && strongTrend && !emaAligned) blockedReasons.push('counter_trend_ema');
      if (this.requireStructureAlignment && !structAligned) blockedReasons.push('counter_trend_structure');

      // Strong-trend guard: if strength is high, forbid fading EMA direction
      if (strongTrend) {
        if (direction === 'BUY' && emaTrend === 'bearish') blockedReasons.push('strong_trend_fade');
        if (direction === 'SELL' && emaTrend === 'bullish') blockedReasons.push('strong_trend_fade');
      }

      if (this.requireSwingMarket && !swing.swingMarketOk) {
        if (swing.chopRatio < this.minChopRatio) {
          blockedReasons.push('trend_too_efficient');
        }
        if (swing.closeReversals < this.minSwingReversals) {
          blockedReasons.push('insufficient_zigzag');
        }
      }

      // Check quality thresholds + filters
      const baseQuality =
        triggers.length >= this.minTriggers &&
        confidence >= this.minConfidence &&
        slTp.rr >= this.minRiskReward;
      const shouldGenerateSignal = baseQuality && blockedReasons.length === 0;

      // Generate reasoning
      const reasoningCore = this.generateReasoning(direction, triggers, patterns, indicators, confidence, slTp.rr);
      const reasoning = blockedReasons.length > 0
        ? `${reasoningCore}\n\n[Filters] Trade Blocked: ${blockedReasons.join(', ')} (rv_pct=${rvPct.toFixed(2)}, ema=${emaTrend}, structure=${structTrend}, strength=${strength.toFixed(2)}, chop=${swing.chopRatio}, rev=${swing.closeReversals})`
        : `${reasoningCore}\n\n[Filters] Allowed (rv_pct=${rvPct.toFixed(2)}, ema=${emaTrend}, structure=${structTrend}, strength=${strength.toFixed(2)}, chop=${swing.chopRatio}, rev=${swing.closeReversals}, swing_ok)`;

      return {
        shouldGenerateSignal,
        direction,
        triggers,
        patterns,
        confidence,
        riskRewardRatio: slTp.rr,
        entryPrice: currentPrice,
        stopLoss: slTp.stopLoss,
        takeProfit: slTp.takeProfit,
        tp1: slTp.tp1,
        reasoning,
        supportLevels: analysis.supportLevels,
        resistanceLevels: analysis.resistanceLevels,
        atr: indicators.atr,
        filters: {
          realizedVolPercentile: rvPct,
          realizedVol: indicators.realized_vol ?? 0,
          volatilityRegime,
          trendEma: emaTrend,
          trendStructure: structTrend,
          trendStrength: strength,
          chopRatio: swing.chopRatio,
          closeReversals: swing.closeReversals,
          swingMarketOk: swing.swingMarketOk,
          allowed: shouldGenerateSignal,
          blockedReasons,
        },
      };
    } catch (error) {
      return {
        shouldGenerateSignal: false,
        direction: null,
        triggers: [],
        patterns: [],
        confidence: 0,
        riskRewardRatio: 0,
        entryPrice: 0,
        stopLoss: 0,
        takeProfit: 0,
        reasoning: `Analysis error: ${error.message}`
      };
    }
  }

  private generateReasoning(
    direction: 'BUY' | 'SELL',
    triggers: SignalTrigger[],
    patterns: CandlePattern[],
    indicators: TechnicalIndicators,
    confidence: number,
    rr: number
  ): string {
    const parts: string[] = [];

    parts.push(`${direction} signal detected with ${confidence}% confidence.`);

    if (triggers.length > 0) {
      parts.push(`\n\nTriggers (${triggers.length}):`);
      triggers.forEach(t => {
        parts.push(`- ${t.indicatorName}: ${t.triggerCondition}`);
      });
    }

    if (patterns.length > 0) {
      parts.push(`\n\nCandlestick Patterns:`);
      patterns.forEach(p => {
        parts.push(`- ${p.name} (${p.confidence}% confidence): ${p.description}`);
      });
    }

    parts.push(`\n\nMarket Context:`);
    parts.push(`- Trend: ${indicators.trend.toUpperCase()}`);
    parts.push(`- Volatility: ${indicators.volatility.toUpperCase()}`);
    parts.push(`- RSI: ${indicators.rsi.toFixed(1)} ${indicators.rsi < 30 ? '(Oversold)' : indicators.rsi > 70 ? '(Overbought)' : '(Neutral)'}`);
    parts.push(`- MACD: ${indicators.macd.histogram > 0 ? 'Bullish' : 'Bearish'} (Histogram: ${indicators.macd.histogram.toFixed(3)})`);

    return parts.join('\n');
  }
}

export function createSignalDetector(ticks: TickData[], config?: SignalDetectorConfig): AdvancedSignalDetector {
  return new AdvancedSignalDetector(ticks, config);
}

