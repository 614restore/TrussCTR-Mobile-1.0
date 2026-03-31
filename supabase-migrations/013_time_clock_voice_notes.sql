-- Migration 013: Time Clock + Voice Notes tables
-- Supports the TimeClock page and VoiceNotes component

-- Time entries for field crew clock in/out
CREATE TABLE IF NOT EXISTS time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  work_order_id UUID REFERENCES work_orders(id) ON DELETE SET NULL,
  clock_in TIMESTAMPTZ NOT NULL DEFAULT now(),
  clock_out TIMESTAMPTZ,
  duration_minutes INTEGER,
  lat_in DOUBLE PRECISION,
  lng_in DOUBLE PRECISION,
  lat_out DOUBLE PRECISION,
  lng_out DOUBLE PRECISION,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_time_entries_user_id ON time_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_company_id ON time_entries(company_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_clock_in ON time_entries(clock_in);
CREATE INDEX IF NOT EXISTS idx_time_entries_status ON time_entries(status) WHERE status = 'active';

ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "time_entries_company_select"
  ON time_entries FOR SELECT
  USING (company_id = auth_company_id());

CREATE POLICY IF NOT EXISTS "time_entries_own_insert"
  ON time_entries FOR INSERT
  WITH CHECK (user_id = auth.uid() AND company_id = auth_company_id());

CREATE POLICY IF NOT EXISTS "time_entries_own_update"
  ON time_entries FOR UPDATE
  USING (user_id = auth.uid() AND company_id = auth_company_id());

-- Voice notes attached to contacts or work orders
CREATE TABLE IF NOT EXISTS voice_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  work_order_id UUID REFERENCES work_orders(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  audio_url TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_voice_notes_company_id ON voice_notes(company_id);
CREATE INDEX IF NOT EXISTS idx_voice_notes_contact_id ON voice_notes(contact_id);
CREATE INDEX IF NOT EXISTS idx_voice_notes_work_order_id ON voice_notes(work_order_id);

ALTER TABLE voice_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "voice_notes_company_select"
  ON voice_notes FOR SELECT
  USING (company_id = auth_company_id());

CREATE POLICY IF NOT EXISTS "voice_notes_company_insert"
  ON voice_notes FOR INSERT
  WITH CHECK (company_id = auth_company_id());

CREATE POLICY IF NOT EXISTS "voice_notes_own_delete"
  ON voice_notes FOR DELETE
  USING (created_by = auth.uid());
