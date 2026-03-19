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

interface AutoSignalResult {
  symbol: string;
  signalGenerated: boolean;
  reason: string;
  confidence?: number;
  direction?: string;
}

interface AmdDiagnosticsItem {
  symbol: string;
  status: "generated" | "pending" | "blocked" | "skipped_active" | "error";
  direction: "BUY" | "SELL" | null;
  confidence: number;
  phase: string;
  htf_bias: string;
  sweep_high: boolean;
  sweep_low: boolean;
  distribution_strength: number;
  range_high: number;
  range_low: number;
  risk_reward_ratio: number;
  entry_price?: number;
  stop_loss?: number;
  take_profit?: number;
  blocked_reasons: string[];
  note?: string;
  mtf_counts?: {
    m1: number;
    m5: number;
    m15: number;
    ticks: number;
  };
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

    // List of symbols to monitor
    // Removed: R_10, R_50, 1HZ50V, 1HZ90V, JD25
    const symbols = ['1HZ10V','1HZ30V','1HZ75V','1HZ100V'];
    const timeframe = 'M1/M5';

    const results: AutoSignalResult[] = [];
    const generatedSignals: any[] = [];
    const amdDiagnostics: AmdDiagnosticsItem[] = [];

    console.log(`[AUTO-SCAN] Starting automated signal scan for ${symbols.length} symbols at ${new Date().toISOString()}`);

