-- TP points = 3 × SL points (1:3 risk:reward in price space).
UPDATE symbol_sl_tp_config
SET
  tp_points = GREATEST(1, ROUND(sl_points::numeric * 3)),
  updated_at = now();
