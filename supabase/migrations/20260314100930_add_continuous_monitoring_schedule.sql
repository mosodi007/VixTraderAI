/*
  # Add Continuous Price Monitoring Schedule

  1. New Tables
    - `price_monitor_schedule`
      - `id` (uuid, primary key)
      - `is_enabled` (boolean) - Whether continuous monitoring is active
      - `check_interval_seconds` (integer) - How often to check prices (default 60)
      - `last_check_at` (timestamptz) - When prices were last checked
      - `active_signals_count` (integer) - Number of signals being monitored
      - `updated_at` (timestamptz)

  2. New Functions
    - `update_signal_outcome` - Function to update signal when TP/SL is hit
    - `check_signal_prices` - Function to check all active signals against current prices

  3. Security
    - Enable RLS on table
    - Allow authenticated users to read
    - Allow service role to update
*/

CREATE TABLE IF NOT EXISTS price_monitor_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_enabled boolean DEFAULT true,
  check_interval_seconds integer DEFAULT 60,
  last_check_at timestamptz,
  active_signals_count integer DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE price_monitor_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read monitor schedule"
  ON price_monitor_schedule
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can update monitor schedule"
  ON price_monitor_schedule
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Insert initial schedule
INSERT INTO price_monitor_schedule (id, is_enabled, check_interval_seconds)
VALUES ('00000000-0000-0000-0000-000000000002', true, 60)
ON CONFLICT (id) DO NOTHING;

-- Function to update signal outcome
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
    profit_loss = p_profit_loss,
    updated_at = now()
  WHERE id = p_signal_id;

  -- Remove from active signal registry
  DELETE FROM active_signal_registry
  WHERE signal_id = p_signal_id;
END;
$$;

-- Add actual_close_price and profit_loss columns if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'signals' AND column_name = 'actual_close_price'
  ) THEN
    ALTER TABLE signals ADD COLUMN actual_close_price decimal(10, 5);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'signals' AND column_name = 'profit_loss'
  ) THEN
    ALTER TABLE signals ADD COLUMN profit_loss decimal(10, 5);
  END IF;
END $$;