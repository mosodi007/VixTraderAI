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

function toNumber(v: unknown, fallback: number | null = null): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function parseBodyUrlEncoded(cleaned: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const part of cleaned.split("&")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const k = decodeURIComponent(part.slice(0, eq)).trim();
    const v = decodeURIComponent(part.slice(eq + 1)).trim();
    if (!k) continue;
    out[k] = v;
  }
  return out;
}

async function parseMt5Body(req: Request): Promise<Record<string, unknown>> {
  const raw = await req.text().catch(() => "");
  const cleaned = raw.replace(/\u0000/g, "").trim();
  if (!cleaned) return {};
  try {
    const parsed = JSON.parse(cleaned);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return parseBodyUrlEncoded(cleaned);
  }
}

type Mt5Position = {
  ticket: string | number;
  symbol: string;
  direction: string; // BUY/SELL
  volume: number;
  price_open: number;
  price_current: number;
  stop_loss?: number | null;
  take_profit?: number | null;
  profit?: number | null;
  opened_at?: string | null; // ISO
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
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

    const body = await parseMt5Body(req);
    const mt5_login = String(body.mt5_login || "").trim();
    if (!mt5_login) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "mt5_login is required",
          debug: { received_keys: Object.keys(body || {}) },
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
      return new Response(JSON.stringify({ success: false, error: "MT5 account not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // positions can arrive as array or as JSON string (if urlencoded)
    let positionsRaw: unknown = (body as any).positions;
    if (typeof positionsRaw === "string") {
      try {
        positionsRaw = JSON.parse(positionsRaw);
      } catch {
        positionsRaw = [];
      }
    }
    const positions = Array.isArray(positionsRaw) ? (positionsRaw as Mt5Position[]) : [];

    const nowIso = new Date().toISOString();
    const ticketList = positions
      .map((p) => String((p as any).ticket ?? "").trim())
      .filter(Boolean);

    // Delete positions that no longer exist for this account
    if (ticketList.length > 0) {
      await supabase
        .from("mt5_positions")
        .delete()
        .eq("user_id", acct.user_id)
        .eq("mt5_login", mt5_login)
        .not("ticket", "in", `(${ticketList.map((t) => `"${t}"`).join(",")})`);
    } else {
      await supabase.from("mt5_positions").delete().eq("user_id", acct.user_id).eq("mt5_login", mt5_login);
    }

    // Upsert current positions
    for (const p of positions) {
      const ticket = String((p as any).ticket ?? "").trim();
      const symbol = String((p as any).symbol ?? "").trim();
      const direction = String((p as any).direction ?? "").trim().toUpperCase();
      if (!ticket || !symbol || (direction !== "BUY" && direction !== "SELL")) continue;

      const openedAt = (p as any).opened_at ? String((p as any).opened_at) : null;

      const row = {
        user_id: acct.user_id,
        mt5_login,
        ticket,
        symbol,
        direction,
        volume: toNumber((p as any).volume, 0) ?? 0,
        price_open: toNumber((p as any).price_open, 0) ?? 0,
        price_current: toNumber((p as any).price_current, 0) ?? 0,
        stop_loss: toNumber((p as any).stop_loss, null),
        take_profit: toNumber((p as any).take_profit, null),
        profit: toNumber((p as any).profit, 0) ?? 0,
        opened_at: openedAt || nowIso,
        last_updated: nowIso,
      };

      const { error } = await supabase.from("mt5_positions").upsert(row, {
        onConflict: "mt5_login,ticket",
      });
      if (error) throw error;
    }

    // Mark account as synced too
    await supabase
      .from("mt5_accounts")
      .update({ last_sync: nowIso })
      .eq("user_id", acct.user_id)
      .eq("mt5_login", mt5_login);

    return new Response(JSON.stringify({ success: true, positions_count: positions.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    const errMsg = error instanceof Error ? error.message : String(error ?? "Failed");
    return new Response(JSON.stringify({ success: false, error: errMsg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

