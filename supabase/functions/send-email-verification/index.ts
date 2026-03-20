import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { sendEmailVerificationEmail } from "../_shared/resend.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) throw new Error("Supabase configuration missing");

    const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    // Use anon key for auth verification, matching the pattern used by other functions
    // in this repo (e.g. generate-signals).
    const supabaseAuthClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    const {
      data: { user },
      error: authError,
    } = await supabaseAuthClient.auth.getUser();

    // Use service role for DB operations.
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (authError || !user) {
      return new Response(
        JSON.stringify({
          error: "Invalid JWT",
          details: authError?.message ?? (!user ? "User not found in token" : undefined),
          receivedAuthorizationLength: authHeader.length,
        }),
        { status: 401, headers: corsHeaders },
      );
    }

    const email = user.email;
    if (!email) {
      return new Response(JSON.stringify({ error: "User email not available" }), { status: 400, headers: corsHeaders });
    }

    const minutesRaw = Deno.env.get("EMAIL_VERIFICATION_TTL_MINUTES");
    const expiresInMinutes = minutesRaw ? Math.max(1, Number(minutesRaw)) : 5;

    // If the user is already verified, don't reset verification state or re-send.
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("email_verified_at")
      .eq("id", user.id)
      .maybeSingle();

    if ((existingProfile as any)?.email_verified_at) {
      return new Response(JSON.stringify({ success: true, email_sent: false, already_verified: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // random, unguessable token
    const token = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now()) + "-" + Math.random();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + expiresInMinutes * 60 * 1000);

    const { error: upsertErr } = await supabase.from("profiles").upsert(
      {
        id: user.id,
        email,
        email_verified_at: null,
        email_verification_token: token,
        email_verification_expires_at: expiresAt.toISOString(),
      },
      { onConflict: "id" },
    );

    if (upsertErr) {
      throw new Error(upsertErr.message);
    }

    const emailResult = await sendEmailVerificationEmail({
      to: email,
      token,
      expiresInMinutes,
    });

    if (emailResult?.error) {
      return new Response(JSON.stringify({ success: false, error: emailResult.error }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ success: false, error: e?.message || "Failed to send verification email" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

