import { TechnicalAnalyzer, TickData, TechnicalIndicators } from './technical-indicators.ts';

export interface TimeframeAnalysis {
  timeframe: string;
  interval: number; // seconds
  indicators: TechnicalIndicators;
  trend: 'bullish' | 'bearish' | 'neutral';
  strength: number; // 0-100
}

export interface MultiTimeframeResult {
  symbol: string;
  timeframes: TimeframeAnalysis[];
  overallTrend: 'bullish' | 'bearish' | 'neutral';
  trendAlignment: number; // 0-100, how well timeframes align
  recommendation: 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG_SELL';
  confidence: number;
  analysis: string;
}

export class MultiTimeframeAnalyzer {
  private ticks: TickData[];

  // Timeframe intervals in seconds
  private timeframes = {
    'M5': 300,    // 5 minutes
    'M15': 900,   // 15 minutes
    'M30': 1800,  // 30 minutes
    'H1': 3600    // 1 hour
  };

  constructor(ticks: TickData[]) {
    this.ticks = ticks;
  }

  private ticksToTimeframeCandles(ticks: TickData[], interval: number): TickData[] {
    if (ticks.length === 0) return [];

    const groupedTicks: { [key: number]: TickData[] } = {};

    // Group ticks by timeframe interval
    for (const tick of ticks) {
      const timeframeKey = Math.floor(tick.epoch / interval) * interval;
      if (!groupedTicks[timeframeKey]) {
        groupedTicks[timeframeKey] = [];
      }
      groupedTicks[timeframeKey].push(tick);
    }

    // Create representative ticks for each timeframe (using close price)
    const timeframeTicks: TickData[] = [];
    const sortedKeys = Object.keys(groupedTicks).map(Number).sort((a, b) => a - b);

    for (const key of sortedKeys) {
      const tickGroup = groupedTicks[key];
      const lastTick = tickGroup[tickGroup.length - 1];
      timeframeTicks.push({
        epoch: key,
        quote: lastTick.quote,
        symbol: lastTick.symbol
      });
    }

    return timeframeTicks;
  }

  private analyzeTrendStrength(indicators: TechnicalIndicators): number {
    let strength = 0;
    let factors = 0;

    // RSI contribution
    if (indicators.rsi < 30) {
      strength += 100; // Strong oversold (bullish)
      factors++;
    } else if (indicators.rsi > 70) {
      strength += 100; // Strong overbought (bearish reversal)
      factors++;
    } else if (indicators.rsi >= 45 && indicators.rsi <= 55) {
      strength += 30; // Neutral
      factors++;
    } else {
      strength += 60; // Moderate
      factors++;
    }

    // MACD contribution
    const macdStrength = Math.abs(indicators.macd.histogram);
    if (macdStrength > 0.5) {
      strength += 90;
    } else if (macdStrength > 0.2) {
      strength += 60;
    } else {
      strength += 30;
    }
    factors++;

    // Trend contribution
    if (indicators.trend === 'bullish' || indicators.trend === 'bearish') {
      strength += 80;
    } else {
      strength += 20;
    }
    factors++;

    // Moving average alignment
    if (indicators.ema12 > indicators.ema26 && indicators.ema12 > indicators.sma20) {
      strength += 70; // Strong bullish alignment
    } else if (indicators.ema12 < indicators.ema26 && indicators.ema12 < indicators.sma20) {
      strength += 70; // Strong bearish alignment
    } else {
      strength += 30; // Mixed signals
    }
    factors++;

    return Math.min(Math.round(strength / factors), 100);
  }

