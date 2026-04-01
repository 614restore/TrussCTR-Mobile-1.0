-- ═══════════════════════════════════════════════════════════════════════════
-- Storage RLS Verification and Hardening (2026-04-02)
-- ═══════════════════════════════════════════════════════════════════════════
-- This script verifies and fixes storage bucket RLS policies to ensure
-- proper company-level isolation for all file uploads
-- ═══════════════════════════════════════════════════════════════════════════

-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Allow public read for app buckets" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated insert for app buckets" ON storage.objects; 
DROP POLICY IF EXISTS "Allow authenticated update for app buckets" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated delete for app buckets" ON storage.objects;

-- Drop individual bucket policies that don't have company isolation
DROP POLICY IF EXISTS "Public company-logos read" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated company-logos upload" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated company-logos update" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated company-logos delete" ON storage.objects;
DROP POLICY IF EXISTS "Public avatars read" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated avatars upload" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated avatars update" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated avatars delete" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated projectceo-documents read" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated projectceo-documents upload" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated projectceo-documents update" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated projectceo-documents delete" ON storage.objects;

-- ═══════════════════════════════════════════════════════════════════════════
-- COMPANY LOGOS BUCKET - Company-level isolation required
-- Files stored as: company-logos/{company_id}/logo.png
-- ═══════════════════════════════════════════════════════════════════════════

-- Public read access for company logos (needed for branding)
CREATE POLICY "company_logos_public_select" ON storage.objects
  FOR SELECT 
  USING (bucket_id = 'company-logos');

-- Company members can only upload to their company folder
CREATE POLICY "company_logos_company_insert" ON storage.objects
  FOR INSERT 
  TO authenticated
  WITH CHECK (
    bucket_id = 'company-logos' 
    AND (storage.foldername(name))[1] = (get_my_company_id())::text
  );

-- Company members can only update files in their company folder  
CREATE POLICY "company_logos_company_update" ON storage.objects
  FOR UPDATE 
  TO authenticated
  USING (
    bucket_id = 'company-logos' 
    AND (storage.foldername(name))[1] = (get_my_company_id())::text
  );

-- Company members can only delete files from their company folder
CREATE POLICY "company_logos_company_delete" ON storage.objects
  FOR DELETE 
  TO authenticated
  USING (
    bucket_id = 'company-logos' 
    AND (storage.foldername(name))[1] = (get_my_company_id())::text
  );

-- ═══════════════════════════════════════════════════════════════════════════  
-- AVATARS BUCKET - Company-level isolation required
-- Files stored as: avatars/{company_id}/{user_id}/avatar.png
-- ═══════════════════════════════════════════════════════════════════════════

-- Public read access for avatars (needed for UI display)
CREATE POLICY "avatars_public_select" ON storage.objects
  FOR SELECT 
  USING (bucket_id = 'avatars');

-- Users can only upload avatars to their company folder
CREATE POLICY "avatars_company_insert" ON storage.objects
  FOR INSERT 
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars' 
    AND (storage.foldername(name))[1] = (get_my_company_id())::text
  );

-- Users can only update avatars in their company folder
CREATE POLICY "avatars_company_update" ON storage.objects
  FOR UPDATE 
  TO authenticated
  USING (
    bucket_id = 'avatars' 
    AND (storage.foldername(name))[1] = (get_my_company_id())::text
  );

-- Users can only delete avatars from their company folder  
CREATE POLICY "avatars_company_delete" ON storage.objects
  FOR DELETE 
  TO authenticated
  USING (
    bucket_id = 'avatars' 
    AND (storage.foldername(name))[1] = (get_my_company_id())::text
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- DOCUMENTS BUCKET - Company-level isolation CRITICAL
-- Files stored as: projectceo-documents/{company_id}/contacts/{contact_id}/file.pdf
-- This is the most sensitive bucket containing contracts, estimates, invoices
-- ═══════════════════════════════════════════════════════════════════════════

-- Company members can only view documents from their company
CREATE POLICY "documents_company_select" ON storage.objects
  FOR SELECT 
  TO authenticated
  USING (
    bucket_id = 'projectceo-documents' 
    AND (storage.foldername(name))[1] = (get_my_company_id())::text
  );

-- Company members can only upload documents to their company folder
CREATE POLICY "documents_company_insert" ON storage.objects
  FOR INSERT 
  TO authenticated
  WITH CHECK (
    bucket_id = 'projectceo-documents' 
    AND (storage.foldername(name))[1] = (get_my_company_id())::text
  );

-- Company members can only update documents in their company folder
CREATE POLICY "documents_company_update" ON storage.objects
  FOR UPDATE 
  TO authenticated
  USING (
    bucket_id = 'projectceo-documents' 
    AND (storage.foldername(name))[1] = (get_my_company_id())::text
  );

-- Company members can only delete documents from their company folder
CREATE POLICY "documents_company_delete" ON storage.objects
  FOR DELETE 
  TO authenticated
  USING (
    bucket_id = 'projectceo-documents' 
    AND (storage.foldername(name))[1] = (get_my_company_id())::text
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERIES - Run after applying policies
-- ═══════════════════════════════════════════════════════════════════════════

-- Verify all policies are in place
DO $$
DECLARE
  expected_policies text[] := ARRAY[
    'company_logos_public_select',
    'company_logos_company_insert', 
    'company_logos_company_update',
    'company_logos_company_delete',
    'avatars_public_select',
    'avatars_company_insert',
    'avatars_company_update', 
    'avatars_company_delete',
    'documents_company_select',
    'documents_company_insert',
    'documents_company_update',
    'documents_company_delete',
    'expense_receipts_select',
    'expense_receipts_insert', 
    'expense_receipts_delete'
  ];
  policy_name text;
  missing_policies text[] := ARRAY[]::text[];
BEGIN
  FOREACH policy_name IN ARRAY expected_policies
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE schemaname = 'storage' 
        AND tablename = 'objects' 
        AND policyname = policy_name
    ) THEN
      missing_policies := missing_policies || policy_name;
    END IF;
  END LOOP;
  
  IF array_length(missing_policies, 1) > 0 THEN
    RAISE WARNING 'Missing storage policies: %', array_to_string(missing_policies, ', ');
  ELSE
    RAISE NOTICE 'All storage RLS policies are properly configured';
  END IF;
END $$;

-- Add documentation comments
COMMENT ON POLICY "company_logos_public_select" ON storage.objects IS 
  'Allows public read access for company branding (logos shown on estimates/invoices)';
COMMENT ON POLICY "documents_company_select" ON storage.objects IS 
  'CRITICAL: Prevents cross-tenant document access - files isolated by company folder';
COMMENT ON POLICY "avatars_company_insert" ON storage.objects IS 
  'Prevents users from uploading avatars to other companies folders';