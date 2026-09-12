/*
  # Fix RLS policies for PDF storage

  1. Storage Bucket Setup
    - Create daily-report-pdfs storage bucket if it doesn't exist
    - Set up proper RLS policies for storage.objects table

  2. Database Table Policies
    - Fix RLS policies on daily_report_pdfs table
    - Allow authenticated users to insert their own PDF metadata
    - Allow all authenticated users to read PDF metadata

  3. Security
    - Ensure users can only upload PDFs to their own folder
    - Maintain data security while allowing proper functionality
*/

-- Create storage bucket for daily report PDFs if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'daily-report-pdfs',
  'daily-report-pdfs',
  false,
  52428800, -- 50MB limit
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS on storage.objects (should already be enabled, but ensuring it)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist to avoid conflicts
DROP POLICY IF EXISTS "Users can upload PDFs to their own folder" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own PDFs" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own PDFs" ON storage.objects;

-- Create storage policies for daily-report-pdfs bucket
CREATE POLICY "Users can upload PDFs to their own folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'daily-report-pdfs' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can view their own PDFs"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'daily-report-pdfs' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can delete their own PDFs"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'daily-report-pdfs' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Fix RLS policies on daily_report_pdfs table
-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "All authenticated users can insert daily report PDFs" ON daily_report_pdfs;
DROP POLICY IF EXISTS "All authenticated users can read daily report PDFs" ON daily_report_pdfs;
DROP POLICY IF EXISTS "Admins and managers can update daily report PDFs" ON daily_report_pdfs;
DROP POLICY IF EXISTS "Admins can delete daily report PDFs" ON daily_report_pdfs;

-- Create new policies for daily_report_pdfs table
CREATE POLICY "Users can insert their own PDF metadata"
ON daily_report_pdfs
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "All authenticated users can read PDF metadata"
ON daily_report_pdfs
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can update their own PDF metadata"
ON daily_report_pdfs
FOR UPDATE
TO authenticated
USING (auth.uid() = created_by)
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Admins can delete any PDF metadata"
ON daily_report_pdfs
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);