/*
  # Signal Filters Config (adaptive)

  Stores global and per-symbol thresholds for:
  - high volatility gating (realized vol percentile)
  - strong trend threshold
  - enforcement toggles
*/

CREATE TABLE IF NOT EXISTS signal_filters_config (
  id text PRIMARY KEY,               -- 'global' or symbol key
  high_vol_percentile numeric(4,3) DEFAULT 0.700,  -- 0..1
  strong_trend_strength numeric(10,4) DEFAULT 1.200,
  require_trend_alignment boolean DEFAULT true,
  require_structure_alignment boolean DEFAULT true,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE signal_filters_config ENABLE ROW LEVEL SECURITY;

-- Only service role manages; authenticated can read (optional for UI/debugging)
CREATE POLICY "Authenticated can read signal filter config"
  ON signal_filters_config FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage signal filter config"
  ON signal_filters_config FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Seed global row
INSERT INTO signal_filters_config (id, high_vol_percentile, strong_trend_strength)
VALUES ('global', 0.700, 1.200)
ON CONFLICT (id) DO NOTHING;

