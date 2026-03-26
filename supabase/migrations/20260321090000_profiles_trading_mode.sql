/*
  Add per-user trading mode (demo/live).

  UI uses this to show a Demo|Live toggle and gate messaging.
*/

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS trading_mode text NOT NULL DEFAULT 'demo';

-- Backfill any existing rows (safety if column was added nullable in the past)
UPDATE profiles
SET trading_mode = 'demo'
WHERE trading_mode IS NULL OR trading_mode = '';

-- Optional: constrain allowed values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_trading_mode_check'
  ) THEN
    ALTER TABLE profiles
    ADD CONSTRAINT profiles_trading_mode_check
    CHECK (trading_mode IN ('demo', 'live'));
  END IF;
END $$;

