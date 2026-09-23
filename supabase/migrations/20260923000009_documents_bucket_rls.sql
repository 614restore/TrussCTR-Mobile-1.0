-- Storage RLS for the 'documents' bucket
-- The app uploads to 'documents' with path {contact_id}/{random}.ext
-- Existing migration 20260402000006 covered 'projectceo-documents' (wrong bucket name).
-- These policies close the gap and enforce company-level isolation via a contacts join.

DROP POLICY IF EXISTS "documents_bucket_select" ON storage.objects;
DROP POLICY IF EXISTS "documents_bucket_insert" ON storage.objects;
DROP POLICY IF EXISTS "documents_bucket_update" ON storage.objects;
DROP POLICY IF EXISTS "documents_bucket_delete" ON storage.objects;

CREATE POLICY "documents_bucket_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'documents'
    AND (
      SELECT company_id FROM contacts
      WHERE id = (storage.foldername(name))[1]::uuid
    ) IN (SELECT get_my_company_ids())
  );

CREATE POLICY "documents_bucket_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND (
      SELECT company_id FROM contacts
      WHERE id = (storage.foldername(name))[1]::uuid
    ) IN (SELECT get_my_company_ids())
  );

CREATE POLICY "documents_bucket_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'documents'
    AND (
      SELECT company_id FROM contacts
      WHERE id = (storage.foldername(name))[1]::uuid
    ) IN (SELECT get_my_company_ids())
  );

CREATE POLICY "documents_bucket_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'documents'
    AND (
      SELECT company_id FROM contacts
      WHERE id = (storage.foldername(name))[1]::uuid
    ) IN (SELECT get_my_company_ids())
  );
