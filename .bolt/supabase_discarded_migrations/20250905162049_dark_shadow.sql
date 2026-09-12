/*
  # Create system_users_status view

  1. New Views
    - `system_users_status`
      - Provides aggregated user statistics
      - Shows counts for each role (admin, manager, worker)
      - Calculates remaining slots (3 - total_users)
      - Lists missing roles that haven't been assigned

  2. Security
    - View is accessible to authenticated users
    - No RLS needed as it's aggregated data
*/

-- Create the system_users_status view
CREATE OR REPLACE VIEW public.system_users_status AS
SELECT
  (SELECT count(*)::integer FROM public.profiles) AS total_users,
  (SELECT count(*)::integer FROM public.profiles WHERE role = 'admin') AS admin_count,
  (SELECT count(*)::integer FROM public.profiles WHERE role = 'manager') AS manager_count,
  (SELECT count(*)::integer FROM public.profiles WHERE role = 'worker') AS worker_count,
  (3 - (SELECT count(*)::integer FROM public.profiles)) AS remaining_slots,
  ARRAY(
    SELECT role_name
    FROM (VALUES ('admin'), ('manager'), ('worker')) AS roles(role_name)
    WHERE NOT EXISTS (SELECT 1 FROM public.profiles WHERE role = role_name::user_role)
  ) AS missing_roles;