-- Migration 005: Add assigned_to column to estimates table
-- Allows estimate analytics to be attributed to the rep assigned to the contact

ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Back-fill existing estimates from their parent contact's assigned_to
UPDATE estimates e
SET    assigned_to = c.assigned_to
FROM   contacts c
WHERE  e.contact_id = c.id
  AND  e.assigned_to IS NULL
  AND  c.assigned_to IS NOT NULL;
