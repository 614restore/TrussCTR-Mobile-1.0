-- Add measurement category tracking to documents table
-- Allows documents to be organised into Roof / Walls / Premium / General buckets
-- per customer, independent of the file-type (type) column.

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS category text;

-- Index so category-filtered queries are fast
CREATE INDEX IF NOT EXISTS documents_category_idx ON documents (category)
  WHERE category IS NOT NULL;

COMMENT ON COLUMN documents.category IS
  'Document section bucket: roof | walls | premium | general | null (uncategorised)';
