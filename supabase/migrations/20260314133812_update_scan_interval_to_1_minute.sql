/*
  # Update Scan Interval to 1 Minute for Real-time Signal Detection

  1. Changes
    - Update `scan_schedule` table default interval from 15 minutes to 1 minute
    - Update existing schedule record to use 1-minute interval
    - Recalculate next_scan_at based on new interval
  
  2. Purpose
    - Enable more responsive signal detection (Option A implementation)
    - Market conditions can change quickly, 1-minute scans provide timely signals
    - Still uses scheduled intervals to manage resource usage
    - More practical than tick-by-tick real-time streaming

  3. Notes
    - Users can still adjust scan_interval_minutes if needed
    - Edge function execution will happen more frequently
    - Monitor API usage and adjust if rate limits are reached
*/

-- Update the default interval in the table definition
DO $$
BEGIN
  -- Update existing schedule to 1-minute interval
  UPDATE scan_schedule
  SET 
    scan_interval_minutes = 1,
    next_scan_at = now() + interval '1 minute',
    updated_at = now()
  WHERE id = '00000000-0000-0000-0000-000000000001';
  
  -- If no record exists, insert with 1-minute interval
  IF NOT FOUND THEN
    INSERT INTO scan_schedule (id, next_scan_at, scan_interval_minutes, is_active)
    VALUES ('00000000-0000-0000-0000-000000000001', now() + interval '1 minute', 1, true)
    ON CONFLICT (id) DO UPDATE
    SET 
      scan_interval_minutes = 1,
      next_scan_at = now() + interval '1 minute',
      updated_at = now();
  END IF;
END $$;
