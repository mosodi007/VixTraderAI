import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createDerivAPI } from "../_shared/deriv-api.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface MonitorResult {
  signal_id: string;
  symbol: string;
  outcome: string | null;
  current_price: number;
  entry_price: number;
  status: string;
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
    const derivApiToken = Deno.env.get("DERIV_API_TOKEN");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Supabase configuration missing");
    }

    if (!derivApiToken) {
      throw new Error("Deriv API token not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`[MONITOR] Starting signal outcome monitoring at ${new Date().toISOString()}`);

    // Get all active signals (no time expiry – monitor until SL or TP hit)
    const { data: activeSignals, error: fetchError } = await supabase
      .from('signals')
      .select('*')
      .eq('is_active', true)
      .eq('signal_status', 'ACTIVE');

    if (fetchError) {
      throw fetchError;
    }

    if (!activeSignals || activeSignals.length === 0) {
      console.log('[MONITOR] No active signals to monitor');
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No active signals to monitor',
          timestamp: new Date().toISOString(),
          monitored: 0,
          closed: 0
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    console.log(`[MONITOR] Monitoring ${activeSignals.length} active signals`);

    const derivAPI = createDerivAPI();
    const results: MonitorResult[] = [];
    let closedCount = 0;

    // Monitor each signal
    for (const signal of activeSignals) {
      try {
        console.log(`[${signal.symbol}] Checking signal ${signal.id} (${signal.direction})`);

        // Get current market price
        const ticks = await derivAPI.getTickHistory(signal.symbol, 1);

        if (!ticks || ticks.length === 0) {
          console.log(`[${signal.symbol}] Unable to fetch current price`);
          results.push({
            signal_id: signal.id,
            symbol: signal.symbol,
            outcome: null,
            current_price: 0,
            entry_price: signal.entry_price,
            status: 'MONITORING'
          });
          continue;
        }

        const currentPrice = ticks[ticks.length - 1].quote;
        const tp = signal.tp1 ?? signal.take_profit;
        console.log(`[${signal.symbol}] Current: ${currentPrice}, Entry: ${signal.entry_price}, TP: ${tp}, SL: ${signal.stop_loss}`);

        let outcome: string | null = null;
        let profitLoss: number | null = null;

        // Check if TP or SL hit (single TP only)
        if (signal.direction === 'BUY') {
          if (currentPrice >= tp) {
            outcome = 'TP1_HIT';
            profitLoss = currentPrice - signal.entry_price;
          } else if (currentPrice <= signal.stop_loss) {
            outcome = 'SL_HIT';
            profitLoss = currentPrice - signal.entry_price;
          }
        } else if (signal.direction === 'SELL') {
          if (currentPrice <= tp) {
            outcome = 'TP1_HIT';
            profitLoss = signal.entry_price - currentPrice;
          } else if (currentPrice >= signal.stop_loss) {
            outcome = 'SL_HIT';
            profitLoss = signal.entry_price - currentPrice;
          }
        }

        if (outcome) {
          console.log(`[${signal.symbol}] ✓ Outcome detected: ${outcome} (P/L: ${profitLoss})`);

          // Close signal with outcome using new function
          await supabase.rpc('update_signal_outcome', {
            p_signal_id: signal.id,
            p_outcome: outcome,
            p_close_price: currentPrice,
            p_profit_loss: profitLoss
          });

          closedCount++;

          results.push({
            signal_id: signal.id,
            symbol: signal.symbol,
            outcome: outcome,
            current_price: currentPrice,
            entry_price: signal.entry_price,
            status: 'CLOSED'
          });

          console.log(`[${signal.symbol}] Signal closed: ${outcome} at ${currentPrice} (P/L: ${profitLoss?.toFixed(5)})`);
        } else {
          results.push({
            signal_id: signal.id,
            symbol: signal.symbol,
            outcome: null,
            current_price: currentPrice,
            entry_price: signal.entry_price,
            status: 'MONITORING'
          });
        }

      } catch (error: any) {
        console.error(`[${signal.symbol}] Error monitoring signal:`, error.message);
        results.push({
          signal_id: signal.id,
          symbol: signal.symbol,
          outcome: null,
          current_price: 0,
          entry_price: signal.entry_price,
          status: 'ERROR'
        });
      }
    }

    // No time-based expiry: signals stay active until SL or TP is hit only

    console.log(`[MONITOR] Completed. Monitored ${activeSignals.length} signals, closed ${closedCount}`);

    // Update monitoring schedule
    await supabase
      .from('price_monitor_schedule')
      .update({
        last_check_at: new Date().toISOString(),
        active_signals_count: activeSignals.length - closedCount,
        updated_at: new Date().toISOString()
      })
      .eq('id', '00000000-0000-0000-0000-000000000002');

    return new Response(
      JSON.stringify({
        success: true,
        message: `Monitored ${activeSignals.length} signals, closed ${closedCount}`,
        timestamp: new Date().toISOString(),
        monitored: activeSignals.length,
        closed: closedCount,
        results
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error: any) {
    console.error("[MONITOR] Fatal error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Signal monitoring failed",
        timestamp: new Date().toISOString()
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
