-- ============================================================
-- TrussCTR — Roof Hub (SRS Distribution) Integration
-- Run this in: Supabase Dashboard → SQL Editor
-- Version: 1.0 — 2026-03
-- ============================================================
-- Adds Roof Hub integration key storage to company_integrations
-- and adds SRS order tracking columns to material_orders.
-- ============================================================

-- ── company_integrations: add Roof Hub key ────────────────────────────────────
ALTER TABLE company_integrations
  ADD COLUMN IF NOT EXISTS roofhub_integration_key text,
  ADD COLUMN IF NOT EXISTS roofhub_enabled          boolean NOT NULL DEFAULT false;

-- ── material_orders: add Roof Hub tracking columns ────────────────────────────
ALTER TABLE material_orders
  ADD COLUMN IF NOT EXISTS roofhub_order_id   text,
  ADD COLUMN IF NOT EXISTS roofhub_status     text,
  ADD COLUMN IF NOT EXISTS roofhub_branch_id  text,
  ADD COLUMN IF NOT EXISTS roofhub_submitted_at timestamptz;

-- ── Index for Roof Hub order lookups ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS material_orders_roofhub_order_id_idx
  ON material_orders (roofhub_order_id)
  WHERE roofhub_order_id IS NOT NULL;
