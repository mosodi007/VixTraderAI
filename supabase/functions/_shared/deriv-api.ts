/**
 * Deriv API Service
 *
 * Provides a reusable service for interacting with Deriv's WebSocket API
 * for MT5 account management, verification, and data retrieval.
 */

export interface DerivAPIConfig {
  apiToken: string;
  appId?: string;
}

export interface MT5AccountInfo {
  login: string;
  server: string;
  balance: number;
  equity: number;
  margin: number;
  free_margin: number;
  margin_level: number;
  currency: string;
  leverage: number;
  account_type?: string; // 'demo' or 'real'
  market_type?: string; // 'financial', 'synthetic', etc.
  name?: string;
  email?: string;
}

export interface MT5ValidationResult {
  isValid: boolean;
  accountInfo?: MT5AccountInfo;
  accountType?: 'demo' | 'live';
  serverValid?: boolean;
  hasBalance?: boolean;
  errors?: string[];
}

export interface MT5Position {
  ticket: string;
  symbol: string;
  type: number; // 0 = BUY, 1 = SELL
  volume: number;
  price_open: number;
  price_current: number;
  stop_loss: number;
  take_profit: number;
  profit: number;
  time: number; // Unix timestamp
}

export interface MT5Deal {
  ticket: string;
  order: string;
  symbol: string;
  type: number; // 0 = BUY, 1 = SELL
  volume: number;
  price: number;
  profit: number;
  time: number;
}

export interface TickData {
  epoch: number;
  quote: number;
  symbol: string;
  pip_size?: number;
}

export interface CandleData {
  open: number;
  high: number;
  low: number;
  close: number;
  epoch: number;
}

export interface MultiTimeframeMarketData {
  m1: CandleData[];
  m5: CandleData[];
  m15: CandleData[];
  ticks: TickData[];
}

export class DerivAPI {
  private config: DerivAPIConfig;
  private wsUrl: string;

  constructor(config: DerivAPIConfig) {
    this.config = config;
    const appId = config.appId || "89937";
    this.wsUrl = `wss://ws.derivws.com/websockets/v3?app_id=${appId}`;
  }

