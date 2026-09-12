/*
  # PDF Storage System for Daily Reports

  1. New Tables
    - `daily_report_pdfs` - Stores PDF metadata and structured data
    - Creates storage bucket for PDF files
    
  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users
    - Storage policies for PDF uploads
    
  3. Storage Setup
    - Create daily-reports bucket
    - Set up proper access policies
*/

-- Create storage bucket for daily report PDFs
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'daily-reports',
  'daily-reports',
  false,
  52428800, -- 50MB limit
  ARRAY['application/pdf']
) ON CONFLICT (id) DO NOTHING;

-- Create daily_report_pdfs table with structured data storage
CREATE TABLE IF NOT EXISTS daily_report_pdfs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date date NOT NULL UNIQUE,
  pdf_path text NOT NULL,
  file_name text NOT NULL,
  file_size bigint DEFAULT 0 CHECK (file_size >= 0),
  
  -- Store structured data for easy conversion back to table
  report_data jsonb NOT NULL DEFAULT '[]'::jsonb,
  credits_data jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Additional metadata
  metadata jsonb DEFAULT '{}'::jsonb
);

-- Enable RLS
ALTER TABLE daily_report_pdfs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for daily_report_pdfs
CREATE POLICY "Users can insert their own PDF reports"
  ON daily_report_pdfs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "All authenticated users can read PDF reports"
  ON daily_report_pdfs
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update their own PDF reports"
  ON daily_report_pdfs
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Admins can delete PDF reports"
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

-- Storage policies for the daily-reports bucket
CREATE POLICY "Users can upload PDFs to their own folder"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'daily-reports' AND
    (storage.foldername(name))[1] = auth.uid()::text AND
    (storage.extension(name)) = 'pdf'
  );

CREATE POLICY "Users can view all PDF reports"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'daily-reports');

CREATE POLICY "Users can update their own PDF files"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'daily-reports' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Admins can delete PDF files"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'daily-reports' AND
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
  );

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_daily_report_pdfs_date ON daily_report_pdfs(report_date);
CREATE INDEX IF NOT EXISTS idx_daily_report_pdfs_created_by ON daily_report_pdfs(created_by);
CREATE INDEX IF NOT EXISTS idx_daily_report_pdfs_created_at ON daily_report_pdfs(created_at);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_daily_report_pdfs_updated_at
    BEFORE UPDATE ON daily_report_pdfs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();