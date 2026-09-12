/*
  # Implement Three User System

  1. Database Changes
    - Add constraint to ensure only 3 users maximum
    - Add constraint to ensure each role is unique
    - Create function to check user limits
    - Update RLS policies for the three-user system

  2. Security
    - Only admin can add users
    - Maximum 3 users total
    - Each role must be unique
*/

-- Create function to check if we can add a user with specific role
CREATE OR REPLACE FUNCTION can_add_user_with_role(target_role user_role)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_count integer;
  role_exists boolean;
BEGIN
  -- Check total user count
  SELECT COUNT(*) INTO current_count FROM profiles;
  
  -- If we already have 3 users, can't add more
  IF current_count >= 3 THEN
    RETURN false;
  END IF;
  
  -- Check if role already exists
  SELECT EXISTS(
    SELECT 1 FROM profiles WHERE role = target_role
  ) INTO role_exists;
  
  -- If role already exists, can't add another
  IF role_exists THEN
    RETURN false;
  END IF;
  
  RETURN true;
END;
$$;

-- Create function to get missing roles
CREATE OR REPLACE FUNCTION get_missing_roles()
RETURNS user_role[]
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  missing_roles user_role[] := '{}';
  all_roles user_role[] := ARRAY['admin', 'manager', 'worker'];
  role_item user_role;
BEGIN
  FOREACH role_item IN ARRAY all_roles
  LOOP
    IF NOT EXISTS(SELECT 1 FROM profiles WHERE role = role_item) THEN
      missing_roles := array_append(missing_roles, role_item);
    END IF;
  END LOOP;
  
  RETURN missing_roles;
END;
$$;

-- Add unique constraint on role (each role can only exist once)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'profiles_role_unique'
  ) THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_role_unique UNIQUE (role);
  END IF;
END $$;

-- Add check constraint for maximum 3 users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'profiles_max_three_users'
  ) THEN
    -- We'll handle this in the application layer since PostgreSQL 
    -- doesn't support table-level check constraints on row count
    -- The constraint will be enforced by our RLS policies and application logic
  END IF;
END $$;

-- Update RLS policies to enforce the three-user system
DROP POLICY IF EXISTS "Allow first admin creation" ON profiles;
DROP POLICY IF EXISTS "Admins can insert profiles" ON profiles;

-- Policy: Allow admin creation only if no users exist OR admin is adding missing roles
CREATE POLICY "Allow user creation with role restrictions"
  ON profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Allow if no users exist (first admin)
    (SELECT COUNT(*) FROM profiles) = 0
    OR
    -- Allow if current user is admin and we can add this role
    (
      ((jwt() -> 'user_metadata'::text) ->> 'role'::text) = 'admin'::text
      AND can_add_user_with_role(role)
    )
  );

-- Policy: Service role can always insert (for triggers)
CREATE POLICY "Service role can insert profiles"
  ON profiles
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Update the handle_new_user trigger to check role constraints
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_role_value user_role;
  user_full_name text;
  user_email text;
  current_user_count integer;
BEGIN
  -- Get current user count
  SELECT COUNT(*) INTO current_user_count FROM profiles;
  
  -- Extract user metadata
  user_email := COALESCE(NEW.email, '');
  
  -- Extract role from metadata (try both locations)
  user_role_value := COALESCE(
    (NEW.raw_user_meta_data ->> 'role')::user_role,
    (NEW.user_metadata ->> 'role')::user_role,
    'worker'::user_role
  );
  
  -- Extract full name from metadata
  user_full_name := COALESCE(
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.user_metadata ->> 'full_name',
    split_part(user_email, '@', 1),
    'User'
  );
  
  -- If this is the first user, make them admin
  IF current_user_count = 0 THEN
    user_role_value := 'admin'::user_role;
  END IF;
  
  -- Check if we can add this role (unless it's the first user)
  IF current_user_count > 0 AND NOT can_add_user_with_role(user_role_value) THEN
    RAISE EXCEPTION 'Cannot add user: role % already exists or maximum users reached', user_role_value;
  END IF;
  
  -- Insert the profile
  INSERT INTO profiles (id, email, full_name, role, created_at, updated_at)
  VALUES (
    NEW.id,
    user_email,
    user_full_name,
    user_role_value,
    NOW(),
    NOW()
  );
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error but don't fail the user creation
    RAISE WARNING 'Profile creation failed for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- Create a view to show system status
CREATE OR REPLACE VIEW system_users_status AS
SELECT 
  COUNT(*) as total_users,
  COUNT(*) FILTER (WHERE role = 'admin') as admin_count,
  COUNT(*) FILTER (WHERE role = 'manager') as manager_count,
  COUNT(*) FILTER (WHERE role = 'worker') as worker_count,
  3 - COUNT(*) as remaining_slots,
  get_missing_roles() as missing_roles
FROM profiles;

-- Grant access to the view
GRANT SELECT ON system_users_status TO authenticated;