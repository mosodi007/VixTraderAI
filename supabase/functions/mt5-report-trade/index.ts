import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getPointSize } from "../_shared/symbol-sl-tp.ts";

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

    const { data: acct } = await supabase
      .from("mt5_accounts")
      .select("user_id")
      .eq("mt5_login", mt5_login)
      .maybeSingle();

    if (!acct?.user_id) {
      return new Response(
        JSON.stringify({ success: false, error: "MT5 account not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
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

    // Upsert into trades keyed by (mt5_login, signal_id) via manual lookup
    const { data: existing } = await supabase
      .from("trades")
      .select("id")
      .eq("mt5_login", mt5_login)
      .eq("signal_id", signal_id)
      .maybeSingle();

    const nowIso = new Date().toISOString();

    if (!existing?.id) {
      const { error } = await supabase.from("trades").insert({
        user_id: acct.user_id,
        mt5_login,
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
    }

    // If MT5 closed the trade, immediately close the linked signal in DB.
    // This is more accurate than Deriv tick monitoring (which can lag/mismatch MT5 execution).
    if (status === "closed") {
      const { data: sig } = await supabase
        .from("signals")
        .select("id, symbol, direction, entry_price, stop_loss, tp1, take_profit, is_active, signal_status")
        .eq("id", signal_id)
        .maybeSingle();

      if (sig?.id) {
        const entry = Number(sig.entry_price);
        const slDb = Number(sig.stop_loss);
        const tpDb = Number((sig as any).tp1 ?? sig.take_profit);
        const exit = exit_price ?? entry_price ?? entry;

        const pointSize = getPointSize(String(sig.symbol || symbol));
        const buffer = pointSize; // require pass by at least one point

        let outcome = "closed";
        if (sig.direction === "BUY") {
          if (Number.isFinite(tpDb) && tpDb > entry && exit >= tpDb + buffer) outcome = "TP1_HIT";
          else if (Number.isFinite(slDb) && slDb < entry && exit <= slDb) outcome = "SL_HIT";
          else outcome = profit_loss >= 0 ? "TP1_HIT" : "SL_HIT";
        } else {
          if (Number.isFinite(tpDb) && tpDb < entry && exit <= tpDb - buffer) outcome = "TP1_HIT";
          else if (Number.isFinite(slDb) && slDb > entry && exit >= slDb) outcome = "SL_HIT";
          else outcome = profit_loss >= 0 ? "TP1_HIT" : "SL_HIT";
        }

        // Close signal using existing DB function (updates is_active/signal_status/outcome + registry)
        await supabase.rpc("update_signal_outcome", {
          p_signal_id: sig.id,
          p_outcome: outcome,
          p_close_price: exit,
          p_profit_loss: profit_loss,
        });
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

