import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseServiceKey) throw new Error("Supabase configuration missing");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Load current global config
    const { data: cfg } = await supabase
      .from("signal_filters_config")
      .select("*")
      .eq("id", "global")
      .maybeSingle();

    const curHighVol = Number(cfg?.high_vol_percentile ?? 0.7);
    const curStrong = Number(cfg?.strong_trend_strength ?? 1.2);

    // Look at recent closed signals
    const { data: recent } = await supabase
      .from("signals")
      .select("outcome, technical_indicators, created_at")
      .not("outcome", "is", null)
      .order("created_at", { ascending: false })
      .limit(200);

    const rows = recent || [];
    let n = 0;
    let sl = 0;
    let counterTrendSL = 0;
    let counterTrendN = 0;

    for (const r of rows) {
      const outcome = String(r.outcome || "").toLowerCase();
      if (!outcome) continue;
      // count only SL/TP outcomes
      const isSL = outcome === "sl_hit";
      const isTP = outcome === "tp1_hit" || outcome === "tp2_hit" || outcome === "tp3_hit";
      if (!isSL && !isTP) continue;
      n++;
      if (isSL) sl++;

      const filters = (r.technical_indicators as any)?.filters;
      const blocked = (filters?.blockedReasons as string[]) || [];
      const wasCounterTrend = Array.isArray(blocked) ? blocked.includes("counter_trend") : false;
      if (wasCounterTrend) {
        counterTrendN++;
        if (isSL) counterTrendSL++;
      }
    }

    if (n < 20) {
      return new Response(
        JSON.stringify({ success: true, message: "Not enough closed signals yet", sample: n }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const slRate = sl / n; // 0..1
    const counterSLRate = counterTrendN > 0 ? counterTrendSL / counterTrendN : 0;

    // Conservative adjustments:
    // - if SL rate high, increase high-vol requirement a bit
    // - if counter-trend SL rate high, require stronger trend (raise strong trend threshold slightly)
    let nextHighVol = curHighVol;
    if (slRate > 0.6) nextHighVol += 0.02;
    else if (slRate < 0.45) nextHighVol -= 0.01;
    nextHighVol = clamp(nextHighVol, 0.55, 0.90);

    let nextStrong = curStrong;
    if (counterTrendN >= 10 && counterSLRate > 0.65) nextStrong += 0.05;
    else if (counterTrendN >= 10 && counterSLRate < 0.45) nextStrong -= 0.03;
    nextStrong = clamp(nextStrong, 0.80, 2.50);

    const nowIso = new Date().toISOString();
    const { error: upErr } = await supabase
      .from("signal_filters_config")
      .update({
        high_vol_percentile: nextHighVol,
        strong_trend_strength: nextStrong,
        updated_at: nowIso,
      })
      .eq("id", "global");

    if (upErr) throw upErr;

    return new Response(
      JSON.stringify({
        success: true,
        updated: {
          high_vol_percentile: { from: curHighVol, to: nextHighVol },
          strong_trend_strength: { from: curStrong, to: nextStrong },
        },
        stats: { sample: n, sl_rate: slRate, counter_trend_sample: counterTrendN, counter_trend_sl_rate: counterSLRate },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    const errMsg = error instanceof Error ? error.message : String(error ?? "Failed");
    return new Response(JSON.stringify({ success: false, error: errMsg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

