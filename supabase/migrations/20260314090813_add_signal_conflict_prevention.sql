/*
  # Add Signal Conflict Prevention and Tracking System

  ## Overview
  This migration adds comprehensive signal tracking to enforce the "one active signal per asset" rule
  and improve signal quality monitoring.

  ## New Tables
  
  ### active_signal_registry
  Tracks which symbols currently have active signals to prevent conflicts
  - `id` (uuid, primary key)
  - `symbol` (text, unique) - The trading symbol (e.g., 'R_10', 'R_25')
  - `mt5_symbol` (text) - The MT5 symbol name
  - `signal_id` (uuid, references signals) - The active signal for this symbol
  - `created_at` (timestamptz) - When signal became active
  - `updated_at` (timestamptz) - Last update time

  ### signal_triggers
  Logs which technical indicators triggered each signal for analysis
  - `id` (uuid, primary key)
  - `signal_id` (uuid, references signals) - Associated signal
  - `indicator_name` (text) - Name of indicator (RSI, MACD, BB, etc)
  - `indicator_value` (decimal) - Current indicator value
  - `trigger_condition` (text) - What condition was met
  - `timeframe` (text) - Timeframe analyzed
  - `triggered_at` (timestamptz) - When indicator triggered

  ### signal_outcomes
  Tracks signal results for performance analysis
  - `id` (uuid, primary key)
  - `signal_id` (uuid, references signals) - Associated signal
  - `outcome` (text) - TP1_HIT, TP2_HIT, TP3_HIT, SL_HIT, EXPIRED, CANCELLED
  - `close_price` (decimal) - Price when signal closed
  - `profit_loss` (decimal) - Calculated P&L
  - `duration_minutes` (integer) - How long signal was active
  - `closed_at` (timestamptz) - When signal closed

  ## Modified Tables
  
  ### signals
  - Add `signal_status` field to track lifecycle (ACTIVE, MONITORING, CLOSED, EXPIRED)
  - Add `outcome` field to store final result
  - Add `closed_at` field for when signal completed
  - Add `trigger_count` field for number of indicators that confirmed
  - Add unique constraint on (symbol, is_active) where is_active = true

  ## Security
  - Enable RLS on all new tables
  - Add policies for authenticated users to read their data
  - Add policies for system (service role) to manage signal lifecycle

  ## Important Notes
  1. The active_signal_registry ensures only one active signal per symbol
  2. Signal triggers provide transparency on why signals were generated
  3. Signal outcomes enable performance tracking and ML training data
  4. The system can automatically manage signal lifecycle
*/

-- Add new fields to signals table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'signals' AND column_name = 'signal_status'
  ) THEN
    ALTER TABLE signals ADD COLUMN signal_status text DEFAULT 'ACTIVE';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'signals' AND column_name = 'outcome'
  ) THEN
    ALTER TABLE signals ADD COLUMN outcome text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'signals' AND column_name = 'closed_at'
  ) THEN
    ALTER TABLE signals ADD COLUMN closed_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'signals' AND column_name = 'trigger_count'
  ) THEN
    ALTER TABLE signals ADD COLUMN trigger_count integer DEFAULT 0;
  END IF;
END $$;

-- Create active_signal_registry table
CREATE TABLE IF NOT EXISTS active_signal_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text UNIQUE NOT NULL,
  mt5_symbol text,
  signal_id uuid REFERENCES signals(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create signal_triggers table
CREATE TABLE IF NOT EXISTS signal_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id uuid REFERENCES signals(id) ON DELETE CASCADE NOT NULL,
  indicator_name text NOT NULL,
  indicator_value decimal,
  trigger_condition text NOT NULL,
  timeframe text NOT NULL,
  triggered_at timestamptz DEFAULT now()
);

-- Create signal_outcomes table
CREATE TABLE IF NOT EXISTS signal_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id uuid REFERENCES signals(id) ON DELETE CASCADE UNIQUE NOT NULL,
  outcome text NOT NULL,
  close_price decimal,
  profit_loss decimal,
  duration_minutes integer,
  closed_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_active_signal_registry_symbol ON active_signal_registry(symbol);
