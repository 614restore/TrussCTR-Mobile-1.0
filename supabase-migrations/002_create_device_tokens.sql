-- Migration: create device_tokens table
-- Stores FCM/APNs push notification tokens so the server can
-- send targeted push notifications to specific devices.

CREATE TABLE IF NOT EXISTS device_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id  UUID REFERENCES companies(id) ON DELETE CASCADE,
  token       TEXT NOT NULL,
  platform    TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One row per (user, token) — upsert target in Layout.tsx registerPushToken()
  UNIQUE (user_id, token)
);

CREATE INDEX IF NOT EXISTS idx_device_tokens_company_id ON device_tokens (company_id);
CREATE INDEX IF NOT EXISTS idx_device_tokens_user_id    ON device_tokens (user_id);

ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;

-- Users can read and delete their own tokens (e.g. on logout)
CREATE POLICY "Users manage own device tokens"
  ON device_tokens FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role reads all tokens for server-side push fan-out
CREATE POLICY "Service role reads all tokens"
  ON device_tokens FOR SELECT
  USING (auth.role() = 'service_role');
