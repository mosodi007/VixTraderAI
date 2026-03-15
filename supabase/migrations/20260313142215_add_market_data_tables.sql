/*
  # Add Market Data and Analysis Tables

  1. New Tables
    - `market_snapshots`
      - `id` (uuid, primary key)
      - `symbol` (text)
      - `price` (numeric)
      - `high` (numeric)
      - `low` (numeric)
      - `average` (numeric)
      - `tick_count` (integer)
      - `timestamp` (timestamptz)
      - `created_at` (timestamptz)

    - `market_analysis_history`
      - `id` (uuid, primary key)
      - `symbol` (text)
      - `current_price` (numeric)
      - `rsi` (numeric)
      - `macd_value` (numeric)
      - `macd_signal` (numeric)
      - `macd_histogram` (numeric)
      - `trend` (text)
      - `volatility` (text)
      - `recommendation` (text)
      - `confidence` (integer)
      - `support_levels` (jsonb)
      - `resistance_levels` (jsonb)
      - `analysis_text` (text)
      - `created_at` (timestamptz)

    - `signal_performance`
      - `id` (uuid, primary key)
      - `signal_id` (uuid, foreign key to signals)
      - `entry_filled` (boolean)
      - `exit_filled` (boolean)
      - `actual_entry_price` (numeric)
      - `actual_exit_price` (numeric)
      - `profit_loss` (numeric)
      - `profit_loss_pips` (numeric)
      - `duration_minutes` (integer)
      - `outcome` (text)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users to read data
    - Signals table is public (no user_id column)

  3. Indexes
    - Add indexes on symbol and timestamp columns for efficient querying
*/

CREATE TABLE IF NOT EXISTS market_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  price numeric NOT NULL,
  high numeric NOT NULL,
  low numeric NOT NULL,
  average numeric NOT NULL,
  tick_count integer NOT NULL DEFAULT 0,
  timestamp timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_market_snapshots_symbol ON market_snapshots(symbol);
CREATE INDEX IF NOT EXISTS idx_market_snapshots_timestamp ON market_snapshots(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_market_snapshots_symbol_timestamp ON market_snapshots(symbol, timestamp DESC);

ALTER TABLE market_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read market snapshots"
  ON market_snapshots FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service can insert market snapshots"
  ON market_snapshots FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE TABLE IF NOT EXISTS market_analysis_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  current_price numeric NOT NULL,
  rsi numeric,
  macd_value numeric,
  macd_signal numeric,
  macd_histogram numeric,
  trend text,
  volatility text,
  recommendation text,
  confidence integer,
  support_levels jsonb DEFAULT '[]'::jsonb,
  resistance_levels jsonb DEFAULT '[]'::jsonb,
  analysis_text text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_market_analysis_symbol ON market_analysis_history(symbol);
CREATE INDEX IF NOT EXISTS idx_market_analysis_created ON market_analysis_history(created_at DESC);

ALTER TABLE market_analysis_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read market analysis"
  ON market_analysis_history FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service can insert market analysis"
  ON market_analysis_history FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE TABLE IF NOT EXISTS signal_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id uuid REFERENCES signals(id) ON DELETE CASCADE,
  entry_filled boolean DEFAULT false,
  exit_filled boolean DEFAULT false,
  actual_entry_price numeric,
  actual_exit_price numeric,
  profit_loss numeric,
  profit_loss_pips numeric,
  duration_minutes integer,
  outcome text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signal_performance_signal_id ON signal_performance(signal_id);
CREATE INDEX IF NOT EXISTS idx_signal_performance_outcome ON signal_performance(outcome);

ALTER TABLE signal_performance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read signal performance"
  ON signal_performance FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service can insert signal performance"
  ON signal_performance FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Service can update signal performance"
  ON signal_performance FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
