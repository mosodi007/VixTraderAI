import { TechnicalAnalyzer, MarketAnalysis, TickData } from './technical-indicators.ts';
import { DerivAPI } from './deriv-api.ts';
import { getPipSize } from './symbol-sl-tp.ts';

export interface AISignal {
  symbol: string;
  mt5_symbol: string;
  direction: 'BUY' | 'SELL';
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  tp1: number;
  tp2: number;
  tp3: number;
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
  ai_analysis?: string;
}

export class AISignalGenerator {
  private openaiApiKey: string;
  private derivAPI: DerivAPI;

  constructor(openaiApiKey: string, derivAPI: DerivAPI) {
    this.openaiApiKey = openaiApiKey;
    this.derivAPI = derivAPI;
  }

  formatMT5Symbol(symbol: string): string {
    const symbolMap: Record<string, string> = {
      'R_10': 'Volatility 10 Index',
      'R_50': 'Volatility 50 Index',
      'R_100': 'Volatility 100 Index',
      '1HZ10V': 'Volatility 10 (1s) Index',
      '1HZ30V': 'Volatility 30 (1s) Index',
      '1HZ50V': 'Volatility 50 (1s) Index',
      '1HZ90V': 'Volatility 90 (1s) Index',
      '1HZ100V': 'Volatility 100 (1s) Index',
      'stpRNG': 'Step Index',
      'JD25': 'Jump 25 Index',
      'CRASH300N': 'Crash 300 Index',
      'CRASH500N': 'Crash 500 Index',
      'CRASH1000N': 'Crash 1000 Index',
      'BOOM300N': 'Boom 300 Index',
      'BOOM500N': 'Boom 500 Index',
      'BOOM1000N': 'Boom 1000 Index',
    };

    return symbolMap[symbol] || symbol;
  }

