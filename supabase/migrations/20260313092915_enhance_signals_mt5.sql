/*
  # Enhanced Signals Schema for MT5 Trading

  ## Overview
  This migration enhances the signals table to support professional MT5 trading with:
  - MT5-compatible symbol formatting
  - Pip-based calculations for forex pairs
  - Timeframe-based expiration logic
  - Advanced confidence scoring
  - Market context and AI reasoning
  - Risk-reward ratio tracking

  ## Changes Made

  ### 1. New Columns Added to signals table
  - `timeframe` (text) - Trading timeframe (M1, M5, M15, M30, H1, H4, D1)
  - `mt5_symbol` (text) - MT5-formatted symbol (e.g., EURUSD, XAUUSD)
  - `pip_stop_loss` (numeric) - Stop loss in pips
  - `pip_take_profit` (numeric) - Take profit in pips
  - `risk_reward_ratio` (numeric) - RR ratio (e.g., 1:2, 1:3)
  - `market_context` (text) - Current market conditions
  - `confidence_percentage` (integer) - Confidence as percentage (0-100)
  - `ai_model_version` (text) - AI model version used
  - `technical_indicators` (jsonb) - Technical analysis indicators used
  - `signal_type` (text) - breakout/reversal/trend/scalp

  ### 2. Indexes
  - Index on timeframe for filtering
  - Index on mt5_symbol for symbol-based queries
  - Index on confidence_percentage for quality filtering
  - Index on signal_type for categorization

  ## Security
  - Existing RLS policies remain unchanged
  - New columns accessible via existing policies

  ## Notes
  - Backward compatible with existing signals
  - Default values ensure old records remain valid
  - JSONB for flexible technical indicator storage
*/

-- Add new columns to signals table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'signals' AND column_name = 'timeframe'
  ) THEN
    ALTER TABLE signals ADD COLUMN timeframe text DEFAULT 'M15';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'signals' AND column_name = 'mt5_symbol'
  ) THEN
    ALTER TABLE signals ADD COLUMN mt5_symbol text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'signals' AND column_name = 'pip_stop_loss'
  ) THEN
    ALTER TABLE signals ADD COLUMN pip_stop_loss numeric(10, 2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'signals' AND column_name = 'pip_take_profit'
  ) THEN
    ALTER TABLE signals ADD COLUMN pip_take_profit numeric(10, 2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'signals' AND column_name = 'risk_reward_ratio'
  ) THEN
    ALTER TABLE signals ADD COLUMN risk_reward_ratio numeric(10, 2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'signals' AND column_name = 'market_context'
  ) THEN
    ALTER TABLE signals ADD COLUMN market_context text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'signals' AND column_name = 'confidence_percentage'
  ) THEN
    ALTER TABLE signals ADD COLUMN confidence_percentage integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'signals' AND column_name = 'ai_model_version'
  ) THEN
    ALTER TABLE signals ADD COLUMN ai_model_version text DEFAULT 'v1.0';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'signals' AND column_name = 'technical_indicators'
  ) THEN
    ALTER TABLE signals ADD COLUMN technical_indicators jsonb DEFAULT '{}'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'signals' AND column_name = 'signal_type'
  ) THEN
    ALTER TABLE signals ADD COLUMN signal_type text DEFAULT 'trend';
  END IF;
END $$;

-- Create indexes for enhanced queries
CREATE INDEX IF NOT EXISTS idx_signals_timeframe ON signals(timeframe);
CREATE INDEX IF NOT EXISTS idx_signals_mt5_symbol ON signals(mt5_symbol);
CREATE INDEX IF NOT EXISTS idx_signals_confidence ON signals(confidence_percentage DESC);
CREATE INDEX IF NOT EXISTS idx_signals_type ON signals(signal_type);
CREATE INDEX IF NOT EXISTS idx_signals_symbol_active ON signals(symbol, is_active, created_at DESC);

-- Create function to calculate pip value for different instruments
CREATE OR REPLACE FUNCTION calculate_pip_value(
  p_symbol text,
  p_price1 numeric,
  p_price2 numeric
)
RETURNS numeric AS $$
DECLARE
  v_pip_size numeric;
  v_pips numeric;
BEGIN
  -- Determine pip size based on symbol type
  IF p_symbol LIKE '%JPY%' THEN
    -- JPY pairs have 2 decimal places (0.01 = 1 pip)
    v_pip_size := 0.01;
  ELSIF p_symbol LIKE 'XAU%' OR p_symbol LIKE 'XAG%' THEN
    -- Gold and Silver have 2 decimal places (0.01 = 1 pip)
    v_pip_size := 0.01;
  ELSE
    -- Most forex pairs have 4 decimal places (0.0001 = 1 pip)
    v_pip_size := 0.0001;
  END IF;

  -- Calculate pips
  v_pips := ABS(p_price1 - p_price2) / v_pip_size;

  RETURN v_pips;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Create function to calculate risk-reward ratio
CREATE OR REPLACE FUNCTION calculate_risk_reward(
  p_entry numeric,
  p_stop_loss numeric,
  p_take_profit numeric,
  p_direction text
)
RETURNS numeric AS $$
DECLARE
  v_risk numeric;
  v_reward numeric;
BEGIN
  IF p_direction = 'BUY' THEN
    v_risk := p_entry - p_stop_loss;
    v_reward := p_take_profit - p_entry;
  ELSE
    v_risk := p_stop_loss - p_entry;
    v_reward := p_entry - p_take_profit;
  END IF;

  -- Avoid division by zero
  IF v_risk <= 0 THEN
    RETURN 0;
  END IF;

  RETURN ROUND(v_reward / v_risk, 2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;
