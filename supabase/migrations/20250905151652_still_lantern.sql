/*
  # Fix User Creation Trigger

  1. Updates
    - Fix the handle_new_user trigger function to properly handle all required fields
    - Ensure all NOT NULL constraints are satisfied
    - Add proper error handling and logging
    - Handle cases where user_metadata might be missing

  2. Security
    - Maintain RLS policies
    - Ensure proper data validation
*/

-- Drop existing trigger and function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Create improved trigger function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_full_name TEXT;
  user_role user_role;
  user_email TEXT;
BEGIN
  -- Get email from the new user record
  user_email := COALESCE(NEW.email, '');
  
  -- Extract full_name from user_metadata, with fallback
  user_full_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.user_metadata->>'full_name',
    SPLIT_PART(user_email, '@', 1),
    'User'
  );
  
  -- Extract role from user_metadata, with fallback to 'worker'
  user_role := COALESCE(
    (NEW.raw_user_meta_data->>'role')::user_role,
    (NEW.user_metadata->>'role')::user_role,
    'worker'::user_role
  );
  
  -- Validate that we have required data
  IF user_email = '' THEN
    RAISE EXCEPTION 'User email is required';
  END IF;
  
  IF user_full_name = '' OR user_full_name IS NULL THEN
    user_full_name := SPLIT_PART(user_email, '@', 1);
  END IF;
  
  -- Insert into profiles table
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    role,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    user_email,
    user_full_name,
    user_role,
    NOW(),
    NOW()
  );
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error but don't fail the user creation
    RAISE LOG 'Error creating profile for user %: %', NEW.id, SQLERRM;
    
    -- Try to insert with minimal data to prevent auth failure
    INSERT INTO public.profiles (
      id,
      email,
      full_name,
      role,
      created_at,
      updated_at
    ) VALUES (
      NEW.id,
      COALESCE(NEW.email, 'unknown@example.com'),
      COALESCE(SPLIT_PART(NEW.email, '@', 1), 'User'),
      'worker'::user_role,
      NOW(),
      NOW()
    ) ON CONFLICT (id) DO NOTHING;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Ensure the profiles table has proper constraints
ALTER TABLE public.profiles 
  ALTER COLUMN email SET NOT NULL,
  ALTER COLUMN full_name SET NOT NULL,
  ALTER COLUMN role SET NOT NULL;

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_email_unique ON public.profiles(email);

-- Update RLS policies to ensure proper access
DROP POLICY IF EXISTS "Allow first admin creation" ON public.profiles;
DROP POLICY IF EXISTS "Service role can insert profiles" ON public.profiles;

-- Allow service role (used by triggers) to insert profiles
CREATE POLICY "Service role can insert profiles"
  ON public.profiles
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Allow authenticated users to insert their own profile
CREATE POLICY "Users can insert own profile"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Allow first admin creation (when no profiles exist)
CREATE POLICY "Allow first admin creation"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT count(*) FROM public.profiles) = 0 
    OR 
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND role = 'admin'
    )
  );