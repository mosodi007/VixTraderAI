/*
  Per-MT5-account per-symbol trading settings:
  - enable/disable trading per symbol
  - lot sizing per symbol (fixed lots or % of balance converted to lots)
*/

CREATE TABLE IF NOT EXISTS mt5_symbol_settings (
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  mt5_login text NOT NULL,
  symbol text NOT NULL,
  trade_enabled boolean NOT NULL DEFAULT true,
  lot_mode text NOT NULL DEFAULT 'fixed', -- 'fixed' | 'percent_balance'
  fixed_lot numeric(10, 2) NOT NULL DEFAULT 0.01,
  percent numeric(10, 2) NOT NULL DEFAULT 0, -- used when lot_mode='percent_balance'
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, mt5_login, symbol)
);

-- Basic validation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'mt5_symbol_settings_lot_mode_check'
  ) THEN
    ALTER TABLE mt5_symbol_settings
    ADD CONSTRAINT mt5_symbol_settings_lot_mode_check
    CHECK (lot_mode IN ('fixed', 'percent_balance'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'mt5_symbol_settings_fixed_lot_check'
  ) THEN
    ALTER TABLE mt5_symbol_settings
    ADD CONSTRAINT mt5_symbol_settings_fixed_lot_check
    CHECK (fixed_lot >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'mt5_symbol_settings_percent_check'
  ) THEN
    ALTER TABLE mt5_symbol_settings
    ADD CONSTRAINT mt5_symbol_settings_percent_check
    CHECK (percent >= 0 AND percent <= 100);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_mt5_symbol_settings_user_mt5
  ON mt5_symbol_settings(user_id, mt5_login);

ALTER TABLE mt5_symbol_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own mt5_symbol_settings"
  ON mt5_symbol_settings FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own mt5_symbol_settings"
  ON mt5_symbol_settings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own mt5_symbol_settings"
  ON mt5_symbol_settings FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Keep updated_at fresh
DROP TRIGGER IF EXISTS update_mt5_symbol_settings_updated_at ON mt5_symbol_settings;
CREATE TRIGGER update_mt5_symbol_settings_updated_at
  BEFORE UPDATE ON mt5_symbol_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

