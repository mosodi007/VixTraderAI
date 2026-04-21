/*
  Reduce Edge invocations for R_100-only operation.
  - Disable non-essential check-pending-entry cron job.
  - Ensure a single auto-generate-signals cron job at 5-minute cadence.
*/

DO $$
BEGIN
  -- Disable pending-entry pipeline in R_100-only mode.
  BEGIN
    PERFORM cron.unschedule('check-pending-entry-every-1min');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- Remove duplicate/legacy auto-generate schedules first.
  BEGIN
    PERFORM cron.unschedule('auto-generate-signals-every-1min');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  BEGIN
    PERFORM cron.unschedule('auto-generate-signals-every-5min');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END $$;

-- Keep exactly one schedule at 5 minutes.
SELECT cron.schedule(
  'auto-generate-signals-every-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://qqkhcvkodbogjsbichrw.supabase.co/functions/v1/auto-generate-signals',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

