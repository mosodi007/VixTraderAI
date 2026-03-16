import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

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
    // Auth disabled for now; re-enable later by checking EA_API_TOKEN vs Bearer token
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseServiceKey) throw new Error("Supabase configuration missing");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const mt5_login = String(body.mt5_login || "").trim();
    const signal_id = String(body.signal_id || "").trim();
    const status = String(body.status || "").trim().toLowerCase(); // opened|closed|modified|error

    if (!mt5_login || !signal_id || !status) {
      return new Response(
        JSON.stringify({ success: false, error: "mt5_login, signal_id, and status are required" }),
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

