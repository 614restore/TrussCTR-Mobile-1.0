-- ============================================================
-- TrussCTR — Supabase Row Level Security (RLS) Policies
-- Run this in: Supabase Dashboard → SQL Editor
-- Version: 1.0 — 2026-03
-- ============================================================
-- This script enables RLS on all core tables and creates
-- company-scoped "users only see their own company's data"
-- policies. Multi-tenancy is enforced via company_id.
-- ============================================================

-- ── Enable RLS on all tables ─────────────────────────────────────────────────
ALTER TABLE IF EXISTS profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS companies             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS contacts              ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS estimates             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS work_orders           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS documents             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS notifications         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS team_members          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS material_orders       ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS photo_checklists      ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS report_templates      ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS price_library         ENABLE ROW LEVEL SECURITY;

-- ── Helper function: get current user's company_id ───────────────────────────
CREATE OR REPLACE FUNCTION get_my_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT company_id FROM profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- ── profiles ──────────────────────────────────────────────────────────────────
-- Users can read/edit their own profile
DROP POLICY IF EXISTS "profiles: own record" ON profiles;
CREATE POLICY "profiles: own record"
  ON profiles FOR ALL
  USING (id = auth.uid());

-- Users can see other profiles in their company (for team directory)
DROP POLICY IF EXISTS "profiles: same company read" ON profiles;
CREATE POLICY "profiles: same company read"
  ON profiles FOR SELECT
  USING (company_id = get_my_company_id());

-- ── companies ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "companies: own company" ON companies;
CREATE POLICY "companies: own company"
  ON companies FOR ALL
  USING (id = get_my_company_id());

-- ── contacts ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "contacts: company scoped" ON contacts;
CREATE POLICY "contacts: company scoped"
  ON contacts FOR ALL
  USING (company_id = get_my_company_id())
  WITH CHECK (company_id = get_my_company_id());

-- ── estimates ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "estimates: company scoped" ON estimates;
CREATE POLICY "estimates: company scoped"
  ON estimates FOR ALL
  USING (company_id = get_my_company_id())
  WITH CHECK (company_id = get_my_company_id());

-- ── work_orders ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "work_orders: company scoped" ON work_orders;
CREATE POLICY "work_orders: company scoped"
  ON work_orders FOR ALL
  USING (company_id = get_my_company_id())
  WITH CHECK (company_id = get_my_company_id());

-- ── documents ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "documents: company scoped" ON documents;
CREATE POLICY "documents: company scoped"
  ON documents FOR ALL
  USING (company_id = get_my_company_id())
  WITH CHECK (company_id = get_my_company_id());

-- ── notifications ─────────────────────────────────────────────────────────────
-- Users see notifications addressed to them or broadcast to their company
DROP POLICY IF EXISTS "notifications: user or company" ON notifications;
CREATE POLICY "notifications: user or company"
  ON notifications FOR SELECT
  USING (
    company_id = get_my_company_id()
    AND (user_id = auth.uid() OR user_id IS NULL)
  );

DROP POLICY IF EXISTS "notifications: insert system" ON notifications;
CREATE POLICY "notifications: insert system"
  ON notifications FOR INSERT
  WITH CHECK (company_id = get_my_company_id());

-- ── team_members ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "team_members: company scoped" ON team_members;
CREATE POLICY "team_members: company scoped"
  ON team_members FOR ALL
  USING (company_id = get_my_company_id())
  WITH CHECK (company_id = get_my_company_id());

-- ── material_orders ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "material_orders: company scoped" ON material_orders;
CREATE POLICY "material_orders: company scoped"
  ON material_orders FOR ALL
  USING (company_id = get_my_company_id())
  WITH CHECK (company_id = get_my_company_id());

-- ── photo_checklists ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "photo_checklists: company scoped" ON photo_checklists;
CREATE POLICY "photo_checklists: company scoped"
  ON photo_checklists FOR ALL
  USING (company_id = get_my_company_id())
  WITH CHECK (company_id = get_my_company_id());

-- ── price_library ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "price_library: company scoped" ON price_library;
CREATE POLICY "price_library: company scoped"
  ON price_library FOR ALL
  USING (company_id = get_my_company_id())
  WITH CHECK (company_id = get_my_company_id());

-- ── report_templates ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "report_templates: company scoped" ON report_templates;
CREATE POLICY "report_templates: company scoped"
  ON report_templates FOR ALL
  USING (company_id = get_my_company_id())
  WITH CHECK (company_id = get_my_company_id());

-- ── Verification ──────────────────────────────────────────────────────────────
-- After running, verify with:
-- SELECT tablename, rowsecurity FROM pg_tables
-- WHERE schemaname = 'public' AND tablename IN (
--   'profiles','companies','contacts','estimates','work_orders',
--   'documents','notifications','team_members','material_orders'
-- );
-- All rows should show rowsecurity = true.
