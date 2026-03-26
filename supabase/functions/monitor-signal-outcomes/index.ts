import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createDerivAPI } from "../_shared/deriv-api.ts";
import { getPointSize } from "../_shared/symbol-sl-tp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface TradeMonitorResult {
  trade_id: string;
  signal_id: string;
  symbol: string;
  outcome: string | null;
  current_price: number;
  entry_price: number;
  status: string;
}

function normalizeDirection(dir: unknown): "BUY" | "SELL" | null {
  const u = String(dir || "").trim().toUpperCase();
  if (u === "BUY" || u === "SELL") return u;
  return null;
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

    console.log(`[MONITOR] Starting trade outcome monitoring at ${new Date().toISOString()}`);

    const derivAPI = createDerivAPI();
    const results: TradeMonitorResult[] = [];
    let tradesClosedCount = 0;

    const { data: openTrades, error: tradesFetchError } = await supabase
      .from("trades")
      .select(
        `
        id,
        entry_price,
        stop_loss,
        take_profit,
        direction,
        signal_id,
        signals!inner (
          symbol
        )
      `,
      )
      .eq("status", "open")
      .not("signal_id", "is", null)
      .limit(500);

    if (tradesFetchError) {
      throw tradesFetchError;
    }

    const rows = openTrades || [];
    console.log(`[MONITOR] Monitoring ${rows.length} open trade(s) (Deriv tick vs per-user SL/TP)`);

    for (const row of rows) {
      const tradeId = String((row as any).id);
      const signalId = String((row as any).signal_id);
      const sig = (row as any).signals;
      const derivSymbol = String(sig?.symbol || "").trim();

      try {
        if (!derivSymbol) {
          results.push({
            trade_id: tradeId,
            signal_id: signalId,
            symbol: "",
            outcome: null,
            current_price: 0,
            entry_price: Number((row as any).entry_price),
            status: "SKIP_NO_SYMBOL",
          });
          continue;
        }

        const direction = normalizeDirection((row as any).direction);
        const entryPrice = Number((row as any).entry_price);
        const stopLoss = Number((row as any).stop_loss);
        const takeProfit = Number((row as any).take_profit);

        if (!direction || !Number.isFinite(entryPrice) || !Number.isFinite(stopLoss) || !Number.isFinite(takeProfit)) {
          results.push({
            trade_id: tradeId,
            signal_id: signalId,
            symbol: derivSymbol,
            outcome: null,
            current_price: 0,
            entry_price: entryPrice,
            status: "SKIP_INVALID_LEVELS",
          });
          continue;
        }

        const ticks = await derivAPI.getTickHistory(derivSymbol, 5);
        if (!ticks || ticks.length === 0) {
          console.log(`[${derivSymbol}] Unable to fetch current price for trade ${tradeId}`);
          results.push({
            trade_id: tradeId,
            signal_id: signalId,
            symbol: derivSymbol,
            outcome: null,
            current_price: 0,
            entry_price: entryPrice,
            status: "MONITORING",
          });
          continue;
        }

        const sortedTicks = [...ticks].sort((a, b) => (b.epoch ?? 0) - (a.epoch ?? 0));
        const currentPrice = Number(sortedTicks[0].quote);
        const pointSize = getPointSize(derivSymbol);
        const tpBuffer = pointSize;

        let outcome: string | null = null;
        let profitLoss: number | null = null;

        if (direction === "BUY") {
          const slValid = stopLoss < entryPrice;
          const tpValid = takeProfit > entryPrice && Number.isFinite(takeProfit);
          if (tpValid && slValid && currentPrice >= takeProfit + tpBuffer) {
            outcome = "TP1_HIT";
            profitLoss = currentPrice - entryPrice;
          } else if (slValid && currentPrice <= stopLoss) {
            outcome = "SL_HIT";
            profitLoss = currentPrice - entryPrice;
          }
        } else {
          const slValid = stopLoss > entryPrice;
          const tpValid = takeProfit < entryPrice && Number.isFinite(takeProfit);
          if (tpValid && slValid && currentPrice <= takeProfit - tpBuffer) {
            outcome = "TP1_HIT";
            profitLoss = entryPrice - currentPrice;
          } else if (slValid && currentPrice >= stopLoss) {
            outcome = "SL_HIT";
            profitLoss = entryPrice - currentPrice;
          }
        }

        if (outcome) {
          console.log(
            `[${derivSymbol}] Trade ${tradeId} outcome: ${outcome} at ${currentPrice} (P/L est: ${profitLoss})`,
          );

          const nowIso = new Date().toISOString();
          const { data: updatedRows, error: updErr } = await supabase
            .from("trades")
            .update({
              status: "closed",
              exit_price: currentPrice,
              closed_at: nowIso,
              profit_loss: profitLoss ?? 0,
            })
            .eq("id", tradeId)
            .eq("status", "open")
            .select("id");

          if (updErr) {
            console.error(`[${derivSymbol}] Trade close update failed:`, updErr.message);
            results.push({
              trade_id: tradeId,
              signal_id: signalId,
              symbol: derivSymbol,
              outcome,
              current_price: currentPrice,
              entry_price: entryPrice,
              status: "ERROR",
            });
            continue;
          }

          if (updatedRows && updatedRows.length > 0) {
            tradesClosedCount++;
            results.push({
              trade_id: tradeId,
              signal_id: signalId,
              symbol: derivSymbol,
              outcome,
              current_price: currentPrice,
              entry_price: entryPrice,
              status: "CLOSED",
            });
          } else {
            results.push({
              trade_id: tradeId,
              signal_id: signalId,
              symbol: derivSymbol,
              outcome: null,
              current_price: currentPrice,
              entry_price: entryPrice,
              status: "ALREADY_CLOSED",
            });
          }
        } else {
          results.push({
            trade_id: tradeId,
            signal_id: signalId,
            symbol: derivSymbol,
            outcome: null,
            current_price: currentPrice,
            entry_price: entryPrice,
            status: "MONITORING",
          });
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`[MONITOR] Error monitoring trade ${tradeId}:`, msg);
        results.push({
          trade_id: tradeId,
          signal_id: signalId,
          symbol: derivSymbol || "",
          outcome: null,
          current_price: 0,
          entry_price: Number((row as any).entry_price),
          status: "ERROR",
        });
      }
    }

    let expiredClosedCount = 0;
    const { data: expiredSignals } = await supabase
      .from("signals")
      .select("id, symbol")
      .eq("is_active", true)
      .lt("expires_at", new Date().toISOString());

    if (expiredSignals && expiredSignals.length > 0) {
      console.log(`[MONITOR] Found ${expiredSignals.length} expired signals`);

      for (const expired of expiredSignals) {
        await supabase.rpc("update_signal_outcome", {
          p_signal_id: expired.id,
          p_outcome: "EXPIRED",
          p_close_price: null,
          p_profit_loss: null,
        });

        expiredClosedCount++;
        console.log(`[${expired.symbol}] Expired signal closed`);
      }
    }

    const closedCount = tradesClosedCount + expiredClosedCount;

    const { count: activeSignalsCount } = await supabase
      .from("signals")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true)
      .eq("signal_status", "ACTIVE")
      .gt("expires_at", new Date().toISOString());

    console.log(
      `[MONITOR] Completed. Open trades checked: ${rows.length}, trades closed: ${tradesClosedCount}, signals expired: ${expiredClosedCount}`,
    );

    await supabase
      .from("price_monitor_schedule")
      .update({
        last_check_at: new Date().toISOString(),
        active_signals_count: activeSignalsCount ?? 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", "00000000-0000-0000-0000-000000000002");

    return new Response(
      JSON.stringify({
        success: true,
        message: `Monitored ${rows.length} open trades, closed ${tradesClosedCount} trade(s); expired ${expiredClosedCount} signal(s)`,
        timestamp: new Date().toISOString(),
        monitored_trades: rows.length,
        trades_closed: tradesClosedCount,
        signals_expired: expiredClosedCount,
        closed: closedCount,
        results,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Signal monitoring failed";
    console.error("[MONITOR] Fatal error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: message,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
});