    // Process symbols in parallel for faster execution
    const symbolPromises = symbols.map(async (symbol) => {
      try {
        // Check if symbol already has an active signal
        const { data: existingRegistry } = await supabase
          .from('active_signal_registry')
          .select('*')
          .eq('symbol', symbol)
          .maybeSingle();

        if (existingRegistry) {
          console.log(`[${symbol}] Already has active signal. Skipping.`);
          amdDiagnostics.push({
            symbol,
            status: "skipped_active",
            direction: null,
            confidence: 0,
            phase: "none",
            htf_bias: "neutral",
            sweep_high: false,
            sweep_low: false,
            distribution_strength: 0,
            range_high: 0,
            range_low: 0,
            risk_reward_ratio: 0,
            blocked_reasons: ["active_signal_registry_exists"],
            note: "Symbol already has active registry signal.",
          });
          return {
            symbol,
            signalGenerated: false,
            reason: 'Symbol already has an active signal. Waiting for current signal to close.'
          };
        }

        // Also check signals table for active signals (no time expiry – stay active until SL/TP)
        const { data: activeSignals } = await supabase
          .from('signals')
          .select('id')
          .eq('symbol', symbol)
          .eq('is_active', true);

        if (activeSignals && activeSignals.length > 0) {
          console.log(`[${symbol}] Has active signals in database. Skipping.`);
          amdDiagnostics.push({
            symbol,
            status: "skipped_active",
            direction: null,
            confidence: 0,
            phase: "none",
            htf_bias: "neutral",
            sweep_high: false,
            sweep_low: false,
            distribution_strength: 0,
            range_high: 0,
            range_low: 0,
            risk_reward_ratio: 0,
            blocked_reasons: ["active_signal_in_db"],
            note: "Symbol already has active signal in signals table.",
          });
          return {
            symbol,
            signalGenerated: false,
            reason: 'Symbol has active signals. One signal per asset rule enforced.'
          };
        }

        // Fetch market data from Deriv
        const derivAPI = createDerivAPI();
        console.log(`[${symbol}] Fetching market data...`);

        const marketData = await derivAPI.getMultiTimeframeMarketData(symbol, {
          m1Count: 260,
          m5Count: 180,
          m15Count: 100,
          tickCount: 1000,
        });
        const ticks = marketData.ticks || [];
        const mtfCounts = {
          m1: marketData.m1?.length || 0,
          m5: marketData.m5?.length || 0,
          m15: marketData.m15?.length || 0,
          ticks: ticks.length,
        };
        if (!ticks.length || !marketData.m1?.length || !marketData.m5?.length || !marketData.m15?.length) {
          console.log(`[${symbol}] Insufficient market data.`);
          amdDiagnostics.push({
            symbol,
            status: "blocked",
            direction: null,
            confidence: 0,
            phase: "none",
            htf_bias: "neutral",
            sweep_high: false,
            sweep_low: false,
            distribution_strength: 0,
            range_high: 0,
            range_low: 0,
            risk_reward_ratio: 0,
            blocked_reasons: ["insufficient_market_data"],
            note: "Missing ticks or required M1/M5/M15 candle history.",
            mtf_counts: mtfCounts,
          });
          return {
            symbol,
            signalGenerated: false,
            reason: 'Insufficient market data for analysis'
          };
        }

        // Run AMD-first signal detection
        console.log(`[${symbol}] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`[${symbol}] 🔍 STARTING AMD ANALYSIS with ${ticks.length} ticks...`);
        console.log(`[${symbol}] Current Price: ${ticks[ticks.length - 1].quote}`);
        const detection = detectAmdSignal({
          m1: marketData.m1,
          m5: marketData.m5,
          m15: marketData.m15,
          ticks,
        });

        console.log(`[${symbol}] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`[${symbol}] 📊 ANALYSIS COMPLETE`);
        console.log(`[${symbol}] Result: ${detection.shouldGenerateSignal ? '✅ SIGNAL DETECTED' : '❌ NO SIGNAL'}`);
        console.log(`[${symbol}] Direction: ${detection.direction || 'NONE'}`);
        console.log(`[${symbol}] Confidence: ${detection.confidence}%`);
        console.log(`[${symbol}] AMD phase: ${detection.amd.phase}`);
        console.log(`[${symbol}] Risk-Reward: ${detection.riskRewardRatio}:1`);
        console.log(
          `[${symbol}] AMD ctx: htf=${detection.amd.htfBias}, sweepHigh=${detection.amd.sweepHigh}, sweepLow=${detection.amd.sweepLow}, dist=${detection.amd.distributionStrength}, blocked=${detection.amd.blockedReasons.join("|") || "none"}`,
        );

        if (detection.shouldGenerateSignal && detection.direction) {
          console.log(`[${symbol}] 💰 TRADE SETUP:`);
          console.log(`[${symbol}]   Entry: ${detection.entryPrice}`);
          console.log(`[${symbol}]   TP: ${detection.tp1}`);
          console.log(`[${symbol}]   SL: ${detection.stopLoss}`);
        } else {
          console.log(`[${symbol}] ⚠️ REASON: ${detection.reasoning.split('\n')[0]}`);
        }
        console.log(`[${symbol}] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

        if (!detection.shouldGenerateSignal || !detection.direction) {
          amdDiagnostics.push({
            symbol,
            status: "blocked",
            direction: detection.direction,
            confidence: detection.confidence,
            phase: detection.amd.phase,
            htf_bias: detection.amd.htfBias,
            sweep_high: detection.amd.sweepHigh,
            sweep_low: detection.amd.sweepLow,
            distribution_strength: detection.amd.distributionStrength,
            range_high: detection.amd.rangeHigh,
            range_low: detection.amd.rangeLow,
            risk_reward_ratio: detection.riskRewardRatio,
            blocked_reasons: detection.amd.blockedReasons,
            note: detection.reasoning,
            mtf_counts: mtfCounts,
          });
          return {
            symbol,
            signalGenerated: false,
            reason: detection.reasoning,
            confidence: detection.confidence
          };
        }

        let entryPrice = detection.entryPrice;
        let stopLoss = detection.stopLoss;
        let marketContext = detection.reasoning;

        const pointSize = getPointSize(symbol);
        const manipulation_high = detection.amd.rangeHigh;
        const manipulation_low = detection.amd.rangeLow;
        const atr = Math.max(Math.abs(manipulation_high - manipulation_low) / 3, entryPrice * 0.0005);
        const risk = Math.abs(entryPrice - stopLoss);
        const rr = Math.max(1.5, Number(detection.riskRewardRatio || 2.5));
        const tp1 = detection.direction === 'BUY' ? entryPrice + rr * risk : entryPrice - rr * risk;
        const takeProfitFinal = tp1;

        const mt5Symbol = derivAPI.getMT5Symbol(symbol);
        const currentPrice = ticks[ticks.length - 1].quote;

        // Entry tolerance: signal only when price reaches suggested entry (or create pending setup)
        const entryTolerancePoints = Number(Deno.env.get('ENTRY_TOLERANCE_POINTS')) || 50;
        const entryTolerance = entryTolerancePoints * pointSize;
        const atEntry = Math.abs(currentPrice - entryPrice) <= entryTolerance;

        const expiresAt = new Date('2099-12-31T23:59:59Z');
        const riskRewardRatio = rr;

        if (atEntry) {
          // Price at entry: create signal immediately
          const { data: newSignal, error: insertError } = await supabase
            .from('signals')
            .insert({
              symbol,
              mt5_symbol: mt5Symbol,
              direction: detection.direction,
              entry_price: entryPrice,
              stop_loss: stopLoss,
              take_profit: takeProfitFinal,
              tp1: takeProfitFinal,
              tp2: null,
              tp3: null,
              pip_stop_loss: Math.abs(entryPrice - stopLoss),
              pip_take_profit: Math.abs(takeProfitFinal - entryPrice),
              risk_reward_ratio: riskRewardRatio,
              timeframe: timeframe,
              confidence: detection.confidence,
              confidence_percentage: detection.confidence,
              signal_type: 'AMD_DISTRIBUTION',
              signal_status: 'ACTIVE',
              trigger_count: 3,
              market_context: marketContext,
              reasoning: marketContext,
              technical_indicators: {
                strategy: "AMD_FIRST",
                amd: detection.amd,
                htf_bias: detection.amd.htfBias,
                blocked_reasons: detection.amd.blockedReasons,
              },
              expires_at: expiresAt.toISOString(),
              is_active: true,
              order_type: 'MARKET',
            })
            .select()
            .single();

          if (insertError) {
            console.error(`[${symbol}] Error creating signal:`, insertError);
            throw insertError;
          }

          console.log(`[${symbol}] Signal created at entry: ${detection.direction} @ ${entryPrice} (ID: ${newSignal.id})`);
          await supabase.rpc('register_active_signal', { p_symbol: symbol, p_mt5_symbol: mt5Symbol, p_signal_id: newSignal.id });

          generatedSignals.push(newSignal);
          amdDiagnostics.push({
            symbol,
            status: "generated",
            direction: detection.direction,
            confidence: detection.confidence,
            phase: detection.amd.phase,
            htf_bias: detection.amd.htfBias,
            sweep_high: detection.amd.sweepHigh,
            sweep_low: detection.amd.sweepLow,
            distribution_strength: detection.amd.distributionStrength,
            range_high: detection.amd.rangeHigh,
            range_low: detection.amd.rangeLow,
            risk_reward_ratio: riskRewardRatio,
            entry_price: entryPrice,
            stop_loss: stopLoss,
            take_profit: takeProfitFinal,
            blocked_reasons: detection.amd.blockedReasons,
            note: "Signal inserted immediately at entry.",
            mtf_counts: mtfCounts,
          });
          return { symbol, signalGenerated: true, reason: `${detection.direction} AMD distribution signal at entry`, confidence: detection.confidence, direction: detection.direction };
        }

        // Price not at entry: store pending setup; signal created when check-pending-entry sees price at entry
        const pendingExpiresAt = new Date();
        pendingExpiresAt.setHours(pendingExpiresAt.getHours() + 2);

        await supabase.from('pending_setups').delete().eq('symbol', symbol).eq('status', 'pending');
        const { error: pendingErr } = await supabase.from('pending_setups').insert({
          symbol,
          direction: detection.direction,
          suggested_entry: entryPrice,
          stop_loss: stopLoss,
          take_profit: takeProfitFinal,
          manipulation_high,
          manipulation_low,
          atr,
          reasoning: marketContext,
          confidence: detection.confidence,
          trigger_summary: `AMD ${detection.amd.phase}; htf=${detection.amd.htfBias}; dist=${detection.amd.distributionStrength}`,
          technical_indicators: { strategy: "AMD_FIRST", amd: detection.amd },
          timeframe,
          expires_at: pendingExpiresAt.toISOString(),
          status: 'pending',
        });

        if (pendingErr) {
          console.error(`[${symbol}] Error creating pending setup:`, pendingErr);
          throw pendingErr;
        }
        console.log(`[${symbol}] Pending setup created: entry ${entryPrice}, SL ${stopLoss}, TP ${takeProfitFinal}; signal when price reaches entry (tolerance ${entryTolerance.toFixed(2)})`);
        amdDiagnostics.push({
          symbol,
          status: "pending",
          direction: detection.direction,
          confidence: detection.confidence,
          phase: detection.amd.phase,
          htf_bias: detection.amd.htfBias,
          sweep_high: detection.amd.sweepHigh,
          sweep_low: detection.amd.sweepLow,
          distribution_strength: detection.amd.distributionStrength,
          range_high: detection.amd.rangeHigh,
          range_low: detection.amd.rangeLow,
          risk_reward_ratio: riskRewardRatio,
          entry_price: entryPrice,
          stop_loss: stopLoss,
          take_profit: takeProfitFinal,
          blocked_reasons: detection.amd.blockedReasons,
          note: "Pending setup created; waiting for entry tolerance.",
          mtf_counts: mtfCounts,
        });
        return { symbol, signalGenerated: true, reason: `Pending setup; signal when price reaches ${entryPrice.toFixed(2)}`, confidence: detection.confidence, direction: detection.direction };

      } catch (error: any) {
        const errMsg = error instanceof Error ? error.message : (typeof error === "string" ? error : String(error ?? "Unknown error"));
        console.error(`[${symbol}] Error:`, errMsg);
        amdDiagnostics.push({
          symbol,
          status: "error",
          direction: null,
          confidence: 0,
          phase: "none",
          htf_bias: "neutral",
          sweep_high: false,
          sweep_low: false,
          distribution_strength: 0,
          range_high: 0,
          range_low: 0,
          risk_reward_ratio: 0,
          blocked_reasons: ["runtime_error"],
          note: errMsg,
        });
        return {
          symbol,
          signalGenerated: false,
          reason: `Error: ${errMsg}`
        };
      }
    });

    // Wait for all symbols to be processed
    const symbolResults = await Promise.all(symbolPromises);
    results.push(...symbolResults);

    const successCount = results.filter(r => r.signalGenerated).length;
    const totalScanned = symbols.length;

    console.log(`[AUTO-SCAN] Completed. Generated ${successCount}/${totalScanned} signals`);

    // Pilot metrics: monitor acceptance gates for AMD rollout.
    try {
      const { data: closedTrades } = await supabase
        .from("trades")
        .select("profit_loss,status,created_at")
        .eq("status", "closed")
        .order("created_at", { ascending: false })
        .limit(200);

      const last100 = (closedTrades || []).slice(0, 100);
      const last200 = (closedTrades || []).slice(0, 200);
      const summarize = (arr: any[]) => {
        const n = arr.length || 1;
        const wins = arr.filter((t) => Number(t.profit_loss) > 0).length;
        const losses = arr.filter((t) => Number(t.profit_loss) < 0).map((t) => Math.abs(Number(t.profit_loss)));
        const profits = arr.filter((t) => Number(t.profit_loss) > 0).map((t) => Number(t.profit_loss));
        const winRate = (wins / n) * 100;
        const expectancy = arr.reduce((s, t) => s + Number(t.profit_loss || 0), 0) / n;
        const grossProfit = profits.reduce((a, b) => a + b, 0);
        const grossLoss = losses.reduce((a, b) => a + b, 0);
        const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 9.99 : 0;
        return { count: arr.length, winRate, expectancy, profitFactor };
      };

      const m100 = summarize(last100);
      const m200 = summarize(last200);
      console.log(
        `[AUTO-SCAN][PILOT] last100: winRate=${m100.winRate.toFixed(2)} expectancy=${m100.expectancy.toFixed(2)} pf=${m100.profitFactor.toFixed(2)} count=${m100.count}`,
      );
      console.log(
        `[AUTO-SCAN][PILOT] last200: winRate=${m200.winRate.toFixed(2)} expectancy=${m200.expectancy.toFixed(2)} pf=${m200.profitFactor.toFixed(2)} count=${m200.count}`,
      );
    } catch (metricsErr) {
      console.warn("[AUTO-SCAN][PILOT] metrics calc failed:", metricsErr instanceof Error ? metricsErr.message : metricsErr);
    }

    // Send signal notification emails via Resend (to users with verified MT5)
    if (generatedSignals.length > 0) {
      try {
        const sendResults = await Promise.allSettled(
          generatedSignals.map(async (s: any) => {
            const signalConfidence = Number(s.confidence_percentage ?? s.confidence ?? 0);
            const emails = await getSignalNotificationEmails(supabase, signalConfidence);
            if (emails.length === 0) return { skipped: true };
            return sendSignalEmail({ signal: s, to: emails });
          })
        );

        const failed = sendResults.filter(
          (r) => r.status === "rejected" || (r.status === "fulfilled" && (r.value as { error?: string }).error),
        );
        if (failed.length > 0) console.warn(`[AUTO-SCAN] ${failed.length} signal email(s) failed to send`);
        else console.log(`[AUTO-SCAN] Signal emails processed for ${generatedSignals.length} signal(s)`);
      } catch (e) {
        console.warn("[AUTO-SCAN] Resend signal emails error:", e instanceof Error ? e.message : e);
      }
    }

    // Update scan schedule with next scan time
    // Get current scan interval from database
    const { data: scheduleData } = await supabase
      .from('scan_schedule')
      .select('scan_interval_minutes')
      .eq('id', '00000000-0000-0000-0000-000000000001')
      .single();

    const scanIntervalMinutes = scheduleData?.scan_interval_minutes || 1;
    const nextScanTime = new Date();
    nextScanTime.setMinutes(nextScanTime.getMinutes() + scanIntervalMinutes);

    await supabase
      .from('scan_schedule')
      .update({
        next_scan_at: nextScanTime.toISOString(),
        last_scan_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', '00000000-0000-0000-0000-000000000001');

    console.log(`[AUTO-SCAN] Next scan scheduled for: ${nextScanTime.toISOString()} (${scanIntervalMinutes} minute interval)`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Automated scan complete. Generated ${successCount} new signals out of ${totalScanned} symbols scanned.`,
        timestamp: new Date().toISOString(),
        results,
        generatedSignals,
        amd_diagnostics: {
          strategy: "AMD_FIRST",
          timeframe_context: timeframe,
          symbols_scanned: symbols,
          generated_count: generatedSignals.length,
          diagnostics: amdDiagnostics,
        },
        stats: {
          total_scanned: totalScanned,
          signals_generated: successCount,
          signals_skipped: totalScanned - successCount
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
    const errMsg = error instanceof Error ? error.message : (typeof error === "string" ? error : String(error ?? "Unknown error"));
    console.error("[AUTO-SCAN] Fatal error:", errMsg);
    return new Response(
      JSON.stringify({
        success: false,
        error: errMsg || "Automated signal generation failed",
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


