/*
  # Fix Daily Reports Function - Resolve Ambiguous Column Reference

  1. Database Changes
    - Fix ambiguous column reference error in manual_generate_daily_report function
    - Use proper table aliases and qualified column names
    - Ensure all column references are unambiguous

  2. Security
    - Maintain existing RLS policies
    - Keep function security as DEFINER
*/

-- Drop the existing function to recreate it with fixes
DROP FUNCTION IF EXISTS manual_generate_daily_report(DATE);
DROP FUNCTION IF EXISTS auto_generate_daily_report();

-- Create the fixed manual_generate_daily_report function
CREATE OR REPLACE FUNCTION manual_generate_daily_report(target_date DATE DEFAULT CURRENT_DATE)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    product_record RECORD;
    previous_date DATE;
    stock_value INTEGER;
    entres_value INTEGER;
    total_jour_value INTEGER;
    solde_value INTEGER;
    sortie_value INTEGER;
    p_total_value NUMERIC(10,2);
    amavide_value INTEGER;
    products_processed INTEGER := 0;
    result JSON;
BEGIN
    -- Calculate previous date
    previous_date := target_date - INTERVAL '1 day';
    
    -- Delete existing data for this date to avoid duplicates
    DELETE FROM daily_reports_storage WHERE report_date = target_date;
    
    -- Process each approved product
    FOR product_record IN 
        SELECT p.id, p.name, p.quantity, p.price, p.category, p.description
        FROM products p 
        WHERE p.status = 'approved' 
        ORDER BY p.name
    LOOP
        -- Get previous day's solde (stock) from stored reports
        SELECT COALESCE(drs.solde, 0) INTO stock_value
        FROM daily_reports_storage drs
        WHERE drs.product_id = product_record.id 
        AND drs.report_date = previous_date;
        
        -- If no previous day data, check if this is the first day ever
        IF stock_value IS NULL THEN
            -- Check if there are any historical adjustments before target date
            IF EXISTS (
                SELECT 1 FROM stock_adjustments sa
                WHERE sa.product_id = product_record.id 
                AND sa.created_at < target_date::timestamp
            ) THEN
                -- Get the last known quantity from stock adjustments
                SELECT COALESCE(sa.new_quantity, 0) INTO stock_value
                FROM stock_adjustments sa
                WHERE sa.product_id = product_record.id 
                AND sa.created_at < target_date::timestamp
                ORDER BY sa.created_at DESC
                LIMIT 1;
            ELSE
                -- This is the first day, stock starts at 0
                stock_value := 0;
            END IF;
        END IF;
        
        -- Calculate entres (stock increases) for the target date
        SELECT COALESCE(SUM(sa.quantity_adjusted), 0) INTO entres_value
        FROM stock_adjustments sa
        WHERE sa.product_id = product_record.id
        AND sa.adjustment_type = 'increase'
        AND DATE(sa.created_at) = target_date;
        
        -- Calculate values based on business logic
        total_jour_value := stock_value + entres_value;
        solde_value := product_record.quantity; -- Current product quantity
        sortie_value := GREATEST(0, total_jour_value - solde_value);
        p_total_value := sortie_value * product_record.price;
        amavide_value := GREATEST(0, solde_value - 5);
        
        -- Insert the daily report record
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
            products_processed + 1,
            product_record.name,
            stock_value,
            entres_value,
            total_jour_value,
            solde_value,
            sortie_value,
            product_record.price,
            p_total_value,
            amavide_value,
            product_record.id,
            auth.uid()
        );
        
        products_processed := products_processed + 1;
    END LOOP;
    
    -- Create result JSON
    result := json_build_object(
        'success', true,
        'date', target_date,
        'products_processed', products_processed,
        'message', 'Daily report generated successfully for ' || target_date
    );
    
    RETURN result;
END;
$$;

-- Create the auto_generate_daily_report function for midnight automation
CREATE OR REPLACE FUNCTION auto_generate_daily_report()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    yesterday_date DATE;
    result JSON;
BEGIN
    -- Generate report for yesterday (since this runs at midnight)
    yesterday_date := CURRENT_DATE - INTERVAL '1 day';
    
    -- Call the manual function with yesterday's date
    SELECT manual_generate_daily_report(yesterday_date) INTO result;
    
    RETURN result;
END;
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION manual_generate_daily_report(DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION auto_generate_daily_report() TO authenticated;

-- Grant execute permissions to service role for automation
GRANT EXECUTE ON FUNCTION manual_generate_daily_report(DATE) TO service_role;
GRANT EXECUTE ON FUNCTION auto_generate_daily_report() TO service_role;