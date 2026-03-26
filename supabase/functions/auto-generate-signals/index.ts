
//Auto-generate-signals old

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createDerivAPI } from "../_shared/deriv-api.ts";
import { createSignalDetector } from "../_shared/advanced-signal-detector.ts";
import { getSignalNotificationEmails, sendSignalEmail } from "../_shared/resend.ts";

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

const SYMBOL_POINT_SIZE: Record<string, number> = {
  R_10: 0.4,
  R_25: 0.4,
  R_50: 0.4,
  R_75: 0.4,
  R_100: 0.4,
  stpRNG: 0.01,
  "1HZ10V": 0.01,
  "1HZ30V": 0.01,
  "1HZ75V": 0.01,
  "1HZ50V": 0.01,
  "1HZ90V": 0.01,
  "1HZ100V": 0.01,
  JD25: 0.01,
  STPIDX: 0.01,
};

function getPointSize(symbol: string): number {
  return SYMBOL_POINT_SIZE[String(symbol || "").trim()] ?? 0.01;
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
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    const derivApiToken = Deno.env.get("DERIV_API_TOKEN");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Supabase configuration missing");
    }

    if (!openaiApiKey) {
      throw new Error("OpenAI API key not configured");
    }

    if (!derivApiToken) {
      throw new Error("Deriv API token not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Load per-symbol SL/TP points configured from Settings page.
    const { data: sltpConfigRows } = await supabase
      .from("symbol_sl_tp_config")
      .select("symbol, sl_points, tp_points");
    const sltpBySymbol = new Map<string, { slPoints: number; tpPoints: number }>();
    for (const row of sltpConfigRows || []) {
      const symbol = String((row as any).symbol || "").trim();
      if (!symbol) continue;
      const slPoints = Math.max(1, Number((row as any).sl_points) || 0);
      const tpPointsRaw = Number((row as any).tp_points);
      const tpPoints = Math.max(1, Number.isFinite(tpPointsRaw) ? tpPointsRaw : slPoints * 3);
      sltpBySymbol.set(symbol, { slPoints, tpPoints });
    }

    // List of symbols to monitor
    const symbols = ['R_10', 'R_25', 'R_50', 'R_75', 'R_100', '1HZ10V', '1HZ30V', '1HZ75V', '1HZ100V'];
    const timeframe = 'M15';

    const results: AutoSignalResult[] = [];
    const generatedSignals: any[] = [];

    console.log(`[AUTO-SCAN] Starting automated signal scan for ${symbols.length} symbols at ${new Date().toISOString()}`);

    // Process symbols in parallel for faster execution
    const symbolPromises = symbols.map(async (symbol) => {
      try {
        // Multiple concurrent signals per symbol are allowed; outcomes are tracked per-user on `trades`.
        // Fetch market data from Deriv
        const derivAPI = createDerivAPI();
        console.log(`[${symbol}] Fetching market data...`);

        const ticks = await derivAPI.getTickHistory(symbol, 200);

        if (!ticks || ticks.length < 100) {
          console.log(`[${symbol}] Insufficient market data.`);
          return {
            symbol,
            signalGenerated: false,
            reason: 'Insufficient market data for analysis'
          };
        }

        // Run advanced signal detection
        console.log(`[${symbol}] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`[${symbol}] 🔍 STARTING ANALYSIS with ${ticks.length} ticks...`);
        console.log(`[${symbol}] Current Price: ${ticks[ticks.length - 1].quote}`);

        const detector = createSignalDetector(ticks);
        const detection = detector.detectSignal(symbol, timeframe);

        console.log(`[${symbol}] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`[${symbol}] 📊 ANALYSIS COMPLETE`);
        console.log(`[${symbol}] Result: ${detection.shouldGenerateSignal ? '✅ SIGNAL DETECTED' : '❌ NO SIGNAL'}`);
        console.log(`[${symbol}] Direction: ${detection.direction || 'NONE'}`);
        console.log(`[${symbol}] Confidence: ${detection.confidence}%`);
        console.log(`[${symbol}] Triggers: ${detection.triggers.length}`);
        console.log(`[${symbol}] Risk-Reward: 1:${detection.riskRewardRatio}`);

        if (detection.triggers.length > 0) {
          console.log(`[${symbol}] 📈 INDICATOR TRIGGERS:`);
          detection.triggers.forEach((trigger, idx) => {
            console.log(`[${symbol}]   ${idx + 1}. ${trigger.indicatorName}: ${trigger.triggerCondition}`);
          });
        }

        if (detection.patterns.length > 0) {
          console.log(`[${symbol}] 🕯️ CANDLESTICK PATTERNS:`);
          detection.patterns.forEach((pattern, idx) => {
            console.log(`[${symbol}]   ${idx + 1}. ${pattern.name} (${pattern.type}) - ${pattern.confidence}% confidence`);
          });
        }

        if (detection.shouldGenerateSignal && detection.direction) {
          console.log(`[${symbol}] 💰 TRADE SETUP:`);
          console.log(`[${symbol}]   Entry: ${detection.entryPrice}`);
          console.log(`[${symbol}]   TP: ${detection.takeProfit}`);
          console.log(`[${symbol}]   SL: ${detection.stopLoss}`);
        } else {
          console.log(`[${symbol}] ⚠️ REASON: ${detection.reasoning.split('\n')[0]}`);
        }
        console.log(`[${symbol}] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

        if (!detection.shouldGenerateSignal || !detection.direction) {
          return {
            symbol,
            signalGenerated: false,
            reason: detection.reasoning,
            confidence: detection.confidence
          };
        }

        // Get MT5 symbol mapping
        const mt5Symbol = derivAPI.getMT5Symbol(symbol);
        const currentPrice = detection.entryPrice;
        let stopLoss = detection.stopLoss;
        let takeProfit = detection.takeProfit;

        // If Settings has symbol points, override detector SL/TP with configured distances.
        const configured = sltpBySymbol.get(symbol);
        if (configured) {
          const pointSize = getPointSize(symbol);
          const slDistance = configured.slPoints * pointSize;
          const tpDistance = configured.tpPoints * pointSize;

          if (detection.direction === "BUY") {
            stopLoss = currentPrice - slDistance;
            takeProfit = currentPrice + tpDistance;
          } else {
            stopLoss = currentPrice + slDistance;
            takeProfit = currentPrice - tpDistance;
          }

          console.log(
            `[${symbol}] Applied settings SL/TP points: SL=${configured.slPoints}, TP=${configured.tpPoints} (pointSize=${pointSize})`
          );
        }

        // Calculate expiry (4 hours for M15 timeframe)
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 4);

        // Create signal in database
        const { data: newSignal, error: insertError } = await supabase
          .from('signals')
          .insert({
            symbol: symbol,
            mt5_symbol: mt5Symbol,
            direction: detection.direction,
            entry_price: currentPrice,
            stop_loss: stopLoss,
            take_profit: takeProfit,
            tp1: null,
            tp2: null,
            tp3: null,
            pip_stop_loss: Math.abs(currentPrice - stopLoss),
            pip_take_profit: Math.abs(takeProfit - currentPrice),
            risk_reward_ratio: detection.riskRewardRatio,
            timeframe: timeframe,
            confidence: detection.confidence,
            confidence_percentage: detection.confidence,
            signal_type: 'INDICATOR_BASED',
            signal_status: 'ACTIVE',
            trigger_count: detection.triggers.length,
            market_context: detection.reasoning,
            reasoning: detection.reasoning,
            technical_indicators: {
              triggers: detection.triggers,
              patterns: detection.patterns
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

        console.log(`[${symbol}] ✓ Signal created: ${detection.direction} at ${currentPrice} (ID: ${newSignal.id})`);

        // Register in active signal registry
        await supabase.rpc('register_active_signal', {
          p_symbol: symbol,
          p_mt5_symbol: mt5Symbol,
          p_signal_id: newSignal.id
        });

        // Record signal triggers
        if (detection.triggers.length > 0) {
          const triggerRecords = detection.triggers.map(trigger => ({
            signal_id: newSignal.id,
            indicator_name: trigger.indicatorName,
            indicator_value: trigger.indicatorValue,
            trigger_condition: trigger.triggerCondition,
            timeframe: trigger.timeframe
          }));

          await supabase
            .from('signal_triggers')
            .insert(triggerRecords);

          console.log(`[${symbol}] Recorded ${detection.triggers.length} trigger conditions`);
        }

        // Send signal notification email via Resend
        try {
          const signalConfidence = Number((newSignal as any)?.confidence_percentage ?? (newSignal as any)?.confidence ?? detection.confidence ?? 0);
          const emails = await getSignalNotificationEmails(supabase, signalConfidence);
          if (emails.length > 0) {
            const payload = {
              id: newSignal.id,
              symbol,
              mt5_symbol: mt5Symbol,
              direction: detection.direction,
              entry_price: currentPrice,
              stop_loss: stopLoss,
              take_profit: takeProfit,
              tp1: null,
              risk_reward_ratio: detection.riskRewardRatio,
              created_at: new Date().toISOString(),
            };
            const emailResult = await sendSignalEmail({ signal: payload, to: emails });
            if (emailResult.error) console.warn(`[${symbol}] Resend email failed:`, emailResult.error);
            else console.log(`[${symbol}] Signal email sent to ${emails.length} recipient(s)`);
          }
        } catch (emailError) {
          console.warn(`[${symbol}] Resend signal email error:`, emailError instanceof Error ? emailError.message : emailError);
        }

        generatedSignals.push(newSignal);

        return {
          symbol,
          signalGenerated: true,
          reason: `${detection.direction} signal generated with ${detection.confidence}% confidence`,
          confidence: detection.confidence,
          direction: detection.direction
        };

      } catch (error: any) {
        console.error(`[${symbol}] Error:`, error.message);
        return {
          symbol,
          signalGenerated: false,
          reason: `Error: ${error.message}`
        };
      }
    });

    // Wait for all symbols to be processed
    const symbolResults = await Promise.all(symbolPromises);
    results.push(...symbolResults);

    const successCount = results.filter(r => r.signalGenerated).length;
    const totalScanned = symbols.length;

    console.log(`[AUTO-SCAN] Completed. Generated ${successCount}/${totalScanned} signals`);

    // Update scan schedule with next scan time
    // Get current scan interval from database
    const { data: scheduleData } = await supabase
      .from('scan_schedule')
      .select('scan_interval_minutes')
      .eq('id', '00000000-0000-0000-0000-000000000001')
      .single();

    const scanIntervalMinutes = scheduleData?.scan_interval_minutes || 5;
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
    console.error("[AUTO-SCAN] Fatal error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Automated signal generation failed",
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
