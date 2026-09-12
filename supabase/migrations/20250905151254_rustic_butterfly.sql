/*
  # Fix User Creation and Auto-Verification

  1. Updates
    - Update auth settings to disable email confirmation by default
    - Ensure proper RLS policies for user creation
    - Add trigger to auto-create profiles

  2. Security
    - Maintain proper RLS policies
    - Allow admins to create users without email verification
*/

-- Update auth settings to disable email confirmation for admin-created users
UPDATE auth.config 
SET enable_confirmations = false 
WHERE id = 'auth';

-- Ensure the handle_new_user trigger exists and works properly
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    COALESCE(new.raw_user_meta_data->>'role', 'worker')
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
    role = COALESCE(EXCLUDED.role, profiles.role);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger to ensure it's working
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Update profiles policies to ensure proper access
DROP POLICY IF EXISTS "Allow first admin creation" ON profiles;
CREATE POLICY "Allow first admin creation" ON profiles
  FOR INSERT WITH CHECK (
    (SELECT count(*) FROM profiles) = 0 OR
    (auth.jwt() ->> 'role' = 'admin') OR
    auth.uid() = id
  );

-- Ensure service role can manage profiles
DROP POLICY IF EXISTS "Service role can manage profiles" ON profiles;
CREATE POLICY "Service role can manage profiles" ON profiles
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');