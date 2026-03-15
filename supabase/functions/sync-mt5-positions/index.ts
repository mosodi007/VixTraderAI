import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createDerivAPI } from "../_shared/deriv-api.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SyncPositionsRequest {
  mt5_login: string;
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

    const { mt5_login } = await req.json() as SyncPositionsRequest;

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

    const positions = await derivAPI.getMT5Positions(mt5_login);

    const positionTickets = positions.map((p) => p.ticket);

    if (positionTickets.length > 0) {
      await supabase
        .from("mt5_positions")
        .delete()
        .eq("user_id", user.id)
        .eq("mt5_login", mt5_login)
        .not("ticket", "in", `(${positionTickets.join(",")})`);
    } else {
      await supabase
        .from("mt5_positions")
        .delete()
        .eq("user_id", user.id)
        .eq("mt5_login", mt5_login);
    }

    for (const position of positions) {
      const positionData = {
        user_id: user.id,
        mt5_login,
        ticket: position.ticket,
        symbol: position.symbol,
        direction: position.type === 0 ? "BUY" : "SELL",
        volume: position.volume,
        price_open: position.price_open,
        price_current: position.price_current,
        stop_loss: position.stop_loss,
        take_profit: position.take_profit,
        profit: position.profit,
        opened_at: new Date(position.time * 1000).toISOString(),
        last_updated: new Date().toISOString(),
      };

      await supabase.from("mt5_positions").upsert(positionData, {
        onConflict: "mt5_login,ticket",
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        positions_count: positions.length,
        data: positions.map((p) => ({
          ticket: p.ticket,
          symbol: p.symbol,
          direction: p.type === 0 ? "BUY" : "SELL",
          volume: p.volume,
          profit: p.profit,
        })),
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error: any) {
    console.error("Position sync error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Position sync failed",
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
