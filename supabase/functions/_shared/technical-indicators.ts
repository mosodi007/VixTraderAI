export interface TickData {
  epoch: number;
  quote: number;
  symbol: string;
}

export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  time: number;
}

export interface TechnicalIndicators {
  rsi: number;
  macd: {
    macd: number;
    signal: number;
    histogram: number;
  };
  sma20: number;
  sma50: number;
  ema50: number;
  ema12: number;
  ema26: number;
  ema200: number;
  ema200_slope: number;
  bollingerBands: {
    upper: number;
    middle: number;
    lower: number;
  };
  atr: number;
  trend: 'bullish' | 'bearish' | 'neutral';
  volatility: 'high' | 'medium' | 'low';
  /** Realized volatility (std dev of log returns) */
  realized_vol: number;
  /** Percentile of realized_vol vs recent distribution (0..1) */
  realized_vol_percentile: number;
  /** Trend direction from EMA50/EMA200 + slope */
  trend_ema: 'bullish' | 'bearish' | 'neutral';
  /** Market structure direction from recent swings */
  trend_structure: 'bullish' | 'bearish' | 'neutral';
  /** Strength of EMA trend: |ema50-ema200| / max(atr, eps) */
  trend_strength: number;
}

export interface MarketAnalysis {
  symbol: string;
  currentPrice: number;
  indicators: TechnicalIndicators;
  supportLevels: number[];
  resistanceLevels: number[];
  signalStrength: number;
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  analysis: string;
}

export class TechnicalAnalyzer {
  private ticks: TickData[] = [];

  constructor(ticks: TickData[] = []) {
    this.ticks = ticks;
  }

  addTick(tick: TickData): void {
    this.ticks.push(tick);
    if (this.ticks.length > 1000) {
      this.ticks.shift();
    }
  }

  private calculateSMA(prices: number[], period: number): number {
    if (prices.length < period) return prices[prices.length - 1] || 0;
    const slice = prices.slice(-period);
    return slice.reduce((sum, price) => sum + price, 0) / period;
  }

  private calculateEMA(prices: number[], period: number): number {
    if (prices.length < period) return this.calculateSMA(prices, prices.length);

    const k = 2 / (period + 1);
    let ema = this.calculateSMA(prices.slice(0, period), period);

    for (let i = period; i < prices.length; i++) {
      ema = prices[i] * k + ema * (1 - k);
    }

    return ema;
  }

