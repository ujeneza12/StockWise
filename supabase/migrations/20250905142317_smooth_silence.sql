/*
  # Clean up storage-related tables and policies

  1. Remove Tables
    - Drop `daily_report_pdfs` table if it exists
    - Clean up any storage policies that were created

  2. Security
    - Remove any storage-related RLS policies
    - Keep existing daily_reports_storage table intact
*/

-- Drop the PDF storage table if it exists
DROP TABLE IF EXISTS daily_report_pdfs CASCADE;

-- Remove any storage policies we might have created
-- (These will only execute if the policies exist)
DO $$
BEGIN
    -- Remove storage policies for daily-reports bucket
    DROP POLICY IF EXISTS "Users can upload PDFs to own folder" ON storage.objects;
    DROP POLICY IF EXISTS "Users can view all PDFs" ON storage.objects;
    DROP POLICY IF EXISTS "Users can delete own PDFs" ON storage.objects;
    DROP POLICY IF EXISTS "Admins can delete any PDF" ON storage.objects;
EXCEPTION
    WHEN undefined_table THEN
        -- storage.objects table doesn't exist, which is fine
        NULL;
    WHEN undefined_object THEN
        -- Policy doesn't exist, which is fine
        NULL;
END $$;

-- Remove storage bucket if it exists
DO $$
BEGIN
    DELETE FROM storage.buckets WHERE id = 'daily-reports';
    DELETE FROM storage.buckets WHERE id = 'daily-report-pdfs';
EXCEPTION
    WHEN undefined_table THEN
        -- storage.buckets table doesn't exist, which is fine
        NULL;
END $$;