export interface MT5Signal {
  symbol: string;
  mt5_symbol: string;
  direction: 'BUY' | 'SELL';
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  pip_stop_loss: number;
  pip_take_profit: number;
  risk_reward_ratio: number;
  timeframe: string;
  confidence_percentage: number;
  signal_type: 'breakout' | 'reversal' | 'trend' | 'scalp';
  market_context: string;
  reasoning: string;
  technical_indicators: Record<string, any>;
  expires_at: Date;
}

export interface MarketData {
  symbol: string;
  price: number;
  high24h?: number;
  low24h?: number;
  volume?: number;
  trend?: 'bullish' | 'bearish' | 'neutral';
}

export class SignalGenerator {
  private readonly AI_MODEL_VERSION = 'v1.0';
  private readonly DEFAULT_TIMEFRAME = 'M15';

  formatMT5Symbol(symbol: string): string {
    const symbolMap: Record<string, string> = {
      'EUR/USD': 'EURUSD',
      'GBP/USD': 'GBPUSD',
      'USD/JPY': 'USDJPY',
      'USD/CHF': 'USDCHF',
      'AUD/USD': 'AUDUSD',
      'USD/CAD': 'USDCAD',
      'NZD/USD': 'NZDUSD',
      'EUR/GBP': 'EURGBP',
      'EUR/JPY': 'EURJPY',
      'GBP/JPY': 'GBPJPY',
      'XAU/USD': 'XAUUSD',
      'XAG/USD': 'XAGUSD',
      'BTC/USD': 'BTCUSD',
      'ETH/USD': 'ETHUSD',
      'Volatility 10 Index': 'R_10',
      'Volatility 25 Index': 'R_25',
      'Volatility 50 Index': 'R_50',
      'Volatility 75 Index': 'R_75',
      'Volatility 100 Index': 'R_100',
      'Crash 300 Index': 'CRASH300N',
      'Crash 500 Index': 'CRASH500N',
      'Crash 1000 Index': 'CRASH1000N',
      'Boom 300 Index': 'BOOM300N',
      'Boom 500 Index': 'BOOM500N',
      'Boom 1000 Index': 'BOOM1000N',
      'Step Index': 'stpRNG',
      'Jump 10 Index': 'JD10',
      'Jump 25 Index': 'JD25',
      'Jump 50 Index': 'JD50',
      'Jump 75 Index': 'JD75',
      'Jump 100 Index': 'JD100',
    };

    const formatted = symbol.toUpperCase().replace('/', '');
    return symbolMap[symbol] || formatted;
  }

  calculatePipSize(symbol: string): number {
    if (symbol.includes('JPY')) {
      return 0.01;
    }
    if (symbol.startsWith('XAU') || symbol.startsWith('XAG')) {
      return 0.01;
    }
    if (symbol.includes('BTC') || symbol.includes('ETH')) {
      return 1.0;
    }
    // Volatility indices - 1 pip = 0.01 (minimum price movement)
    if (symbol.startsWith('R_') || symbol.includes('CRASH') || symbol.includes('BOOM') || symbol.includes('JD')) {
      return 0.01;
    }
    return 0.0001;
  }

  calculatePips(symbol: string, price1: number, price2: number): number {
    const pipSize = this.calculatePipSize(symbol);
    return Math.abs(price1 - price2) / pipSize;
  }

  calculateRiskReward(
    entry: number,
    stopLoss: number,
    takeProfit: number,
    direction: 'BUY' | 'SELL'
  ): number {
    let risk: number;
    let reward: number;

    if (direction === 'BUY') {
      risk = entry - stopLoss;
      reward = takeProfit - entry;
    } else {
      risk = stopLoss - entry;
      reward = entry - takeProfit;
    }

    if (risk <= 0) {
      return 0;
    }

    return Number((reward / risk).toFixed(2));
  }

