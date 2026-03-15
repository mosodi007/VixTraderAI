/*
  # Add Signal Tracking and Outcome Fields

  1. Changes to `signals` table
    - Add `order_type` field for order execution type
    - Add `tp1`, `tp2`, `tp3` fields for multiple take profit levels
    - Add `outcome` field to track if signal hit TP or SL
    - Add `closed_at` field for when signal was resolved
    - Add `accuracy_percentage` field for tracking success rate
    - Add indexes for performance

  2. Security
    - Maintain existing RLS policies
*/

-- Add new columns to signals table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'signals' AND column_name = 'order_type'
  ) THEN
    ALTER TABLE signals ADD COLUMN order_type text DEFAULT 'Market Execution';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'signals' AND column_name = 'tp1'
  ) THEN
    ALTER TABLE signals ADD COLUMN tp1 decimal(10, 5);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'signals' AND column_name = 'tp2'
  ) THEN
    ALTER TABLE signals ADD COLUMN tp2 decimal(10, 5);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'signals' AND column_name = 'tp3'
  ) THEN
    ALTER TABLE signals ADD COLUMN tp3 decimal(10, 5);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'signals' AND column_name = 'outcome'
  ) THEN
    ALTER TABLE signals ADD COLUMN outcome text CHECK (outcome IN ('tp1_hit', 'tp2_hit', 'tp3_hit', 'sl_hit', 'expired', 'pending'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'signals' AND column_name = 'closed_at'
  ) THEN
    ALTER TABLE signals ADD COLUMN closed_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'signals' AND column_name = 'accuracy_percentage'
  ) THEN
    ALTER TABLE signals ADD COLUMN accuracy_percentage decimal(5, 2);
  END IF;
END $$;

-- Create index for faster queries on closed signals
CREATE INDEX IF NOT EXISTS idx_signals_outcome ON signals(outcome);
CREATE INDEX IF NOT EXISTS idx_signals_closed_at ON signals(closed_at);
CREATE INDEX IF NOT EXISTS idx_signals_is_active ON signals(is_active);
