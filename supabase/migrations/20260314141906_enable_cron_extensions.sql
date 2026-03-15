/*
  # Enable pg_cron and pg_net Extensions
  
  1. Extensions
    - Enable pg_cron for scheduled job execution
    - Enable pg_net for making HTTP requests from database functions
  
  2. Purpose
    - Allows database to run scheduled tasks automatically
    - Enables calling edge functions from within the database
    - Required for automated signal generation every 5 minutes
*/

-- Enable pg_cron for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Enable pg_net for HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
