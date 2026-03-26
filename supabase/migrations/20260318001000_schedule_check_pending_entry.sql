/*
  # Schedule check-pending-entry Edge Function

  - Runs every 1 minute
  - Calls the check-pending-entry edge function to convert pending_setups into live signals
  - Uses pg_cron + pg_net.http_post (same pattern as auto-generate-signals)
*/

-- Create the cron job to run check-pending-entry every minute
SELECT cron.schedule(
  'check-pending-entry-every-1min',
  '* * * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://iudouyfzyxuusbkwzkte.supabase.co/functions/v1/check-pending-entry',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1ZG91eWZ6eXh1dXNia3d6a3RlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzMTI5MDAsImV4cCI6MjA4ODg4ODkwMH0.wWeyNDsq2FHw_MlnInMDvhQUn-Q-nMnGaxZzgap6Z6A"}'::jsonb,
      body := '{}'::jsonb
    ) as request_id;
  $$
);

