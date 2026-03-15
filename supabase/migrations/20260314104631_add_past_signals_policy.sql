/*
  # Add RLS policy for viewing past signals

  1. Changes
    - Add policy to allow verified users to view closed signals (outcome is not null)
    - This enables the Past Signals page to display historical signal data
  
  2. Security
    - Only authenticated users with verified MT5 accounts can view past signals
    - Users can see all closed signals to track performance and accuracy
*/

CREATE POLICY "Verified users can view past signals"
  ON signals
  FOR SELECT
  TO authenticated
  USING (
    outcome IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM mt5_accounts
      WHERE mt5_accounts.user_id = auth.uid()
      AND mt5_accounts.verified = true
    )
  );
