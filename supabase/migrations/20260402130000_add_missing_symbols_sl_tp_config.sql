-- Ensure newer symbols exist in global symbol SL/TP defaults used by Settings.
-- Safe to run multiple times.
INSERT INTO public.symbol_sl_tp_config (symbol, sl_points, tp_points, updated_at)
VALUES
  ('R_25', 8000, 24000, now()),
  ('R_75', 8000, 24000, now()),
  ('1HZ90V', 200000, 600000, now()),
  ('stpRNG', 80, 240, now()),
  ('JD25', 80000, 240000, now())
ON CONFLICT (symbol) DO NOTHING;
