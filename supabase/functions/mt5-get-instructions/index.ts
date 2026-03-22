// @ts-nocheck
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
  "R_25": "Volatility 25 Index",
  "R_50": "Volatility 50 Index",
  "R_75": "Volatility 75 Index",
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

type LotMode = "fixed" | "percent_balance";
type SymbolSettings = {
  trade_enabled: boolean;
  lot_mode: LotMode;
  fixed_lot: number;
  percent: number;
  sl_points?: number | null;
  tp_points?: number | null;
};

const SYMBOL_POINT_SIZE: Record<string, number> = {
  R_10: 0.4,
  R_25: 0.4,
  R_50: 0.4,
  R_75: 0.4,
  R_100: 0.4,
  stpRNG: 0.01,
  "1HZ10V": 0.01,
  "1HZ30V": 0.01,
  "1HZ50V": 0.01,
  "1HZ75V": 0.01,
  "1HZ90V": 0.01,
  "1HZ100V": 0.01,
  JD25: 0.01,
  STPIDX: 0.01,
};

function getPointSize(symbol: string): number {
  return SYMBOL_POINT_SIZE[String(symbol || "").trim()] ?? 0.01;
}

// Default minimum lots (Deriv MT5) for convenience; EA also clamps to broker min/max/step at execution time.
const SYMBOL_MIN_LOT: Record<string, number> = {
  "R_25": 0.5,
  "R_50": 4,
  "R_75": 0.001,
  "R_100": 1,
  "1HZ10V": 0.5,
  "1HZ30V": 0.2,
  "1HZ75V": 0.05,
  "1HZ100V": 1,
};

const SYMBOL_MAX_LOT: Record<string, number> = {
  "R_25": 400,
  "R_50": 3700,
  "R_75": 50,
  "R_100": 220,
  "1HZ10V": 400,
  "1HZ30V": 120,
  "1HZ75V": 80,
  "1HZ100V": 330,
};

function getBearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!auth) return null;
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toMillis(v: string | null | undefined): number {
  if (!v) return 0;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : 0;
}

type EaMode = "demo" | "live";

function toEaMode(v: unknown): EaMode {
  const s = String(v || "").toLowerCase().trim();
  return s === "live" ? "live" : "demo";
}

