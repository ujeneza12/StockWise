-- Fix authentication and RLS policies to prevent infinite loading
-- This migration addresses circular dependencies and improves auth flow

-- First, drop all existing problematic policies
DROP POLICY IF EXISTS "Admins can delete profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can insert profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can read all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
DROP POLICY IF EXISTS "System can insert profiles" ON profiles;
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Service role can insert profiles" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Allow first user creation" ON profiles;

-- Drop the problematic is_admin function
DROP FUNCTION IF EXISTS is_admin();

-- Create a simple, non-recursive admin check function
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  -- Check if the current user has admin role in their JWT metadata
  -- This avoids querying the profiles table which could cause recursion
  SELECT COALESCE(
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin',
    false
  );
$$;

-- Create new, simplified policies without circular references

-- 1. Allow users to read their own profile (most basic access)
CREATE POLICY "Users can read own profile"
  ON profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- 2. Allow users to update their own profile
CREATE POLICY "Users can update own profile"
  ON profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- 3. Allow service role full access (for triggers and admin operations)
CREATE POLICY "Service role can insert profiles"
  ON profiles
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update profiles"
  ON profiles
  FOR UPDATE
  TO service_role
  USING (true);

CREATE POLICY "Service role can delete profiles"
  ON profiles
  FOR DELETE
  TO service_role
  USING (true);

CREATE POLICY "Service role can read profiles"
  ON profiles
  FOR SELECT
  TO service_role
  USING (true);

-- 4. Allow authenticated users to insert their own profile (for manual creation)
CREATE POLICY "Users can insert own profile"
  ON profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- 5. Special policy for initial admin creation (when no admin exists)
-- This uses a simple count check instead of complex role checking
CREATE POLICY "Allow first admin creation"
  ON profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Allow if no profiles exist yet OR if inserting user has admin in metadata
    (SELECT COUNT(*) FROM profiles) = 0 OR
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );

-- 6. Admin policies (these will work after user metadata is properly set)
CREATE POLICY "Admins can read all profiles"
  ON profiles
  FOR SELECT
  TO authenticated
  USING (
    -- Allow if user is admin (from metadata) OR reading own profile
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin' OR
    auth.uid() = id
  );

CREATE POLICY "Admins can update all profiles"
  ON profiles
  FOR UPDATE
  TO authenticated
  USING (
    -- Allow if user is admin (from metadata) OR updating own profile
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin' OR
    auth.uid() = id
  );

CREATE POLICY "Admins can delete profiles"
  ON profiles
  FOR DELETE
  TO authenticated
  USING (
    -- Only allow if user is admin (from metadata) AND not deleting themselves
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin' AND
    auth.uid() != id
  );

-- Update the trigger function to be more robust
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  -- Extract user information with better error handling
  DECLARE
    user_email text;
    user_full_name text;
    user_role user_role;
  BEGIN
    -- Get email (required for email auth)
    user_email := COALESCE(new.email, '');
    
    -- Get full name with multiple fallbacks
    user_full_name := COALESCE(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      new.raw_user_meta_data->>'display_name',
      split_part(new.email, '@', 1), -- Use email prefix as fallback
      'User'
    );
    
    -- Get role with fallback to worker
    user_role := COALESCE(
      (new.raw_user_meta_data->>'role')::user_role,
      'worker'::user_role
    );
    
    -- Only insert if email is not empty
    IF user_email != '' THEN
      -- Insert profile with email
      INSERT INTO public.profiles (id, email, full_name, role, created_at, updated_at)
      VALUES (
        new.id, 
        user_email, 
        user_full_name, 
        user_role,
        now(),
        now()
      );
    END IF;
    
    RETURN new;
  EXCEPTION
    WHEN OTHERS THEN
      -- Log the error but don't fail the auth operation
      RAISE WARNING 'Failed to create profile for user %: %', new.id, SQLERRM;
      RETURN new;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure the trigger exists and is properly configured
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Add helpful indexes for performance
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

-- Add comments for documentation
COMMENT ON FUNCTION handle_new_user() IS 'Automatically creates a profile when a new user signs up';
COMMENT ON FUNCTION is_admin() IS 'Checks if current user is admin using JWT metadata to avoid recursion';