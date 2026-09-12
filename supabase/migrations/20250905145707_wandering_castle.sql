/*
  # Automated Cleanup System for Old Records

  1. Functions
    - `cleanup_old_paid_credits()` - Deletes paid credits older than 3 months
    - `cleanup_old_daily_reports()` - Deletes daily reports older than 6 months
    - `run_weekly_cleanup()` - Main cleanup function that runs both cleanups

  2. Scheduled Jobs
    - Weekly cleanup job using pg_cron extension
    - Runs every Sunday at 2 AM

  3. Logging
    - Creates cleanup_logs table to track cleanup operations
    - Records what was deleted and when
*/

-- Enable pg_cron extension for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create cleanup logs table
CREATE TABLE IF NOT EXISTS cleanup_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cleanup_type text NOT NULL,
  records_deleted integer DEFAULT 0,
  cleanup_date timestamptz DEFAULT now(),
  details jsonb,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on cleanup_logs
ALTER TABLE cleanup_logs ENABLE ROW LEVEL SECURITY;

-- Policy for cleanup_logs (admins can read, system can insert)
CREATE POLICY "Admins can read cleanup logs"
  ON cleanup_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "System can insert cleanup logs"
  ON cleanup_logs
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Function to cleanup old paid credits (3+ months old)
CREATE OR REPLACE FUNCTION cleanup_old_paid_credits()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count integer := 0;
  cutoff_date date;
BEGIN
  -- Calculate cutoff date (3 months ago)
  cutoff_date := CURRENT_DATE - INTERVAL '3 months';
  
  -- Delete paid credits older than 3 months
  WITH deleted AS (
    DELETE FROM credits 
    WHERE status = 'paid' 
    AND created_at::date <= cutoff_date
    RETURNING id
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;
  
  -- Log the cleanup operation
  INSERT INTO cleanup_logs (cleanup_type, records_deleted, details)
  VALUES (
    'paid_credits',
    deleted_count,
    jsonb_build_object(
      'cutoff_date', cutoff_date,
      'criteria', 'status = paid AND created_at <= cutoff_date'
    )
  );
  
  RETURN deleted_count;
END;
$$;

-- Function to cleanup old daily reports (6+ months old)
CREATE OR REPLACE FUNCTION cleanup_old_daily_reports()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count integer := 0;
  cutoff_date date;
BEGIN
  -- Calculate cutoff date (6 months ago)
  cutoff_date := CURRENT_DATE - INTERVAL '6 months';
  
  -- Delete daily reports older than 6 months
  WITH deleted AS (
    DELETE FROM daily_reports_storage 
    WHERE report_date <= cutoff_date
    RETURNING id
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;
  
  -- Log the cleanup operation
  INSERT INTO cleanup_logs (cleanup_type, records_deleted, details)
  VALUES (
    'daily_reports',
    deleted_count,
    jsonb_build_object(
      'cutoff_date', cutoff_date,
      'criteria', 'report_date <= cutoff_date'
    )
  );
  
  RETURN deleted_count;
END;
$$;

-- Main weekly cleanup function
CREATE OR REPLACE FUNCTION run_weekly_cleanup()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  credits_deleted integer := 0;
  reports_deleted integer := 0;
  cleanup_result jsonb;
BEGIN
  -- Run credit cleanup
  SELECT cleanup_old_paid_credits() INTO credits_deleted;
  
  -- Run daily reports cleanup
  SELECT cleanup_old_daily_reports() INTO reports_deleted;
  
  -- Create summary result
  cleanup_result := jsonb_build_object(
    'timestamp', now(),
    'credits_deleted', credits_deleted,
    'reports_deleted', reports_deleted,
    'total_deleted', credits_deleted + reports_deleted
  );
  
  -- Log the overall cleanup
  INSERT INTO cleanup_logs (cleanup_type, records_deleted, details)
  VALUES (
    'weekly_cleanup_summary',
    credits_deleted + reports_deleted,
    cleanup_result
  );
  
  RETURN cleanup_result;
END;
$$;

-- Schedule weekly cleanup (every Sunday at 2 AM)
-- Note: This requires pg_cron extension and superuser privileges
-- If pg_cron is not available, this can be handled by application-level cron jobs
DO $$
BEGIN
  -- Try to schedule the job, but don't fail if pg_cron is not available
  BEGIN
    PERFORM cron.schedule(
      'weekly-cleanup',
      '0 2 * * 0', -- Every Sunday at 2 AM
      'SELECT run_weekly_cleanup();'
    );
  EXCEPTION WHEN OTHERS THEN
    -- Log that scheduling failed (pg_cron might not be available)
    RAISE NOTICE 'Could not schedule weekly cleanup job. pg_cron extension may not be available.';
  END;
END;
$$;

-- Create indexes for better cleanup performance
CREATE INDEX IF NOT EXISTS idx_credits_status_created_at 
  ON credits (status, created_at) 
  WHERE status = 'paid';

CREATE INDEX IF NOT EXISTS idx_daily_reports_storage_report_date 
  ON daily_reports_storage (report_date);

CREATE INDEX IF NOT EXISTS idx_cleanup_logs_cleanup_date 
  ON cleanup_logs (cleanup_date);

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION cleanup_old_paid_credits() TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_old_daily_reports() TO service_role;
GRANT EXECUTE ON FUNCTION run_weekly_cleanup() TO service_role;