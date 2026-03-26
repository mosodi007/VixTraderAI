/*
  # Schedule auto-generate-signals every 5 minutes (was 1 minute)

  - Unschedule the 1-minute pg_cron job
  - Schedule auto-generate-signals every 5 minutes
  - Set scan_schedule.scan_interval_minutes = 5 for Live Analysis countdown
*/

-- Remove 1-minute cron job
DO $$
BEGIN
  PERFORM cron.unschedule('auto-generate-signals-every-1min');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Remove any existing 5-minute job with this name so schedule is idempotent
DO $$
BEGIN
  PERFORM cron.unschedule('auto-generate-signals-every-5min');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Schedule signal generation every 5 minutes
SELECT cron.schedule(
  'auto-generate-signals-every-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://qqkhcvkodbogjsbichrw.supabase.co/functions/v1/auto-generate-signals',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- Align scan_schedule with 5-minute interval
UPDATE scan_schedule
SET scan_interval_minutes = 5,
    next_scan_at = now() + interval '5 minutes',
    updated_at = now()
WHERE id = '00000000-0000-0000-0000-000000000001';