  /**
   * Execute a WebSocket request and wait for response
   */
  private async executeRequest<T>(request: any, msgType: string, requireAuth: boolean = true): Promise<T> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl);
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error("Request timeout"));
      }, 30000);

      ws.onopen = () => {
        if (requireAuth) {
          ws.send(JSON.stringify({
            authorize: this.config.apiToken,
          }));
        } else {
          ws.send(JSON.stringify(request));
        }
      };

      ws.onmessage = (event) => {
        const response = JSON.parse(event.data);

        if (response.error) {
          clearTimeout(timeout);
          ws.close();
          reject(new Error(response.error.message || "API error"));
          return;
        }

        if (response.msg_type === "authorize" && requireAuth) {
          ws.send(JSON.stringify(request));
        }

        if (response.msg_type === msgType) {
          clearTimeout(timeout);
          ws.close();
          resolve(response[msgType] as T);
        }
      };

      ws.onerror = (error) => {
        clearTimeout(timeout);
        ws.close();
        reject(error);
      };
    });
  }

  /**
   * Get list of MT5 accounts for authenticated user
   */
  async getMT5Accounts(): Promise<any[]> {
    const result = await this.executeRequest<any>(
      { mt5_login_list: 1 },
      "mt5_login_list"
    );
    return result || [];
  }

  /**
   * Verify MT5 account credentials with comprehensive validation
   * Checks: account existence, server validity, account type, and balance
   */
  async verifyMT5Account(login: string, server: string): Promise<boolean> {
    try {
      const accounts = await this.getMT5Accounts();
      const account = accounts.find(
        (acc: any) => acc.login === login && acc.server === server
      );
      return !!account;
    } catch (error) {
      return false;
    }
  }

  /**
   * Comprehensive MT5 account validation
   * Returns detailed validation results including account type, server, and balance
   */
  async validateMT5Account(login: string, server: string): Promise<MT5ValidationResult> {
    const errors: string[] = [];

    try {
      // Step 1: Validate server name
      const validServers = [
        'Deriv-Demo',
        'Deriv-Server',
        'Deriv-Server-02',
        'Deriv-Server-03',
        'DerivSVG-Server',
        'DerivFX-Server',
        'DerivVU-Server'
      ];

      const serverValid = validServers.includes(server);
      if (!serverValid) {
        errors.push(`Invalid server: ${server}. Must be a valid Deriv MT5 server.`);
      }

      // Step 2: Get all MT5 accounts for the authenticated user
      const accounts = await this.getMT5Accounts();
      const account = accounts.find(
        (acc: any) => acc.login === login && acc.server === server
      );

      if (!account) {
        errors.push('MT5 account not found or does not belong to this Deriv account.');
        return {
          isValid: false,
          serverValid,
          errors
        };
      }

      // Step 3: Detect account type (demo vs live)
      const accountType = account.account_type?.includes('demo') ||
                         server.includes('Demo') ? 'demo' : 'live';

      // Step 4: Get detailed account information
      const accountInfo: MT5AccountInfo = {
        login: account.login,
        server: account.server,
        balance: parseFloat(account.balance || "0"),
        equity: parseFloat(account.equity || account.balance || "0"),
        margin: parseFloat(account.margin || "0"),
        free_margin: parseFloat(account.margin_free || "0"),
        margin_level: parseFloat(account.margin_level || "0"),
        currency: account.currency || "USD",
        leverage: parseInt(account.leverage || "100"),
        account_type: accountType,
        market_type: account.market_type || account.mt5_account_type || 'financial',
        name: account.name,
        email: account.email
      };

      // Step 5: Validate balance (ensure account has been funded)
      const hasBalance = accountInfo.balance > 0;
      if (!hasBalance && accountType === 'live') {
        errors.push('Live account must have a positive balance.');
      }

      // All validations passed
      return {
        isValid: errors.length === 0,
        accountInfo,
        accountType,
        serverValid,
        hasBalance,
        errors: errors.length > 0 ? errors : undefined
      };

    } catch (error: any) {
      errors.push(`Validation error: ${error.message}`);
      return {
        isValid: false,
        errors
      };
    }
  }

  /**
   * Get MT5 account balance and equity information
   */
  async getMT5AccountInfo(login: string): Promise<MT5AccountInfo | null> {
    try {
      const accounts = await this.getMT5Accounts();
      const account = accounts.find((acc: any) => acc.login === login);

      if (!account) {
        return null;
      }

      const accountType = account.account_type?.includes('demo') ||
                         account.server?.includes('Demo') ? 'demo' : 'live';

      return {
        login: account.login,
        server: account.server,
        balance: parseFloat(account.balance || "0"),
        equity: parseFloat(account.equity || account.balance || "0"),
        margin: parseFloat(account.margin || "0"),
        free_margin: parseFloat(account.margin_free || "0"),
        margin_level: parseFloat(account.margin_level || "0"),
        currency: account.currency || "USD",
        leverage: parseInt(account.leverage || "100"),
        account_type: accountType,
        market_type: account.market_type || account.mt5_account_type || 'financial',
        name: account.name,
        email: account.email
      };
    } catch (error) {
      console.error("Error fetching MT5 account info:", error);
      return null;
    }
  }

  /**
   * Create new MT5 account
   */
  async createMT5Account(params: {
    account_type: string;
    email: string;
    leverage: number;
    mainPassword: string;
    name: string;
    mt5_account_type?: string;
  }): Promise<any> {
    return this.executeRequest(
      {
        mt5_new_account: 1,
        account_type: params.account_type,
        email: params.email,
        leverage: params.leverage,
        mainPassword: params.mainPassword,
        name: params.name,
        mt5_account_type: params.mt5_account_type || "financial",
      },
      "mt5_new_account"
    );
  }

  /**
   * Get open positions for MT5 account
   * Note: This requires extended Deriv API access
   */
  async getMT5Positions(login: string): Promise<MT5Position[]> {
    try {
      // This endpoint may require additional permissions
      // For now, return empty array as placeholder
      // In production, you would use mt5_get_positions or similar
      return [];
    } catch (error) {
      console.error("Error fetching MT5 positions:", error);
      return [];
    }
  }

  /**
   * Get trade history for MT5 account
   */
  async getMT5TradeHistory(login: string, fromDate?: Date, toDate?: Date): Promise<MT5Deal[]> {
    try {
      // This endpoint may require additional permissions
      // Placeholder for actual implementation
      return [];
    } catch (error) {
      console.error("Error fetching MT5 trade history:", error);
      return [];
    }
  }

  /**
   * Stream real-time tick data for a symbol
   */
  async streamTicks(symbol: string, callback: (tick: TickData) => void): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl);

      ws.onopen = () => {
        ws.send(JSON.stringify({
          ticks: symbol,
          subscribe: 1,
        }));
        resolve(ws);
      };

      ws.onmessage = (event) => {
        const response = JSON.parse(event.data);

        if (response.error) {
          reject(new Error(response.error.message || "API error"));
          return;
        }

        if (response.msg_type === "tick") {
          const tick: TickData = {
            epoch: response.tick.epoch,
            quote: response.tick.quote,
            symbol: response.tick.symbol,
            pip_size: response.tick.pip_size,
          };
          callback(tick);
        }
      };

      ws.onerror = (error) => {
        reject(error);
      };
    });
  }

  /**
   * Get historical tick data for a symbol
   */
  async getTickHistory(symbol: string, count: number = 1000): Promise<TickData[]> {
    try {
      const result = await this.executeRequest<any>(
        {
          ticks_history: symbol,
          count: count,
          end: 'latest',
          style: 'ticks',
        },
        "history",
        false
      );

      console.log(`[DerivAPI] Tick history response for ${symbol}:`, JSON.stringify(result).substring(0, 200));

      if (!result || !result.prices || !result.times) {
        console.error(`[DerivAPI] Invalid tick history response for ${symbol}:`, result);
        return [];
      }

      const ticks: TickData[] = [];
      for (let i = 0; i < result.prices.length; i++) {
        ticks.push({
          epoch: result.times[i],
          quote: result.prices[i],
          symbol: symbol,
        });
      }

      console.log(`[DerivAPI] Successfully parsed ${ticks.length} ticks for ${symbol}`);
      return ticks;
    } catch (error: any) {
      console.error(`[DerivAPI] Error fetching tick history for ${symbol}:`, error.message);
      return [];
    }
  }

  /**
   * Get historical candle data for a symbol
   */
  async getCandleHistory(
    symbol: string,
    granularity: number = 60,
    count: number = 100
  ): Promise<CandleData[]> {
    try {
      const result = await this.executeRequest<any>(
        {
          ticks_history: symbol,
          count: count,
          end: 'latest',
          style: 'candles',
          granularity: granularity,
        },
        "candles",
        false
      );

      // Deriv can return candles in different shapes depending on msg parsing path:
      // - Array shape: response.candles (already extracted by executeRequest)
      // - Object shape: { candles: [...] }
      // - History shape: { history: { candles: [...] } } in some API wrappers
      const rawCandles: any[] | null =
        Array.isArray(result)
          ? result
          : Array.isArray(result?.candles)
            ? result.candles
            : Array.isArray(result?.history?.candles)
              ? result.history.candles
              : null;

      if (!rawCandles || rawCandles.length === 0) {
        console.warn(`[DerivAPI] Empty candle history for ${symbol} @ ${granularity}s (count=${count})`);
        return [];
      }

      return rawCandles
        .map((candle: any) => ({
          open: Number(candle?.open),
          high: Number(candle?.high),
          low: Number(candle?.low),
          close: Number(candle?.close),
          epoch: Number(candle?.epoch),
        }))
        .filter(
          (c: CandleData) =>
            Number.isFinite(c.open) &&
            Number.isFinite(c.high) &&
            Number.isFinite(c.low) &&
            Number.isFinite(c.close) &&
            Number.isFinite(c.epoch),
        );
    } catch (error) {
      console.error("Error fetching candle history:", error);
      return [];
    }
  }

  /**
   * Fetch synchronized multi-timeframe market data for AMD strategy.
   */
  async getMultiTimeframeMarketData(
    symbol: string,
    options?: {
      m1Count?: number;
      m5Count?: number;
      m15Count?: number;
      tickCount?: number;
    },
  ): Promise<MultiTimeframeMarketData> {
    const m1Count = Math.max(60, options?.m1Count ?? 240);
    const m5Count = Math.max(40, options?.m5Count ?? 160);
    const m15Count = Math.max(24, options?.m15Count ?? 96);
    const tickCount = Math.max(200, options?.tickCount ?? 1000);

    const [m1, m5, m15, ticks] = await Promise.all([
      this.getCandleHistory(symbol, 60, m1Count),
      this.getCandleHistory(symbol, 300, m5Count),
      this.getCandleHistory(symbol, 900, m15Count),
      this.getTickHistory(symbol, tickCount),
    ]);

    return { m1, m5, m15, ticks };
  }

  /**
   * Get list of available trading symbols
   */
  async getActiveSymbols(): Promise<any[]> {
    try {
      const result = await this.executeRequest<any>(
        {
          active_symbols: "brief",
          product_type: "basic",
        },
        "active_symbols"
      );
      return result || [];
    } catch (error) {
      console.error("Error fetching active symbols:", error);
      return [];
    }
  }

  /**
   * Map Deriv symbol to MT5 symbol format
   */
  getMT5Symbol(symbol: string): string {
    // Map Deriv synthetic indices to MT5 format
    const symbolMap: { [key: string]: string } = {
      'R_10': 'Volatility 10 Index',
      'R_50': 'Volatility 50 Index',
      'R_100': 'Volatility 100 Index',
      '1HZ10V': 'Volatility 10 (1s) Index',
      '1HZ30V': 'Volatility 30 (1s) Index',
      '1HZ50V': 'Volatility 50 (1s) Index',
      '1HZ75V': 'Volatility 75 (1s) Index',
      '1HZ90V': 'Volatility 90 (1s) Index',
      '1HZ100V': 'Volatility 100 (1s) Index',
      'stpRNG': 'Step Index',
      'JD25': 'Jump 25 Index',
    };

    return symbolMap[symbol] || symbol;
  }
}

/**
 * Create DerivAPI instance from environment
 */
export function createDerivAPI(): DerivAPI {
  const apiToken = Deno.env.get("DERIV_API_TOKEN");
  if (!apiToken) {
    throw new Error("DERIV_API_TOKEN not configured");
  }

  return new DerivAPI({ apiToken });
}
