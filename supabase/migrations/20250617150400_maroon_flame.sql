/*
  # Fix user creation issues

  1. Database Issues
    - Fix trigger function for email authentication
    - Ensure proper constraints and indexes
    - Add better error handling for user creation
  
  2. Security
    - Maintain RLS policies
    - Ensure proper permissions for user creation
*/

-- Fix the trigger function to handle email authentication properly
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  -- Insert profile with email authentication
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    new.id,
    new.email,
    COALESCE(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1)
    ),
    COALESCE(
      (new.raw_user_meta_data->>'role')::user_role,
      'worker'::user_role
    )
  );
  RETURN new;
EXCEPTION
  WHEN others THEN
    -- Log the error but don't fail the user creation
    RAISE WARNING 'Failed to create profile for user %: %', new.id, SQLERRM;
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger to ensure it's properly set up
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Ensure the email column has proper constraints
DO $$
BEGIN
  -- Make sure email column exists and is properly configured
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'email'
  ) THEN
    ALTER TABLE profiles ADD COLUMN email text;
  END IF;
  
  -- Ensure email is NOT NULL
  ALTER TABLE profiles ALTER COLUMN email SET NOT NULL;
  
  -- Create unique index if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE tablename = 'profiles' AND indexname = 'profiles_email_key'
  ) THEN
    CREATE UNIQUE INDEX profiles_email_key ON profiles(email);
  END IF;
END $$;

-- Remove any old phone_number constraints that might interfere
DO $$
BEGIN
  -- Drop phone_number column if it still exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'phone_number'
  ) THEN
    ALTER TABLE profiles DROP COLUMN phone_number;
  END IF;
END $$;

-- Ensure user_role enum exists and has correct values
DO $$
BEGIN
  -- Check if the enum type exists, if not create it
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('admin', 'manager', 'worker');
  END IF;
END $$;

-- Update RLS policies to ensure they work with email authentication
DROP POLICY IF EXISTS "Admins can insert profiles" ON profiles;
CREATE POLICY "Admins can insert profiles"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
    OR NOT EXISTS (SELECT 1 FROM profiles) -- Allow first user creation
  );

-- Add a policy to allow the trigger to insert profiles
DROP POLICY IF EXISTS "System can insert profiles" ON profiles;
CREATE POLICY "System can insert profiles"
  ON profiles FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Ensure the profiles table has all required columns with proper defaults
ALTER TABLE profiles ALTER COLUMN role SET DEFAULT 'worker'::user_role;
ALTER TABLE profiles ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE profiles ALTER COLUMN updated_at SET DEFAULT now();

-- Add a function to manually create a profile if the trigger fails
CREATE OR REPLACE FUNCTION create_profile_for_user(
  user_id uuid,
  user_email text,
  user_full_name text DEFAULT NULL,
  user_role user_role DEFAULT 'worker'
)
RETURNS void AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    user_id,
    user_email,
    COALESCE(user_full_name, split_part(user_email, '@', 1)),
    user_role
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON public.profiles TO service_role;
GRANT EXECUTE ON FUNCTION create_profile_for_user TO service_role;
GRANT EXECUTE ON FUNCTION handle_new_user TO service_role;