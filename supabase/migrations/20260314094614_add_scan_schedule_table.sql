/*
  # Add scan schedule tracking

  1. New Tables
    - `scan_schedule`
      - `id` (uuid, primary key)
      - `next_scan_at` (timestamptz) - When the next automated scan is scheduled
      - `last_scan_at` (timestamptz) - When the last scan completed
      - `scan_interval_minutes` (integer) - Scan interval in minutes (default 15)
      - `is_active` (boolean) - Whether automated scanning is enabled
      - `updated_at` (timestamptz) - Last update time

  2. Security
    - Enable RLS on `scan_schedule` table
    - Add policy for authenticated users to read scan schedule
    - Add policy for service role to update scan schedule

  3. Initial Data
    - Insert default schedule record with 15-minute interval
*/

CREATE TABLE IF NOT EXISTS scan_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  next_scan_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  last_scan_at timestamptz,
  scan_interval_minutes integer DEFAULT 15,
  is_active boolean DEFAULT true,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE scan_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read scan schedule"
  ON scan_schedule
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can update scan schedule"
  ON scan_schedule
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can insert scan schedule"
  ON scan_schedule
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Insert initial schedule record (if none exists)
INSERT INTO scan_schedule (id, next_scan_at, scan_interval_minutes, is_active)
VALUES ('00000000-0000-0000-0000-000000000001', now() + interval '15 minutes', 15, true)
ON CONFLICT (id) DO NOTHING;