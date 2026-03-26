-- Per-user per-MT5-account SL/TP points (Settings). NULL = use signal row defaults (from global symbol_sl_tp_config at generation time).
ALTER TABLE mt5_symbol_settings
  ADD COLUMN IF NOT EXISTS sl_points numeric,
  ADD COLUMN IF NOT EXISTS tp_points numeric;

COMMENT ON COLUMN mt5_symbol_settings.sl_points IS 'Optional SL distance in points; overrides signal SL/TP for EA when set.';
COMMENT ON COLUMN mt5_symbol_settings.tp_points IS 'Optional TP distance in points; typically 3× sl_points.';
