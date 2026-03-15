-- ATR settings for signal generation (single row, editable from Settings page)
CREATE TABLE IF NOT EXISTS signal_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atr_sl_multiplier numeric NOT NULL DEFAULT 1.5,
  atr_tp_multiplier numeric NOT NULL DEFAULT 2.5,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE signal_config ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read and update (single row used by app)
CREATE POLICY "Allow authenticated read signal_config"
  ON signal_config FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated update signal_config"
  ON signal_config FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated insert signal_config"
  ON signal_config FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Seed the single row if empty
INSERT INTO signal_config (atr_sl_multiplier, atr_tp_multiplier)
SELECT 1.5, 2.5
WHERE NOT EXISTS (SELECT 1 FROM signal_config LIMIT 1);
