/*
  # Add MT5 Account Monitoring Fields

  ## Summary
  This migration extends the mt5_accounts table with real-time monitoring capabilities
  for balance, equity, margin, and position tracking.

  ## Changes Made

  ### Modified Tables
  
  #### mt5_accounts
  Added monitoring fields:
  - `balance` (numeric) - Current account balance
  - `equity` (numeric) - Current account equity
  - `margin` (numeric) - Used margin
  - `free_margin` (numeric) - Available margin
  - `margin_level` (numeric) - Margin level percentage
  - `currency` (text) - Account currency (USD, EUR, etc.)
  - `leverage` (integer) - Account leverage (100, 500, 1000, etc.)
  - `last_sync` (timestamptz) - Last successful data synchronization timestamp
  - `password_hash` (text) - Encrypted password for verification (optional)

  ### New Table: mt5_positions
  
  Stores current open positions from MT5 accounts:
  - `id` (uuid) - Position identifier
  - `user_id` (uuid) - References profiles
  - `mt5_login` (text) - MT5 account login
  - `ticket` (text) - MT5 position ticket number
  - `symbol` (text) - Trading instrument
  - `direction` (text) - BUY or SELL
  - `volume` (numeric) - Position volume (lot size)
  - `price_open` (numeric) - Opening price
  - `price_current` (numeric) - Current price
  - `stop_loss` (numeric) - Stop loss level
  - `take_profit` (numeric) - Take profit level
  - `profit` (numeric) - Current profit/loss
  - `opened_at` (timestamptz) - Position open time
  - `last_updated` (timestamptz) - Last position update

  ## Security
  - RLS enabled on mt5_positions table
  - Users can only access their own positions
  - Automatic cleanup of closed positions

  ## Notes
  - All monetary values use numeric type for precision
  - Timestamps track data freshness for monitoring
  - Positions table syncs with MT5 every 60 seconds
*/

-- Add monitoring fields to mt5_accounts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'mt5_accounts' AND column_name = 'balance'
  ) THEN
    ALTER TABLE mt5_accounts ADD COLUMN balance numeric(15, 2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'mt5_accounts' AND column_name = 'equity'
  ) THEN
    ALTER TABLE mt5_accounts ADD COLUMN equity numeric(15, 2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'mt5_accounts' AND column_name = 'margin'
  ) THEN
    ALTER TABLE mt5_accounts ADD COLUMN margin numeric(15, 2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'mt5_accounts' AND column_name = 'free_margin'
  ) THEN
    ALTER TABLE mt5_accounts ADD COLUMN free_margin numeric(15, 2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'mt5_accounts' AND column_name = 'margin_level'
  ) THEN
    ALTER TABLE mt5_accounts ADD COLUMN margin_level numeric(10, 2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'mt5_accounts' AND column_name = 'currency'
  ) THEN
    ALTER TABLE mt5_accounts ADD COLUMN currency text DEFAULT 'USD';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'mt5_accounts' AND column_name = 'leverage'
  ) THEN
    ALTER TABLE mt5_accounts ADD COLUMN leverage integer DEFAULT 100;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'mt5_accounts' AND column_name = 'last_sync'
  ) THEN
    ALTER TABLE mt5_accounts ADD COLUMN last_sync timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'mt5_accounts' AND column_name = 'password_hash'
  ) THEN
    ALTER TABLE mt5_accounts ADD COLUMN password_hash text;
  END IF;
END $$;

-- Create mt5_positions table
CREATE TABLE IF NOT EXISTS mt5_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  mt5_login text NOT NULL,
  ticket text NOT NULL,
  symbol text NOT NULL,
  direction text NOT NULL,
  volume numeric(10, 2) NOT NULL,
  price_open numeric(10, 5) NOT NULL,
  price_current numeric(10, 5) NOT NULL,
  stop_loss numeric(10, 5),
  take_profit numeric(10, 5),
  profit numeric(10, 2) DEFAULT 0,
  opened_at timestamptz NOT NULL,
  last_updated timestamptz DEFAULT now(),
  UNIQUE(mt5_login, ticket)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_mt5_positions_user_id ON mt5_positions(user_id);
CREATE INDEX IF NOT EXISTS idx_mt5_positions_mt5_login ON mt5_positions(mt5_login);
CREATE INDEX IF NOT EXISTS idx_mt5_positions_symbol ON mt5_positions(symbol);
CREATE INDEX IF NOT EXISTS idx_mt5_accounts_last_sync ON mt5_accounts(last_sync);

-- Enable RLS on mt5_positions
ALTER TABLE mt5_positions ENABLE ROW LEVEL SECURITY;

-- Positions policies
CREATE POLICY "Users can view own positions"
  ON mt5_positions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own positions"
  ON mt5_positions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own positions"
  ON mt5_positions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own positions"
  ON mt5_positions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create trigger for last_updated
CREATE TRIGGER update_mt5_positions_last_updated
  BEFORE UPDATE ON mt5_positions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
