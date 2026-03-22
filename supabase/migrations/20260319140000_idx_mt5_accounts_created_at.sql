-- Speed up fallback scan in resolve-mt5_account (newest rows first) when RPC is unavailable.
CREATE INDEX IF NOT EXISTS idx_mt5_accounts_created_at_desc ON public.mt5_accounts (created_at DESC);
