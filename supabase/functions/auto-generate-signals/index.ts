import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createDerivAPI } from "../_shared/deriv-api.ts";
import { createSignalDetector } from "../_shared/advanced-signal-detector.ts";
import { refineSignalWithICT } from "../_shared/ict-signal-refiner.ts";
import { SYMBOL_SL_TP_POINTS } from "../_shared/symbol-sl-tp.ts";

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

    // Fetch per-symbol SL/TP points from symbol_sl_tp_config (Settings page)
    const { data: configRows } = await supabase.from('symbol_sl_tp_config').select('symbol, sl_points, tp_points');
    const pointsBySymbol: Record<string, { slPoints: number; tpPoints: number }> = {};
    if (configRows?.length) {
      for (const row of configRows) {
        const sl = Number(row.sl_points);
        const tp = Number(row.tp_points);
        if (Number.isFinite(sl) && Number.isFinite(tp) && sl > 0 && tp > 0) {
          pointsBySymbol[row.symbol] = { slPoints: sl, tpPoints: tp };
        }
      }
      console.log(`[AUTO-SCAN] Loaded points for ${Object.keys(pointsBySymbol).length} symbols from config`);
    }

    // List of symbols to monitor
    const symbols = ['R_10', 'R_50', 'R_100', '1HZ10V', '1HZ30V', '1HZ50V', '1HZ90V', '1HZ100V', 'stpRNG', 'JD25'];
    const timeframe = 'M1';

    const results: AutoSignalResult[] = [];
    const generatedSignals = [];

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

        // Run advanced signal detection
        console.log(`[${symbol}] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`[${symbol}] 🔍 STARTING ANALYSIS with ${ticks.length} ticks...`);
        console.log(`[${symbol}] Current Price: ${ticks[ticks.length - 1].quote}`);

        const points = pointsBySymbol[symbol] ?? SYMBOL_SL_TP_POINTS[symbol] ?? { slPoints: 400, tpPoints: 800 };
        const detector = createSignalDetector(ticks, { slPoints: points.slPoints, tpPoints: points.tpPoints });
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
          console.log(`[${symbol}] 💰 TRADE SETUP:`);
          console.log(`[${symbol}]   Entry: ${detection.entryPrice}`);
          console.log(`[${symbol}]   TP: ${detection.tp1}`);
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

        // Liquidity levels from recent price range (ICT: avoid placing SL where liquidity sits)
        const prices = ticks.map((t: { quote: number }) => t.quote);
        const recentPrices = prices.slice(-Math.min(80, prices.length));
        const recentSwingHigh = recentPrices.length ? Math.max(...recentPrices) : detection.entryPrice;
        const recentSwingLow = recentPrices.length ? Math.min(...recentPrices) : detection.entryPrice;

        // ICT refinement: OpenAI acts as expert ICT trader (best-effort; never blocks signal creation)
        let entryPrice = detection.entryPrice;
        let stopLoss = detection.stopLoss;
        let takeProfit = detection.takeProfit ?? detection.tp1 ?? 0;
        let tp1 = detection.tp1 ?? detection.takeProfit ?? 0;
        let marketContext = detection.reasoning;
        let ictResult: { refined: { entry_price: number; stop_loss: number; tp1: number }; reasoning: string } | null = null;
        try {
          ictResult = await refineSignalWithICT(openaiApiKey, {
            symbol,
            direction: detection.direction,
            currentPrice: detection.entryPrice,
            atr: detection.atr ?? Math.abs(detection.entryPrice - detection.stopLoss) / 2,
            supportLevels: detection.supportLevels ?? [],
            resistanceLevels: detection.resistanceLevels ?? [],
            recentSwingHigh,
            recentSwingLow,
            initialEntry: detection.entryPrice,
            initialStopLoss: detection.stopLoss,
            initialTp1: detection.tp1 ?? detection.takeProfit ?? 0,
            initialTp2: detection.tp1 ?? detection.takeProfit ?? 0,
            initialTp3: detection.tp1 ?? detection.takeProfit ?? 0,
            triggerSummary: detection.triggers.map((t) => t.triggerCondition).join('; '),
          });
        } catch (ictErr: unknown) {
          console.warn(`[${symbol}] ICT refiner failed (using detector levels):`, ictErr instanceof Error ? ictErr.message : ictErr);
        }

        if (ictResult) {
          const detectorSlDistance = Math.abs(detection.entryPrice - detection.stopLoss);
          const ictSlDistance = Math.abs(ictResult.refined.entry_price - ictResult.refined.stop_loss);
          const ictTpDistance = Math.abs(ictResult.refined.tp1 - ictResult.refined.entry_price);
          const useIctSl = detectorSlDistance > 0 && ictSlDistance >= detectorSlDistance * 0.5;
          const useIctTp = detectorSlDistance > 0 && ictTpDistance >= detectorSlDistance * 0.75;

          entryPrice = ictResult.refined.entry_price;
          stopLoss = useIctSl ? ictResult.refined.stop_loss : detection.stopLoss;
          tp1 = useIctTp ? ictResult.refined.tp1 : (detection.tp1 ?? detection.takeProfit ?? 0);
          takeProfit = tp1;
          marketContext = `${detection.reasoning}\n\n[ICT Refinement] ${ictResult.reasoning}`;
          if (!useIctSl || !useIctTp) {
            console.log(`[${symbol}] 🎯 ICT refined but SL/TP too tight; using detector levels for ${!useIctSl ? 'SL' : ''} ${!useIctTp ? 'TP' : ''}`);
          }
          console.log(`[${symbol}] 🎯 ICT refined: Entry ${entryPrice}, SL ${stopLoss}, TP ${tp1}`);
        }

        // Ensure SL/TP are valid: positive and on correct side of entry (never negative or wrong side)
        const dir = detection.direction;
        const invalid =
          stopLoss <= 0 ||
          tp1 <= 0 ||
          (dir === 'BUY' && (stopLoss >= entryPrice || tp1 <= entryPrice)) ||
          (dir === 'SELL' && (tp1 >= entryPrice || stopLoss <= entryPrice));
        if (invalid) {
          console.warn(`[${symbol}] Invalid SL/TP levels (e.g. negative or wrong side), using detector levels`);
          entryPrice = detection.entryPrice;
          stopLoss = detection.stopLoss;
          takeProfit = detection.takeProfit ?? detection.tp1 ?? 0;
          tp1 = detection.tp1 ?? detection.takeProfit ?? 0;
        }

        // Get MT5 symbol mapping
        const mt5Symbol = derivAPI.getMT5Symbol(symbol);
        const currentPrice = entryPrice;

        // No time-based expiry: signal stays active until SL or TP is hit
        const expiresAt = new Date('2099-12-31T23:59:59Z');

        const riskRewardRatio = Math.abs(tp1 - currentPrice) / Math.abs(currentPrice - stopLoss) || detection.riskRewardRatio;

        // Create signal in database (single TP only; tp2/tp3 kept null for schema compatibility)
        const { data: newSignal, error: insertError } = await supabase
          .from('signals')
          .insert({
            symbol: symbol,
            mt5_symbol: mt5Symbol,
            direction: detection.direction,
            entry_price: currentPrice,
            stop_loss: stopLoss,
            take_profit: takeProfit,
            tp1,
            tp2: null,
            tp3: null,
            pip_stop_loss: Math.abs(currentPrice - stopLoss),
            pip_take_profit: Math.abs(tp1 - currentPrice),
            risk_reward_ratio: riskRewardRatio,
            timeframe: timeframe,
            confidence: detection.confidence,
            confidence_percentage: detection.confidence,
            signal_type: ictResult ? 'ICT_REFINED' : 'INDICATOR_BASED',
            signal_status: 'ACTIVE',
            trigger_count: detection.triggers.length,
            market_context: marketContext,
            reasoning: marketContext,
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
