```sql
CREATE POLICY "Allow admin to create non-admin user profiles"
ON public.profiles
FOR INSERT TO authenticated
WITH CHECK (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  AND NEW.id != auth.uid()
  AND NEW.role IN ('manager', 'worker')
);
```