-- Migration to update authentication from phone to email
-- This migration updates the profiles table to use email instead of phone_number

-- Add email column to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email text;

-- Update existing profiles to use email from auth.users if available
UPDATE profiles 
SET email = auth_users.email 
FROM auth.users 
WHERE profiles.id = auth_users.id 
AND profiles.email IS NULL;

-- For any profiles without email, set a placeholder
UPDATE profiles 
SET email = phone_number || '@placeholder.com' 
WHERE email IS NULL;

-- Make email NOT NULL and UNIQUE
ALTER TABLE profiles ALTER COLUMN email SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_key ON profiles(email);

-- Drop the phone_number constraint and column
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_phone_number_key;
DROP INDEX IF EXISTS profiles_phone_number_key;
ALTER TABLE profiles DROP COLUMN IF EXISTS phone_number;

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