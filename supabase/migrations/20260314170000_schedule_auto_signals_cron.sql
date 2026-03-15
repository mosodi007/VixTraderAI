/*
  # Schedule auto-generate-signals to run every 5 minutes (this project)

  Ensures the cron job targets this Supabase project so signals are generated
  in the background every 5 minutes. New signals appear on the Signals page
  via Realtime without opening Live Analysis.

  - Unschedule any existing job with the same or old name
  - Schedule auto-generate-signals every 5 minutes
  - Uses project URL for this project (qqkhcvkodbogjsbichrw)
  - Edge function is deployed with --no-verify-jwt so no auth header required
*/

-- Remove old cron job if it exists (may point to another project)
DO $$
BEGIN
  PERFORM cron.unschedule('auto-generate-signals-every-5min');
EXCEPTION WHEN OTHERS THEN
  NULL; -- job may not exist
END $$;

-- Schedule signal generation every 5 minutes for this project
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
