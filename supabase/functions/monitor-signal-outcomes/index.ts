import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createDerivAPI } from "../_shared/deriv-api.ts";
import { getPointSize } from "../_shared/symbol-sl-tp.ts";

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

    // Get all active signals
    const { data: activeSignals, error: fetchError } = await supabase
      .from('signals')
      .select('*')
      .eq('is_active', true)
      .eq('signal_status', 'ACTIVE')
      .gt('expires_at', new Date().toISOString());

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

        // Get current market price: fetch multiple ticks and use the latest by epoch to avoid stale/wrong tick
        const ticks = await derivAPI.getTickHistory(signal.symbol, 5);
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
        const sortedTicks = [...ticks].sort((a, b) => (b.epoch ?? 0) - (a.epoch ?? 0));
        const currentPrice = Number(sortedTicks[0].quote);
        const entryPrice = Number(signal.entry_price);
        const stopLoss = Number(signal.stop_loss);
        const tp1 = Number(signal.tp1 ?? signal.take_profit ?? 0);
        const tp2 = signal.tp2 != null && Number.isFinite(Number(signal.tp2)) ? Number(signal.tp2) : null;
        const tp3 = signal.tp3 != null && Number.isFinite(Number(signal.tp3)) ? Number(signal.tp3) : null;

        const pointSize = getPointSize(signal.symbol);
        const tpBuffer = pointSize; // Require price to pass TP by at least one point to avoid false hits

        console.log(`[${signal.symbol}] Current: ${currentPrice}, Entry: ${entryPrice}, TP1: ${tp1}, SL: ${stopLoss}`);

        let outcome: string | null = null;
        let profitLoss: number | null = null;

        // Only compare to valid numbers; many signals have tp2/tp3 null – comparing price >= null is true in JS (null→0) and caused false TP hits
        if (signal.direction === 'BUY') {
          const slValid = stopLoss < entryPrice;
          const tp1Valid = tp1 > entryPrice && Number.isFinite(tp1);
          if (tp1Valid && slValid && currentPrice >= tp1 + tpBuffer) {
            outcome = 'TP1_HIT';
            profitLoss = currentPrice - entryPrice;
          } else if (tp2 != null && tp2 > entryPrice && slValid && currentPrice >= tp2 + tpBuffer) {
            outcome = 'TP2_HIT';
            profitLoss = currentPrice - entryPrice;
          } else if (tp3 != null && tp3 > entryPrice && slValid && currentPrice >= tp3 + tpBuffer) {
            outcome = 'TP3_HIT';
            profitLoss = currentPrice - entryPrice;
          } else if (slValid && currentPrice <= stopLoss) {
            outcome = 'SL_HIT';
            profitLoss = currentPrice - entryPrice;
          }
        } else if (signal.direction === 'SELL') {
          const slValid = stopLoss > entryPrice;
          const tp1Valid = tp1 < entryPrice && Number.isFinite(tp1);
          if (tp1Valid && slValid && currentPrice <= tp1 - tpBuffer) {
            outcome = 'TP1_HIT';
            profitLoss = entryPrice - currentPrice;
          } else if (tp2 != null && tp2 < entryPrice && slValid && currentPrice <= tp2 - tpBuffer) {
            outcome = 'TP2_HIT';
            profitLoss = entryPrice - currentPrice;
          } else if (tp3 != null && tp3 < entryPrice && slValid && currentPrice <= tp3 - tpBuffer) {
            outcome = 'TP3_HIT';
            profitLoss = entryPrice - currentPrice;
          } else if (slValid && currentPrice >= stopLoss) {
            outcome = 'SL_HIT';
            profitLoss = entryPrice - currentPrice;
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

    // Also check for expired signals
    const { data: expiredSignals } = await supabase
      .from('signals')
      .select('id, symbol')
      .eq('is_active', true)
      .lt('expires_at', new Date().toISOString());

    if (expiredSignals && expiredSignals.length > 0) {
      console.log(`[MONITOR] Found ${expiredSignals.length} expired signals`);

      for (const expired of expiredSignals) {
        await supabase.rpc('update_signal_outcome', {
          p_signal_id: expired.id,
          p_outcome: 'EXPIRED',
          p_close_price: null,
          p_profit_loss: null
        });

        closedCount++;
        console.log(`[${expired.symbol}] Expired signal closed`);
      }
    }

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
