import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface MT5AccountRequest {
  account_type: string;
  email: string;
  leverage: number;
  mainPassword: string;
  name: string;
  mt5_account_type?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { account_type, email, leverage, mainPassword, name, mt5_account_type } = await req.json() as MT5AccountRequest;

    const derivApiToken = Deno.env.get("DERIV_API_TOKEN");
    if (!derivApiToken) {
      throw new Error("Deriv API token not configured");
    }

    const ws = new WebSocket("wss://ws.derivws.com/websockets/v3?app_id=89937");

    const accountCreationPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error("Request timeout"));
      }, 30000);

      ws.onopen = () => {
        ws.send(JSON.stringify({
          authorize: derivApiToken,
        }));
      };

      ws.onmessage = (event) => {
        const response = JSON.parse(event.data);

        if (response.error) {
          clearTimeout(timeout);
          ws.close();
          reject(new Error(response.error.message || "API error"));
          return;
        }

        if (response.msg_type === "authorize") {
          ws.send(JSON.stringify({
            mt5_new_account: 1,
            account_type: account_type,
            email: email,
            leverage: leverage,
            mainPassword: mainPassword,
            name: name,
            mt5_account_type: mt5_account_type || "financial",
          }));
        }

        if (response.msg_type === "mt5_new_account") {
          clearTimeout(timeout);
          ws.close();
          resolve({
            login: response.mt5_new_account.login,
            server: response.mt5_new_account.server,
            balance: response.mt5_new_account.balance,
            currency: response.mt5_new_account.currency,
          });
        }
      };

      ws.onerror = (error) => {
        clearTimeout(timeout);
        ws.close();
        reject(error);
      };
    });

    const result = await accountCreationPromise;

    return new Response(
      JSON.stringify({
        success: true,
        data: result,
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
        error: error.message || "Failed to create MT5 account",
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
