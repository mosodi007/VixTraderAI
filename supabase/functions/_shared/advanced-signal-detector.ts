//Advance-signal-detector old
import { TechnicalAnalyzer, TickData, Candle, TechnicalIndicators } from './technical-indicators.ts';

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
  reasoning: string;
}

export class AdvancedSignalDetector {
  private analyzer: TechnicalAnalyzer;
  private minTriggers: number = 3;
  private minConfidence: number = 50;
  private minRiskReward: number = 1.5;

  constructor(ticks: TickData[]) {
    this.analyzer = new TechnicalAnalyzer(ticks);
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

    // Bollinger Bands
    if (currentPrice < indicators.bollingerBands.lower) {
      triggers.push({
        indicatorName: 'Bollinger Bands',
        indicatorValue: currentPrice,
        triggerCondition: 'Price below lower band (Oversold - Bullish signal)',
        timeframe
      });
    } else if (currentPrice > indicators.bollingerBands.upper) {
      triggers.push({
        indicatorName: 'Bollinger Bands',
        indicatorValue: currentPrice,
        triggerCondition: 'Price above upper band (Overbought - Bearish signal)',
        timeframe
      });
    }

    // EMA Crossover
    if (indicators.ema12 > indicators.ema26) {
      const crossoverStrength = ((indicators.ema12 - indicators.ema26) / indicators.ema26) * 100;
      if (crossoverStrength > 0.5) {
        triggers.push({
          indicatorName: 'EMA Crossover',
          indicatorValue: crossoverStrength,
          triggerCondition: 'EMA12 above EMA26 (Bullish crossover)',
          timeframe
        });
      }
    } else if (indicators.ema12 < indicators.ema26) {
      const crossoverStrength = ((indicators.ema26 - indicators.ema12) / indicators.ema26) * 100;
      if (crossoverStrength > 0.5) {
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
    resistanceLevels: number[]
  ): { stopLoss: number; takeProfit: number; rr: number } {
    const slMultiplier = 1;
    let riskAmount = atr * slMultiplier;

    const minRiskPercentage = 0.015;
    const minRiskAmount = entryPrice * minRiskPercentage;
    if (riskAmount < minRiskAmount) {
      riskAmount = minRiskAmount;
    }

    const rewardMultiplier = 3;

    let stopLoss: number;
    let takeProfit: number;

    if (direction === 'BUY') {
      stopLoss = entryPrice - riskAmount;
      takeProfit = entryPrice + (riskAmount * rewardMultiplier);

      if (supportLevels.length > 0) {
        const nearestSupport = supportLevels
          .filter(s => s < entryPrice)
          .sort((a, b) => b - a)[0];
        if (nearestSupport) {
          const supportDistance = entryPrice - nearestSupport;
          if (supportDistance > riskAmount * 0.3 && supportDistance < riskAmount * 2) {
            stopLoss = nearestSupport - (atr * 0.5);
            const newRisk = entryPrice - stopLoss;
            takeProfit = entryPrice + (newRisk * rewardMultiplier);
          }
        }
      }
    } else {
      stopLoss = entryPrice + riskAmount;
      takeProfit = entryPrice - (riskAmount * rewardMultiplier);

      if (resistanceLevels.length > 0) {
        const nearestResistance = resistanceLevels
          .filter(r => r > entryPrice)
          .sort((a, b) => a - b)[0];
        if (nearestResistance) {
          const resistanceDistance = nearestResistance - entryPrice;
          if (resistanceDistance > riskAmount * 0.3 && resistanceDistance < riskAmount * 2) {
            stopLoss = nearestResistance + (atr * 0.5);
            const newRisk = stopLoss - entryPrice;
            takeProfit = entryPrice - (newRisk * rewardMultiplier);
          }
        }
      }
    }

    const riskReward = Math.abs(takeProfit - entryPrice) / Math.abs(stopLoss - entryPrice);

    return {
      stopLoss: parseFloat(stopLoss.toFixed(2)),
      takeProfit: parseFloat(takeProfit.toFixed(2)),
      rr: parseFloat(riskReward.toFixed(2))
    };
  }

  detectSignal(symbol: string, timeframe: string = 'M15'): SignalDetectionResult {
    try {
      const indicators = this.analyzer.calculateIndicators();
      const ticks = (this.analyzer as any).ticks as TickData[];
      const prices = ticks.map(t => t.quote);
      const currentPrice = prices[prices.length - 1];

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
          reasoning: 'Insufficient signal strength. Need at least 3 confirming indicators with 75% confidence.'
        };
      }

      // Calculate SL/TP
      const slTp = this.calculateStopLossAndTakeProfit(
        direction,
        currentPrice,
        indicators.atr,
        analysis.supportLevels,
        analysis.resistanceLevels
      );

      // Calculate confidence
      const maxSignals = Math.max(bullishSignals, bearishSignals);
      const totalPossibleSignals = 6; // RSI, MACD, BB, EMA, Trend, Patterns
      const confidence = Math.min(Math.round((maxSignals / totalPossibleSignals) * 100), 99);

      // Check quality thresholds
      const shouldGenerateSignal =
        triggers.length >= this.minTriggers &&
        confidence >= this.minConfidence &&
        slTp.rr >= this.minRiskReward;

      // Generate reasoning
      const reasoning = this.generateReasoning(direction, triggers, patterns, indicators, confidence, slTp.rr);

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
        reasoning
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

    parts.push(`${direction} signal detected with ${confidence}% confidence and ${rr}:1 risk-reward ratio.`);

    if (triggers.length > 0) {
      parts.push(`\n\nTechnical Triggers (${triggers.length}):`);
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

export function createSignalDetector(ticks: TickData[]): AdvancedSignalDetector {
  return new AdvancedSignalDetector(ticks);
}
