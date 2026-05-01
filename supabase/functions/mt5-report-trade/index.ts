import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { resolveMt5Account } from "../_shared/resolve-mt5-account.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function getBearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!auth) return null;
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

type EaMode = "demo" | "live";
function toEaMode(v: unknown): EaMode {
  const s = String(v || "").toLowerCase().trim();
  return s === "live" ? "live" : "demo";
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
        return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseServiceKey) throw new Error("Supabase configuration missing");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // MT5 WebRequest can omit Content-Type or send urlencoded bodies; also sometimes includes null bytes.
    // Be tolerant like mt5-get-instructions.
    const raw = await req.text().catch(() => "");
    const cleaned = raw.replace(/\u0000/g, "").trim();
    let body: Record<string, unknown> = {};
    if (cleaned) {
      try {
        const parsed = JSON.parse(cleaned);
        if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>;
      } catch {
        const out: Record<string, unknown> = {};
        for (const part of cleaned.split("&")) {
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
    const mt5_login = String(body.mt5_login || "").trim();
    const signal_id = String(body.signal_id || "").trim();
    const status = String(body.status || "").trim().toLowerCase(); // opened|closed|modified|error
    const ea_mode = toEaMode((body as any).ea_mode);

    if (!mt5_login || !signal_id || !status) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "mt5_login, signal_id, and status are required",
          debug: {
            content_type: req.headers.get("content-type") || null,
            received_keys: Object.keys(body || {}),
          },
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const acct = await resolveMt5Account(supabase, mt5_login);

    if (!acct?.user_id) {
      // Demo mode: allow unregistered demo accounts; ignore reports.
      if (ea_mode === "demo") {
        return new Response(JSON.stringify({ success: true, demo_unregistered: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({ success: false, error: "MT5 account not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const t = String((acct as any).account_type || "").toLowerCase();
    const typeOk = ea_mode === "demo" ? t === "demo" : t === "real" || t === "live";
    const isApproved =
      typeOk &&
      ((acct as any).verified === true ||
        ["verified", "approved"].includes(String((acct as any).verification_status || "").toLowerCase()));
    // Demo mode: don't require approval, only that type matches if row exists.
    if (ea_mode === "live" && !isApproved) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const symbol = String(body.symbol || "").trim();
    const direction = String(body.direction || "").trim();
    const entry_price = Number(body.entry_price || 0);
    const exit_price = body.exit_price != null ? Number(body.exit_price) : null;
    const stop_loss = body.stop_loss != null ? Number(body.stop_loss) : null;
    const take_profit = body.take_profit != null ? Number(body.take_profit) : null;
    const lot_size = body.lot_size != null ? Number(body.lot_size) : 0.01;
    const profit_loss = body.profit != null ? Number(body.profit) : 0;
    const ticket = body.ticket != null ? String(body.ticket) : null;
    const error_message = body.error_message != null ? String(body.error_message) : null;

    const mt5_loginStored = acct.mt5_login ?? mt5_login;

    // Find recent rows for this signal/account; duplicates may exist from old dispatch behavior.
    const { data: existingRows, error: existingErr } = await supabase
      .from("trades")
      .select("id,status,created_at")
      .eq("mt5_login", mt5_loginStored)
      .eq("signal_id", signal_id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (existingErr) throw existingErr;

    const rows = existingRows || [];
    const openLike = rows.find((r: any) => String(r.status || "") !== "closed");
    const existing = openLike || rows[0] || null;

    const nowIso = new Date().toISOString();

    if (!existing?.id) {
      const { error } = await supabase.from("trades").insert({
        user_id: acct.user_id,
        mt5_login: mt5_loginStored,
        signal_id,
        symbol,
        direction,
        entry_price: entry_price || 0,
        exit_price: status === "closed" ? (exit_price ?? entry_price ?? 0) : null,
        stop_loss,
        take_profit,
        lot_size,
        profit_loss: profit_loss || 0,
        status: status === "closed" ? "closed" : "open",
        opened_at: nowIso,
        closed_at: status === "closed" ? nowIso : null,
      });
      if (error) throw error;
    } else {
      const update: Record<string, unknown> = {
        symbol,
        direction,
        stop_loss,
        take_profit,
        lot_size,
      };
      if (status === "closed") {
        update.status = "closed";
        update.exit_price = exit_price ?? entry_price ?? null;
        update.closed_at = nowIso;
        update.profit_loss = profit_loss || 0;
      }
      const { error } = await supabase.from("trades").update(update).eq("id", existing.id);
      if (error) throw error;

      // If this trade is closed, close all duplicate rows for same login/signal to stop future duplication noise.
      if (status === "closed") {
        const { error: closeDupErr } = await supabase
          .from("trades")
          .update({
            status: "closed",
            exit_price: exit_price ?? entry_price ?? null,
            closed_at: nowIso,
            profit_loss: profit_loss || 0,
          })
          .eq("mt5_login", mt5_loginStored)
          .eq("signal_id", signal_id)
          .in("status", ["sent", "open"]);
        if (closeDupErr) {
          console.warn("[mt5-report-trade] close duplicate rows warning:", closeDupErr.message);
        }
      }
    }

    // Global shared-signal lifecycle: close signal when any linked trade closes.
    if (status === "closed") {
      const derivedOutcome = (profit_loss || 0) >= 0 ? "TP1_HIT" : "SL_HIT";
      const closePrice = exit_price ?? entry_price ?? null;
      const { error: signalOutcomeErr } = await supabase.rpc("update_signal_outcome", {
        p_signal_id: signal_id,
        p_outcome: derivedOutcome,
        p_close_price: closePrice,
        p_profit_loss: profit_loss || 0,
      });
      if (signalOutcomeErr) {
        console.warn("[mt5-report-trade] update_signal_outcome warning:", signalOutcomeErr.message);
      }
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, error: error?.message || "Failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

