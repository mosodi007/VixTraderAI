-- Use `approved` (not `verified`) for demo MT5 accounts that are already marked verified.
-- Live/real accounts keep `verified` where applicable.
UPDATE public.mt5_accounts
SET verification_status = 'approved'
WHERE verified = true
  AND LOWER(COALESCE(account_type, '')) = 'demo'
  AND LOWER(COALESCE(verification_status, '')) = 'verified';