  analyzeMultipleTimeframes(): MultiTimeframeResult {
    const timeframeAnalyses: TimeframeAnalysis[] = [];

    // Analyze each timeframe
    for (const [tfName, interval] of Object.entries(this.timeframes)) {
      try {
        const tfTicks = this.ticksToTimeframeCandles(this.ticks, interval);

        if (tfTicks.length < 50) {
          console.log(`Insufficient data for ${tfName} timeframe`);
          continue;
        }

        const analyzer = new TechnicalAnalyzer(tfTicks);
        const indicators = analyzer.calculateIndicators();
        const strength = this.analyzeTrendStrength(indicators);

        timeframeAnalyses.push({
          timeframe: tfName,
          interval: interval,
          indicators: indicators,
          trend: indicators.trend,
          strength: strength
        });

        console.log(`${tfName}: ${indicators.trend} (Strength: ${strength}%)`);
      } catch (error: any) {
        console.log(`Error analyzing ${tfName}:`, error.message);
      }
    }

    if (timeframeAnalyses.length === 0) {
      throw new Error('Unable to analyze any timeframes');
    }

    // Calculate overall trend and alignment
    let bullishCount = 0;
    let bearishCount = 0;
    let totalWeight = 0;

    // Weight higher timeframes more heavily
    const weights = {
      'M5': 1,
      'M15': 2,
      'M30': 3,
      'H1': 4
    };

    for (const tf of timeframeAnalyses) {
      const weight = weights[tf.timeframe as keyof typeof weights] || 1;
      totalWeight += weight;

      if (tf.trend === 'bullish') {
        bullishCount += weight;
      } else if (tf.trend === 'bearish') {
        bearishCount += weight;
      }
    }

    const overallTrend: 'bullish' | 'bearish' | 'neutral' =
      bullishCount > bearishCount && bullishCount / totalWeight > 0.6 ? 'bullish' :
      bearishCount > bullishCount && bearishCount / totalWeight > 0.6 ? 'bearish' :
      'neutral';

    // Calculate alignment (how well timeframes agree)
    const maxCount = Math.max(bullishCount, bearishCount);
    const trendAlignment = Math.round((maxCount / totalWeight) * 100);

    // Determine recommendation
    let recommendation: 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG_SELL';
    let confidence = trendAlignment;

    if (overallTrend === 'bullish') {
      recommendation = trendAlignment >= 80 ? 'STRONG_BUY' : 'BUY';
    } else if (overallTrend === 'bearish') {
      recommendation = trendAlignment >= 80 ? 'STRONG_SELL' : 'SELL';
    } else {
      recommendation = 'NEUTRAL';
      confidence = 50;
    }

    // Generate analysis text
    const analysis = this.generateMultiTimeframeAnalysis(
      timeframeAnalyses,
      overallTrend,
      trendAlignment,
      recommendation
    );

    return {
      symbol: this.ticks[0]?.symbol || 'UNKNOWN',
      timeframes: timeframeAnalyses,
      overallTrend,
      trendAlignment,
      recommendation,
      confidence,
      analysis
    };
  }

  private generateMultiTimeframeAnalysis(
    timeframes: TimeframeAnalysis[],
    overallTrend: string,
    alignment: number,
    recommendation: string
  ): string {
    const parts: string[] = [];

    parts.push(`Multi-Timeframe Analysis shows ${overallTrend.toUpperCase()} trend with ${alignment}% alignment.`);
    parts.push(`\n\nTimeframe Breakdown:`);

    for (const tf of timeframes) {
      const rsi = tf.indicators.rsi.toFixed(1);
      const macdSignal = tf.indicators.macd.histogram > 0 ? 'Bullish' : 'Bearish';
      parts.push(
        `- ${tf.timeframe}: ${tf.trend.toUpperCase()} (Strength: ${tf.strength}%) | RSI: ${rsi} | MACD: ${macdSignal}`
      );
    }

    parts.push(`\n\nRecommendation: ${recommendation}`);

    if (alignment >= 80) {
      parts.push('Strong alignment across all timeframes indicates high probability setup.');
    } else if (alignment >= 60) {
      parts.push('Good alignment across most timeframes.');
    } else {
      parts.push('Mixed signals across timeframes. Exercise caution.');
    }

    return parts.join('\n');
  }

  // Check if higher timeframe confirms the signal
  validateSignalWithHigherTimeframe(
    signalDirection: 'BUY' | 'SELL',
    primaryTimeframe: string = 'M15'
  ): { valid: boolean; reason: string } {
    try {
      const mtfAnalysis = this.analyzeMultipleTimeframes();

      // For BUY signals, higher timeframe should be bullish or neutral
      if (signalDirection === 'BUY') {
        if (mtfAnalysis.overallTrend === 'bearish' && mtfAnalysis.trendAlignment > 70) {
          return {
            valid: false,
            reason: 'Higher timeframe shows strong bearish trend. Counter-trend signal rejected.'
          };
        }
        return {
          valid: true,
          reason: mtfAnalysis.overallTrend === 'bullish'
            ? 'Higher timeframe confirms bullish direction'
            : 'Higher timeframe neutral, signal acceptable'
        };
      }

      // For SELL signals, higher timeframe should be bearish or neutral
      if (signalDirection === 'SELL') {
        if (mtfAnalysis.overallTrend === 'bullish' && mtfAnalysis.trendAlignment > 70) {
          return {
            valid: false,
            reason: 'Higher timeframe shows strong bullish trend. Counter-trend signal rejected.'
          };
        }
        return {
          valid: true,
          reason: mtfAnalysis.overallTrend === 'bearish'
            ? 'Higher timeframe confirms bearish direction'
            : 'Higher timeframe neutral, signal acceptable'
        };
      }

      return { valid: false, reason: 'Invalid signal direction' };
    } catch (error: any) {
      return { valid: true, reason: 'Unable to validate with higher timeframe, signal allowed' };
    }
  }
}

export function createMultiTimeframeAnalyzer(ticks: TickData[]): MultiTimeframeAnalyzer {
  return new MultiTimeframeAnalyzer(ticks);
}
