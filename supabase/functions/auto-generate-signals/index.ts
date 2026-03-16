import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createDerivAPI } from "../_shared/deriv-api.ts";
import { createSignalDetector } from "../_shared/advanced-signal-detector.ts";
import { refineSignalWithICT } from "../_shared/ict-signal-refiner.ts";
import { SYMBOL_SL_TP_POINTS, getPointSize } from "../_shared/symbol-sl-tp.ts";

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

        // Manipulation phase high/low (recent range before the move; used for SL placement)
        const prices = ticks.map((t: { quote: number }) => t.quote);
        const recentPrices = prices.slice(-Math.min(80, prices.length));
        const manipulation_high = recentPrices.length ? Math.max(...recentPrices) : detection.entryPrice;
        const manipulation_low = recentPrices.length ? Math.min(...recentPrices) : detection.entryPrice;
        const atr = detection.atr ?? Math.max(Math.abs(detection.entryPrice - detection.stopLoss) / 2, detection.entryPrice * 0.001);

        // ICT refinement: AI sets entry and SL at manipulation phase high/low
        let entryPrice = detection.entryPrice;
        let stopLoss = detection.stopLoss;
        let marketContext = detection.reasoning;
        let ictResult: { refined: { entry_price: number; stop_loss: number; tp1: number }; reasoning: string } | null = null;
        try {
          ictResult = await refineSignalWithICT(openaiApiKey, {
            symbol,
            direction: detection.direction,
            currentPrice: detection.entryPrice,
            atr,
            supportLevels: detection.supportLevels ?? [],
            resistanceLevels: detection.resistanceLevels ?? [],
            manipulation_high,
            manipulation_low,
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
          entryPrice = ictResult.refined.entry_price;
          stopLoss = ictResult.refined.stop_loss;
          marketContext = `${detection.reasoning}\n\n[ICT Refinement] ${ictResult.reasoning}`;
          console.log(`[${symbol}] ICT refined: Entry ${entryPrice}, SL ${stopLoss}`);
        }

        // Enforce minimum SL distance (enough room): min_sl_distance = max(1*ATR, pointSize*15)
        const pointSize = getPointSize(symbol);
        const minSlDistance = Math.max(atr, pointSize * 15);
        const slDistance = Math.abs(entryPrice - stopLoss);
        if (slDistance < minSlDistance) {
          if (detection.direction === 'BUY') {
            stopLoss = entryPrice - minSlDistance;
          } else {
            stopLoss = entryPrice + minSlDistance;
          }
          console.log(`[${symbol}] SL nudged to meet min distance: ${minSlDistance.toFixed(2)}`);
        }

        // Enforce 1:2 risk-to-reward: TP = entry ± 2 * risk
        const risk = Math.abs(entryPrice - stopLoss);
        let tp1 = detection.direction === 'BUY' ? entryPrice + 2 * risk : entryPrice - 2 * risk;

        // Ensure SL/TP valid (positive, correct side of entry)
        const dir = detection.direction;
        const invalid =
          stopLoss <= 0 ||
          tp1 <= 0 ||
          (dir === 'BUY' && (stopLoss >= entryPrice || tp1 <= entryPrice)) ||
          (dir === 'SELL' && (tp1 >= entryPrice || stopLoss <= entryPrice));
        if (invalid) {
          console.warn(`[${symbol}] Invalid SL/TP after enforcement; using detector levels`);
          entryPrice = detection.entryPrice;
          stopLoss = detection.stopLoss;
          const riskFallback = Math.abs(entryPrice - stopLoss) || atr;
          tp1 = detection.direction === 'BUY' ? entryPrice + 2 * riskFallback : entryPrice - 2 * riskFallback;
        }
        const takeProfitFinal = tp1;

        const mt5Symbol = derivAPI.getMT5Symbol(symbol);
        const currentPrice = prices[prices.length - 1];

        // Entry tolerance: signal only when price reaches suggested entry (or create pending setup)
        const entryTolerancePoints = Number(Deno.env.get('ENTRY_TOLERANCE_POINTS')) || 50;
        const entryTolerance = entryTolerancePoints * pointSize;
        const atEntry = Math.abs(currentPrice - entryPrice) <= entryTolerance;

        const expiresAt = new Date('2099-12-31T23:59:59Z');
        const riskRewardRatio = 2;

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
              signal_type: ictResult ? 'ICT_REFINED' : 'INDICATOR_BASED',
              signal_status: 'ACTIVE',
              trigger_count: detection.triggers.length,
              market_context: marketContext,
              reasoning: marketContext,
              technical_indicators: { triggers: detection.triggers, patterns: detection.patterns },
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

          if (detection.triggers.length > 0) {
            await supabase.from('signal_triggers').insert(detection.triggers.map(trigger => ({
              signal_id: newSignal.id,
              indicator_name: trigger.indicatorName,
              indicator_value: trigger.indicatorValue,
              trigger_condition: trigger.triggerCondition,
              timeframe: trigger.timeframe
            })));
          }
          generatedSignals.push(newSignal);
          return { symbol, signalGenerated: true, reason: `${detection.direction} signal at entry (1:2 R:R)`, confidence: detection.confidence, direction: detection.direction };
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
          trigger_summary: detection.triggers.map((t) => t.triggerCondition).join('; '),
          technical_indicators: { triggers: detection.triggers, patterns: detection.patterns },
          timeframe,
          expires_at: pendingExpiresAt.toISOString(),
          status: 'pending',
        });

        if (pendingErr) {
          console.error(`[${symbol}] Error creating pending setup:`, pendingErr);
          throw pendingErr;
        }
        console.log(`[${symbol}] Pending setup created: entry ${entryPrice}, SL ${stopLoss}, TP ${takeProfitFinal}; signal when price reaches entry (tolerance ${entryTolerance.toFixed(2)})`);
        return { symbol, signalGenerated: true, reason: `Pending setup; signal when price reaches ${entryPrice.toFixed(2)}`, confidence: detection.confidence, direction: detection.direction };

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
