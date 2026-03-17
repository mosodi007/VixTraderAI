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
  // MT5 WebRequest can omit Content-Type or send urlencoded bodies; also sometimes includes null bytes.
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
      .select("user_id, mt5_login")
      .eq("mt5_login", mt5_login)
      .maybeSingle();

    if (!acct?.user_id) {
      return new Response(JSON.stringify({ success: false, error: "MT5 account not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = {
      balance: toNumber(body.balance, 0),
      equity: toNumber(body.equity, 0),
      margin: toNumber(body.margin, 0),
      free_margin: toNumber(body.free_margin, 0),
      margin_level: toNumber(body.margin_level, 0),
      currency: body.currency != null ? String(body.currency) : undefined,
      leverage: body.leverage != null ? Number(body.leverage) : undefined,
      last_sync: new Date().toISOString(),
    };

    const { error: updateError } = await supabase
      .from("mt5_accounts")
      .update(payload)
      .eq("user_id", acct.user_id)
      .eq("mt5_login", acct.mt5_login);

    if (updateError) throw updateError;

    return new Response(JSON.stringify({ success: true }), {
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

