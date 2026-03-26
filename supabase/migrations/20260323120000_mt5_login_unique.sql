-- One MT5 login number may only be registered once (across all users).
UPDATE mt5_accounts SET mt5_login = trim(mt5_login) WHERE mt5_login IS NOT NULL;

-- Keep earliest row per login; remove later duplicates (same login registered twice).
DELETE FROM mt5_accounts a
USING mt5_accounts b
WHERE a.mt5_login = b.mt5_login AND a.id > b.id;

ALTER TABLE mt5_accounts
  ADD CONSTRAINT mt5_accounts_mt5_login_key UNIQUE (mt5_login);

COMMENT ON CONSTRAINT mt5_accounts_mt5_login_key ON mt5_accounts IS 'Prevents connecting the same MT5 login to multiple app accounts';
