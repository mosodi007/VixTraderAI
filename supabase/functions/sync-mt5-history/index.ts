import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createDerivAPI } from "../_shared/deriv-api.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SyncHistoryRequest {
  mt5_login: string;
  from_date?: string;
  to_date?: string;
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

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Supabase configuration missing");
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

    const { mt5_login, from_date, to_date } = await req.json() as SyncHistoryRequest;

    if (!mt5_login) {
      throw new Error("MT5 login is required");
    }

    const { data: accountData, error: accountError } = await supabase
      .from("mt5_accounts")
      .select("*")
      .eq("user_id", user.id)
      .eq("mt5_login", mt5_login)
      .maybeSingle();

    if (accountError || !accountData) {
      throw new Error("MT5 account not found");
    }

    if (!accountData.verified) {
      throw new Error("MT5 account not verified");
    }

    const derivAPI = createDerivAPI();

    const fromDate = from_date ? new Date(from_date) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const toDate = to_date ? new Date(to_date) : new Date();

    const deals = await derivAPI.getMT5TradeHistory(mt5_login, fromDate, toDate);

    let syncedCount = 0;

    for (const deal of deals) {
      const { data: existingTrade } = await supabase
        .from("trades")
        .select("id")
        .eq("mt5_login", mt5_login)
        .eq("status", "closed")
        .eq("opened_at", new Date(deal.time * 1000).toISOString())
        .maybeSingle();

      if (existingTrade) {
        continue;
      }

      const tradeData = {
        user_id: user.id,
        mt5_login,
        signal_id: null,
        symbol: deal.symbol,
        direction: deal.type === 0 ? "BUY" : "SELL",
        entry_price: deal.price,
        exit_price: deal.price,
        lot_size: deal.volume,
        profit_loss: deal.profit,
        status: "closed",
        opened_at: new Date(deal.time * 1000).toISOString(),
        closed_at: new Date(deal.time * 1000).toISOString(),
      };

      const { error: insertError } = await supabase
        .from("trades")
        .insert(tradeData);

      if (!insertError) {
        syncedCount++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        synced_count: syncedCount,
        total_deals: deals.length,
        message: `Synced ${syncedCount} new closed trades`,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error: any) {
    console.error("History sync error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "History sync failed",
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
