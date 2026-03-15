import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const derivToken = Deno.env.get("DERIV_API_TOKEN");
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    return new Response(
      JSON.stringify({
        success: true,
        message: "Simple test successful",
        env_check: {
          hasDerivToken: !!derivToken,
          hasOpenAI: !!openaiKey,
          derivPreview: derivToken ? derivToken.substring(0, 8) + '...' : 'MISSING',
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
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
