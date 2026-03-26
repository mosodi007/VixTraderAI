/*
  Revert to global ICT-refined behavior:
  1) One standard SL/TP from shared `signals` for all accounts.
  2) One ACTIVE shared signal per symbol globally.

  Notes:
  - This migration intentionally disables per-account SL/TP overrides in `mt5_symbol_settings`.
  - Application code should continue using signal-level SL/TP (and not per-account overrides).
*/

BEGIN;

-- ---------------------------------------------------------------------------
-- A) Disable per-account SL/TP overrides (global signal SL/TP only)
-- ---------------------------------------------------------------------------

-- Null out any existing account-specific overrides.
UPDATE public.mt5_symbol_settings
SET sl_points = NULL,
    tp_points = NULL,
    updated_at = now()
WHERE sl_points IS NOT NULL OR tp_points IS NOT NULL;

-- Ensure future writes keep these columns NULL (if UI/API still sends values).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'mt5_symbol_settings_global_sl_tp_only_check'
      AND conrelid = 'public.mt5_symbol_settings'::regclass
  ) THEN
    ALTER TABLE public.mt5_symbol_settings
      ADD CONSTRAINT mt5_symbol_settings_global_sl_tp_only_check
      CHECK (sl_points IS NULL AND tp_points IS NULL);
  END IF;
END $$;

COMMENT ON CONSTRAINT mt5_symbol_settings_global_sl_tp_only_check ON public.mt5_symbol_settings
  IS 'Global SL/TP mode: per-account sl_points/tp_points must remain NULL; use shared signals.stop_loss/take_profit.';

-- ---------------------------------------------------------------------------
-- B) Enforce one ACTIVE shared signal per symbol globally
-- ---------------------------------------------------------------------------

-- Close duplicate active signals per symbol, keep newest by created_at.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY symbol
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM public.signals
  WHERE is_active = true
    AND COALESCE(signal_status, 'ACTIVE') = 'ACTIVE'
)
UPDATE public.signals s
SET is_active = false,
    signal_status = 'CLOSED',
    closed_at = COALESCE(s.closed_at, now())
FROM ranked r
WHERE s.id = r.id
  AND r.rn > 1;

-- DB-level uniqueness for active shared signal per symbol.
CREATE UNIQUE INDEX IF NOT EXISTS uq_signals_one_active_per_symbol
  ON public.signals(symbol)
  WHERE is_active = true AND COALESCE(signal_status, 'ACTIVE') = 'ACTIVE';

-- Keep active_signal_registry aligned with current active signals.
DELETE FROM public.active_signal_registry;

INSERT INTO public.active_signal_registry (symbol, mt5_symbol, signal_id, created_at, updated_at)
SELECT s.symbol,
       COALESCE(s.mt5_symbol, s.symbol) AS mt5_symbol,
       s.id,
       now(),
       now()
FROM public.signals s
WHERE s.is_active = true
  AND COALESCE(s.signal_status, 'ACTIVE') = 'ACTIVE'
ON CONFLICT (symbol)
DO UPDATE SET
  signal_id = EXCLUDED.signal_id,
  mt5_symbol = EXCLUDED.mt5_symbol,
  updated_at = now();

COMMIT;
