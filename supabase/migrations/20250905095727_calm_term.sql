/*
  # Fix Storage RLS Policies for PDF Uploads

  This migration fixes the RLS policy violations when uploading PDFs to the daily-report-pdfs bucket.
  
  1. Storage Policies
    - Allow authenticated users to upload PDFs to their own folder
    - Allow authenticated users to read PDFs they have access to
    - Allow authenticated users to delete their own PDFs
  
  2. Database Table Policies
    - Ensure proper policies exist for the daily_report_pdfs table
*/

-- First, ensure the bucket exists (in case it was created manually without proper setup)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'daily-report-pdfs',
  'daily-report-pdfs',
  false,
  10485760, -- 10MB
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Drop existing storage policies if they exist
DROP POLICY IF EXISTS "Authenticated users can upload PDFs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read PDFs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete PDFs" ON storage.objects;

-- Create storage policies for the daily-report-pdfs bucket
CREATE POLICY "Authenticated users can upload PDFs"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'daily-report-pdfs' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Authenticated users can read PDFs"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'daily-report-pdfs'
);

CREATE POLICY "Authenticated users can delete PDFs"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'daily-report-pdfs' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Ensure RLS is enabled on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Drop existing table policies if they exist
DROP POLICY IF EXISTS "All authenticated users can insert daily report PDFs" ON daily_report_pdfs;
DROP POLICY IF EXISTS "All authenticated users can read daily report PDFs" ON daily_report_pdfs;
DROP POLICY IF EXISTS "Admins and managers can update daily report PDFs" ON daily_report_pdfs;
DROP POLICY IF EXISTS "Admins can delete daily report PDFs" ON daily_report_pdfs;

-- Create proper policies for the daily_report_pdfs table
CREATE POLICY "Users can insert their own daily report PDFs"
ON daily_report_pdfs
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "All authenticated users can read daily report PDFs"
ON daily_report_pdfs
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can update their own daily report PDFs"
ON daily_report_pdfs
FOR UPDATE
TO authenticated
USING (auth.uid() = created_by)
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can delete their own daily report PDFs"
ON daily_report_pdfs
FOR DELETE
TO authenticated
USING (auth.uid() = created_by);

-- Ensure RLS is enabled on the table
ALTER TABLE daily_report_pdfs ENABLE ROW LEVEL SECURITY;