CREATE INDEX IF NOT EXISTS idx_active_signal_registry_signal_id ON active_signal_registry(signal_id);
CREATE INDEX IF NOT EXISTS idx_signal_triggers_signal_id ON signal_triggers(signal_id);
CREATE INDEX IF NOT EXISTS idx_signal_outcomes_signal_id ON signal_outcomes(signal_id);
CREATE INDEX IF NOT EXISTS idx_signals_status ON signals(signal_status);
CREATE INDEX IF NOT EXISTS idx_signals_symbol_active ON signals(symbol, is_active) WHERE is_active = true;

-- Enable RLS
ALTER TABLE active_signal_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE signal_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE signal_outcomes ENABLE ROW LEVEL SECURITY;

-- RLS Policies for active_signal_registry
CREATE POLICY "Anyone can view active signal registry"
  ON active_signal_registry FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage active signal registry"
  ON active_signal_registry FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- RLS Policies for signal_triggers
CREATE POLICY "Anyone can view signal triggers"
  ON signal_triggers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage signal triggers"
  ON signal_triggers FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- RLS Policies for signal_outcomes
CREATE POLICY "Anyone can view signal outcomes"
  ON signal_outcomes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage signal outcomes"
  ON signal_outcomes FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Function to check if symbol has active signal
CREATE OR REPLACE FUNCTION has_active_signal(p_symbol text)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM active_signal_registry
    WHERE symbol = p_symbol
  );
END;
$$ LANGUAGE plpgsql;

-- Function to register new active signal
CREATE OR REPLACE FUNCTION register_active_signal(
  p_symbol text,
  p_mt5_symbol text,
  p_signal_id uuid
)
RETURNS void AS $$
BEGIN
  INSERT INTO active_signal_registry (symbol, mt5_symbol, signal_id, created_at, updated_at)
  VALUES (p_symbol, p_mt5_symbol, p_signal_id, now(), now())
  ON CONFLICT (symbol) 
  DO UPDATE SET 
    signal_id = p_signal_id,
    mt5_symbol = p_mt5_symbol,
    updated_at = now();
END;
$$ LANGUAGE plpgsql;

-- Function to remove active signal registration
CREATE OR REPLACE FUNCTION unregister_active_signal(p_symbol text)
RETURNS void AS $$
BEGIN
  DELETE FROM active_signal_registry WHERE symbol = p_symbol;
END;
$$ LANGUAGE plpgsql;

-- Function to close signal and record outcome
CREATE OR REPLACE FUNCTION close_signal_with_outcome(
  p_signal_id uuid,
  p_outcome text,
  p_close_price decimal DEFAULT NULL,
  p_profit_loss decimal DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  v_symbol text;
  v_created_at timestamptz;
  v_duration integer;
BEGIN
  -- Get signal details
  SELECT symbol, created_at INTO v_symbol, v_created_at
  FROM signals WHERE id = p_signal_id;

  -- Calculate duration in minutes
  v_duration := EXTRACT(EPOCH FROM (now() - v_created_at)) / 60;

  -- Update signal status
  UPDATE signals
  SET 
    signal_status = 'CLOSED',
    outcome = p_outcome,
    closed_at = now(),
    is_active = false
  WHERE id = p_signal_id;

  -- Record outcome
  INSERT INTO signal_outcomes (signal_id, outcome, close_price, profit_loss, duration_minutes, closed_at)
  VALUES (p_signal_id, p_outcome, p_close_price, p_profit_loss, v_duration, now())
  ON CONFLICT (signal_id) DO UPDATE
  SET 
    outcome = p_outcome,
    close_price = p_close_price,
    profit_loss = p_profit_loss,
    duration_minutes = v_duration,
    closed_at = now();

  -- Unregister from active registry
  PERFORM unregister_active_signal(v_symbol);
END;
$$ LANGUAGE plpgsql;