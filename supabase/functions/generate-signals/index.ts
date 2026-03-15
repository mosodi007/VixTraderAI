import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createDerivAPI } from "../_shared/deriv-api.ts";
import { createAISignalGenerator } from "../_shared/ai-signal-generator.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface GenerateSignalsRequest {
  symbols?: string[];
  timeframe?: string;
  count?: number;
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
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    const derivApiToken = Deno.env.get("DERIV_API_TOKEN");

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ success: false, error: "Supabase configuration missing" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "OpenAI API key not configured. Please contact support." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!derivApiToken) {
      return new Response(
        JSON.stringify({ success: false, error: "Deriv API token not configured. Please add your Deriv API token." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized. Please log in again." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { symbols, timeframe, count } = await req.json() as GenerateSignalsRequest;

    const defaultSymbols = [
      'R_10',
      'R_50',
      'R_100',
      '1HZ10V',
      '1HZ30V',
      '1HZ50V',
      '1HZ90V',
      '1HZ100V',
      'stpRNG',
      'JD25',
    ];

    const targetSymbols = symbols || defaultSymbols;
    const targetTimeframe = timeframe || 'M15';
    const signalCount = Math.min(count || 3, 10);

    const derivAPI = createDerivAPI();
    const aiGenerator = createAISignalGenerator(openaiApiKey, derivAPI);

    const generatedSignals = [];

    for (let i = 0; i < signalCount && i < targetSymbols.length; i++) {
      const symbol = targetSymbols[i];

      try {
        const signal = await aiGenerator.generateSignalForSymbol(symbol, targetTimeframe);

        const { data: insertedSignal, error: insertError } = await supabase
          .from('signals')
          .insert({
            symbol: signal.symbol,
            mt5_symbol: signal.mt5_symbol,
            direction: signal.direction,
            entry_price: signal.entry_price,
            stop_loss: signal.stop_loss,
            take_profit: signal.take_profit,
            tp1: signal.tp1,
            tp2: signal.tp2,
            tp3: signal.tp3,
            pip_stop_loss: signal.pip_stop_loss,
            pip_take_profit: signal.pip_take_profit,
            risk_reward_ratio: signal.risk_reward_ratio,
            timeframe: signal.timeframe,
            confidence: signal.confidence_percentage,
            confidence_percentage: signal.confidence_percentage,
            signal_type: signal.signal_type,
            market_context: signal.market_context,
            reasoning: signal.reasoning,
            technical_indicators: signal.technical_indicators,
            expires_at: signal.expires_at.toISOString(),
            is_active: true,
            order_type: 'MARKET',
          })
          .select()
          .single();

        if (insertError) {
          console.error('Error inserting signal:', insertError);
          throw new Error(`Failed to insert signal: ${insertError.message}`);
        }

        generatedSignals.push(insertedSignal);
        console.log(`Generated ${signal.direction} signal for ${signal.symbol} with ${signal.confidence_percentage}% confidence (RR: ${signal.risk_reward_ratio})`);

        await supabase
          .from('market_analysis_history')
          .insert({
            symbol: signal.mt5_symbol,
            current_price: signal.entry_price,
            rsi: signal.technical_indicators.rsi,
            macd_value: signal.technical_indicators.macd.macd,
            macd_signal: signal.technical_indicators.macd.signal,
            macd_histogram: signal.technical_indicators.macd.histogram,
            trend: signal.technical_indicators.trend,
            volatility: signal.technical_indicators.volatility,
            recommendation: signal.direction,
            confidence: signal.confidence_percentage,
            analysis_text: signal.ai_analysis || signal.reasoning,
          });

      } catch (error: any) {
        console.error(`Failed to generate signal for ${symbol}:`, error.message);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Successfully generated ${generatedSignals.length} trading signals`,
        signals: generatedSignals,
        metadata: {
          timeframe: targetTimeframe,
          generated_at: new Date().toISOString(),
          total_count: generatedSignals.length,
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
    console.error("Signal generation error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Failed to generate signals",
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
