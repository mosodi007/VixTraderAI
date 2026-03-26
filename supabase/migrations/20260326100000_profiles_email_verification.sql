/*
  Custom email verification (Resend-based).

  - email_verified_at: set when user clicks the verification link
  - email_verification_token: random token sent via email
  - email_verification_expires_at: expiry timestamp for the token
*/

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS email_verified_at timestamptz NULL,
ADD COLUMN IF NOT EXISTS email_verification_token text UNIQUE,
ADD COLUMN IF NOT EXISTS email_verification_expires_at timestamptz NULL;

-- Backfill existing users as verified to avoid locking them out.
-- New sign-ups will explicitly insert email_verified_at = NULL.
UPDATE profiles
SET email_verified_at = now()
WHERE email_verified_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_email_verification_expires_at
  ON profiles (email_verification_expires_at);

