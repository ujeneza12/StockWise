/*
  # Add policy for authenticated user insertion

  1. Security Policy
    - Allow authenticated users to insert new users
    - Prevent insertion of users with 'admin' role
    - Maintain existing role restrictions and user limits

  2. Changes
    - Add new policy "Authenticated users can insert non-admin users"
    - Allows INSERT operations for authenticated users
    - Blocks admin role creation through policy constraint
*/

-- Add policy to allow authenticated users to insert new users (except admin role)
CREATE POLICY "Authenticated users can insert non-admin users"
  ON profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Prevent insertion of admin role
    role != 'admin'
    -- Allow manager and worker roles
    AND role IN ('manager', 'worker')
    -- Ensure the user is creating their own profile or has permission
    AND (
      uid() = id 
      OR EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = uid() 
        AND role IN ('admin', 'manager')
      )
    )
  );