import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createDerivAPI } from "../_shared/deriv-api.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SyncAccountRequest {
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

    const { mt5_login } = await req.json() as SyncAccountRequest;

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

    const accountInfo = await derivAPI.getMT5AccountInfo(mt5_login);

    if (!accountInfo) {
      throw new Error("Failed to retrieve account information from Deriv");
    }

    const { error: updateError } = await supabase
      .from("mt5_accounts")
      .update({
        balance: accountInfo.balance,
        equity: accountInfo.equity,
        margin: accountInfo.margin,
        free_margin: accountInfo.free_margin,
        margin_level: accountInfo.margin_level,
        currency: accountInfo.currency,
        leverage: accountInfo.leverage,
        last_sync: new Date().toISOString(),
      })
      .eq("user_id", user.id)
      .eq("mt5_login", mt5_login);

    if (updateError) {
      throw new Error(`Database update failed: ${updateError.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          mt5_login: accountInfo.login,
          server: accountInfo.server,
          balance: accountInfo.balance,
          equity: accountInfo.equity,
          margin: accountInfo.margin,
          free_margin: accountInfo.free_margin,
          margin_level: accountInfo.margin_level,
          currency: accountInfo.currency,
          leverage: accountInfo.leverage,
          last_sync: new Date().toISOString(),
        },
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error: any) {
    console.error("Sync error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Sync failed",
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
