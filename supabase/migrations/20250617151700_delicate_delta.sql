-- Migration to update authentication from phone to email
-- This migration updates the profiles table to use email instead of phone_number

-- Add email column to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email text;

-- Update existing profiles to use email from auth.users if available
-- Note: We need to reference the auth schema properly
UPDATE profiles 
SET email = au.email 
FROM auth.users au
WHERE profiles.id = au.id 
AND profiles.email IS NULL;

-- For any profiles without email, set a placeholder using the user ID
UPDATE profiles 
SET email = 'user' || id::text || '@placeholder.com'
WHERE email IS NULL;

-- Make email NOT NULL and UNIQUE
ALTER TABLE profiles ALTER COLUMN email SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_key ON profiles(email);

-- Drop the phone_number constraint and column if they exist
-- Use IF EXISTS to avoid errors if they don't exist
DO $$ 
BEGIN
    -- Drop constraint if it exists
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints 
               WHERE constraint_name = 'profiles_phone_number_key' 
               AND table_name = 'profiles') THEN
        ALTER TABLE profiles DROP CONSTRAINT profiles_phone_number_key;
    END IF;
    
    -- Drop index if it exists
    IF EXISTS (SELECT 1 FROM pg_indexes 
               WHERE indexname = 'profiles_phone_number_key' 
               AND tablename = 'profiles') THEN
        DROP INDEX profiles_phone_number_key;
    END IF;
    
    -- Drop column if it exists
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'profiles' 
               AND column_name = 'phone_number') THEN
        ALTER TABLE profiles DROP COLUMN phone_number;
    END IF;
END $$;

-- Update the trigger function to handle email instead of phone
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  -- Extract user information
  DECLARE
    user_email text;
    user_full_name text;
    user_role user_role;
  BEGIN
    -- Get email (required for email auth)
    user_email := new.email;
    
    -- Get full name
    user_full_name := COALESCE(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1) -- Use email prefix as fallback
    );
    
    -- Get role
    user_role := COALESCE(
      (new.raw_user_meta_data->>'role')::user_role,
      'worker'::user_role
    );
    
    -- Insert profile with email
    INSERT INTO public.profiles (id, email, full_name, role)
    VALUES (new.id, user_email, user_full_name, user_role);
    
    RETURN new;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update RLS policies that might reference phone_number
-- (The existing policies should work fine with the email column)

-- Add comment to document the change
COMMENT ON COLUMN profiles.email IS 'User email address for authentication (changed from phone_number)';