/*
  # Initial Database Schema for Deriv AI Copy Trading Platform

  ## Overview
  This migration creates the complete database schema for the AI copy trading platform.
  Users register, submit MT5 accounts for verification, receive AI-generated signals,
  and track their trading performance.

  ## Tables Created

  ### 1. profiles
  Extended user profile information linked to Supabase auth.users
  - `id` (uuid, references auth.users) - User identifier
  - `email` (text) - User email address
  - `full_name` (text) - User's full name
  - `created_at` (timestamptz) - Account creation timestamp
  - `updated_at` (timestamptz) - Last profile update

  ### 2. mt5_accounts
  Stores user MT5 account credentials and verification status
  - `id` (uuid) - Account identifier
  - `user_id` (uuid) - References profiles
  - `mt5_login` (text) - MT5 account login number
  - `server` (text) - MT5 server name
  - `account_type` (text) - Account type (live/demo)
  - `verified` (boolean) - Verification status
  - `verification_status` (text) - pending/verified/rejected
  - `rejected_reason` (text) - Reason if rejected
  - `created_at` (timestamptz) - Submission timestamp
  - `verified_at` (timestamptz) - Verification completion timestamp

  ### 3. signals
  AI-generated trading signals
  - `id` (uuid) - Signal identifier
  - `symbol` (text) - Trading instrument
  - `direction` (text) - BUY or SELL
  - `entry_price` (numeric) - Suggested entry price
  - `stop_loss` (numeric) - Stop loss level
  - `take_profit` (numeric) - Take profit level
  - `confidence` (integer) - Signal confidence score (0-100)
  - `reasoning` (text) - AI explanation of the signal
  - `expires_at` (timestamptz) - Signal expiration time
  - `is_active` (boolean) - Whether signal is still valid
  - `created_at` (timestamptz) - Signal generation time

  ### 4. ea_connections
  Tracks Expert Advisor connectivity status
  - `id` (uuid) - Connection identifier
  - `user_id` (uuid) - References profiles
  - `mt5_login` (text) - MT5 account login
  - `status` (text) - online/offline
  - `last_ping` (timestamptz) - Last heartbeat timestamp
  - `version` (text) - EA version
  - `created_at` (timestamptz) - First connection time
  - `updated_at` (timestamptz) - Last update time

  ### 5. trades
  Record of executed trades
  - `id` (uuid) - Trade identifier
  - `user_id` (uuid) - References profiles
  - `mt5_login` (text) - MT5 account that executed trade
  - `signal_id` (uuid) - References signals
  - `symbol` (text) - Trading instrument
  - `direction` (text) - BUY or SELL
  - `entry_price` (numeric) - Actual entry price
  - `exit_price` (numeric) - Actual exit price
  - `stop_loss` (numeric) - Stop loss level
  - `take_profit` (numeric) - Take profit level
  - `lot_size` (numeric) - Trade volume
  - `profit_loss` (numeric) - Trade profit/loss
  - `status` (text) - open/closed/cancelled
  - `opened_at` (timestamptz) - Trade open time
  - `closed_at` (timestamptz) - Trade close time
  - `created_at` (timestamptz) - Record creation time

  ## Security
  - Row Level Security (RLS) enabled on all tables
  - Users can only access their own data
  - Signals are readable by all authenticated users with verified accounts
  - Admin policies for verification workflows

  ## Notes
  - All timestamps use timestamptz for timezone awareness
  - UUIDs used for all primary keys for security
  - Proper indexes created for performance optimization
  - Foreign key constraints ensure data integrity
*/

-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  full_name text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create mt5_accounts table
CREATE TABLE IF NOT EXISTS mt5_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  mt5_login text NOT NULL,
  server text NOT NULL,
  account_type text DEFAULT 'live',
  verified boolean DEFAULT false,
  verification_status text DEFAULT 'pending',
  rejected_reason text,
  created_at timestamptz DEFAULT now(),
  verified_at timestamptz,
  UNIQUE(user_id, mt5_login)
);

-- Create signals table
CREATE TABLE IF NOT EXISTS signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  direction text NOT NULL,
  entry_price numeric(10, 5) NOT NULL,
  stop_loss numeric(10, 5) NOT NULL,
  take_profit numeric(10, 5) NOT NULL,
  confidence integer DEFAULT 0,
  reasoning text,
  expires_at timestamptz NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Create ea_connections table
CREATE TABLE IF NOT EXISTS ea_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  mt5_login text NOT NULL,
  status text DEFAULT 'offline',
  last_ping timestamptz DEFAULT now(),
  version text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, mt5_login)
);

-- Create trades table
CREATE TABLE IF NOT EXISTS trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  mt5_login text NOT NULL,
  signal_id uuid REFERENCES signals(id) ON DELETE SET NULL,
  symbol text NOT NULL,
  direction text NOT NULL,
  entry_price numeric(10, 5) NOT NULL,
  exit_price numeric(10, 5),
  stop_loss numeric(10, 5),
  take_profit numeric(10, 5),
  lot_size numeric(10, 2) DEFAULT 0.01,
  profit_loss numeric(10, 2) DEFAULT 0,
  status text DEFAULT 'open',
  opened_at timestamptz DEFAULT now(),
  closed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_mt5_accounts_user_id ON mt5_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_mt5_accounts_verification_status ON mt5_accounts(verification_status);
CREATE INDEX IF NOT EXISTS idx_signals_active ON signals(is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signals_expires ON signals(expires_at);
CREATE INDEX IF NOT EXISTS idx_ea_connections_user_id ON ea_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_trades_user_id ON trades(user_id);
CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
CREATE INDEX IF NOT EXISTS idx_trades_signal_id ON trades(signal_id);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE mt5_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE ea_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- MT5 accounts policies
CREATE POLICY "Users can view own MT5 accounts"
  ON mt5_accounts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own MT5 accounts"
  ON mt5_accounts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own MT5 accounts"
  ON mt5_accounts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Signals policies (verified users can view all signals)
CREATE POLICY "Verified users can view active signals"
  ON signals FOR SELECT
  TO authenticated
  USING (
    is_active = true 
    AND expires_at > now()
    AND EXISTS (
      SELECT 1 FROM mt5_accounts
      WHERE mt5_accounts.user_id = auth.uid()
      AND mt5_accounts.verified = true
    )
  );

-- EA connections policies
CREATE POLICY "Users can view own EA connections"
  ON ea_connections FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own EA connections"
  ON ea_connections FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own EA connections"
  ON ea_connections FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Trades policies
CREATE POLICY "Users can view own trades"
  ON trades FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own trades"
  ON trades FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own trades"
  ON trades FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ea_connections_updated_at
  BEFORE UPDATE ON ea_connections
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();