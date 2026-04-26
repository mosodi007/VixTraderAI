/*
  Restore auto-generate-signals to 1-minute cadence for R_100 (and any monitored symbols).

  The earlier quota-reduction migration (20260402170000) set generation to every 5 minutes, which
  reduces edge invocations but also ~5x fewer opportunities for the technical detector
  to fire on a rare M5 setup — a common cause of "1–2/day" dropping to "1 every few days".

  EA-side throttling (report-account / report-positions) remains the right place to save
  most quota; signal generation should stay frequent enough to catch short-lived edges.
*/

DO $$
BEGIN
  BEGIN
    PERFORM cron.unschedule('auto-generate-signals-every-5min');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END $$;

-- One scan per minute (same name/pattern as 20260315120000_schedule_auto_signals_every_1min.sql)
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