function isApprovedAccountForMode(
  a: { account_type?: string; verified?: boolean; verification_status?: string } | null,
  mode: EaMode,
): boolean {
  if (!a) return false;
  const type = String((a as any).account_type || "").toLowerCase();
  const isTypeOk = mode === "demo" ? type === "demo" : type === "real" || type === "live";
  if (!isTypeOk) return false;
  if ((a as any).verified === true) return true;
  const s = String((a as any).verification_status || "").toLowerCase();
  return s === "verified" || s === "approved";
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
    const ea_mode = toEaMode((body as any).ea_mode);

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

    // Find the account owner (user_id) if registered; try exact mt5_login and normalized (no leading zeros)
    const loginNorm = mt5_login.replace(/^0+/, "") || mt5_login;
    const { data: acctExact } = await supabase
      .from("mt5_accounts")
      .select("user_id, verified, verification_status, account_type, mt5_login")
      .eq("mt5_login", mt5_login)
      .maybeSingle();
    const acct = acctExact ?? (
      loginNorm !== mt5_login
        ? (await supabase
          .from("mt5_accounts")
          .select("user_id, verified, verification_status, account_type, mt5_login")
          .eq("mt5_login", loginNorm)
          .maybeSingle()).data
        : null
    );

    if (!acct || !acct.user_id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Unauthorized Account: Go to https://vixai.trade to add this account",
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Demo mode no longer requires approval/verification.
    // Live mode can still enforce approval via isApprovedAccountForMode if desired.
    if (ea_mode === "live" && !isApprovedAccountForMode(acct as any, ea_mode)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Unauthorized: MT5 login must be an approved ${ea_mode} account in this platform.`,
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
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
      .select("id, symbol, mt5_symbol, direction, entry_price, stop_loss, take_profit, tp1, risk_reward_ratio, confidence, confidence_percentage, created_at, is_active, signal_status, signal_type, technical_indicators")
      .eq("is_active", true)
      .eq("signal_status", "ACTIVE")
      .order("created_at", { ascending: false })
      .limit(50);

    if (sigErr) throw sigErr;
    const sigList = signals || [];

    // Per-user minimum confidence threshold (defaults to 50%)
    const { data: profileRow, error: profErr } = await supabase
      .from("profiles")
      .select("ai_min_confidence_percent")
      .eq("id", acct.user_id)
      .maybeSingle();
    if (profErr) {
      console.warn("[mt5-get-instructions] profiles load failed:", profErr.message);
    }
    const rawMin = (profileRow as any)?.ai_min_confidence_percent;
    // Clamp to [20, 100] so the EA never uses a threshold below 20.
    const parsed = rawMin == null ? 20 : Number(rawMin);
    const minConfidencePercent = Math.max(20, Math.min(100, Number.isFinite(parsed) ? parsed : 20));

    // Load per-symbol settings for this mt5_login. Keyed by Deriv symbol code (e.g., "R_50").
    const { data: symbolRows, error: symErr } = await supabase
      .from("mt5_symbol_settings")
      .select("symbol, trade_enabled, lot_mode, fixed_lot, percent, sl_points, tp_points")
      .eq("user_id", acct.user_id)
      .eq("mt5_login", mt5_loginStored);
    if (symErr) {
      console.warn("[mt5-get-instructions] mt5_symbol_settings load failed:", symErr.message);
    }
    const symbolSettings = new Map<string, SymbolSettings>();
    for (const r of symbolRows || []) {
      const symbol = String((r as any).symbol || "").trim();
      if (!symbol) continue;
      symbolSettings.set(symbol, {
        trade_enabled: (r as any).trade_enabled !== false,
        lot_mode: ((r as any).lot_mode === "percent_balance" ? "percent_balance" : "fixed") as LotMode,
        fixed_lot: Math.max(0, Number((r as any).fixed_lot) || 0.01),
        percent: Math.max(0, Math.min(100, Number((r as any).percent) || 0)),
        sl_points: (r as any).sl_points,
        tp_points: (r as any).tp_points,
      });
    }

    // Get already-executed signal_ids for this account.
    // We only treat signals as executed once the trade is actually "open" or "closed".
    const { data: executedTrades, error: trErr } = await supabase
      .from("trades")
      .select("signal_id,status")
      .eq("mt5_login", mt5_loginStored)
      .not("signal_id", "is", null)
      .in("status", ["open", "closed"])
      .order("created_at", { ascending: false })
      .limit(500);

    if (trErr) throw trErr;
    const executed = new Set((executedTrades || []).map((t: any) => String(t.signal_id)));

    // One in-flight trade per Deriv symbol per MT5 account: sent/open on a symbol blocks other
    // signals for that symbol only; other symbols can still receive instructions.
    const { data: inFlightTrades, error: ifErr } = await supabase
      .from("trades")
      .select("signal_id")
      .eq("mt5_login", mt5_loginStored)
      .in("status", ["sent", "open"])
      .not("signal_id", "is", null);

    if (ifErr) throw ifErr;
    const inFlightIds = [...new Set((inFlightTrades || []).map((t: any) => String(t.signal_id)))];
    const inFlightBySymbol = new Map<string, string>();
    if (inFlightIds.length > 0) {
      const { data: symRows, error: symErr } = await supabase
        .from("signals")
        .select("id, symbol")
        .in("id", inFlightIds);
      if (symErr) throw symErr;
      for (const row of symRows || []) {
        const sym = String((row as any).symbol || "").trim();
        const sid = String((row as any).id);
        if (sym) inFlightBySymbol.set(sym, sid);
      }
    }
    const dispatchRetrySeconds = Math.max(15, Number(Deno.env.get("DISPATCH_RETRY_SECONDS") || 120));

    const instructions: any[] = [];
    const skippedByReason: Record<string, number> = {};
    const skippedSignals: Array<{ signal_id: string; symbol: string; reason: string }> = [];
    const recordSkip = (reason: string, signalId: string, symbol: string) => {
      skippedByReason[reason] = (skippedByReason[reason] || 0) + 1;
      if (skippedSignals.length < 20) {
        skippedSignals.push({ signal_id: signalId, symbol, reason });
      }
    };
    /** Avoid emitting two instructions for the same symbol in one response */
    const symbolsDispatchedThisPoll = new Set<string>();
    for (const s of sigList) {
      const id = String(s.id);
      const symbolCode = String(s.symbol || "").trim();
      if (executed.has(id)) {
        recordSkip("already_executed", id, symbolCode);
        continue;
      }
      const lockedForSymbol = inFlightBySymbol.get(symbolCode);
      if (lockedForSymbol !== undefined && id !== lockedForSymbol) {
        recordSkip("one_active_trade_per_symbol", id, symbolCode);
        continue;
      }
      if (symbolsDispatchedThisPoll.has(symbolCode)) {
        recordSkip("symbol_already_dispatched_this_poll", id, symbolCode);
        continue;
      }
      if (!s.symbol || !s.direction) {
        recordSkip("missing_symbol_or_direction", id, symbolCode);
        continue;
      }

      const confidencePercent = Number((s as any).confidence_percentage ?? (s as any).confidence ?? 0) || 0;
      if (confidencePercent < minConfidencePercent) {
        recordSkip("below_min_confidence", id, symbolCode);
        continue;
      }

      const settings = symbolSettings.get(symbolCode);
      if (settings && settings.trade_enabled === false) {
        recordSkip("trade_disabled_for_symbol", id, symbolCode);
        continue;
      }

      const tp = s.tp1 ?? s.take_profit;
      let sl = Number(s.stop_loss);
      let tpVal = Number(tp);

      const entryPrice = Number(s.entry_price) || 0;
      const userSlPts = settings?.sl_points;
      const userTpPts = settings?.tp_points;
      if (userSlPts != null && Number(userSlPts) > 0 && entryPrice > 0) {
        const slPoints = Math.max(1, Number(userSlPts));
        const tpPoints =
          userTpPts != null && Number(userTpPts) > 0 ? Math.max(1, Number(userTpPts)) : slPoints * 3;
        const pointSize = getPointSize(symbolCode);
        const slDist = slPoints * pointSize;
        const tpDist = tpPoints * pointSize;
        const dirUp = String(s.direction).toUpperCase();
        if (dirUp === "BUY") {
          sl = entryPrice - slDist;
          tpVal = entryPrice + tpDist;
        } else {
          sl = entryPrice + slDist;
          tpVal = entryPrice - tpDist;
        }
      }

      if (!Number.isFinite(sl) || !Number.isFinite(tpVal) || sl <= 0 || tpVal <= 0) {
        recordSkip("invalid_sl_or_tp", id, symbolCode);
        continue;
      }
      // EA needs the symbol as shown in MT5 Market Watch (e.g. "Volatility 30 (1s) Index"), not Deriv code "1HZ30V"
      const rawSymbol = symbolCode;
      const symbolForEA =
        (s.mt5_symbol && String(s.mt5_symbol).trim()) ||
        DERIV_TO_MT5_SYMBOL[rawSymbol] ||
        rawSymbol;

      const lot_mode: LotMode = settings?.lot_mode || "fixed";
      const minLot = SYMBOL_MIN_LOT[rawSymbol] ?? 0;
      const maxLot = SYMBOL_MAX_LOT[rawSymbol] ?? Number.POSITIVE_INFINITY;
      const fixedCandidate = settings?.fixed_lot ?? SYMBOL_MIN_LOT[rawSymbol] ?? 0.01;
      const fixed_lot = round2(Math.min(maxLot, Math.max(minLot, fixedCandidate)));
      const percent = round2(settings?.percent ?? 0);
      const lotSizeForDispatch = lot_mode === "fixed" ? fixed_lot : 0;

      // Dispatch lock: avoid duplicate "sent" rows on repeated EA polls.
      // Retry a "sent" dispatch only after DISPATCH_RETRY_SECONDS.
      const nowIso = new Date().toISOString();
      const { data: recentRows, error: recentErr } = await supabase
        .from("trades")
        .select("id,status,created_at,opened_at")
        .eq("mt5_login", mt5_loginStored)
        .eq("signal_id", id)
        .order("created_at", { ascending: false })
        .limit(10);
      if (recentErr) {
        console.warn("[mt5-get-instructions] dispatch precheck failed:", recentErr.message);
      }

      const rows = recentRows || [];
      const hasExecutedRow = rows.some((r: any) => ["open", "closed"].includes(String(r.status || "")));
      if (hasExecutedRow) {
        executed.add(id);
        recordSkip("already_executed_trade_row", id, symbolCode);
        continue;
      }

      const sentRow = rows.find((r: any) => String(r.status || "") === "sent");
      if (sentRow) {
        const sentAtMs = Math.max(toMillis((sentRow as any).opened_at), toMillis((sentRow as any).created_at));
        const ageSec = sentAtMs > 0 ? (Date.now() - sentAtMs) / 1000 : Number.POSITIVE_INFINITY;
        if (ageSec < dispatchRetrySeconds) {
          // Still inside retry lock window; don't send duplicate instruction.
          recordSkip("dispatch_retry_lock", id, symbolCode);
          continue;
        }
      }

      let dispatchErr: any = null;
      if (sentRow?.id) {
        // Reuse stale sent row instead of creating a new duplicate.
        const { error } = await supabase
          .from("trades")
          .update({
            symbol: symbolForEA,
            direction: String(s.direction),
            entry_price: Number(s.entry_price) || 0,
            stop_loss: sl,
            take_profit: tpVal,
            lot_size: lotSizeForDispatch,
            profit_loss: 0,
            status: "sent",
            opened_at: nowIso,
            closed_at: null,
          })
          .eq("id", sentRow.id);
        dispatchErr = error;
      } else {
        const { error } = await supabase
          .from("trades")
          .insert({
            user_id: acct.user_id,
            mt5_login: mt5_loginStored,
            signal_id: id,
            symbol: symbolForEA,
            direction: String(s.direction),
            entry_price: Number(s.entry_price) || 0,
            stop_loss: sl,
            take_profit: tpVal,
            lot_size: lotSizeForDispatch,
            profit_loss: 0,
            status: "sent",
            opened_at: nowIso,
            closed_at: null,
          });
        dispatchErr = error;
      }
      if (dispatchErr) {
        const msg = String((dispatchErr as any)?.message || dispatchErr);
        console.warn("[mt5-get-instructions] dispatch write failed:", msg);
        recordSkip("dispatch_write_failed", id, symbolCode);
        continue;
      }

      instructions.push({
        signal_id: id,
        symbol: symbolForEA,
        symbol_code: rawSymbol,
        direction: s.direction,
        confidence_percent: confidencePercent,
        signal_type: (s as any).signal_type || "STANDARD",
        amd_context: (s as any)?.technical_indicators?.amd || null,
        entry_type: "market",
        entry_price: Number(s.entry_price) || 0,
        stop_loss: sl,
        take_profit: tpVal,
        lot_mode,
        fixed_lot,
        percent,
        percent_formula: "lots_per_1000",
        magic: 123456,
        comment: `VIX_AI:${id}`,
      });
      symbolsDispatchedThisPoll.add(symbolCode);
      if (instructions.length >= max) break;
    }

    console.log(`[mt5-get-instructions] mt5_login=${mt5_loginStored} active_signals=${sigList.length} already_executed=${executed.size} instructions=${instructions.length}`);

    return new Response(
      JSON.stringify({
        success: true,
        instructions,
        min_confidence_percent: minConfidencePercent,
        debug: {
          active_signals_count: sigList.length,
          already_executed_count: executed.size,
          instructions_count: instructions.length,
          skipped_by_reason: skippedByReason,
          skipped_signals: skippedSignals,
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

