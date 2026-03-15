/*
  # Schedule auto-generate-signals every 1 minute and set scan_schedule to 1 min

  - Unschedule the existing 5-minute job
  - Schedule auto-generate-signals every 1 minute (aligns with M1 / 60-sec analysis)
  - Set scan_schedule.scan_interval_minutes = 1 for Live Analysis countdown
*/

-- Remove old cron job (5-minute interval)
DO $$
BEGIN
  PERFORM cron.unschedule('auto-generate-signals-every-5min');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Schedule signal generation every 1 minute
SELECT cron.schedule(
  'auto-generate-signals-every-1min',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://qqkhcvkodbogjsbichrw.supabase.co/functions/v1/auto-generate-signals',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- Set scan_schedule to 1-minute interval for Live Analysis countdown
UPDATE scan_schedule
SET scan_interval_minutes = 1,
    updated_at = now()
WHERE id = '00000000-0000-0000-0000-000000000001';
