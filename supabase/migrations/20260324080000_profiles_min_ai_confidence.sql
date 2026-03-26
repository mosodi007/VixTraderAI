/*
  Add per-user minimum AI confidence threshold (0-100).
  EA and instruction generator can use this to decide which signals to execute.
*/

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS ai_min_confidence_percent integer NOT NULL DEFAULT 50;

-- Safety backfill for any legacy rows that might be NULL
UPDATE profiles
SET ai_min_confidence_percent = 50
WHERE ai_min_confidence_percent IS NULL;

-- Optional constraint to keep values sane
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_ai_min_confidence_percent_check'
  ) THEN
    ALTER TABLE profiles
    ADD CONSTRAINT profiles_ai_min_confidence_percent_check
    CHECK (ai_min_confidence_percent >= 0 AND ai_min_confidence_percent <= 100);
  END IF;
END $$;

