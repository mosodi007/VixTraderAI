/*
  Per-user email signal notifications toggle.
  Default is disabled.
*/

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS email_signals_enabled boolean NOT NULL DEFAULT false;

UPDATE profiles
SET email_signals_enabled = false
WHERE email_signals_enabled IS NULL;

