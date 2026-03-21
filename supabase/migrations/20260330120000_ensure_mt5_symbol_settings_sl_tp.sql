-- Ensure per-user SL/TP point columns exist (idempotent).
-- Apply if an older DB never ran 20260328120000_mt5_symbol_settings_sl_tp.sql.
ALTER TABLE public.mt5_symbol_settings
  ADD COLUMN IF NOT EXISTS sl_points numeric,
  ADD COLUMN IF NOT EXISTS tp_points numeric;

COMMENT ON COLUMN public.mt5_symbol_settings.sl_points IS 'Optional SL distance in points; overrides signal SL/TP for EA when set.';
COMMENT ON COLUMN public.mt5_symbol_settings.tp_points IS 'Optional TP distance in points; typically 3× sl_points.';
