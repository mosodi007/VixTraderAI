/**
 * Resolve mt5_accounts row when EA sends login text that may differ from DB
 * (leading zeros, trim). Used by mt5-get-instructions, mt5-report-account, etc.
 */
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export type Mt5AccountRow = {
  user_id: string;
  verified?: boolean;
  verification_status?: string;
  account_type?: string;
  mt5_login?: string;
};

const SELECT_FIELDS = "user_id, verified, verification_status, account_type, mt5_login";

export function canonicalMt5Login(s: string): string {
  const t = String(s || "").trim();
  return t.replace(/^0+/, "") || t;
}

export async function resolveMt5Account(
  supabase: SupabaseClient,
  mt5_login: string,
): Promise<Mt5AccountRow | null> {
  const raw = String(mt5_login || "").trim();
  if (!raw) return null;

  const loginNorm = raw.replace(/^0+/, "") || raw;

  const { data: acctExact } = await supabase
    .from("mt5_accounts")
    .select(SELECT_FIELDS)
    .eq("mt5_login", raw)
    .maybeSingle();
  if (acctExact) return acctExact as Mt5AccountRow;

  if (loginNorm !== raw) {
    const { data: byNorm } = await supabase
      .from("mt5_accounts")
      .select(SELECT_FIELDS)
      .eq("mt5_login", loginNorm)
      .maybeSingle();
    if (byNorm) return byNorm as Mt5AccountRow;
  }

  const { data: rpcRows, error: rpcErr } = await supabase.rpc("mt5_accounts_match_login", {
    p_login: raw,
  });
  if (!rpcErr && rpcRows != null) {
    const arr = Array.isArray(rpcRows) ? rpcRows : [rpcRows];
    if (arr.length > 0) return arr[0] as Mt5AccountRow;
  }
  if (rpcErr) {
    console.warn("[resolve-mt5-account] mt5_accounts_match_login RPC:", rpcErr.message);
  }

  const target = canonicalMt5Login(raw);
  // Newest rows first so new signups are found even when the table is large (unbounded scan was missing them).
  const { data: scanRows, error: scanErr } = await supabase
    .from("mt5_accounts")
    .select(SELECT_FIELDS)
    .order("created_at", { ascending: false })
    .limit(25000);

  if (scanErr) {
    console.warn("[resolve-mt5-account] fallback scan failed:", scanErr.message);
    return null;
  }

  const found =
    (scanRows as Mt5AccountRow[] | null)?.find(
      (r) => canonicalMt5Login(String(r.mt5_login || "")) === target,
    ) ?? null;
  return found;
}
