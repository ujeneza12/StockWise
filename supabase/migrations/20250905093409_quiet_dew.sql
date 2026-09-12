/*
  # Create Daily Report PDFs Storage System

  1. New Tables
    - `daily_report_pdfs` - Store PDF metadata and references
      - `id` (uuid, primary key)
      - `report_date` (date) - the date this report represents
      - `pdf_path` (text) - path to PDF file in Supabase Storage
      - `file_name` (text) - original filename
      - `file_size` (bigint) - file size in bytes
      - `created_by` (uuid) - who generated the report
      - `created_at` (timestamp) - when PDF was created
      - `metadata` (jsonb) - additional PDF metadata

  2. Security
    - Enable RLS on `daily_report_pdfs` table
    - Add policies for authenticated users to read/write

  3. Storage
    - Create storage bucket for daily report PDFs
    - Set up proper access policies
*/

-- Create the daily report PDFs table
CREATE TABLE IF NOT EXISTS daily_report_pdfs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date date NOT NULL UNIQUE,
  pdf_path text NOT NULL,
  file_name text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  metadata jsonb DEFAULT '{}',
  
  -- Constraints
  CONSTRAINT daily_report_pdfs_file_size_positive CHECK (file_size >= 0)
);

-- Enable RLS
ALTER TABLE daily_report_pdfs ENABLE ROW LEVEL SECURITY;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_daily_report_pdfs_date ON daily_report_pdfs(report_date);
CREATE INDEX IF NOT EXISTS idx_daily_report_pdfs_created_at ON daily_report_pdfs(created_at);
CREATE INDEX IF NOT EXISTS idx_daily_report_pdfs_created_by ON daily_report_pdfs(created_by);

-- RLS Policies
CREATE POLICY "All authenticated users can read daily report PDFs"
  ON daily_report_pdfs
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "All authenticated users can insert daily report PDFs"
  ON daily_report_pdfs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Admins and managers can update daily report PDFs"
  ON daily_report_pdfs
  FOR UPDATE
  TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'manager') OR
    auth.uid() = created_by
  );

CREATE POLICY "Admins can delete daily report PDFs"
  ON daily_report_pdfs
  FOR DELETE
  TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );

-- Create storage bucket for daily report PDFs
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'daily-report-pdfs',
  'daily-report-pdfs',
  false,
  10485760, -- 10MB limit
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for the bucket
CREATE POLICY "Authenticated users can view daily report PDFs"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'daily-report-pdfs');

CREATE POLICY "Authenticated users can upload daily report PDFs"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'daily-report-pdfs' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can update their own daily report PDFs"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'daily-report-pdfs' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Admins can delete daily report PDFs"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'daily-report-pdfs' AND
    (
      (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin' OR
      (storage.foldername(name))[1] = auth.uid()::text
    )
  );