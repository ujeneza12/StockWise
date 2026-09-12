/*
  # Add RLS policy for admin to create other user profiles

  1. New Policy
    - `Allow admin to create non-admin user profiles`
    - Allows authenticated admin users to insert profiles for other users
    - Restricts new profiles to 'manager' and 'worker' roles only
    - Prevents admin from creating another admin profile

  2. Security
    - Uses auth.uid() to get current authenticated user ID
    - Checks current user has admin role via profiles table join
    - Ensures new profile ID is different from current user ID
    - Blocks insertion of admin role for new users
*/

-- Add policy to allow admin users to create profiles for other users (manager/worker only)
CREATE POLICY "Allow admin to create non-admin user profiles"
  ON profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Current user must be an admin
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
    -- New profile must be for a different user (not self)
    AND NEW.id != auth.uid()
    -- New profile role must be manager or worker (not admin)
    AND NEW.role IN ('manager', 'worker')
  );