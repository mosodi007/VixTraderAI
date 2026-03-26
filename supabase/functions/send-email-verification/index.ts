// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { sendEmailVerificationEmail } from "../_shared/resend.ts";

// Cursor/TS diagnostics sometimes don't know about Edge runtime globals.
declare const Deno: any;

// Cursor TS diagnostics sometimes don't know how to resolve `jsr:` imports.
// This declaration only affects editor diagnostics, not runtime.
declare module "jsr:@supabase/supabase-js@2" {
  export function createClient(...args: any[]): any;
}

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

    const requestBody = await req.json().catch(() => ({}));
    const emailFromBody = String((requestBody as any)?.email || '').trim().toLowerCase();

    const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
    let user: any = null;
    let authError: any = null;

    // Use anon key for auth verification when a JWT is provided.
    // If the JWT is missing/invalid, we still allow resend using the `email` in the request body.
    if (authHeader) {
      const supabaseAuthClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: {
          headers: { Authorization: authHeader },
        },
      });

      const authRes = await supabaseAuthClient.auth.getUser();
      user = (authRes as any)?.data?.user ?? null;
      authError = (authRes as any)?.error ?? null;
    } else {
      authError = new Error("Missing Authorization header");
    }

    // Use service role for DB operations.
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (authError || !user) {
      // JWT fallback: if the client sends the user's email, allow resend based on DB state.
      if (emailFromBody) {
        const { data: profile, error: profErr } = await supabase
          .from("profiles")
          .select("id,email,email_verified_at,email_verification_expires_at")
          .eq("email", emailFromBody)
          .maybeSingle();

        if (profErr) {
          return new Response(JSON.stringify({ success: false, error: profErr.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (!profile) {
          // Avoid account enumeration; respond with success but no guarantee.
          return new Response(JSON.stringify({ success: true, email_sent: false, message: "If your account exists, we sent a verification email to your inbox." }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (profile.email_verified_at) {
          return new Response(JSON.stringify({ success: true, email_sent: false, already_verified: true, message: "Email is already verified." }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const now = Date.now();
        const expiresRaw = profile.email_verification_expires_at as string | null;
        if (expiresRaw) {
          const expiresAt = new Date(expiresRaw).getTime();
          if (!Number.isNaN(expiresAt) && expiresAt > now) {
            return new Response(JSON.stringify({ success: true, email_sent: false, already_sent: true, message: "A verification email was already sent recently. Please wait and try again." }), {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }

        const minutesRaw = Deno.env.get("EMAIL_VERIFICATION_TTL_MINUTES");
        const expiresInMinutes = minutesRaw ? Math.max(1, Number(minutesRaw)) : 5;

        const token = typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : String(Date.now()) + "-" + Math.random();
        const expiresAt = new Date(new Date().getTime() + expiresInMinutes * 60 * 1000);

        const { error: upsertErr } = await supabase
          .from("profiles")
          .update({
            email_verified_at: null,
            email_verification_token: token,
            email_verification_expires_at: expiresAt.toISOString(),
          })
          .eq("id", profile.id);

        if (upsertErr) throw new Error(upsertErr.message);

        const emailResult = await sendEmailVerificationEmail({
          to: profile.email,
          token,
          expiresInMinutes,
        });

        if (emailResult?.error) {
          return new Response(JSON.stringify({ success: false, error: emailResult.error }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ success: true, email_sent: true, message: `Verification email sent to ${profile.email}.` }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({
          error: "Invalid JWT",
          details: authError?.message ?? (!user ? "User not found in token" : undefined),
          receivedAuthorizationLength: authHeader?.length ?? 0,
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