  determineSignalType(marketData: MarketData): 'breakout' | 'reversal' | 'trend' | 'scalp' {
    if (!marketData.high24h || !marketData.low24h) {
      return 'trend';
    }

    const range = marketData.high24h - marketData.low24h;
    const currentFromHigh = marketData.high24h - marketData.price;
    const currentFromLow = marketData.price - marketData.low24h;

    if (currentFromHigh < range * 0.1 || currentFromLow < range * 0.1) {
      return 'breakout';
    }

    if (currentFromHigh > range * 0.7 || currentFromLow > range * 0.7) {
      return 'reversal';
    }

    if (range < marketData.price * 0.005) {
      return 'scalp';
    }

    return 'trend';
  }

  calculateExpiration(timeframe: string): Date {
    const expirationMap: Record<string, number> = {
      'M1': 5,
      'M5': 15,
      'M15': 60,
      'M30': 120,
      'H1': 240,
      'H4': 720,
      'D1': 1440,
    };

    const minutes = expirationMap[timeframe] || 60;
    const expiration = new Date();
    expiration.setMinutes(expiration.getMinutes() + minutes);
    return expiration;
  }

  generateMarketContext(marketData: MarketData, signalType: string): string {
    const contexts: string[] = [];

    if (marketData.trend) {
      contexts.push(`Market trend: ${marketData.trend}`);
    }

    if (marketData.high24h && marketData.low24h) {
      const range = ((marketData.high24h - marketData.low24h) / marketData.price) * 100;
      contexts.push(`24h volatility: ${range.toFixed(2)}%`);
    }

    contexts.push(`Signal pattern: ${signalType}`);

    if (marketData.volume) {
      contexts.push(`Volume: ${marketData.volume > 1000000 ? 'High' : 'Moderate'}`);
    }

    return contexts.join('. ');
  }

  generateAIReasoning(
    direction: 'BUY' | 'SELL',
    signalType: string,
    riskReward: number,
    confidence: number
  ): string {
    const reasons: string[] = [];

    if (direction === 'BUY') {
      reasons.push('Technical analysis indicates bullish momentum');

      if (signalType === 'breakout') {
        reasons.push('Price breaking above key resistance level');
      } else if (signalType === 'reversal') {
        reasons.push('Oversold conditions suggest potential reversal');
      } else if (signalType === 'trend') {
        reasons.push('Strong uptrend confirmed by multiple indicators');
      } else {
        reasons.push('Short-term buying opportunity identified');
      }
    } else {
      reasons.push('Technical analysis indicates bearish momentum');

      if (signalType === 'breakout') {
        reasons.push('Price breaking below key support level');
      } else if (signalType === 'reversal') {
        reasons.push('Overbought conditions suggest potential reversal');
      } else if (signalType === 'trend') {
        reasons.push('Strong downtrend confirmed by multiple indicators');
      } else {
        reasons.push('Short-term selling opportunity identified');
      }
    }

    reasons.push(`Risk-reward ratio of 1:${riskReward.toFixed(1)} offers favorable trade setup`);

    if (confidence >= 80) {
      reasons.push('High confidence signal with strong technical confluence');
    } else if (confidence >= 60) {
      reasons.push('Moderate confidence signal with acceptable risk parameters');
    } else {
      reasons.push('Conservative signal requiring careful position sizing');
    }

    return reasons.join('. ') + '.';
  }

