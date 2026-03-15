/*
  # Setup 5-Minute Automated Signal Generation
  
  1. Cron Job Configuration
    - Creates scheduled job running every 5 minutes
    - Calls auto-generate-signals edge function automatically
    - Runs 24/7 without manual intervention
    - 288 automatic scans per day
  
  2. Database Updates
    - Update scan_schedule interval from 1 minute to 5 minutes
    - Adjust next_scan_at to reflect new 5-minute intervals
  
  3. Implementation Details
    - Uses pg_cron for scheduling
    - Uses pg_net.http_post to call edge function
    - Passes authentication headers automatically
    - Logs execution to Supabase logs
  
  4. Notes
    - Cron expression means every 5 minutes
    - Edge function verifyJWT is set to false for public access
    - Function handles all 5 symbols: R_10, R_25, R_50, R_75, R_100
*/

-- First, update the scan_schedule table to reflect 5-minute intervals
UPDATE scan_schedule 
SET 
  scan_interval_minutes = 5,
  next_scan_at = now() + interval '5 minutes',
  updated_at = now()
WHERE id IN (SELECT id FROM scan_schedule LIMIT 1);

-- Create the cron job to run auto-generate-signals every 5 minutes
SELECT cron.schedule(
  'auto-generate-signals-every-5min',
  '*/5 * * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://iudouyfzyxuusbkwzkte.supabase.co/functions/v1/auto-generate-signals',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1ZG91eWZ6eXh1dXNia3d6a3RlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzMTI5MDAsImV4cCI6MjA4ODg4ODkwMH0.wWeyNDsq2FHw_MlnInMDvhQUn-Q-nMnGaxZzgap6Z6A"}'::jsonb,
      body := '{}'::jsonb
    ) as request_id;
  $$
);

-- Update the last_scan_at to current time
UPDATE scan_schedule 
SET 
  last_scan_at = now(),
  updated_at = now()
WHERE id IN (SELECT id FROM scan_schedule LIMIT 1);
