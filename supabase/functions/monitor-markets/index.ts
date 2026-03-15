import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createDerivAPI } from "../_shared/deriv-api.ts";
import { createMarketDataCollector } from "../_shared/market-data-collector.ts";
import { TechnicalAnalyzer } from "../_shared/technical-indicators.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface MonitorMarketsRequest {
  symbols?: string[];
  duration?: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Supabase configuration missing");
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));

    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    const { symbols, duration } = await req.json() as MonitorMarketsRequest;

    const defaultSymbols = ['R_10', 'R_50', 'R_100', '1HZ10V', '1HZ30V', '1HZ50V', '1HZ90V', '1HZ100V', 'stpRNG', 'JD25'];
    const targetSymbols = symbols || defaultSymbols;
    const monitorDuration = Math.min(duration || 300, 600);

    const derivAPI = createDerivAPI();
    const collector = createMarketDataCollector(derivAPI, supabaseUrl, supabaseServiceKey);

    const marketData = [];

    for (const symbol of targetSymbols) {
      try {
        console.log(`Collecting historical data for ${symbol}...`);
        const ticks = await collector.collectHistoricalData(symbol, 500);

        if (ticks.length >= 50) {
          const analyzer = new TechnicalAnalyzer(ticks);
          const analysis = analyzer.analyzeMarket(symbol);

          marketData.push({
            symbol,
            ...analysis,
            tick_count: ticks.length,
            latest_price: ticks[ticks.length - 1].quote,
            latest_timestamp: new Date(ticks[ticks.length - 1].epoch * 1000).toISOString(),
          });

          await supabase
            .from('market_analysis_history')
            .insert({
              symbol,
              current_price: analysis.currentPrice,
              rsi: analysis.indicators.rsi,
              macd_value: analysis.indicators.macd.macd,
              macd_signal: analysis.indicators.macd.signal,
              macd_histogram: analysis.indicators.macd.histogram,
              trend: analysis.indicators.trend,
              volatility: analysis.indicators.volatility,
              recommendation: analysis.recommendation,
              confidence: analysis.confidence,
              support_levels: JSON.stringify(analysis.supportLevels),
              resistance_levels: JSON.stringify(analysis.resistanceLevels),
              analysis_text: analysis.analysis,
            });

          const snapshot = collector.getMarketSnapshot(symbol);
          if (snapshot) {
            await collector.saveMarketSnapshot(snapshot);
          }

          console.log(`Analyzed ${symbol}: ${analysis.recommendation} (${analysis.confidence}% confidence)`);
        } else {
          console.log(`Insufficient data for ${symbol}: ${ticks.length} ticks`);
        }
      } catch (error: any) {
        console.error(`Error monitoring ${symbol}:`, error.message);
      }
    }

    collector.clearCache();

    return new Response(
      JSON.stringify({
        success: true,
        message: `Successfully monitored ${marketData.length} markets`,
        data: marketData,
        metadata: {
          symbols_analyzed: marketData.length,
          total_symbols: targetSymbols.length,
          timestamp: new Date().toISOString(),
        }
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error: any) {
    console.error("Market monitoring error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Failed to monitor markets",
      }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
