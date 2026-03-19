import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createDerivAPI } from "../_shared/deriv-api.ts";
import { detectAmdSignal } from "../_shared/advanced-signal-detector.ts";
import { getPointSize } from "../_shared/symbol-sl-tp.ts";
import { sendSignalEmail, getSignalNotificationEmails } from "../_shared/resend.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface PendingResult {
  id: string;
  symbol: string;
  direction: string;
  status: string;
  current_price: number;
  suggested_entry: number;
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
    const derivAPI = createDerivAPI();

    console.log(`[PENDING] Checking pending setups at ${new Date().toISOString()}`);

    const nowIso = new Date().toISOString();

    // Fetch all pending setups that have not expired
    const { data: pendingSetups, error: fetchError } = await supabase
      .from("pending_setups")
      .select("*")
      .eq("status", "pending")
      .gt("expires_at", nowIso);

    if (fetchError) {
      throw fetchError;
    }

    if (!pendingSetups || pendingSetups.length === 0) {
      console.log("[PENDING] No pending setups to monitor");
      return new Response(
        JSON.stringify({
          success: true,
          message: "No pending setups to monitor",
          monitored: 0,
          converted: 0,
          expired: 0,
          timestamp: new Date().toISOString(),
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    console.log(`[PENDING] Monitoring ${pendingSetups.length} pending setups`);

    const entryTolerancePoints = Number(Deno.env.get("ENTRY_TOLERANCE_POINTS")) || 50;

    const results: PendingResult[] = [];
    let convertedCount = 0;
    let expiredCount = 0;

    for (const pending of pendingSetups) {
      try {
        const symbol: string = pending.symbol;
        const direction: "BUY" | "SELL" = pending.direction;
        const suggestedEntry: number = Number(pending.suggested_entry);
        const stopLoss: number = Number(pending.stop_loss);
        const riskPending = Math.abs(suggestedEntry - stopLoss);
        const takeProfit: number =
          direction === "BUY"
            ? suggestedEntry + 3 * riskPending
            : suggestedEntry - 3 * riskPending;

        console.log(`[PENDING][${symbol}] Checking pending setup ${pending.id} (${direction})`);

        // If expired while looping, mark as expired and skip
        if (new Date(pending.expires_at) <= new Date()) {
          await supabase
            .from("pending_setups")
            .update({ status: "expired", updated_at: new Date().toISOString() })
            .eq("id", pending.id);
          expiredCount++;
          results.push({
            id: pending.id,
            symbol,
            direction,
            status: "expired",
            current_price: 0,
            suggested_entry: suggestedEntry,
          });
          continue;
        }

        // Check there is still no active signal for this symbol
        const { data: activeRegistry } = await supabase
          .from("active_signal_registry")
          .select("*")
          .eq("symbol", symbol)
          .maybeSingle();

        if (activeRegistry) {
          console.log(`[PENDING][${symbol}] Active signal already present. Skipping conversion.`);
          results.push({
            id: pending.id,
            symbol,
            direction,
            status: "skipped_active_signal",
            current_price: 0,
            suggested_entry: suggestedEntry,
          });
          continue;
        }

        const { data: activeSignals } = await supabase
          .from("signals")
          .select("id")
          .eq("symbol", symbol)
          .eq("is_active", true);

        if (activeSignals && activeSignals.length > 0) {
          console.log(`[PENDING][${symbol}] Active signals exist in database. Skipping conversion.`);
          results.push({
            id: pending.id,
            symbol,
            direction,
            status: "skipped_active_signal",
            current_price: 0,
            suggested_entry: suggestedEntry,
          });
          continue;
        }

        // Get latest price
        const ticks = await derivAPI.getTickHistory(symbol, 5);
        if (!ticks || ticks.length === 0) {
          console.log(`[PENDING][${symbol}] Unable to fetch current price`);
          results.push({
            id: pending.id,
            symbol,
            direction,
            status: "no_price",
            current_price: 0,
            suggested_entry: suggestedEntry,
          });
          continue;
        }

        const sortedTicks = [...ticks].sort((a, b) => (b.epoch ?? 0) - (a.epoch ?? 0));
        const currentPrice = Number(sortedTicks[0].quote);

        const pointSize = getPointSize(symbol);
        const entryTolerance = entryTolerancePoints * pointSize;

        const distanceToEntry = Math.abs(currentPrice - suggestedEntry);
        const atEntry = distanceToEntry <= entryTolerance;

        console.log(
          `[PENDING][${symbol}] Current: ${currentPrice}, Entry: ${suggestedEntry}, tol: ${entryTolerance.toFixed(5)}, atEntry: ${atEntry}`,
        );

        if (!atEntry) {
          results.push({
            id: pending.id,
            symbol,
            direction,
            status: "waiting",
            current_price: currentPrice,
            suggested_entry: suggestedEntry,
          });
          continue;
        }

        // Revalidate AMD context at conversion time.
        const amdSnapshot = await derivAPI.getMultiTimeframeMarketData(symbol, {
          m1Count: 220,
          m5Count: 140,
          m15Count: 90,
          tickCount: 800,
        });
        const amdNow = detectAmdSignal({
          m1: amdSnapshot.m1,
          m5: amdSnapshot.m5,
          m15: amdSnapshot.m15,
          ticks: amdSnapshot.ticks,
        });
        if (!amdNow.shouldGenerateSignal || amdNow.direction !== direction) {
          await supabase
            .from("pending_setups")
            .update({
              status: "expired",
              updated_at: new Date().toISOString(),
              reasoning: `${pending.reasoning ?? ""}\n\n[PENDING AMD INVALIDATED] blocked=${amdNow.amd.blockedReasons.join("|") || "no_distribution"}`,
            })
            .eq("id", pending.id);

          expiredCount++;
          results.push({
            id: pending.id,
            symbol,
            direction,
            status: "expired_amd_invalidated",
            current_price: currentPrice,
            suggested_entry: suggestedEntry,
          });
          continue;
        }

        // Convert pending setup into live signal
        const mt5Symbol = derivAPI.getMT5Symbol(symbol);
        const risk = riskPending;
        const riskRewardRatio = risk > 0 ? 3 : 0;

        const { data: newSignal, error: insertError } = await supabase
          .from("signals")
          .insert({
            symbol,
            mt5_symbol: mt5Symbol,
            direction,
            entry_price: suggestedEntry,
            stop_loss: stopLoss,
            take_profit: takeProfit,
            tp1: takeProfit,
            tp2: null,
            tp3: null,
            pip_stop_loss: risk,
            pip_take_profit: Math.abs(takeProfit - suggestedEntry),
            risk_reward_ratio: riskRewardRatio,
            timeframe: pending.timeframe ?? "M1",
            confidence: pending.confidence ?? 0,
            confidence_percentage: pending.confidence ?? 0,
            signal_type: "ICT_REFINED",
            signal_status: "ACTIVE",
            trigger_count: (pending.technical_indicators?.triggers || []).length ?? 0,
            market_context: pending.reasoning,
            reasoning: pending.reasoning,
            technical_indicators: {
              ...(pending.technical_indicators ?? {}),
              amd_revalidated: amdNow.amd,
            },
            expires_at: new Date("2099-12-31T23:59:59Z").toISOString(),
            is_active: true,
            order_type: "MARKET",
          })
          .select()
          .single();

        if (insertError) {
          console.error(`[PENDING][${symbol}] Error creating signal from pending:`, insertError);
          results.push({
            id: pending.id,
            symbol,
            direction,
            status: "error_insert_signal",
            current_price: currentPrice,
            suggested_entry: suggestedEntry,
          });
          continue;
        }

        // Update pending_setup as converted and link to signal
        await supabase
          .from("pending_setups")
          .update({
            status: "converted",
            signal_id: newSignal.id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", pending.id);

        // Register in active_signal_registry
        await supabase.rpc("register_active_signal", {
          p_symbol: symbol,
          p_mt5_symbol: mt5Symbol,
          p_signal_id: newSignal.id,
        });

        convertedCount++;
        results.push({
          id: pending.id,
          symbol,
          direction,
          status: "converted",
          current_price: currentPrice,
          suggested_entry: suggestedEntry,
        });
        console.log(`[PENDING][${symbol}] Converted pending setup ${pending.id} to signal ${newSignal.id}`);

        // Send signal notification email via Resend
        try {
          const signalConfidence = Number((newSignal as any)?.confidence_percentage ?? (newSignal as any)?.confidence ?? pending.confidence ?? 0);
          const emails = await getSignalNotificationEmails(supabase, signalConfidence);
          if (emails.length > 0) {
            const payload = {
              id: newSignal.id,
              symbol,
              mt5_symbol: mt5Symbol,
              direction,
              entry_price: suggestedEntry,
              stop_loss,
              take_profit: takeProfit,
              tp1: takeProfit,
              risk_reward_ratio: riskRewardRatio,
              created_at: new Date().toISOString(),
            };
            const result = await sendSignalEmail({ signal: payload, to: emails });
            if (result.error) console.warn(`[PENDING][${symbol}] Resend email failed:`, result.error);
            else console.log(`[PENDING][${symbol}] Signal email sent to ${emails.length} recipient(s)`);
          }
        } catch (e) {
          console.warn("[PENDING] Resend signal email error:", e instanceof Error ? e.message : e);
        }
      } catch (err: any) {
        console.error(`[PENDING] Error processing pending setup ${pending.id}:`, err.message || err);
        results.push({
          id: pending.id,
          symbol: pending.symbol,
          direction: pending.direction,
          status: "error",
          current_price: 0,
          suggested_entry: Number(pending.suggested_entry),
        });
      }
    }

    // Also mark any pending setups that are now expired as expired
    const { error: expireError } = await supabase
      .from("pending_setups")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("status", "pending")
      .lte("expires_at", new Date().toISOString());

    if (expireError) {
      console.error("[PENDING] Error expiring old pending setups:", expireError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Checked ${pendingSetups.length} pending setups, converted ${convertedCount}, expired ${expiredCount}`,
        monitored: pendingSetups.length,
        converted: convertedCount,
        expired: expiredCount,
        results,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error: any) {
    console.error("[PENDING] Fatal error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Pending entry check failed",
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

