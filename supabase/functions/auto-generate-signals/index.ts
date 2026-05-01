import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createDerivAPI } from "../_shared/deriv-api.ts";
import { createSignalDetector } from "../_shared/advanced-signal-detector.ts";
import { refineSignalWithICT } from "../_shared/ict-signal-refiner.ts";
import { priceLevelsFromPoints } from "../_shared/symbol-sl-tp.ts";

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

function invertDirection(direction: "BUY" | "SELL"): "BUY" | "SELL" {
  return direction === "BUY" ? "SELL" : "BUY";
}

function isInvertStrategyEnabled(): boolean {
  const raw = String(Deno.env.get("INVERT_STRATEGY") || "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
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

    // Same Deriv codes as Settings.tsx SYMBOLS so enable/disable and lots match what we scan.
    const symbols = [
      'R_100',
    ];
    const timeframe = 'M5';

    const invertStrategy = isInvertStrategyEnabled();
    const results: AutoSignalResult[] = [];
    const generatedSignals = [];

    console.log(`[AUTO-SCAN] Starting automated signal scan for ${symbols.length} symbols at ${new Date().toISOString()}`);
    console.log(`[AUTO-SCAN] INVERT_STRATEGY=${invertStrategy ? "ON" : "OFF"}`);

    // Global SL/TP source of truth: symbol_sl_tp_config
    const { data: sltpRows, error: sltpErr } = await supabase
      .from("symbol_sl_tp_config")
      .select("symbol, sl_points, tp_points");
    if (sltpErr) throw sltpErr;
    const sltpBySymbol = new Map<string, { sl_points: number; tp_points: number }>();
    for (const row of sltpRows || []) {
      const symbol = String((row as any).symbol || "").trim();
      const sl = Number((row as any).sl_points);
      const tp = Number((row as any).tp_points);
      if (!symbol || !Number.isFinite(sl) || !Number.isFinite(tp) || sl <= 0 || tp <= 0) continue;
      sltpBySymbol.set(symbol, { sl_points: sl, tp_points: tp });
    }

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
          return {
            symbol,
            signalGenerated: false,
            reason: 'Symbol already has an active signal. Waiting for current signal to close.'
          };
        }

        // Also check signals table for active signals
        const { data: activeSignals } = await supabase
          .from('signals')
          .select('id')
          .eq('symbol', symbol)
          .eq('is_active', true)
          .gt('expires_at', new Date().toISOString());

        if (activeSignals && activeSignals.length > 0) {
          console.log(`[${symbol}] Has active signals in database. Skipping.`);
          return {
            symbol,
            signalGenerated: false,
            reason: 'Symbol has active signals. One signal per asset rule enforced.'
          };
        }

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

        const sltp = sltpBySymbol.get(symbol);
        if (!sltp) {
          console.warn(`[${symbol}] Missing symbol_sl_tp_config row. Skipping symbol.`);
          return {
            symbol,
            signalGenerated: false,
            reason: 'Missing symbol_sl_tp_config row (SL/TP not configured in database)'
          };
        }

        // Run advanced signal detection
        console.log(`[${symbol}] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`[${symbol}] 🔍 STARTING ANALYSIS with ${ticks.length} ticks...`);
        console.log(`[${symbol}] Current Price: ${ticks[ticks.length - 1].quote}`);
        console.log(`[${symbol}] Using DB SL/TP points: SL=${sltp.sl_points}, TP=${sltp.tp_points}`);

        const detector = createSignalDetector(ticks, {
          slPoints: sltp.sl_points,
          tpPoints: sltp.tp_points,
        });
        const detection = detector.detectSignal(symbol, timeframe);

        console.log(`[${symbol}] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`[${symbol}] 📊 ANALYSIS COMPLETE`);
        console.log(`[${symbol}] Result: ${detection.shouldGenerateSignal ? '✅ SIGNAL DETECTED' : '❌ NO SIGNAL'}`);
        console.log(`[${symbol}] Direction: ${detection.direction || 'NONE'}`);
        console.log(`[${symbol}] Confidence: ${detection.confidence}%`);
        console.log(`[${symbol}] Triggers: ${detection.triggers.length}`);
        console.log(`[${symbol}] Risk-Reward: ${detection.riskRewardRatio}:1`);

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
          const finalDirectionPreview = invertStrategy ? invertDirection(detection.direction) : detection.direction;
          console.log(`[${symbol}] 💰 TRADE SETUP:`);
          console.log(`[${symbol}]   Direction (raw): ${detection.direction} -> (final): ${finalDirectionPreview}`);
          console.log(`[${symbol}]   Entry: ${detection.entryPrice}`);
          console.log(`[${symbol}]   TP1: ${detection.tp1}`);
          console.log(`[${symbol}]   TP2: ${detection.tp2}`);
          console.log(`[${symbol}]   TP3: ${detection.tp3}`);
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

        const finalDirection = invertStrategy ? invertDirection(detection.direction) : detection.direction;

        // Liquidity levels from recent price range (ICT: avoid placing SL where liquidity sits)
        const prices = ticks.map((t: { quote: number }) => t.quote);
        const recentPrices = prices.slice(-Math.min(80, prices.length));
        const recentSwingHigh = recentPrices.length ? Math.max(...recentPrices) : detection.entryPrice;
        const recentSwingLow = recentPrices.length ? Math.min(...recentPrices) : detection.entryPrice;

        // ICT refinement: OpenAI acts as expert ICT trader (best-effort; never blocks signal creation)
        let entryPrice = detection.entryPrice;
        let stopLoss = detection.stopLoss;
        let takeProfit = detection.takeProfit ?? 0;
        let tp1 = detection.tp1 ?? detection.takeProfit ?? 0;
        let tp2 = detection.tp2 ?? tp1;
        let tp3 = detection.tp3 ?? detection.takeProfit ?? tp1;
        let marketContext = detection.reasoning;
        let ictResult: { refined: { entry_price: number; stop_loss: number; tp1: number; tp2: number; tp3: number }; reasoning: string } | null = null;
        try {
          ictResult = await refineSignalWithICT(openaiApiKey, {
            symbol,
            direction: finalDirection,
            currentPrice: detection.entryPrice,
            atr: detection.atr ?? Math.abs(detection.entryPrice - detection.stopLoss) / 2,
            supportLevels: detection.supportLevels ?? [],
            resistanceLevels: detection.resistanceLevels ?? [],
            manipulation_high: recentSwingHigh,
            manipulation_low: recentSwingLow,
            initialEntry: detection.entryPrice,
            initialStopLoss: detection.stopLoss,
            initialTp1: detection.tp1 ?? detection.takeProfit ?? 0,
            initialTp2: detection.tp2 ?? detection.tp1 ?? detection.takeProfit ?? 0,
            initialTp3: detection.tp3 ?? detection.takeProfit ?? 0,
            triggerSummary: detection.triggers.map((t) => t.triggerCondition).join('; '),
          });
        } catch (ictErr: unknown) {
          console.warn(`[${symbol}] ICT refiner failed (using detector levels):`, ictErr instanceof Error ? ictErr.message : ictErr);
        }

        if (ictResult) {
          entryPrice = ictResult.refined.entry_price;
          stopLoss = ictResult.refined.stop_loss;
          tp1 = ictResult.refined.tp1;
          tp2 = ictResult.refined.tp2;
          tp3 = ictResult.refined.tp3;
          takeProfit = tp3;
          marketContext = `${detection.reasoning}\n\n[ICT Refinement] ${ictResult.reasoning}`;
          console.log(`[${symbol}] 🎯 ICT refined: Entry ${entryPrice}, SL ${stopLoss}, TP1 ${tp1}`);
        }

        // Source of truth for distances: symbol_sl_tp_config (ICT may move levels; EA must match DB).
        if (entryPrice > 0) {
          const dbLv = priceLevelsFromPoints(
            finalDirection,
            entryPrice,
            symbol,
            sltp.sl_points,
            sltp.tp_points,
          );
          stopLoss = dbLv.stopLoss;
          tp1 = dbLv.tp1;
          tp2 = dbLv.tp1;
          tp3 = dbLv.tp1;
          takeProfit = dbLv.tp1;
          console.log(
            `[${symbol}] SL/TP snapped to DB points (SL=${sltp.sl_points}, TP=${sltp.tp_points}): SL ${stopLoss}, TP ${tp1}`,
          );
        }

        // Get MT5 symbol mapping
        const mt5Symbol = derivAPI.getMT5Symbol(symbol);
        const currentPrice = entryPrice;

        // Calculate expiry (1 hour for M1 timeframe)
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 1);

        const slDistAbs = Math.abs(currentPrice - stopLoss);
        const tpDistAbs = Math.abs(tp1 - currentPrice);
        const rawRr = slDistAbs > 1e-10 ? tpDistAbs / slDistAbs : detection.riskRewardRatio;
        const riskRewardRatio = Number.isFinite(rawRr) ? Math.min(1e9, Math.max(0, rawRr)) : detection.riskRewardRatio;

        // Create signal in database
        const { data: newSignal, error: insertError } = await supabase
          .from('signals')
          .insert({
            symbol: symbol,
            mt5_symbol: mt5Symbol,
            direction: finalDirection,
            entry_price: currentPrice,
            stop_loss: stopLoss,
            take_profit: takeProfit,
            tp1,
            tp2,
            tp3,
            pip_stop_loss: Math.abs(currentPrice - stopLoss),
            pip_take_profit: Math.abs(tp1 - currentPrice),
            risk_reward_ratio: riskRewardRatio,
            timeframe: timeframe,
            confidence: detection.confidence,
            confidence_percentage: detection.confidence,
            signal_type: ictResult
              ? (invertStrategy ? 'ICT_REFINED_DIRECTION' : 'ICT_REFINED')
              : (invertStrategy ? 'INDICATOR_BASED_DIRECTION' : 'INDICATOR_BASED'),
            signal_status: 'ACTIVE',
            trigger_count: detection.triggers.length,
            market_context: invertStrategy
              ? `[Direction Inversion] Raw: ${detection.direction}, Final: ${finalDirection}\n\n${marketContext}`
              : marketContext,
            reasoning: invertStrategy
              ? `[Direction Inversion] Raw: ${detection.direction}, Final: ${finalDirection}\n\n${marketContext}`
              : marketContext,
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

        console.log(`[${symbol}] ✓ Signal created: ${detection.direction} at ${currentPrice} (ID: ${newSignal.id})${ictResult ? ' [ICT refined]' : ''}`);

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

