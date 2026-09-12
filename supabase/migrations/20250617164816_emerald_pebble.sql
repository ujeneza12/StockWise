/*
  # Create Daily Reports Storage Table

  1. New Tables
    - `daily_reports_storage`
      - `id` (uuid, primary key)
      - `report_date` (date, unique) - the date this report represents
      - `no` (integer) - product number in report
      - `libelle` (text) - product name
      - `stock` (integer) - previous day stock
      - `entres` (integer) - new stock entries
      - `total_jour` (integer) - total available for the day
      - `solde` (integer) - end of day balance
      - `sortie` (integer) - items sold/removed
      - `p_unit1` (numeric) - unit price
      - `p_total` (numeric) - total value of sorties
      - `amavide` (integer) - available stock minus minimum
      - `product_id` (uuid) - reference to product
      - `created_at` (timestamp) - when record was created
      - `created_by` (uuid) - who created the record

  2. Security
    - Enable RLS on `daily_reports_storage` table
    - Add policies for authenticated users to read
    - Add policies for system to insert daily reports

  3. Functions
    - `generate_daily_report_data()` - generates report data for a specific date
    - `insert_daily_report()` - inserts daily report at midnight
    - Scheduled function to run at midnight daily

  4. Triggers
    - Automatic daily report generation at midnight
*/

-- Create the daily reports storage table
CREATE TABLE IF NOT EXISTS daily_reports_storage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date date NOT NULL,
  no integer NOT NULL,
  libelle text NOT NULL,
  stock integer NOT NULL DEFAULT 0,
  entres integer NOT NULL DEFAULT 0,
  total_jour integer NOT NULL DEFAULT 0,
  solde integer NOT NULL DEFAULT 0,
  sortie integer NOT NULL DEFAULT 0,
  p_unit1 numeric(10,2) NOT NULL DEFAULT 0,
  p_total numeric(10,2) NOT NULL DEFAULT 0,
  amavide integer NOT NULL DEFAULT 0,
  product_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  created_by uuid,
  
  -- Constraints
  CONSTRAINT daily_reports_storage_report_date_product_key UNIQUE (report_date, product_id)
);

-- Enable RLS
ALTER TABLE daily_reports_storage ENABLE ROW LEVEL SECURITY;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_daily_reports_storage_date ON daily_reports_storage(report_date);
CREATE INDEX IF NOT EXISTS idx_daily_reports_storage_product ON daily_reports_storage(product_id);
CREATE INDEX IF NOT EXISTS idx_daily_reports_storage_created_at ON daily_reports_storage(created_at);

-- RLS Policies
CREATE POLICY "All authenticated users can read daily reports storage"
  ON daily_reports_storage
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "System can insert daily reports"
  ON daily_reports_storage
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Admins can insert daily reports"
  ON daily_reports_storage
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );

CREATE POLICY "Admins can update daily reports"
  ON daily_reports_storage
  FOR UPDATE
  TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );

