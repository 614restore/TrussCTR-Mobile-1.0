-- ============================================================
-- TrussCTR — Company Integrations + Hailtrace Hail Alerts
-- Run this in: Supabase Dashboard → SQL Editor
-- Version: 1.0 — 2026-03
-- ============================================================
-- Creates the company_integrations table (referenced by
-- Roofr and EagleView panels) and adds Hailtrace columns
-- for hail-alert push notifications.
-- ============================================================

-- ── company_integrations ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS company_integrations (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Roofr
  roofr_api_key               text,

  -- EagleView
  eagleview_api_key           text,
  eagleview_client_id         text,

  -- Hailtrace hail alerts
  hailtrace_api_key           text,
  hailtrace_enabled           boolean NOT NULL DEFAULT false,
  hailtrace_radius_miles      integer NOT NULL DEFAULT 25,
  -- Cached geocode of the company's monitoring center (derived from company address)
  hailtrace_lat               double precision,
  hailtrace_lng               double precision,
  -- ISO timestamp of last successful API check (used to request only new events)
  hailtrace_last_checked_at   timestamptz,

  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT company_integrations_company_id_key UNIQUE (company_id)
);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE company_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_integrations: company scoped" ON company_integrations;
CREATE POLICY "company_integrations: company scoped"
  ON company_integrations FOR ALL
  USING (company_id = get_my_company_id())
  WITH CHECK (company_id = get_my_company_id());

-- Service role (edge functions, webhooks) can read all rows
DROP POLICY IF EXISTS "company_integrations: service role" ON company_integrations;
CREATE POLICY "company_integrations: service role"
  ON company_integrations FOR ALL
  USING (auth.role() = 'service_role');

-- ── notifications — ensure title, message, metadata columns exist ─────────────
-- The notifications table is assumed to already exist (created by initial schema).
-- Add any missing columns needed for hail alerts.
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS title    text,
  ADD COLUMN IF NOT EXISTS message  text,
  ADD COLUMN IF NOT EXISTS metadata jsonb;

-- ── updated_at trigger ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS company_integrations_updated_at ON company_integrations;
CREATE TRIGGER company_integrations_updated_at
  BEFORE UPDATE ON company_integrations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