  private calculateRSI(prices: number[], period: number = 14): number {
    if (prices.length < period + 1) return 50;

    let gains = 0;
    let losses = 0;

    for (let i = prices.length - period; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      if (change > 0) {
        gains += change;
      } else {
        losses -= change;
      }
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;

    if (avgLoss === 0) return 100;

    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  private calculateMACD(prices: number[]): { macd: number; signal: number; histogram: number } {
    const ema12 = this.calculateEMA(prices, 12);
    const ema26 = this.calculateEMA(prices, 26);
    const macd = ema12 - ema26;

    const macdLine: number[] = [];
    for (let i = 26; i <= prices.length; i++) {
      const slice = prices.slice(0, i);
      const e12 = this.calculateEMA(slice, 12);
      const e26 = this.calculateEMA(slice, 26);
      macdLine.push(e12 - e26);
    }

    const signal = this.calculateEMA(macdLine, 9);
    const histogram = macd - signal;

    return { macd, signal, histogram };
  }

  private calculateBollingerBands(prices: number[], period: number = 20, stdDev: number = 2): {
    upper: number;
    middle: number;
    lower: number;
  } {
    const middle = this.calculateSMA(prices, period);

    if (prices.length < period) {
      return { upper: middle, middle, lower: middle };
    }

    const slice = prices.slice(-period);
    const variance = slice.reduce((sum, price) => {
      return sum + Math.pow(price - middle, 2);
    }, 0) / period;

    const standardDeviation = Math.sqrt(variance);

    return {
      upper: middle + (standardDeviation * stdDev),
      middle,
      lower: middle - (standardDeviation * stdDev),
    };
  }

  private calculateATR(candles: Candle[], period: number = 14): number {
    if (candles.length < 2) return 0;

    const trueRanges: number[] = [];

    for (let i = 1; i < candles.length; i++) {
      const high = candles[i].high;
      const low = candles[i].low;
      const prevClose = candles[i - 1].close;

      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );

      trueRanges.push(tr);
    }

    return this.calculateSMA(trueRanges, Math.min(period, trueRanges.length));
  }

  private calculateLogReturns(prices: number[], window: number): number[] {
    const n = Math.min(window, prices.length);
    if (n < 3) return [];
    const slice = prices.slice(-n);
    const rets: number[] = [];
    for (let i = 1; i < slice.length; i++) {
      const prev = slice[i - 1];
      const cur = slice[i];
      if (prev > 0 && cur > 0) {
        rets.push(Math.log(cur / prev));
      }
    }
    return rets;
  }

  private std(values: number[]): number {
    if (values.length < 2) return 0;
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / (values.length - 1);
    return Math.sqrt(variance);
  }

  private realizedVol(prices: number[], window: number): number {
    const rets = this.calculateLogReturns(prices, window);
    return this.std(rets);
  }

  private realizedVolPercentile(prices: number[], window: number, lookback: number): { vol: number; pct: number } {
    const volNow = this.realizedVol(prices, window);
    const vols: number[] = [];
    const step = Math.max(5, Math.floor(window / 5));
    const maxStart = Math.max(0, prices.length - lookback);
    for (let end = prices.length; end >= maxStart + window; end -= step) {
      const sub = prices.slice(0, end);
      vols.push(this.realizedVol(sub, window));
      if (vols.length >= 60) break;
    }
    const valid = vols.filter((v) => Number.isFinite(v) && v > 0);
    if (valid.length < 5 || volNow <= 0) return { vol: volNow, pct: 0.5 };
    valid.sort((a, b) => a - b);
    let count = 0;
    for (const v of valid) if (v <= volNow) count++;
    return { vol: volNow, pct: count / valid.length };
  }

  private detectStructureTrend(candles: Candle[]): 'bullish' | 'bearish' | 'neutral' {
    if (candles.length < 20) return 'neutral';
    const recent = candles.slice(-80);
    const swingHighs: number[] = [];
    const swingLows: number[] = [];
    for (let i = 2; i < recent.length - 2; i++) {
      const c = recent[i];
      const p1 = recent[i - 1], p2 = recent[i - 2];
      const n1 = recent[i + 1], n2 = recent[i + 2];
      if (c.high > p1.high && c.high > p2.high && c.high > n1.high && c.high > n2.high) swingHighs.push(c.high);
      if (c.low < p1.low && c.low < p2.low && c.low < n1.low && c.low < n2.low) swingLows.push(c.low);
    }
    const h = swingHighs.slice(-3);
    const l = swingLows.slice(-3);
    if (h.length >= 2 && l.length >= 2) {
      const hh = h[h.length - 1] > h[h.length - 2];
      const hl = l[l.length - 1] > l[l.length - 2];
      const lh = h[h.length - 1] < h[h.length - 2];
      const ll = l[l.length - 1] < l[l.length - 2];
      if (hh && hl) return 'bullish';
      if (lh && ll) return 'bearish';
    }
    return 'neutral';
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

  private findSupportResistance(candles: Candle[], numLevels: number = 3): {
    support: number[];
    resistance: number[];
  } {
    if (candles.length < 20) {
      return { support: [], resistance: [] };
    }

    const recentCandles = candles.slice(-50);
    const pivotPoints: { price: number; type: 'high' | 'low' }[] = [];

    for (let i = 2; i < recentCandles.length - 2; i++) {
      const candle = recentCandles[i];
      const prevCandle = recentCandles[i - 1];
      const nextCandle = recentCandles[i + 1];

      if (candle.high > prevCandle.high && candle.high > nextCandle.high) {
        pivotPoints.push({ price: candle.high, type: 'high' });
      }

      if (candle.low < prevCandle.low && candle.low < nextCandle.low) {
        pivotPoints.push({ price: candle.low, type: 'low' });
      }
    }

    const resistanceLevels = pivotPoints
      .filter(p => p.type === 'high')
      .map(p => p.price)
      .sort((a, b) => b - a)
      .slice(0, numLevels);

    const supportLevels = pivotPoints
      .filter(p => p.type === 'low')
      .map(p => p.price)
      .sort((a, b) => a - b)
      .slice(0, numLevels);

    return {
      support: supportLevels,
      resistance: resistanceLevels,
    };
  }

  calculateIndicators(): TechnicalIndicators {
    if (this.ticks.length < 50) {
      throw new Error('Insufficient data for technical analysis. Need at least 50 ticks.');
    }

    const prices = this.ticks.map(t => t.quote);
    const candles = this.ticksToCandles(this.ticks, 60);

    const rsi = this.calculateRSI(prices, 14);
    const macd = this.calculateMACD(prices);
    const sma20 = this.calculateSMA(prices, 20);
    const sma50 = this.calculateSMA(prices, 50);
    const ema50 = this.calculateEMA(prices, 50);
    const ema12 = this.calculateEMA(prices, 12);
    const ema26 = this.calculateEMA(prices, 26);
    const ema200 = this.calculateEMA(prices, 200);
    const ema200_prev = this.calculateEMA(prices.slice(0, Math.max(10, prices.length - 10)), 200);
    const ema200_slope = ema200 - ema200_prev;
    const bollingerBands = this.calculateBollingerBands(prices, 20, 2);
    const atr = this.calculateATR(candles, 14);

    const currentPrice = prices[prices.length - 1];
    let trend: 'bullish' | 'bearish' | 'neutral' = 'neutral';

    if (ema12 > ema26 && currentPrice > sma20) {
      trend = 'bullish';
    } else if (ema12 < ema26 && currentPrice < sma20) {
      trend = 'bearish';
    }

    const bbWidth = bollingerBands.upper - bollingerBands.lower;
    const avgPrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;
    const volatilityRatio = bbWidth / avgPrice;

    let volatility: 'high' | 'medium' | 'low' = 'medium';
    if (volatilityRatio > 0.05) {
      volatility = 'high';
    } else if (volatilityRatio < 0.02) {
      volatility = 'low';
    }

    const { vol: realized_vol, pct: realized_vol_percentile } = this.realizedVolPercentile(prices, 200, 800);
    const trend_structure = this.detectStructureTrend(candles);
    let trend_ema: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    if (ema50 > ema200 && ema200_slope > 0) trend_ema = 'bullish';
    else if (ema50 < ema200 && ema200_slope < 0) trend_ema = 'bearish';
    const trend_strength = Math.abs(ema50 - ema200) / Math.max(atr, currentPrice * 0.0001, 1e-9);

    return {
      rsi,
      macd,
      sma20,
      sma50,
      ema50,
      ema12,
      ema26,
      ema200,
      ema200_slope,
      bollingerBands,
      atr,
      trend,
      volatility,
      realized_vol,
      realized_vol_percentile,
      trend_ema,
      trend_structure,
      trend_strength,
    };
  }

  analyzeMarket(symbol: string): MarketAnalysis {
    const indicators = this.calculateIndicators();
    const prices = this.ticks.map(t => t.quote);
    const currentPrice = prices[prices.length - 1];
    const candles = this.ticksToCandles(this.ticks, 60);
    const { support, resistance } = this.findSupportResistance(candles);

    let signals = 0;
    let totalSignals = 0;
    let recommendation: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';

    if (indicators.rsi < 30) {
      signals += 1;
      totalSignals += 1;
    } else if (indicators.rsi > 70) {
      signals -= 1;
      totalSignals += 1;
    }

    if (indicators.macd.histogram > 0 && indicators.macd.macd > indicators.macd.signal) {
      signals += 1;
      totalSignals += 1;
    } else if (indicators.macd.histogram < 0 && indicators.macd.macd < indicators.macd.signal) {
      signals -= 1;
      totalSignals += 1;
    }

    if (indicators.trend === 'bullish') {
      signals += 1;
      totalSignals += 1;
    } else if (indicators.trend === 'bearish') {
      signals -= 1;
      totalSignals += 1;
    }

    if (currentPrice < indicators.bollingerBands.lower) {
      signals += 1;
      totalSignals += 1;
    } else if (currentPrice > indicators.bollingerBands.upper) {
      signals -= 1;
      totalSignals += 1;
    }

    const signalStrength = totalSignals > 0 ? Math.abs(signals) / totalSignals : 0;
    const confidence = Math.round(signalStrength * 100);

    if (signals >= 2) {
      recommendation = 'BUY';
    } else if (signals <= -2) {
      recommendation = 'SELL';
    }

    const analysis = this.generateAnalysis(indicators, recommendation, currentPrice);

    return {
      symbol,
      currentPrice,
      indicators,
      supportLevels: support,
      resistanceLevels: resistance,
      signalStrength,
      recommendation,
      confidence,
      analysis,
    };
  }

  private generateAnalysis(indicators: TechnicalIndicators, recommendation: string, currentPrice: number): string {
    const parts: string[] = [];

    parts.push(`Market is showing ${indicators.trend} trend with ${indicators.volatility} volatility.`);

    if (indicators.rsi < 30) {
      parts.push('RSI indicates oversold conditions.');
    } else if (indicators.rsi > 70) {
      parts.push('RSI indicates overbought conditions.');
    } else {
      parts.push(`RSI at ${indicators.rsi.toFixed(1)} is neutral.`);
    }

    if (indicators.macd.histogram > 0) {
      parts.push('MACD showing bullish momentum.');
    } else {
      parts.push('MACD showing bearish momentum.');
    }

    if (currentPrice > indicators.bollingerBands.upper) {
      parts.push('Price is above upper Bollinger Band (overbought).');
    } else if (currentPrice < indicators.bollingerBands.lower) {
      parts.push('Price is below lower Bollinger Band (oversold).');
    }

    return parts.join(' ');
  }
}
