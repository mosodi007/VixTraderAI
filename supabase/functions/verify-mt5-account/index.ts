import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createDerivAPI } from "../_shared/deriv-api.ts";
import { sendMt5VerificationEmail } from "../_shared/resend.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface VerifyAccountRequest {
  mt5_login: string;
  server: string;
  password?: string;
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

    const { mt5_login, server } = await req.json() as VerifyAccountRequest;

    if (!mt5_login || !server) {
      throw new Error("MT5 login and server are required");
    }

    const derivAPI = createDerivAPI();

    console.log(`Starting comprehensive validation for MT5 account ${mt5_login} on ${server}`);

    const validationResult = await derivAPI.validateMT5Account(mt5_login, server);

    if (!validationResult.isValid) {
      const rejectionReason = validationResult.errors?.join('; ') ||
        "Account validation failed";

      const { error: updateError } = await supabase
        .from("mt5_accounts")
        .update({
          verification_status: "rejected",
          rejected_reason: rejectionReason,
          verified: false,
        })
        .eq("user_id", user.id)
        .eq("mt5_login", mt5_login);

      if (updateError) {
        console.error("Error updating account status:", updateError);
      }

      // Email user about rejection, then remove the rejected MT5 login so they can add a new one.
      let rejectionEmail: { id?: string; error?: string } | null = null;
      try {
        const { data: profile } = await supabase.from("profiles").select("email").eq("id", user.id).maybeSingle();
        const to = (profile as any)?.email || user.email || "";
        if (to) {
          rejectionEmail = await sendMt5VerificationEmail({
            to,
            status: "rejected",
            mt5_login: String(mt5_login),
            server: String(server),
            rejected_reason: rejectionReason,
          });
        }
      } catch (e) {
        console.warn("Failed to send rejection email:", String((e as any)?.message || e));
      }

      try {
        const { error: delErr } = await supabase
          .from("mt5_accounts")
          .delete()
          .eq("user_id", user.id)
          .eq("mt5_login", mt5_login);
        if (delErr) console.warn("Failed to delete rejected MT5 row:", delErr.message);
      } catch (e) {
        console.warn("Failed to delete rejected MT5 row:", String((e as any)?.message || e));
      }

      // Best-effort cleanup of per-login settings/connection rows for this MT5 login
      try {
        await supabase.from("mt5_symbol_settings").delete().eq("user_id", user.id).eq("mt5_login", mt5_login);
      } catch {
        // ignore
      }
      try {
        await supabase.from("ea_connections").delete().eq("user_id", user.id).eq("mt5_login", mt5_login);
      } catch {
        // ignore
      }

      return new Response(
        JSON.stringify({
          success: false,
          verified: false,
          message: "Account verification failed",
          errors: validationResult.errors,
          email: rejectionEmail,
          validation_details: {
            server_valid: validationResult.serverValid,
            account_type: validationResult.accountType,
            has_balance: validationResult.hasBalance,
          }
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

    const accountInfo = validationResult.accountInfo!;

    const updateData: any = {
      verified: true,
      verification_status: "verified",
      verified_at: new Date().toISOString(),
      balance: accountInfo.balance,
      equity: accountInfo.equity,
      margin: accountInfo.margin,
      free_margin: accountInfo.free_margin,
      margin_level: accountInfo.margin_level,
      currency: accountInfo.currency,
      leverage: accountInfo.leverage,
      last_sync: new Date().toISOString(),
      rejected_reason: null,
    };

    if (validationResult.accountType) {
      updateData.account_type = validationResult.accountType;
    }

    const { error: updateError } = await supabase
      .from("mt5_accounts")
      .update(updateData)
      .eq("user_id", user.id)
      .eq("mt5_login", mt5_login);

    if (updateError) {
      throw new Error(`Database update failed: ${updateError.message}`);
    }

    console.log(`MT5 account ${mt5_login} verified and approved successfully`);

    // Email user about approval.
    let approvalEmail: { id?: string; error?: string } | null = null;
    try {
      const { data: profile } = await supabase.from("profiles").select("email").eq("id", user.id).maybeSingle();
      const to = (profile as any)?.email || user.email || "";
      if (to) {
        approvalEmail = await sendMt5VerificationEmail({
          to,
          status: "approved",
          mt5_login: String(mt5_login),
          server: String(server),
        });
      }
    } catch (e) {
      console.warn("Failed to send approval email:", String((e as any)?.message || e));
    }

    return new Response(
      JSON.stringify({
        success: true,
        verified: true,
        message: "Account verified and approved successfully",
        email: approvalEmail,
        account_info: {
          login: accountInfo.login,
          server: accountInfo.server,
          balance: accountInfo.balance,
          equity: accountInfo.equity,
          currency: accountInfo.currency,
          leverage: accountInfo.leverage,
          account_type: validationResult.accountType,
          market_type: accountInfo.market_type,
        },
        validation_details: {
          server_valid: validationResult.serverValid,
          has_balance: validationResult.hasBalance,
          auto_approved: true,
        }
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error: any) {
    console.error("Verification error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Verification failed",
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
