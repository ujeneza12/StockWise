@@ .. @@
 CREATE OR REPLACE FUNCTION cleanup_old_daily_reports()
 RETURNS TABLE(deleted_count INTEGER) AS $$
 DECLARE
-    cutoff_date DATE := CURRENT_DATE - INTERVAL '6 months';
+    cutoff_date DATE := CURRENT_DATE - INTERVAL '5 months';
     deleted_records INTEGER;
 BEGIN
     -- Delete daily reports older than specified months
@@ .. @@
     
     -- Log the cleanup operation
     INSERT INTO cleanup_logs (cleanup_type, records_deleted, details)
-    VALUES ('daily_reports', deleted_records, jsonb_build_object('cutoff_date', cutoff_date, 'months_threshold', 6));
+    VALUES ('daily_reports', deleted_records, jsonb_build_object('cutoff_date', cutoff_date, 'months_threshold', 5));
     
     RETURN QUERY SELECT deleted_records;
 END;
 $$ LANGUAGE plpgsql SECURITY DEFINER;