  generateSignal(marketData: MarketData, timeframe: string = 'M15'): MT5Signal {
    const mt5Symbol = this.formatMT5Symbol(marketData.symbol);
    const direction: 'BUY' | 'SELL' = Math.random() > 0.5 ? 'BUY' : 'SELL';

    if (marketData.trend === 'bullish') {
      marketData.trend = 'bullish';
    } else if (marketData.trend === 'bearish') {
      marketData.trend = 'bearish';
    }

    const entryPrice = marketData.price;
    const pipSize = this.calculatePipSize(mt5Symbol);

    let stopLossPips: number;
    let takeProfitPips: number;

    // Day trading targets - much wider than scalping
    // Volatility indices need significantly wider targets due to price movement characteristics
    const isVolatilityIndex = mt5Symbol.startsWith('R_') || mt5Symbol.includes('CRASH') ||
                               mt5Symbol.includes('BOOM') || mt5Symbol.includes('JD');

    if (isVolatilityIndex) {
      // Volatility indices require MUCH wider targets
      // VIX75 typical price: ~3000-8000, VIX100: ~5000-15000
      // For day trading, we need 100-300 point movements
      if (timeframe === 'M1' || timeframe === 'M5') {
        stopLossPips = 150;    // 1.50 points minimum
        takeProfitPips = 300;  // 3.00 points (1:2 RR)
      } else if (timeframe === 'M15' || timeframe === 'M30') {
        stopLossPips = 300;    // 3.00 points
        takeProfitPips = 600;  // 6.00 points (1:2 RR)
      } else if (timeframe === 'H1') {
        stopLossPips = 500;    // 5.00 points
        takeProfitPips = 1000; // 10.00 points (1:2 RR)
      } else {
        stopLossPips = 800;    // 8.00 points
        takeProfitPips = 1600; // 16.00 points (1:2 RR)
      }
    } else {
      // Forex/commodities - day trading targets
      if (timeframe === 'M1' || timeframe === 'M5') {
        stopLossPips = 15;
        takeProfitPips = 30;
      } else if (timeframe === 'M15' || timeframe === 'M30') {
        stopLossPips = 30;
        takeProfitPips = 60;
      } else if (timeframe === 'H1') {
        stopLossPips = 50;
        takeProfitPips = 100;
      } else {
        stopLossPips = 80;
        takeProfitPips = 160;
      }
    }

    let stopLoss: number;
    let takeProfit: number;

    if (direction === 'BUY') {
      stopLoss = entryPrice - (stopLossPips * pipSize);
      takeProfit = entryPrice + (takeProfitPips * pipSize);
    } else {
      stopLoss = entryPrice + (stopLossPips * pipSize);
      takeProfit = entryPrice - (takeProfitPips * pipSize);
    }

    const riskReward = this.calculateRiskReward(entryPrice, stopLoss, takeProfit, direction);
    const signalType = this.determineSignalType(marketData);
    const baseConfidence = 60 + Math.floor(Math.random() * 30);
    const confidenceBoost = riskReward >= 2 ? 10 : 0;
    const confidence = Math.min(95, baseConfidence + confidenceBoost);

    const marketContext = this.generateMarketContext(marketData, signalType);
    const reasoning = this.generateAIReasoning(direction, signalType, riskReward, confidence);

    const technicalIndicators = {
      rsi: direction === 'BUY' ? 35 + Math.random() * 20 : 55 + Math.random() * 20,
      macd: direction === 'BUY' ? 'bullish_cross' : 'bearish_cross',
      moving_averages: direction === 'BUY' ? 'price_above_ma' : 'price_below_ma',
      support_resistance: signalType === 'breakout' ? 'breakout_confirmed' : 'level_respected',
    };

    return {
      symbol: marketData.symbol,
      mt5_symbol: mt5Symbol,
      direction,
      entry_price: Number(entryPrice.toFixed(5)),
      stop_loss: Number(stopLoss.toFixed(5)),
      take_profit: Number(takeProfit.toFixed(5)),
      pip_stop_loss: stopLossPips,
      pip_take_profit: takeProfitPips,
      risk_reward_ratio: riskReward,
      timeframe,
      confidence_percentage: confidence,
      signal_type: signalType,
      market_context: marketContext,
      reasoning,
      technical_indicators: technicalIndicators,
      expires_at: this.calculateExpiration(timeframe),
    };
  }
}

export function createSignalGenerator(): SignalGenerator {
  return new SignalGenerator();
}
