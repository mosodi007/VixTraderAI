/*
  # Signals stay active until SL or TP hit (no time-based expiry)

  - Active signals are visible to authenticated users whenever is_active = true.
  - expires_at is no longer used to hide or close signals; only SL/TP close them.
*/

DROP POLICY IF EXISTS "Authenticated users can view active signals" ON signals;

CREATE POLICY "Authenticated users can view active signals"
  ON signals
  FOR SELECT
  TO authenticated
  USING (is_active = true);
