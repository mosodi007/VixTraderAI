/*
  # Allow all authenticated users to view signals (no MT5 verification required)

  Removes the requirement for a verified MT5 account to see active and past signals.
  Any logged-in user can now view signals on Deriv Live Signals and Past Signals pages.
*/

-- Drop the policy that required verified MT5 to view active signals
DROP POLICY IF EXISTS "Verified users can view active signals" ON signals;

-- Allow any authenticated user to view active signals
CREATE POLICY "Authenticated users can view active signals"
  ON signals
  FOR SELECT
  TO authenticated
  USING (
    is_active = true
    AND expires_at > now()
  );

-- Drop the policy that required verified MT5 to view past signals
DROP POLICY IF EXISTS "Verified users can view past signals" ON signals;

-- Allow any authenticated user to view past/closed signals
CREATE POLICY "Authenticated users can view past signals"
  ON signals
  FOR SELECT
  TO authenticated
  USING (outcome IS NOT NULL);
