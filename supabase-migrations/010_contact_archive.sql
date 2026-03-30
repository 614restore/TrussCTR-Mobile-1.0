-- ============================================================
-- TrussCTR — Contact Archive Feature
-- Migration 010
-- Run this in: Supabase Dashboard → SQL Editor
-- ============================================================
-- Adds is_archived, archived_at, and archived_by to contacts
-- so completed projects can be archived and reactivated without
-- losing any history.
-- ============================================================

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS is_archived   BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by   UUID        REFERENCES auth.users(id);

-- Index so the Pipeline query (WHERE is_archived = false) is fast
CREATE INDEX IF NOT EXISTS contacts_is_archived_company
  ON contacts (company_id, is_archived);

-- ── Verification ──────────────────────────────────────────────────────────────
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'contacts' AND column_name IN ('is_archived','archived_at','archived_by');
