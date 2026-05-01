-- Enforce global SL/TP mode at the DB level.
-- The application should treat `mt5_symbol_settings.sl_points/tp_points` as always NULL.
-- This trigger prevents any client write (including older frontend versions) from violating
-- `mt5_symbol_settings_global_sl_tp_only_check`.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'force_mt5_symbol_settings_sl_tp_null'
  ) THEN
    CREATE OR REPLACE FUNCTION public.force_mt5_symbol_settings_sl_tp_null()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $fn$
    BEGIN
      NEW.sl_points := NULL;
      NEW.tp_points := NULL;
      RETURN NEW;
    END;
    $fn$;
  END IF;
END $$;

-- Recreate the trigger safely.
DROP TRIGGER IF EXISTS force_mt5_symbol_settings_sl_tp_null_trg ON public.mt5_symbol_settings;
CREATE TRIGGER force_mt5_symbol_settings_sl_tp_null_trg
  BEFORE INSERT OR UPDATE ON public.mt5_symbol_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.force_mt5_symbol_settings_sl_tp_null();

