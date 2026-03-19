import { supabase } from './supabase';

const STORAGE_BUCKETS = ['documents', 'projectceo-photos'] as const;

function dedupe<T>(values: T[]) {
  return Array.from(new Set(values));
}

function normalizeStoragePath(path: string) {
  return decodeURIComponent(path.replace(/^\/+/, '').trim());
}

function parseStoredMetadata(storedUrl: string) {
  try {
    const parsed = new URL(storedUrl);
    const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ''));
    const bucket = hashParams.get('bucket');
    const path = hashParams.get('path');
    if (bucket && path) {
      return {
        bucket,
        path: normalizeStoragePath(path),
      };
    }
  } catch {
    return null;
  }

  return null;
}

function parseBucketAndPathFromUrl(storedUrl: string) {
  try {
    const parsed = new URL(storedUrl);
    const pathname = parsed.pathname || '';

    for (const bucket of STORAGE_BUCKETS) {
      const marker = `/${bucket}/`;
      const index = pathname.indexOf(marker);
      if (index !== -1) {
        return {
          bucket,
          path: normalizeStoragePath(pathname.slice(index + marker.length)),
        };
      }
    }
  } catch {
    return null;
  }

  return null;
}

function buildBucketCandidates(preferredBucket?: string | null) {
  if (!preferredBucket) {
    return [...STORAGE_BUCKETS];
  }

  return dedupe([preferredBucket, ...STORAGE_BUCKETS]);
}

export function buildStoredDocumentUrl(publicUrl: string, bucket: string, path: string) {
  try {
    const parsed = new URL(publicUrl);
    parsed.hash = new URLSearchParams({
      bucket,
      path,
    }).toString();
    return parsed.toString();
  } catch {
    return publicUrl;
  }
}

export async function resolveDocumentSignedUrl(storedUrl: string) {
  const metadata = parseStoredMetadata(storedUrl) || parseBucketAndPathFromUrl(storedUrl);

  if (!metadata?.path) {
    return {
      signedUrl: storedUrl,
      bucket: null,
      path: null,
    };
  }

  const bucketsToTry = buildBucketCandidates(metadata.bucket);
  let lastError: string | null = null;

  for (const bucket of bucketsToTry) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(metadata.path, 60 * 60);

    if (!error && data?.signedUrl) {
      return {
        signedUrl: data.signedUrl,
        bucket,
        path: metadata.path,
      };
    }

    lastError = error?.message || `Unable to resolve signed URL from bucket ${bucket}`;
  }

  throw new Error(lastError || 'Unable to resolve document URL');
}

export async function fetchDocumentObjectUrl(storedUrl: string) {
  const resolved = await resolveDocumentSignedUrl(storedUrl);
  const response = await fetch(resolved.signedUrl);

  if (!response.ok) {
    throw new Error(`Failed to load document (${response.status})`);
  }

  const blob = await response.blob();

  return {
    objectUrl: URL.createObjectURL(blob),
    blob,
    sourceUrl: resolved.signedUrl,
    bucket: resolved.bucket,
    path: resolved.path,
  };
}

export async function buildDocumentDisplayUrl(storedUrl: string) {
  try {
    const resolved = await resolveDocumentSignedUrl(storedUrl);
    return resolved.signedUrl;
  } catch {
    return storedUrl;
  }
}
