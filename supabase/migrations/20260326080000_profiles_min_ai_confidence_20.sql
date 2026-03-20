/*
  Update per-user minimum AI confidence threshold:
  - Default: 20
  - Cannot be lower than 20
*/

ALTER TABLE profiles
ALTER COLUMN ai_min_confidence_percent SET DEFAULT 20;

-- Backfill any legacy rows that might still be below 20.
UPDATE profiles
SET ai_min_confidence_percent = 20
WHERE ai_min_confidence_percent < 20;

-- Recreate the safety constraint with the new minimum.
ALTER TABLE profiles
DROP CONSTRAINT IF EXISTS profiles_ai_min_confidence_percent_check;

ALTER TABLE profiles
ADD CONSTRAINT profiles_ai_min_confidence_percent_check
CHECK (ai_min_confidence_percent >= 20 AND ai_min_confidence_percent <= 100);