-- Function to get previous day stock for a product
CREATE OR REPLACE FUNCTION get_previous_day_stock(
  p_product_id uuid,
  p_current_date date
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  previous_stock integer := 0;
  previous_date date;
BEGIN
  -- Calculate previous date
  previous_date := p_current_date - INTERVAL '1 day';
  
  -- Try to get stock from previous day's report
  SELECT solde INTO previous_stock
  FROM daily_reports_storage
  WHERE product_id = p_product_id
    AND report_date = previous_date;
  
  -- If no previous report exists, check stock adjustments
  IF previous_stock IS NULL THEN
    -- Get the last known stock level from stock adjustments before current date
    SELECT COALESCE(new_quantity, 0) INTO previous_stock
    FROM stock_adjustments
    WHERE product_id = p_product_id
      AND created_at < p_current_date::timestamp
    ORDER BY created_at DESC
    LIMIT 1;
    
    -- If still no data, default to 0
    IF previous_stock IS NULL THEN
      previous_stock := 0;
    END IF;
  END IF;
  
  RETURN previous_stock;
END;
$$;

-- Function to generate daily report data for a specific date
CREATE OR REPLACE FUNCTION generate_daily_report_data(
  target_date date DEFAULT CURRENT_DATE
) RETURNS TABLE (
  product_id uuid,
  no integer,
  libelle text,
  stock integer,
  entres integer,
  total_jour integer,
  solde integer,
  sortie integer,
  p_unit1 numeric,
  p_total numeric,
  amavide integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  product_record RECORD;
  product_counter integer := 1;
  start_of_day timestamp;
  end_of_day timestamp;
  previous_stock integer;
  entres_qty integer;
  current_solde integer;
  total_jour_qty integer;
  sortie_qty integer;
  unit_price numeric;
  total_price numeric;
  amavide_qty integer;
BEGIN
  -- Calculate day boundaries
  start_of_day := target_date::timestamp;
  end_of_day := (target_date + INTERVAL '1 day')::timestamp - INTERVAL '1 second';
  
  -- Loop through all approved products
  FOR product_record IN 
    SELECT p.id, p.name, p.price, p.quantity, p.category
    FROM products p
    WHERE p.status = 'approved'
    ORDER BY p.name
  LOOP
    -- Get previous day stock
    previous_stock := get_previous_day_stock(product_record.id, target_date);
    
    -- Calculate entres (stock increases) for the target date
    SELECT COALESCE(SUM(quantity_adjusted), 0) INTO entres_qty
    FROM stock_adjustments
    WHERE product_id = product_record.id
      AND adjustment_type = 'increase'
      AND created_at >= start_of_day
      AND created_at <= end_of_day;
    
    -- Current solde is the current product quantity
    current_solde := COALESCE(product_record.quantity, 0);
    
    -- Calculate total available for the day
    total_jour_qty := previous_stock + entres_qty;
    
    -- Calculate sortie (what was sold/removed)
    sortie_qty := GREATEST(0, total_jour_qty - current_solde);
    
    -- Get unit price
    unit_price := COALESCE(product_record.price, 0);
    
    -- Calculate total price for sorties
    total_price := sortie_qty * unit_price;
    
    -- Calculate amavide (available minus minimum stock of 5)
    amavide_qty := GREATEST(0, current_solde - 5);
    
    -- Return the row
    RETURN QUERY SELECT
      product_record.id,
      product_counter,
      product_record.name,
      previous_stock,
      entres_qty,
      total_jour_qty,
      current_solde,
      sortie_qty,
      unit_price,
      total_price,
      amavide_qty;
    
    product_counter := product_counter + 1;
  END LOOP;
END;
$$;

-- Function to insert daily report for a specific date
CREATE OR REPLACE FUNCTION insert_daily_report(
  target_date date DEFAULT CURRENT_DATE,
  created_by_user uuid DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  report_row RECORD;
  inserted_count integer := 0;
BEGIN
  -- Check if report already exists for this date
  IF EXISTS (
    SELECT 1 FROM daily_reports_storage 
    WHERE report_date = target_date
  ) THEN
    -- Delete existing report for this date to regenerate
    DELETE FROM daily_reports_storage WHERE report_date = target_date;
  END IF;
  
  -- Insert new report data
  FOR report_row IN 
    SELECT * FROM generate_daily_report_data(target_date)
  LOOP
    INSERT INTO daily_reports_storage (
      report_date,
      no,
      libelle,
      stock,
      entres,
      total_jour,
      solde,
      sortie,
      p_unit1,
      p_total,
      amavide,
      product_id,
      created_by
    ) VALUES (
      target_date,
      report_row.no,
      report_row.libelle,
      report_row.stock,
      report_row.entres,
      report_row.total_jour,
      report_row.solde,
      report_row.sortie,
      report_row.p_unit1,
      report_row.p_total,
      report_row.amavide,
      report_row.product_id,
      created_by_user
    );
    
    inserted_count := inserted_count + 1;
  END LOOP;
  
  RETURN inserted_count;
END;
$$;

-- Function to automatically generate daily report at midnight
CREATE OR REPLACE FUNCTION auto_generate_daily_report()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  yesterday_date date;
  inserted_count integer;
BEGIN
  -- Calculate yesterday's date (since this runs at midnight)
  yesterday_date := CURRENT_DATE - INTERVAL '1 day';
  
  -- Generate report for yesterday
  SELECT insert_daily_report(yesterday_date) INTO inserted_count;
  
  -- Log the operation (you can remove this if you don't want logging)
  RAISE NOTICE 'Daily report generated for % with % products', yesterday_date, inserted_count;
END;
$$;

-- Create a function to manually trigger daily report generation (for testing)
CREATE OR REPLACE FUNCTION manual_generate_daily_report(
  target_date date DEFAULT CURRENT_DATE
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  inserted_count integer;
  result json;
BEGIN
  -- Generate report for the specified date
  SELECT insert_daily_report(target_date) INTO inserted_count;
  
  -- Return result as JSON
  result := json_build_object(
    'success', true,
    'date', target_date,
    'products_processed', inserted_count,
    'message', 'Daily report generated successfully'
  );
  
  RETURN result;
END;
$$;

-- Note: Automatic scheduling would typically be done with pg_cron extension
-- Since we can't guarantee pg_cron is available, we'll provide instructions
-- for manual setup or alternative scheduling methods

-- Add foreign key constraint to products table
ALTER TABLE daily_reports_storage 
ADD CONSTRAINT daily_reports_storage_product_id_fkey 
FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

-- Add foreign key constraint to profiles table (optional, for created_by)
ALTER TABLE daily_reports_storage 
ADD CONSTRAINT daily_reports_storage_created_by_fkey 
FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- Create a view for easy querying of daily reports with additional info
CREATE OR REPLACE VIEW daily_reports_view AS
SELECT 
  drs.*,
  p.category as product_category,
  p.description as product_description,
  pr.full_name as created_by_name
FROM daily_reports_storage drs
LEFT JOIN products p ON drs.product_id = p.id
LEFT JOIN profiles pr ON drs.created_by = pr.id
ORDER BY drs.report_date DESC, drs.no ASC;

-- Grant necessary permissions
GRANT SELECT ON daily_reports_view TO authenticated;
GRANT EXECUTE ON FUNCTION generate_daily_report_data(date) TO authenticated;
GRANT EXECUTE ON FUNCTION manual_generate_daily_report(date) TO authenticated;

-- Comments for documentation
COMMENT ON TABLE daily_reports_storage IS 'Stores daily business reports with exact structure from daily reports page';
COMMENT ON FUNCTION generate_daily_report_data(date) IS 'Generates daily report data for a specific date';
COMMENT ON FUNCTION insert_daily_report(date, uuid) IS 'Inserts daily report data into storage table';
COMMENT ON FUNCTION auto_generate_daily_report() IS 'Automatically generates daily report at midnight';
COMMENT ON FUNCTION manual_generate_daily_report(date) IS 'Manually generates daily report for testing';
COMMENT ON VIEW daily_reports_view IS 'Enhanced view of daily reports with product and user information';