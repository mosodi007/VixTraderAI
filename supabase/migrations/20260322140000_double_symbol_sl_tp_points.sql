-- Double SL/TP point distances for all stored symbol configs.
UPDATE symbol_sl_tp_config
SET
  sl_points = GREATEST(1, ROUND(sl_points::numeric * 2)),
  tp_points = GREATEST(1, ROUND(tp_points::numeric * 2)),
  updated_at = now()
WHERE sl_points IS NOT NULL AND tp_points IS NOT NULL;

-- Monitored symbol missing from older seeds (doubled from former 20k/60k defaults).
INSERT INTO symbol_sl_tp_config (symbol, sl_points, tp_points, updated_at)
SELECT '1HZ75V', 40000, 120000, now()
WHERE NOT EXISTS (SELECT 1 FROM symbol_sl_tp_config WHERE symbol = '1HZ75V');
