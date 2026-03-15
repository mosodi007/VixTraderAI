/*
  # Re-open signals that were closed only due to time expiry

  So they appear as active again and are monitored until SL or TP is hit.
*/

WITH updated AS (
  UPDATE signals
  SET
    outcome = NULL,
    is_active = true,
    signal_status = 'ACTIVE',
    closed_at = NULL,
    actual_close_price = NULL,
    profit_loss = NULL,
    expires_at = '2099-12-31 23:59:59+00'::timestamptz
  WHERE LOWER(TRIM(COALESCE(outcome, ''))) = 'expired'
  RETURNING id, symbol, mt5_symbol, created_at
),
per_symbol AS (
  SELECT DISTINCT ON (symbol) id, symbol, mt5_symbol
  FROM updated
  ORDER BY symbol, created_at DESC
)
INSERT INTO active_signal_registry (symbol, mt5_symbol, signal_id, created_at, updated_at)
SELECT symbol, mt5_symbol, id, now(), now()
FROM per_symbol
ON CONFLICT (symbol) DO UPDATE
  SET signal_id = EXCLUDED.signal_id,
      mt5_symbol = EXCLUDED.mt5_symbol,
      updated_at = now();
