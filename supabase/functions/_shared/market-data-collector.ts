import { DerivAPI, TickData } from './deriv-api.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

export interface MarketDataSnapshot {
  symbol: string;
  price: number;
  timestamp: number;
  tick_count: number;
  high: number;
  low: number;
  average: number;
}

export class MarketDataCollector {
  private derivAPI: DerivAPI;
  private supabaseUrl: string;
  private supabaseKey: string;
  private tickCache: Map<string, TickData[]>;
  private activeStreams: Map<string, WebSocket>;

  constructor(derivAPI: DerivAPI, supabaseUrl: string, supabaseKey: string) {
    this.derivAPI = derivAPI;
    this.supabaseUrl = supabaseUrl;
    this.supabaseKey = supabaseKey;
    this.tickCache = new Map();
    this.activeStreams = new Map();
  }

  async collectHistoricalData(symbol: string, count: number = 1000): Promise<TickData[]> {
    try {
      const ticks = await this.derivAPI.getTickHistory(symbol, count);
      this.tickCache.set(symbol, ticks);
      return ticks;
    } catch (error) {
      console.error(`Error collecting historical data for ${symbol}:`, error);
      return [];
    }
  }

  async startRealtimeCollection(symbol: string): Promise<void> {
    if (this.activeStreams.has(symbol)) {
      console.log(`Already streaming ${symbol}`);
      return;
    }

    try {
      const ws = await this.derivAPI.streamTicks(symbol, (tick: TickData) => {
        let ticks = this.tickCache.get(symbol) || [];
        ticks.push(tick);

        if (ticks.length > 1000) {
          ticks.shift();
        }

        this.tickCache.set(symbol, ticks);
      });

      this.activeStreams.set(symbol, ws);
      console.log(`Started streaming ${symbol}`);
    } catch (error) {
      console.error(`Error starting realtime collection for ${symbol}:`, error);
    }
  }

  stopRealtimeCollection(symbol: string): void {
    const ws = this.activeStreams.get(symbol);
    if (ws) {
      ws.close();
      this.activeStreams.delete(symbol);
      console.log(`Stopped streaming ${symbol}`);
    }
  }

  stopAllStreams(): void {
    for (const [symbol, ws] of this.activeStreams.entries()) {
      ws.close();
      console.log(`Stopped streaming ${symbol}`);
    }
    this.activeStreams.clear();
  }

  getTicksForSymbol(symbol: string): TickData[] {
    return this.tickCache.get(symbol) || [];
  }

  getMarketSnapshot(symbol: string): MarketDataSnapshot | null {
    const ticks = this.tickCache.get(symbol);
    if (!ticks || ticks.length === 0) {
      return null;
    }

    const prices = ticks.map(t => t.quote);
    const latest = ticks[ticks.length - 1];

    return {
      symbol,
      price: latest.quote,
      timestamp: latest.epoch,
      tick_count: ticks.length,
      high: Math.max(...prices),
      low: Math.min(...prices),
      average: prices.reduce((sum, p) => sum + p, 0) / prices.length,
    };
  }

  async saveMarketSnapshot(snapshot: MarketDataSnapshot): Promise<void> {
    try {
      const supabase = createClient(this.supabaseUrl, this.supabaseKey);

      const { error } = await supabase
        .from('market_snapshots')
        .insert({
          symbol: snapshot.symbol,
          price: snapshot.price,
          high: snapshot.high,
          low: snapshot.low,
          average: snapshot.average,
          tick_count: snapshot.tick_count,
          timestamp: new Date(snapshot.timestamp * 1000).toISOString(),
        });

      if (error) {
        console.error('Error saving market snapshot:', error);
      }
    } catch (error) {
      console.error('Error saving market snapshot:', error);
    }
  }

  clearCache(symbol?: string): void {
    if (symbol) {
      this.tickCache.delete(symbol);
    } else {
      this.tickCache.clear();
    }
  }

  getCachedSymbols(): string[] {
    return Array.from(this.tickCache.keys());
  }

  getStreamStatus(): Record<string, boolean> {
    const status: Record<string, boolean> = {};
    for (const symbol of this.tickCache.keys()) {
      status[symbol] = this.activeStreams.has(symbol);
    }
    return status;
  }
}

export function createMarketDataCollector(
  derivAPI: DerivAPI,
  supabaseUrl: string,
  supabaseKey: string
): MarketDataCollector {
  return new MarketDataCollector(derivAPI, supabaseUrl, supabaseKey);
}
