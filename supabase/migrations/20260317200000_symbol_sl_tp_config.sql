-- Per-symbol SL and TP points (editable from Settings). Replaces single ATR for all symbols.
CREATE TABLE IF NOT EXISTS symbol_sl_tp_config (
  symbol text PRIMARY KEY,
  sl_points numeric NOT NULL,
  tp_points numeric NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE symbol_sl_tp_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read symbol_sl_tp_config"
  ON symbol_sl_tp_config FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated update symbol_sl_tp_config"
  ON symbol_sl_tp_config FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated insert symbol_sl_tp_config"
  ON symbol_sl_tp_config FOR INSERT TO authenticated WITH CHECK (true);

-- Seed with default points (same as SYMBOL_SL_TP_POINTS in code)
INSERT INTO symbol_sl_tp_config (symbol, sl_points, tp_points) VALUES
  ('R_10', 4000, 8000),
  ('R_50', 4000, 8000),
  ('R_100', 400, 800),
  ('stpRNG', 40, 80),
  ('1HZ10V', 400, 800),
  ('1HZ30V', 20000, 40000),
  ('1HZ50V', 200000, 400000),
  ('1HZ90V', 100000, 200000),
  ('1HZ100V', 2000, 4000),
  ('JD25', 40000, 80000),
  ('STPIDX', 40, 80)
ON CONFLICT (symbol) DO NOTHING;