  /** Uses shared pip size from symbol-sl-tp for consistent SL/TP across the app. */
  calculatePipSize(symbol: string): number {
    return getPipSize(symbol);
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

    if (risk <= 0) return 0;
    return Number((reward / risk).toFixed(2));
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

  async getAIAnalysis(marketAnalysis: MarketAnalysis): Promise<string> {
    try {
      const prompt = `You are an expert forex and synthetic indices trader analyzing market data for ${marketAnalysis.symbol}.

Current Market Conditions:
- Price: ${marketAnalysis.currentPrice}
- Trend: ${marketAnalysis.indicators.trend}
- Volatility: ${marketAnalysis.indicators.volatility}
- RSI: ${marketAnalysis.indicators.rsi.toFixed(2)}
- MACD: ${marketAnalysis.indicators.macd.macd.toFixed(4)} (Signal: ${marketAnalysis.indicators.macd.signal.toFixed(4)})
- Price vs SMA20: ${marketAnalysis.currentPrice > marketAnalysis.indicators.sma20 ? 'Above' : 'Below'}
- Bollinger Bands: Upper ${marketAnalysis.indicators.bollingerBands.upper.toFixed(4)}, Lower ${marketAnalysis.indicators.bollingerBands.lower.toFixed(4)}
- Support Levels: ${marketAnalysis.supportLevels.map(s => s.toFixed(4)).join(', ')}
- Resistance Levels: ${marketAnalysis.resistanceLevels.map(r => r.toFixed(4)).join(', ')}

Technical Recommendation: ${marketAnalysis.recommendation}
Confidence: ${marketAnalysis.confidence}%

Provide a concise trading analysis (2-3 sentences) explaining the key factors influencing this market and whether traders should consider ${marketAnalysis.recommendation} positions. Focus on the most important technical signals.`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.openaiApiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You are an expert technical analyst for forex and synthetic indices trading. Provide clear, actionable insights based on technical indicators.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.7,
          max_tokens: 200,
        }),
      });

      if (!response.ok) {
        console.error('OpenAI API error:', await response.text());
        return marketAnalysis.analysis;
      }

      const data = await response.json();
      return data.choices[0]?.message?.content || marketAnalysis.analysis;
    } catch (error) {
      console.error('Error getting AI analysis:', error);
      return marketAnalysis.analysis;
    }
  }

  determineSignalType(analysis: MarketAnalysis): 'breakout' | 'reversal' | 'trend' | 'scalp' {
    const { currentPrice, indicators, resistanceLevels, supportLevels } = analysis;

    if (resistanceLevels.length > 0 && Math.abs(currentPrice - resistanceLevels[0]) / currentPrice < 0.002) {
      return 'breakout';
    }

    if (supportLevels.length > 0 && Math.abs(currentPrice - supportLevels[0]) / currentPrice < 0.002) {
      return 'breakout';
    }

    if (indicators.rsi < 30 || indicators.rsi > 70) {
      return 'reversal';
    }

    if (indicators.volatility === 'low') {
      return 'scalp';
    }

    return 'trend';
  }

  async generateSignalFromAnalysis(
    symbol: string,
    marketAnalysis: MarketAnalysis,
    timeframe: string = 'M15'
  ): Promise<AISignal> {
    const mt5Symbol = this.formatMT5Symbol(symbol);
    const direction = marketAnalysis.recommendation === 'SELL' ? 'SELL' :
                     marketAnalysis.recommendation === 'BUY' ? 'BUY' :
                     marketAnalysis.indicators.trend === 'bullish' ? 'BUY' : 'SELL';

    const entryPrice = marketAnalysis.currentPrice;
    const pipSize = this.calculatePipSize(symbol);
    const atrMultiplier = marketAnalysis.indicators.volatility === 'high' ? 2.5 :
                         marketAnalysis.indicators.volatility === 'low' ? 1.0 : 1.5;

    let stopLossPips: number;
    let takeProfitPips: number;

    const atrPips = this.calculatePips(symbol, 0, marketAnalysis.indicators.atr);

    if (atrPips > 0) {
      stopLossPips = Math.round(atrPips * atrMultiplier);
      takeProfitPips = Math.round(stopLossPips * 2);
    } else {
      if (timeframe === 'M1' || timeframe === 'M5') {
        stopLossPips = 50;
        takeProfitPips = 100;
      } else if (timeframe === 'M15' || timeframe === 'M30') {
        stopLossPips = 80;
        takeProfitPips = 160;
      } else if (timeframe === 'H1') {
        stopLossPips = 120;
        takeProfitPips = 240;
      } else {
        stopLossPips = 200;
        takeProfitPips = 400;
      }
    }

    // Ensure minimum stop loss for MT5 compatibility (especially for synthetic indices)
    const minStopLossPips = 50;
    if (stopLossPips < minStopLossPips) {
      stopLossPips = minStopLossPips;
      takeProfitPips = stopLossPips * 2;
    }

    let stopLoss: number;
    let takeProfit: number;

    if (direction === 'BUY') {
      stopLoss = entryPrice - (stopLossPips * pipSize);
      takeProfit = entryPrice + (takeProfitPips * pipSize);

      if (marketAnalysis.supportLevels.length > 0) {
        const nearestSupport = marketAnalysis.supportLevels.find(s => s < entryPrice);
        if (nearestSupport && nearestSupport > stopLoss) {
          stopLoss = nearestSupport - (pipSize * 5);
        }
      }

      if (marketAnalysis.resistanceLevels.length > 0) {
        const nearestResistance = marketAnalysis.resistanceLevels.find(r => r > entryPrice);
        if (nearestResistance && nearestResistance < takeProfit) {
          takeProfit = nearestResistance - (pipSize * 5);
        }
      }
    } else {
      stopLoss = entryPrice + (stopLossPips * pipSize);
      takeProfit = entryPrice - (takeProfitPips * pipSize);

      if (marketAnalysis.resistanceLevels.length > 0) {
        const nearestResistance = marketAnalysis.resistanceLevels.find(r => r > entryPrice);
        if (nearestResistance && nearestResistance < stopLoss) {
          stopLoss = nearestResistance + (pipSize * 5);
        }
      }

      if (marketAnalysis.supportLevels.length > 0) {
        const nearestSupport = marketAnalysis.supportLevels.find(s => s < entryPrice);
        if (nearestSupport && nearestSupport > takeProfit) {
          takeProfit = nearestSupport + (pipSize * 5);
        }
      }
    }

    stopLossPips = this.calculatePips(symbol, entryPrice, stopLoss);
    takeProfitPips = this.calculatePips(symbol, entryPrice, takeProfit);

    const riskReward = this.calculateRiskReward(entryPrice, stopLoss, takeProfit, direction);
    const signalType = this.determineSignalType(marketAnalysis);

    let confidence = marketAnalysis.confidence;
    if (riskReward >= 2) confidence = Math.min(95, confidence + 10);
    if (riskReward >= 3) confidence = Math.min(98, confidence + 5);

    const aiAnalysis = await this.getAIAnalysis(marketAnalysis);

    const marketContext = `${marketAnalysis.indicators.trend} trend with ${marketAnalysis.indicators.volatility} volatility. ${marketAnalysis.analysis}`;

    const tp1 = takeProfit;

    return {
      symbol: mt5Symbol,
      mt5_symbol: symbol,
      direction,
      entry_price: Number(entryPrice.toFixed(5)),
      stop_loss: Number(stopLoss.toFixed(5)),
      take_profit: Number(takeProfit.toFixed(5)),
      tp1: Number(tp1.toFixed(5)),
      tp2: 0,
      tp3: 0,
      pip_stop_loss: Math.round(stopLossPips),
      pip_take_profit: Math.round(takeProfitPips),
      risk_reward_ratio: riskReward,
      timeframe,
      confidence_percentage: Math.round(confidence),
      signal_type: signalType,
      market_context: marketContext,
      reasoning: aiAnalysis,
      technical_indicators: {
        rsi: marketAnalysis.indicators.rsi,
        macd: marketAnalysis.indicators.macd,
        trend: marketAnalysis.indicators.trend,
        volatility: marketAnalysis.indicators.volatility,
        sma20: marketAnalysis.indicators.sma20,
        sma50: marketAnalysis.indicators.sma50,
        bollinger_bands: marketAnalysis.indicators.bollingerBands,
        atr: marketAnalysis.indicators.atr,
      },
      expires_at: this.calculateExpiration(timeframe),
      ai_analysis: aiAnalysis,
    };
  }

  async generateSignalForSymbol(symbol: string, timeframe: string = 'M15'): Promise<AISignal> {
    const tickHistory = await this.derivAPI.getTickHistory(symbol, 1000);

    if (tickHistory.length < 50) {
      throw new Error(`Insufficient tick data for ${symbol}. Need at least 50 ticks, got ${tickHistory.length}`);
    }

    const analyzer = new TechnicalAnalyzer(tickHistory);
    const marketAnalysis = analyzer.analyzeMarket(symbol);

    return await this.generateSignalFromAnalysis(symbol, marketAnalysis, timeframe);
  }

  async generateSignalsForMultipleSymbols(symbols: string[], timeframe: string = 'M15'): Promise<AISignal[]> {
    const signals: AISignal[] = [];

    for (const symbol of symbols) {
      try {
        const signal = await this.generateSignalForSymbol(symbol, timeframe);

        if (signal.confidence_percentage >= 60 && signal.risk_reward_ratio >= 1.5) {
          signals.push(signal);
        }
      } catch (error) {
        console.error(`Error generating signal for ${symbol}:`, error);
      }
    }

    signals.sort((a, b) => {
      const scoreA = a.confidence_percentage * a.risk_reward_ratio;
      const scoreB = b.confidence_percentage * b.risk_reward_ratio;
      return scoreB - scoreA;
    });

    return signals;
  }
}

export function createAISignalGenerator(openaiApiKey: string, derivAPI: DerivAPI): AISignalGenerator {
  return new AISignalGenerator(openaiApiKey, derivAPI);
}
