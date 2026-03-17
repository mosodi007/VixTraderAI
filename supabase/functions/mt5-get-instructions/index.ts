import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Map Deriv symbol to MT5 Market Watch name (must match what EA sees in MT5)
const DERIV_TO_MT5_SYMBOL: Record<string, string> = {
  "R_10": "Volatility 10 Index",
  "R_50": "Volatility 50 Index",
  "R_100": "Volatility 100 Index",
  "1HZ10V": "Volatility 10 (1s) Index",
  "1HZ30V": "Volatility 30 (1s) Index",
  "1HZ50V": "Volatility 50 (1s) Index",
  "1HZ75V": "Volatility 75 (1s) Index",
  "1HZ90V": "Volatility 90 (1s) Index",
  "1HZ100V": "Volatility 100 (1s) Index",
  "stpRNG": "Step Index",
  "JD25": "Jump 25 Index",
};

function getBearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!auth) return null;
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // Optional auth: if EA_API_TOKEN is set, require matching Bearer token
    const expected = Deno.env.get("EA_API_TOKEN") || "";
    if (expected) {
      const token = getBearerToken(req) || "";
      if (token !== expected) {
        return new Response(
          JSON.stringify({ success: false, error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseServiceKey) throw new Error("Supabase configuration missing");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Support both POST and GET. MT5 WebRequest can omit Content-Type or send
    // urlencoded bodies; also sometimes includes null bytes. Be tolerant.
    let body: Record<string, unknown> = {};
    if (req.method === "GET") {
      const url = new URL(req.url);
      body = {
        mt5_login: url.searchParams.get("mt5_login") ?? "",
        max: url.searchParams.get("max") ?? 5,
        version: url.searchParams.get("version") ?? null,
      };
    } else {
      const raw = await req.text().catch(() => "");
      const cleaned = raw.replace(/\u0000/g, "").trim();
      if (cleaned) {
        // 1) JSON body: {"mt5_login":"123","max":5}
        try {
          const parsed = JSON.parse(cleaned);
          if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>;
        } catch {
          // 2) URL encoded body: mt5_login=123&max=5
          const out: Record<string, unknown> = {};
          const parts = cleaned.split("&");
          for (const part of parts) {
            const eq = part.indexOf("=");
            if (eq <= 0) continue;
            const k = decodeURIComponent(part.slice(0, eq)).trim();
            const v = decodeURIComponent(part.slice(eq + 1)).trim();
            if (!k) continue;
            out[k] = v;
          }
          body = out;
        }
      }
    }

    const mt5_loginRaw = body.mt5_login;
    const mt5_login = String(mt5_loginRaw != null ? mt5_loginRaw : "").trim();
    const max = Math.max(1, Math.min(20, Number(body.max) || 5));

    if (!mt5_login) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "mt5_login is required (body or ?mt5_login=)",
          debug: {
            method: req.method,
            content_type: req.headers.get("content-type") || null,
            // Helpful for MT5 debugging; body only contains mt5_login/max so safe to include.
            received_keys: Object.keys(body || {}),
          },
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Find the account owner (user_id); try exact mt5_login and normalized (no leading zeros)
    const loginNorm = mt5_login.replace(/^0+/, "") || mt5_login;
    const { data: acctExact } = await supabase
      .from("mt5_accounts")
      .select("user_id, verified, mt5_login")
      .eq("mt5_login", mt5_login)
      .maybeSingle();
    const acct = acctExact ?? (
      loginNorm !== mt5_login
        ? (await supabase
          .from("mt5_accounts")
          .select("user_id, verified, mt5_login")
          .eq("mt5_login", loginNorm)
          .maybeSingle()).data
        : null
    );

    if (!acct || !acct.user_id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "MT5 account not found. Add and verify this MT5 account in the app first.",
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const mt5_loginStored = (acct as { mt5_login?: string }).mt5_login ?? mt5_login;

    // Register/refresh EA connection for dashboard (heartbeat)
    const now = new Date().toISOString();
    const version = typeof body.version === "string" ? body.version : null;
    const { error: upsertErr } = await supabase
      .from("ea_connections")
      .upsert(
        {
          user_id: acct.user_id,
          mt5_login: mt5_loginStored,
          status: "online",
          last_ping: now,
          updated_at: now,
          version: version || null,
        },
        { onConflict: "user_id,mt5_login" },
      );

    if (upsertErr) {
      console.error("[mt5-get-instructions] ea_connections upsert failed:", upsertErr.message);
    }

    // Pull newest active signals; include mt5_symbol so EA gets the symbol name used in MT5 Market Watch
    const { data: signals, error: sigErr } = await supabase
      .from("signals")
      .select("id, symbol, mt5_symbol, direction, entry_price, stop_loss, take_profit, tp1, risk_reward_ratio, created_at, is_active, signal_status")
      .eq("is_active", true)
      .eq("signal_status", "ACTIVE")
      .order("created_at", { ascending: false })
      .limit(50);

    if (sigErr) throw sigErr;
    const sigList = signals || [];

    // Get already-executed signal_ids for this account (use request mt5_login so it matches what EA sends when reporting)
    const { data: executedTrades, error: trErr } = await supabase
      .from("trades")
      .select("signal_id")
      .eq("mt5_login", mt5_login)
      .not("signal_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(500);

    if (trErr) throw trErr;
    const executed = new Set((executedTrades || []).map((t: any) => String(t.signal_id)));

    const instructions: any[] = [];
    for (const s of sigList) {
      const id = String(s.id);
      if (executed.has(id)) continue;
      if (!s.symbol || !s.direction) continue;
      const tp = s.tp1 ?? s.take_profit;
      const sl = Number(s.stop_loss);
      const tpVal = Number(tp);
      if (!Number.isFinite(sl) || !Number.isFinite(tpVal) || sl <= 0 || tpVal <= 0) continue;
      // EA needs the symbol as shown in MT5 Market Watch (e.g. "Volatility 30 (1s) Index"), not Deriv code "1HZ30V"
      const rawSymbol = String(s.symbol || "").trim();
      const symbolForEA =
        (s.mt5_symbol && String(s.mt5_symbol).trim()) ||
        DERIV_TO_MT5_SYMBOL[rawSymbol] ||
        rawSymbol;

      // Dispatch lock: record that this signal was sent to this mt5_login.
      // This prevents duplicate instructions if the EA polls again before it reports trade open,
      // or if multiple EA instances are polling the same mt5_login.
      const nowIso = new Date().toISOString();
      const { error: dispatchErr } = await supabase
        .from("trades")
        .insert({
          user_id: acct.user_id,
          mt5_login,
          signal_id: id,
          symbol: symbolForEA,
          direction: String(s.direction),
          entry_price: Number(s.entry_price) || 0,
          stop_loss: sl,
          take_profit: tpVal,
          lot_size: 0.01,
          profit_loss: 0,
          status: "sent",
          opened_at: nowIso,
          closed_at: null,
        });
      if (dispatchErr) {
        // If already inserted concurrently, ignore; otherwise log.
        const msg = String((dispatchErr as any)?.message || dispatchErr);
        if (msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("unique")) {
          executed.add(id);
          continue;
        }
        console.warn("[mt5-get-instructions] dispatch insert failed:", msg);
      } else {
        executed.add(id);
      }

      instructions.push({
        signal_id: id,
        symbol: symbolForEA,
        direction: s.direction,
        entry_type: "market",
        entry_price: Number(s.entry_price) || 0,
        stop_loss: sl,
        take_profit: tpVal,
        magic: 123456,
        comment: `VIX_AI:${id}`,
      });
      if (instructions.length >= max) break;
    }

    console.log(`[mt5-get-instructions] mt5_login=${mt5_loginStored} active_signals=${sigList.length} already_executed=${executed.size} instructions=${instructions.length}`);

    return new Response(
      JSON.stringify({
        success: true,
        instructions,
        debug: {
          active_signals_count: sigList.length,
          already_executed_count: executed.size,
          instructions_count: instructions.length,
        },
        connection_registered: !upsertErr,
        ...(upsertErr && { connection_error: upsertErr.message }),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, error: error?.message || "Failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

