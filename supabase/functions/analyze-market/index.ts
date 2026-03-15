import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getSlTpDistanceInPrice } from "../_shared/symbol-sl-tp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface AnalyzeMarketRequest {
  symbol: string;
  timeframe?: string;
}

interface MarketData {
  price: number;
  volatility: number;
  trend: 'bullish' | 'bearish' | 'neutral';
  volume: number;
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

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Supabase configuration missing");
    }

    if (!openaiApiKey) {
      throw new Error("OpenAI API key not configured. Please add OPENAI_API_KEY to your edge function secrets.");
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));

    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    const { symbol, timeframe = 'M15' } = await req.json() as AnalyzeMarketRequest;

    const marketData = generateMarketData(symbol);

    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are an expert forex and synthetic indices trading analyst. Analyze market data and provide trading signals with precise entry, stop loss, and take profit levels.

For synthetic indices (like Volatility and Step indices), use these characteristics:
- Volatility indices have continuous price movements with no real-world market influence
- Higher volatility numbers (75, 100) need wider stop losses
- Step indices move in predictable increments
- 1-second tick indices require tighter risk management

Provide your analysis in a structured JSON format with:
- direction: "BUY" or "SELL"
- confidence: number between 60-95
- entry_price: current market price
- stop_loss: price level for stop loss
- take_profit: price level for take profit
- risk_reward_ratio: calculated ratio
- market_context: brief market overview (2-3 sentences)
- reasoning: detailed explanation of the signal (3-4 sentences)
- signal_type: "breakout", "reversal", "trend_continuation", or "support_resistance"
- timeframe: "${timeframe}"`
          },
          {
            role: "user",
            content: `Analyze ${symbol} and provide a trading signal.

Current Market Data:
- Symbol: ${symbol}
- Current Price: ${marketData.price}
- Volatility: ${marketData.volatility}%
- Market Trend: ${marketData.trend}
- Volume: ${marketData.volume}
- Timeframe: ${timeframe}

