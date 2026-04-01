// Mobile App Storage Security Utils
// Ensures all file uploads use company-isolated paths

import { supabase } from './supabase';

/**
 * Get the current user's company ID for secure file path construction
 */
export async function getCurrentUserCompanyId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('User not authenticated');
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('id', user.id)
    .single();

  if (error || !profile?.company_id) {
    throw new Error('Could not determine user company ID');
  }

  return profile.company_id;
}

/**
 * Create a secure, company-isolated file path
 */
export function createSecureFilePath(
  companyId: string, 
  contactId: string, 
  fileName: string
): string {
  // Ensure company isolation by prefixing with company ID
  return `${companyId}/${contactId}/${fileName}`;
}

/**
 * Upload file to company-isolated path
 */
export async function secureUpload(
  bucket: string,
  contactId: string, 
  file: Blob,
  fileName: string,
  contentType?: string
): Promise<{
  path: string;
  publicUrl: string;
  signedUrl?: string;
}> {
  const companyId = await getCurrentUserCompanyId();
  const securePath = createSecureFilePath(companyId, contactId, fileName);

  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(securePath, file, { 
      contentType: contentType || 'application/octet-stream',
      upsert: false 
    });

  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }

  const { data: { publicUrl } } = supabase.storage
    .from(bucket)
    .getPublicUrl(data.path);

  // Optional signed URL for private access
  const { data: signedUrlData } = await supabase.storage
    .from(bucket)
    .createSignedUrl(data.path, 60 * 60); // 1 hour expiry

  return {
    path: data.path,
    publicUrl,
    signedUrl: signedUrlData?.signedUrl
  };
}

/**
 * Security check: Verify user can access file at path
 */
export async function canUserAccessFile(filePath: string): Promise<boolean> {
  try {
    const companyId = await getCurrentUserCompanyId();
    // File paths should start with user's company ID
    return filePath.startsWith(`${companyId}/`);
  } catch {
    return false;
  }
}