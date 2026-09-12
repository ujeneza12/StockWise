/*
  # Initial Database Schema for RGBUSS Business Management System

  1. New Tables
    - `profiles` - User profiles with phone authentication
    - `products` - Product inventory
    - `sales` - Sales transactions
    - `credits` - Credit sales tracking
    - `stock_adjustments` - Stock movement history
    - `daily_reports` - Daily report data

  2. Security
    - Enable RLS on all tables
    - Add policies for role-based access control
    - Phone number authentication setup

  3. Functions
    - Custom functions for business logic
*/

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create custom types
CREATE TYPE user_role AS ENUM ('admin', 'manager', 'worker');
CREATE TYPE product_status AS ENUM ('approved', 'pending');
CREATE TYPE adjustment_type AS ENUM ('increase', 'decrease');
CREATE TYPE credit_status AS ENUM ('pending', 'paid', 'overdue');

-- Profiles table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  phone_number text UNIQUE NOT NULL,
  full_name text NOT NULL,
  role user_role NOT NULL DEFAULT 'worker',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Products table
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  price decimal(10,2) NOT NULL CHECK (price > 0),
  quantity integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  category text NOT NULL,
  description text,
  status product_status NOT NULL DEFAULT 'approved',
  created_by uuid REFERENCES profiles(id) NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Sales table
CREATE TABLE IF NOT EXISTS sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES products(id) NOT NULL,
  product_name text NOT NULL,
  quantity_sold integer NOT NULL CHECK (quantity_sold > 0),
  unit_price decimal(10,2) NOT NULL CHECK (unit_price > 0),
  total_amount decimal(10,2) NOT NULL CHECK (total_amount > 0),
  sold_by uuid REFERENCES profiles(id) NOT NULL,
  customer_name text,
  is_credit boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Credits table
CREATE TABLE IF NOT EXISTS credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid REFERENCES sales(id),
  customer_name text NOT NULL,
  amount decimal(10,2) NOT NULL CHECK (amount > 0),
  product_name text NOT NULL,
  issued_by uuid REFERENCES profiles(id) NOT NULL,
  status credit_status NOT NULL DEFAULT 'pending',
  due_date date NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Stock adjustments table
CREATE TABLE IF NOT EXISTS stock_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES products(id) NOT NULL,
  product_name text NOT NULL,
  adjustment_type adjustment_type NOT NULL,
  quantity_adjusted integer NOT NULL CHECK (quantity_adjusted > 0),
  previous_quantity integer NOT NULL CHECK (previous_quantity >= 0),
  new_quantity integer NOT NULL CHECK (new_quantity >= 0),
  reason text NOT NULL,
  adjusted_by uuid REFERENCES profiles(id) NOT NULL,
  adjusted_by_name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Daily reports table
CREATE TABLE IF NOT EXISTS daily_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date date NOT NULL,
  total_sales integer NOT NULL DEFAULT 0,
  total_revenue decimal(10,2) NOT NULL DEFAULT 0,
  products_sold integer NOT NULL DEFAULT 0,
  report_data jsonb,
  created_by uuid REFERENCES profiles(id) NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(report_date)
);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_reports ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Admins can read all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can insert profiles"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can update all profiles"
  ON profiles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can delete profiles"
  ON profiles FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Products policies
CREATE POLICY "All authenticated users can read products"
  ON products FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "All authenticated users can insert products"
  ON products FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "All authenticated users can update products"
  ON products FOR UPDATE
  TO authenticated
  USING (true);

-- Sales policies
CREATE POLICY "All authenticated users can read sales"
  ON sales FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "All authenticated users can insert sales"
  ON sales FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = sold_by);

-- Credits policies
CREATE POLICY "All authenticated users can read credits"
  ON credits FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "All authenticated users can insert credits"
  ON credits FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = issued_by);

CREATE POLICY "Managers and admins can update credits"
  ON credits FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'manager')
    )
  );

-- Stock adjustments policies
CREATE POLICY "All authenticated users can read stock adjustments"
  ON stock_adjustments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "All authenticated users can insert stock adjustments"
  ON stock_adjustments FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = adjusted_by);

-- Daily reports policies
CREATE POLICY "All authenticated users can read daily reports"
  ON daily_reports FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "All authenticated users can insert daily reports"
  ON daily_reports FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

-- Functions
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, phone_number, full_name, role)
  VALUES (
    new.id,
    new.phone,
    COALESCE(new.raw_user_meta_data->>'full_name', 'User'),
    COALESCE((new.raw_user_meta_data->>'role')::user_role, 'worker')
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add updated_at triggers
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_credits_updated_at
  BEFORE UPDATE ON credits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_credits_status ON credits(status);
CREATE INDEX IF NOT EXISTS idx_credits_due_date ON credits(due_date);
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_product_id ON stock_adjustments(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_created_at ON stock_adjustments(created_at);
CREATE INDEX IF NOT EXISTS idx_daily_reports_date ON daily_reports(report_date);

-- Insert default admin user (will be created via auth, this is just for reference)
-- The actual user creation will be handled through the application