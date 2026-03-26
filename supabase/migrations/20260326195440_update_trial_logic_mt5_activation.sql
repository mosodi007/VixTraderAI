-- # Update Trial Logic - Start on MT5 Connection
--
-- 1. Changes
--    - Remove automatic trial on signup
--    - Trial starts when user connects MT5 login
--    - Add trial_started_at field to track when trial begins
--
-- 2. Fields
--    - trial_started_at: Timestamp when user activated their trial by connecting MT5
--    - Users start with no trial (subscription_status = 'inactive')
--    - Trial activates on first MT5 connection

-- Add trial_started_at field
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'trial_started_at'
  ) THEN
    ALTER TABLE profiles ADD COLUMN trial_started_at timestamptz;
  END IF;
END $$;

-- Update default subscription status to 'inactive' for new users
ALTER TABLE profiles ALTER COLUMN subscription_status SET DEFAULT 'inactive';

-- Update trial_ends_at to have no default (will be set when trial starts)
ALTER TABLE profiles ALTER COLUMN trial_ends_at DROP DEFAULT;

-- Function to start free trial when MT5 is connected
CREATE OR REPLACE FUNCTION start_free_trial_on_mt5_connection()
RETURNS TRIGGER AS $$
BEGIN
  -- Only activate trial if user doesn't have an active subscription and hasn't started trial yet
  IF NEW.verification_status = 'approved' OR NEW.verified = true THEN
    UPDATE profiles
    SET
      subscription_status = 'trialing',
      trial_started_at = COALESCE(trial_started_at, NOW()),
      trial_ends_at = COALESCE(trial_ends_at, NOW() + INTERVAL '3 days')
    WHERE id = NEW.user_id
      AND (subscription_status IS NULL OR subscription_status = 'inactive')
      AND trial_started_at IS NULL;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for demo accounts
DROP TRIGGER IF EXISTS trigger_start_trial_demo ON mt5_accounts;
CREATE TRIGGER trigger_start_trial_demo
  AFTER INSERT OR UPDATE ON mt5_accounts
  FOR EACH ROW
  WHEN (NEW.account_type = 'demo')
  EXECUTE FUNCTION start_free_trial_on_mt5_connection();

-- Create trigger for live accounts
DROP TRIGGER IF EXISTS trigger_start_trial_live ON mt5_accounts;
CREATE TRIGGER trigger_start_trial_live
  AFTER INSERT OR UPDATE ON mt5_accounts
  FOR EACH ROW
  WHEN (NEW.account_type = 'live' OR NEW.account_type = 'real')
  EXECUTE FUNCTION start_free_trial_on_mt5_connection();

-- Update existing users who have MT5 accounts but no trial
UPDATE profiles p
SET
  subscription_status = 'trialing',
  trial_started_at = COALESCE(p.trial_started_at, NOW()),
  trial_ends_at = COALESCE(p.trial_ends_at, NOW() + INTERVAL '3 days')
WHERE EXISTS (
  SELECT 1 FROM mt5_accounts m
  WHERE m.user_id = p.id
    AND (m.verified = true OR m.verification_status = 'approved')
)
AND (p.subscription_status IS NULL OR p.subscription_status = 'inactive' OR p.subscription_status = 'trialing')
AND p.trial_started_at IS NULL;