Provide a complete trading signal with entry, stop loss, and take profit levels.`
          }
        ],
        temperature: 0.7,
        response_format: { type: "json_object" }
      }),
    });

    if (!openaiResponse.ok) {
      const errorData = await openaiResponse.text();
      throw new Error(`OpenAI API error: ${errorData}`);
    }

    const aiData = await openaiResponse.json();
    const analysis = JSON.parse(aiData.choices[0].message.content);

    const direction = analysis.direction || (Math.random() > 0.5 ? 'BUY' : 'SELL');
    const entryPrice = analysis.entry_price || marketData.price;
    const confidence = Math.min(95, Math.max(60, analysis.confidence || 75));

    const { slDistance, tpDistance } = getSlTpDistanceInPrice(symbol);
    const stopLoss = direction === 'BUY'
      ? entryPrice - slDistance
      : entryPrice + slDistance;

    const takeProfit = direction === 'BUY'
      ? entryPrice + tpDistance
      : entryPrice - tpDistance;

    const tp1 = takeProfit;
    const stopLossPips = 30;
    const takeProfitPips = 60;

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + getSignalExpiry(timeframe));

    const orderType = analysis.order_type || 'Market Execution';

    const signal = {
      symbol,
      mt5_symbol: getMT5Symbol(symbol),
      direction,
      order_type: orderType,
      entry_price: entryPrice,
      stop_loss: stopLoss,
      take_profit: takeProfit,
      tp1,
      tp2: null as number | null,
      tp3: null as number | null,
      pip_stop_loss: stopLossPips,
      pip_take_profit: takeProfitPips,
      risk_reward_ratio: analysis.risk_reward_ratio || Math.round((takeProfitPips / stopLossPips) * 10) / 10,
      timeframe,
      confidence,
      confidence_percentage: confidence,
      signal_type: analysis.signal_type || 'trend_continuation',
      market_context: analysis.market_context || `${symbol} is showing ${marketData.trend} momentum with ${marketData.volatility}% volatility.`,
      reasoning: analysis.reasoning || `AI analysis suggests a ${direction} opportunity based on current market conditions and technical indicators.`,
      technical_indicators: {
        volatility: marketData.volatility,
        trend: marketData.trend,
        volume: marketData.volume,
        ai_analysis: analysis
      },
      outcome: 'pending',
      expires_at: expiresAt.toISOString(),
      is_active: true,
    };

    const { data: insertedSignal, error: insertError } = await supabase
      .from('signals')
      .insert(signal)
      .select()
      .single();

    if (insertError) {
      throw new Error(`Failed to save signal: ${insertError.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        signal: insertedSignal,
        message: `Generated ${direction} signal for ${symbol} with ${confidence}% confidence`
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error: any) {
    console.error("Market analysis error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Failed to analyze market",
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

function generateMarketData(symbol: string): MarketData {
  const basePrice = getBasePrice(symbol);
  const volatilityLevel = getVolatilityLevel(symbol);

  const price = basePrice + (Math.random() - 0.5) * (basePrice * volatilityLevel * 0.01);
  const volatility = Math.random() * 3 + volatilityLevel;
  const trend = Math.random() > 0.5 ? 'bullish' : (Math.random() > 0.5 ? 'bearish' : 'neutral') as 'bullish' | 'bearish' | 'neutral';
  const volume = Math.floor(Math.random() * 1000000) + 500000;

  return { price, volatility, trend, volume };
}

function getBasePrice(symbol: string): number {
  const prices: Record<string, number> = {
    'R_10': 3500,
    'R_50': 1900,
    'R_100': 4500,
    '1HZ10V': 3500,
    '1HZ30V': 2600,
    '1HZ50V': 1900,
    '1HZ90V': 5000,
    '1HZ100V': 4500,
    '1HZ200V': 7500,
    '1HZ300V': 11000,
    'STPIDX': 25000,
    'stpRNG': 25000,
    'JD25': 2800,
  };
  return prices[symbol] || 1000;
}

function getVolatilityLevel(symbol: string): number {
  if (symbol.includes('300')) return 300;
  if (symbol.includes('200')) return 200;
  if (symbol.includes('100')) return 100;
  if (symbol.includes('90')) return 90;
  if (symbol.includes('75')) return 75;
  if (symbol.includes('50')) return 50;
  if (symbol.includes('30')) return 30;
  if (symbol.includes('25')) return 25;
  if (symbol.includes('10')) return 10;
  if (symbol === 'STPIDX' || symbol === 'stpRNG') return 5;
  if (symbol.startsWith('JD')) return 25;
  return 15;
}

function getStopLossPips(symbol: string, volatility: number): number {
  const baseStopLoss = volatility * 2;

  if (symbol.includes('1HZ')) {
    return Math.max(50, Math.floor(baseStopLoss * 1.5));
  }

  if (symbol.includes('R_10')) return Math.max(50, Math.floor(baseStopLoss * 2));
  if (symbol.includes('R_25')) return Math.max(60, Math.floor(baseStopLoss * 2.5));
  if (symbol.includes('R_50')) return Math.max(80, Math.floor(baseStopLoss * 3));
  if (symbol.includes('R_75')) return Math.max(100, Math.floor(baseStopLoss * 3.5));
  if (symbol.includes('R_100') || symbol.includes('200') || symbol.includes('300')) {
    return Math.max(120, Math.floor(baseStopLoss * 4));
  }
  if (symbol === 'STPIDX' || symbol === 'stpRNG') return Math.max(50, Math.floor(baseStopLoss * 2));
  if (symbol.startsWith('JD')) return Math.max(60, Math.floor(baseStopLoss * 2.5));

  return Math.max(50, Math.floor(baseStopLoss));
}

function getMT5Symbol(symbol: string): string {
  const mapping: Record<string, string> = {
    'R_10': 'Volatility 10 Index',
    'R_50': 'Volatility 50 Index',
    'R_100': 'Volatility 100 Index',
    '1HZ10V': 'Volatility 10 (1s) Index',
    '1HZ30V': 'Volatility 30 (1s) Index',
    '1HZ50V': 'Volatility 50 (1s) Index',
    '1HZ90V': 'Volatility 90 (1s) Index',
    '1HZ100V': 'Volatility 100 (1s) Index',
    '1HZ200V': 'Volatility 200 (1s) Index',
    '1HZ300V': 'Volatility 300 (1s) Index',
    'STPIDX': 'Step Index',
    'stpRNG': 'Step Index',
    'JD25': 'Jump 25 Index',
  };
  return mapping[symbol] || symbol;
}

function getSignalExpiry(timeframe: string): number {
  const expiry: Record<string, number> = {
    'M1': 1,
    'M5': 2,
    'M15': 4,
    'M30': 6,
    'H1': 8,
    'H4': 12,
    'D1': 24,
  };
  return expiry[timeframe] || 4;
}
