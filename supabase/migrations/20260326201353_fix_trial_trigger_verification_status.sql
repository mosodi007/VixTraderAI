/*
  # Fix Trial Trigger - Handle All Verification Statuses

  1. Changes
    - Update trigger function to recognize 'verified' status in addition to 'approved'
    - Ensures trial starts when MT5 account is verified with any valid status

  2. Security
    - Maintains existing RLS policies
    - Function remains SECURITY DEFINER for proper permission handling
*/

-- Update function to handle both 'approved' and 'verified' statuses
CREATE OR REPLACE FUNCTION start_free_trial_on_mt5_connection()
RETURNS TRIGGER AS $$
BEGIN
  -- Only activate trial if MT5 account is verified/approved and user hasn't started trial yet
  IF (NEW.verification_status IN ('approved', 'verified') OR NEW.verified = true) THEN
    UPDATE profiles
    SET
      subscription_status = 'trialing',
      trial_started_at = COALESCE(trial_started_at, NOW()),
      trial_ends_at = COALESCE(trial_ends_at, NOW() + INTERVAL '3 days')
    WHERE id = NEW.user_id
      AND (subscription_status IS NULL OR subscription_status = 'inactive')
      AND trial_started_at IS NULL
      AND (stripe_customer_id IS NULL OR stripe_customer_id = '');
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
