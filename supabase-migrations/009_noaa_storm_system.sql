-- ============================================================
-- TrussCTR — NOAA SPC Storm Alert System
-- Run this in: Supabase Dashboard → SQL Editor
-- Version: 1.0 — 2026-03
-- ============================================================
-- Extends company_integrations with NOAA SPC alert settings.
-- No new tables — storm events are stored as notifications
-- (type = 'storm_alert'), consistent with the HailTrace pattern.
-- ============================================================

-- ── Add NOAA columns to company_integrations ──────────────────────────────────
ALTER TABLE company_integrations
  ADD COLUMN IF NOT EXISTS noaa_enabled           boolean       NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS noaa_min_hail_inches   double precision NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS noaa_min_wind_mph      integer       NOT NULL DEFAULT 58,
  ADD COLUMN IF NOT EXISTS noaa_radius_miles      integer       NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS noaa_last_checked_at   timestamptz;

-- ── Index to make storm history queries fast ──────────────────────────────────
-- The StormHistory page queries: type IN ('storm_alert','hail_alert'), company_id,
-- order by created_at DESC. This partial index covers that exactly.
CREATE INDEX IF NOT EXISTS notifications_storm_history_idx
  ON notifications (company_id, created_at DESC)
  WHERE type IN ('storm_alert', 'hail_alert');

-- ── Ensure notifications.metadata has a GIN index for fingerprint dedup ───────
-- Allows: WHERE metadata->>'fingerprint' = $1
-- Skipped if already exists — IF NOT EXISTS is not valid for CREATE INDEX
-- on expression indexes in older PG; use a unique name instead.
CREATE INDEX IF NOT EXISTS notifications_metadata_gin_idx
  ON notifications USING GIN (metadata);
