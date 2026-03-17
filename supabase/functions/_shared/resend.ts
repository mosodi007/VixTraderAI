/**
 * Resend email integration for sending signal notifications.
 * Uses fetch (no npm) so it works in Deno Edge Functions.
 * Set RESEND_API_KEY and RESEND_FROM in Supabase Edge Function secrets.
 */

const RESEND_API = "https://api.resend.com/emails";

/**
 * Get emails of users who have at least one verified MT5 account. Signals are sent only to those accounts, at the email registered in their profile.
 */
export async function getSignalNotificationEmails(supabase: any): Promise<string[]> {
  const { data: accounts } = await supabase.from("mt5_accounts").select("user_id").eq("verified", true);
  const userIds = [...new Set((accounts || []).map((a: { user_id: string }) => a.user_id).filter(Boolean))];
  if (userIds.length === 0) return [];
  const { data: profiles } = await supabase.from("profiles").select("email").in("id", userIds);
  return (profiles || []).map((p: { email: string }) => p.email).filter((e: string) => e && e.trim());
}

export interface SignalEmailPayload {
  id: string;
  symbol: string;
  mt5_symbol?: string | null;
  direction: string;
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  tp1?: number | null;
  risk_reward_ratio?: number;
  created_at?: string;
}

export interface SendSignalEmailOptions {
  signal: SignalEmailPayload;
  to: string[];
  from?: string;
  apiKey?: string;
}

function buildSignalHtml(signal: SignalEmailPayload): string {
  const tp = signal.tp1 ?? signal.take_profit;
  const rr = signal.risk_reward_ratio ?? 0;
  const time = signal.created_at
    ? new Date(signal.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
    : "Just now";

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family: system-ui, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; color: #1e293b;">
  <h2 style="color: #0f172a; margin-bottom: 8px;">New trading signal</h2>
  <p style="color: #64748b; font-size: 14px; margin-bottom: 20px;">${time}</p>
  <table style="width: 100%; border-collapse: collapse; background: #f8fafc; border-radius: 8px; overflow: hidden;">
    <tr><td style="padding: 12px 16px; font-weight: 600;">Symbol</td><td style="padding: 12px 16px;">${escapeHtml(signal.mt5_symbol || signal.symbol)}</td></tr>
    <tr style="background: #fff;"><td style="padding: 12px 16px; font-weight: 600;">Direction</td><td style="padding: 12px 16px;"><strong style="color: ${signal.direction === "BUY" ? "#059669" : "#dc2626"};">${escapeHtml(signal.direction)}</strong></td></tr>
    <tr><td style="padding: 12px 16px; font-weight: 600;">Entry</td><td style="padding: 12px 16px;">${Number(signal.entry_price).toFixed(5)}</td></tr>
    <tr style="background: #fff;"><td style="padding: 12px 16px; font-weight: 600;">Stop loss</td><td style="padding: 12px 16px;">${Number(signal.stop_loss).toFixed(5)}</td></tr>
    <tr><td style="padding: 12px 16px; font-weight: 600;">Take profit</td><td style="padding: 12px 16px;">${Number(tp).toFixed(5)}</td></tr>
    ${rr ? `<tr style="background: #fff;"><td style="padding: 12px 16px; font-weight: 600;">Risk:Reward</td><td style="padding: 12px 16px;">1:${rr}</td></tr>` : ""}
  </table>
  <p style="margin-top: 20px; font-size: 12px; color: #94a3b8;">VixAI – Check the app for full details and to manage the signal.</p>
</body>
</html>
`.trim();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Send one email per signal to the given recipients via Resend.
 * If RESEND_API_KEY or to list is empty, no request is made.
 */
export async function sendSignalEmail(options: SendSignalEmailOptions): Promise<{ id?: string; error?: string }> {
  const { signal, to } = options;
  const apiKey = options.apiKey ?? Deno.env.get("RESEND_API_KEY");
  const from = options.from ?? Deno.env.get("RESEND_FROM") ?? "VixAI - Signals <signals@vixai.trade>";

  if (!apiKey || to.length === 0) {
    if (!apiKey) console.warn("[Resend] RESEND_API_KEY not set; skipping email.");
    return {};
  }

  const subject = `${signal.direction} ${signal.mt5_symbol || signal.symbol} @ ${Number(signal.entry_price).toFixed(2)}`;
  const html = buildSignalHtml(signal);

  const res = await fetch(RESEND_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      html,
    }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = (data as { message?: string }).message ?? res.statusText;
    console.error("[Resend] Send failed:", res.status, err);
    return { error: err };
  }

  const id = (data as { id?: string }).id;
  return { id };
}
