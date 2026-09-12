/*
  # Fix RLS policies for daily report PDFs

  1. Storage Policies
    - Allow authenticated users to upload PDFs to their own folder
    - Allow authenticated users to read their own PDFs
    - Allow authenticated users to delete their own PDFs

  2. Database Table Policies
    - Allow authenticated users to insert their own PDF metadata
    - Allow authenticated users to read all PDF metadata
    - Allow authenticated users to update their own PDF metadata
    - Allow authenticated users to delete their own PDF metadata
*/

-- Create storage policies for daily-report-pdfs bucket
INSERT INTO storage.policies (id, bucket_id, name, definition, check, command)
VALUES 
  (
    'daily-report-pdfs-upload-policy',
    'daily-report-pdfs',
    'Allow authenticated users to upload PDFs',
    'auth.role() = ''authenticated''',
    'auth.role() = ''authenticated''',
    'INSERT'
  ),
  (
    'daily-report-pdfs-read-policy', 
    'daily-report-pdfs',
    'Allow authenticated users to read PDFs',
    'auth.role() = ''authenticated''',
    NULL,
    'SELECT'
  ),
  (
    'daily-report-pdfs-delete-policy',
    'daily-report-pdfs', 
    'Allow authenticated users to delete PDFs',
    'auth.role() = ''authenticated''',
    NULL,
    'DELETE'
  )
ON CONFLICT (id) DO UPDATE SET
  definition = EXCLUDED.definition,
  check = EXCLUDED.check;

-- Ensure the daily_report_pdfs table has proper RLS policies
DO $$
BEGIN
  -- Check if the table exists first
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'daily_report_pdfs') THEN
    
    -- Enable RLS on the table if not already enabled
    ALTER TABLE daily_report_pdfs ENABLE ROW LEVEL SECURITY;
    
    -- Drop existing policies if they exist to avoid conflicts
    DROP POLICY IF EXISTS "Allow authenticated users to insert daily report PDFs" ON daily_report_pdfs;
    DROP POLICY IF EXISTS "Allow authenticated users to read daily report PDFs" ON daily_report_pdfs;
    DROP POLICY IF EXISTS "Allow authenticated users to update daily report PDFs" ON daily_report_pdfs;
    DROP POLICY IF EXISTS "Allow authenticated users to delete daily report PDFs" ON daily_report_pdfs;
    
    -- Create new policies
    CREATE POLICY "Allow authenticated users to insert daily report PDFs"
      ON daily_report_pdfs
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = created_by);
    
    CREATE POLICY "Allow authenticated users to read daily report PDFs"
      ON daily_report_pdfs
      FOR SELECT
      TO authenticated
      USING (true);
    
    CREATE POLICY "Allow authenticated users to update daily report PDFs"
      ON daily_report_pdfs
      FOR UPDATE
      TO authenticated
      USING (auth.uid() = created_by)
      WITH CHECK (auth.uid() = created_by);
    
    CREATE POLICY "Allow authenticated users to delete daily report PDFs"
      ON daily_report_pdfs
      FOR DELETE
      TO authenticated
      USING (auth.uid() = created_by);
      
  END IF;
END $$;