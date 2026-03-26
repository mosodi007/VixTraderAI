-- Pending setups: AI-suggested entry/SL/TP; signal created only when price reaches suggested_entry.
CREATE TABLE IF NOT EXISTS pending_setups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('BUY', 'SELL')),
  suggested_entry numeric NOT NULL,
  stop_loss numeric NOT NULL,
  take_profit numeric NOT NULL,
  manipulation_high numeric,
  manipulation_low numeric,
  atr numeric,
  reasoning text,
  confidence integer DEFAULT 0,
  trigger_summary text,
  technical_indicators jsonb DEFAULT '{}',
  timeframe text DEFAULT 'M1',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'converted', 'expired', 'cancelled')),
  signal_id uuid REFERENCES signals(id)
);

CREATE INDEX IF NOT EXISTS idx_pending_setups_status ON pending_setups(status);
CREATE INDEX IF NOT EXISTS idx_pending_setups_symbol ON pending_setups(symbol);
CREATE INDEX IF NOT EXISTS idx_pending_setups_expires_at ON pending_setups(expires_at);

ALTER TABLE pending_setups ENABLE ROW LEVEL SECURITY;

-- Service role and backend need full access; authenticated users can read (e.g. for "upcoming" UI).
CREATE POLICY "Allow authenticated read pending_setups"
  ON pending_setups FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow service role all pending_setups"
  ON pending_setups FOR ALL TO service_role USING (true) WITH CHECK (true);
