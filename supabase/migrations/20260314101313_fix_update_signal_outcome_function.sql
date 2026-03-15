/*
  # Fix update_signal_outcome Function

  1. Changes
    - Remove reference to non-existent updated_at column
    - Ensure function correctly updates signal status

  2. Security
    - Maintains existing permissions
*/

-- Drop and recreate the function without updated_at
CREATE OR REPLACE FUNCTION update_signal_outcome(
  p_signal_id uuid,
  p_outcome text,
  p_close_price decimal,
  p_profit_loss decimal
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE signals
  SET
    signal_status = 'CLOSED',
    is_active = false,
    outcome = LOWER(p_outcome),
    closed_at = now(),
    actual_close_price = p_close_price,
    profit_loss = p_profit_loss
  WHERE id = p_signal_id;

  -- Remove from active signal registry if exists
  DELETE FROM active_signal_registry
  WHERE signal_id = p_signal_id;
END;
$$;