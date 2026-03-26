/*
  # Schedule update-signal-filters

  Runs every 10 minutes to adapt filter thresholds based on recent TP/SL outcomes.
*/

DO $$
BEGIN
  -- Ensure required extensions exist (pg_cron + pg_net enabled elsewhere in repo)
  PERFORM 1;
END $$;

SELECT
  cron.schedule(
    'update-signal-filters',
    '*/10 * * * *',
    $$
    SELECT
      net.http_post(
        url := 'https://qqkhcvkodbogjsbichrw.supabase.co/functions/v1/update-signal-filters',
        headers := '{"Content-Type":"application/json"}'::jsonb,
        body := '{}'::jsonb
      ) as request_id;
    $$
  );

