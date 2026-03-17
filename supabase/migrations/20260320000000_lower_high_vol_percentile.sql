/*
  signal_filters_config (create if missing) + global vol threshold 0.55.
  Safe if 20260318002000 was never applied.
*/

CREATE TABLE IF NOT EXISTS signal_filters_config (
  id text PRIMARY KEY,
  high_vol_percentile numeric(4,3) DEFAULT 0.550,
  strong_trend_strength numeric(10,4) DEFAULT 1.200,
  require_trend_alignment boolean DEFAULT true,
  require_structure_alignment boolean DEFAULT true,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE signal_filters_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read signal filter config" ON signal_filters_config;
CREATE POLICY "Authenticated can read signal filter config"
  ON signal_filters_config FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Service role can manage signal filter config" ON signal_filters_config;
CREATE POLICY "Service role can manage signal filter config"
  ON signal_filters_config FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

INSERT INTO signal_filters_config (id, high_vol_percentile, strong_trend_strength)
VALUES ('global', 0.550, 1.200)
ON CONFLICT (id) DO UPDATE SET
  high_vol_percentile = EXCLUDED.high_vol_percentile,
  updated_at = now();
