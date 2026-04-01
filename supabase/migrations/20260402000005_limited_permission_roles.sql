-- Add limited permission roles with direct account creation and expiration
-- Migration: 20260402000005_limited_permission_roles.sql

-- Add new roles to the existing role enum
DO $$ 
BEGIN
    -- Check if the roles already exist before adding them
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'canvasser' AND enumtypid = 'enum_profiles_role'::regtype) THEN
        ALTER TYPE enum_profiles_role ADD VALUE 'canvasser';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'field_contractor' AND enumtypid = 'enum_profiles_role'::regtype) THEN
        ALTER TYPE enum_profiles_role ADD VALUE 'field_contractor';
    END IF;
EXCEPTION
    WHEN undefined_object THEN
        -- If enum doesn't exist, create it with all roles
        CREATE TYPE enum_profiles_role AS ENUM (
            'owner', 'admin', 'sales_manager', 'production_manager', 
            'project_manager', 'office_staff', 'sales_rep', 'field_tech', 
            'subcontractor', 'canvasser', 'field_contractor'
        );
END $$;

-- Add limited seat tracking to companies table
ALTER TABLE companies 
  ADD COLUMN IF NOT EXISTS limited_seats_total integer DEFAULT 5,
  ADD COLUMN IF NOT EXISTS limited_seats_used integer DEFAULT 0;

-- Add account expiration and direct creation to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS account_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_limited_account boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_directly boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS temp_password_hash text,
  ADD COLUMN IF NOT EXISTS must_change_password boolean DEFAULT false;

-- Create customer assignments table for field contractors
CREATE TABLE IF NOT EXISTS customer_assignments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_at timestamptz DEFAULT NOW(),
  notes text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW()
);

-- RLS for customer_assignments
ALTER TABLE customer_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customer_assignments_company_isolation" ON customer_assignments
  FOR ALL USING (company_id = get_my_company_id());

-- Function to update limited seat usage when profiles change
CREATE OR REPLACE FUNCTION update_limited_seat_usage()
RETURNS TRIGGER AS $$
BEGIN
  -- Update seat count for the company
  UPDATE companies 
  SET limited_seats_used = (
    SELECT COUNT(*)
    FROM profiles 
    WHERE company_id = COALESCE(NEW.company_id, OLD.company_id)
      AND is_active = true
      AND is_limited_account = true
      AND role IN ('canvasser', 'field_contractor')
      AND (account_expires_at IS NULL OR account_expires_at > NOW())
  )
  WHERE id = COALESCE(NEW.company_id, OLD.company_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update limited seat usage
DROP TRIGGER IF EXISTS update_limited_seats_trigger ON profiles;
CREATE TRIGGER update_limited_seats_trigger
  AFTER INSERT OR UPDATE OR DELETE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_limited_seat_usage();

-- Function to check limited seat availability before insert/update
CREATE OR REPLACE FUNCTION check_limited_seat_availability()
RETURNS TRIGGER AS $$
DECLARE
  seat_limit integer;
  current_usage integer;
BEGIN
  -- Only check for limited roles being activated
  IF NEW.role NOT IN ('canvasser', 'field_contractor') OR 
     NEW.is_active = false OR 
     NEW.is_limited_account = false THEN
    RETURN NEW;
  END IF;
  
  -- Get company limits
  SELECT limited_seats_total, limited_seats_used
  INTO seat_limit, current_usage
  FROM companies 
  WHERE id = NEW.company_id;
  
  -- Check if we're at the limit (allow updates to existing users)
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND 
      (OLD.role NOT IN ('canvasser', 'field_contractor') OR 
       OLD.is_limited_account = false OR
       OLD.is_active = false)) THEN
    IF current_usage >= seat_limit THEN
      RAISE EXCEPTION 'Limited permission seat limit reached. Maximum % seats allowed.', seat_limit;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to enforce seat limits
DROP TRIGGER IF EXISTS check_limited_seats_trigger ON profiles;
CREATE TRIGGER check_limited_seats_trigger
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION check_limited_seat_availability();

-- Function to deactivate expired accounts
CREATE OR REPLACE FUNCTION deactivate_expired_accounts()
RETURNS void AS $$
BEGIN
  UPDATE profiles 
  SET is_active = false, updated_at = NOW()
  WHERE is_limited_account = true 
    AND is_active = true
    AND account_expires_at IS NOT NULL 
    AND account_expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Create a scheduled job to run daily (requires pg_cron extension)
-- SELECT cron.schedule('deactivate-expired-accounts', '0 1 * * *', 'SELECT deactivate_expired_accounts();');

-- Add useful indexes
CREATE INDEX IF NOT EXISTS idx_customer_assignments_user_id ON customer_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_customer_assignments_contact_id ON customer_assignments(contact_id);
CREATE INDEX IF NOT EXISTS idx_customer_assignments_company_active ON customer_assignments(company_id, is_active);
CREATE INDEX IF NOT EXISTS idx_profiles_limited_account ON profiles(company_id, is_limited_account, is_active);
CREATE INDEX IF NOT EXISTS idx_profiles_account_expires ON profiles(account_expires_at) WHERE account_expires_at IS NOT NULL;

-- Create view for limited account management
CREATE OR REPLACE VIEW limited_accounts_view AS
SELECT 
  p.id,
  p.email,
  p.first_name || COALESCE(' ' || p.last_name, '') as full_name,
  p.role,
  p.is_active,
  p.account_expires_at,
  p.created_directly,
  p.must_change_password,
  p.created_at,
  creator.first_name || ' ' || creator.last_name as created_by_name,
  CASE 
    WHEN p.account_expires_at IS NOT NULL AND p.account_expires_at < NOW() THEN 'expired'
    WHEN p.is_active = false THEN 'inactive'
    WHEN p.account_expires_at IS NOT NULL AND p.account_expires_at < NOW() + INTERVAL '7 days' THEN 'expiring_soon'
    ELSE 'active'
  END as status,
  (
    SELECT COUNT(*)
    FROM customer_assignments ca
    WHERE ca.user_id = p.id AND ca.is_active = true
  ) as assigned_customers_count,
  p.company_id
FROM profiles p
LEFT JOIN auth.users au ON p.id = au.id
LEFT JOIN profiles creator ON au.raw_user_meta_data->>'created_by' = creator.id::text
WHERE p.is_limited_account = true;

-- Update existing profiles to initialize limited seat counts
UPDATE companies 
SET limited_seats_used = (
  SELECT COUNT(*)
  FROM profiles 
  WHERE profiles.company_id = companies.id
    AND profiles.is_active = true
    AND profiles.is_limited_account = true
    AND profiles.role IN ('canvasser', 'field_contractor')
    AND (profiles.account_expires_at IS NULL OR profiles.account_expires_at > NOW())
)
WHERE limited_seats_used IS NULL;