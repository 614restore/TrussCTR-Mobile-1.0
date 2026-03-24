/**
 * localFiles.ts
 *
 * Saves photos and documents into the device's Files app (iOS) or
 * triggers a browser download on web.
 *
 * iOS folder structure visible in Files → On My iPhone → TrussCTR:
 *   TrussCTR/
 *     [Customer Name]/
 *       [photo or doc].jpg / .pdf
 *
 * Requires Info.plist to have:
 *   UIFileSharingEnabled       = YES
 *   LSSupportsOpeningDocumentsInPlace = YES
 */

import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';

/** Strip characters that are invalid in folder/file names on iOS. */
function sanitizeName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim() || 'file';
}

/** Returns the organised folder path for a contact inside Documents. */
export function contactFolderPath(contactName: string): string {
  return `TrussCTR/${sanitizeName(contactName)}`;
}

/** Convert a Blob to a base64 data-URL string for Filesystem.writeFile. */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result ?? ''));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Save a single file (photo or document) to the device's Files app.
 *
 * @param url        Signed or public URL of the file to download and save.
 * @param contactName Customer name — used as the sub-folder name.
 * @param fileName   Desired filename including extension (.jpg, .pdf, etc.)
 */
export async function saveFileToDevice(
  url: string,
  contactName: string,
  fileName: string,
): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    // Web fallback: trigger a browser download
    const link = document.createElement('a');
    link.href = url;
    link.download = sanitizeName(fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return;
  }

  const folderPath = contactFolderPath(contactName);

  // Ensure the folder hierarchy exists
  try {
    await Filesystem.mkdir({
      path: folderPath,
      directory: Directory.Documents,
      recursive: true,
    });
  } catch {
    // Directory already exists — safe to ignore
  }

  // Fetch the file and encode it
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download file (HTTP ${response.status})`);
  const blob = await response.blob();
  const base64 = await blobToBase64(blob);

  const safeFileName = sanitizeName(fileName);
  await Filesystem.writeFile({
    path: `${folderPath}/${safeFileName}`,
    data: base64,
    directory: Directory.Documents,
    recursive: true,
  });
}

export type SaveProgress = { done: number; total: number; failed: number };

/**
 * Bulk-save every photo for a contact to the Files app.
 * Calls onProgress after each file so the UI can show a progress indicator.
 */
export async function saveAllPhotosToDevice(
  photos: Array<{ displayUrl: string; name: string }>,
  contactName: string,
  onProgress?: (progress: SaveProgress) => void,
): Promise<{ saved: number; failed: number }> {
  let saved = 0;
  let failed = 0;

  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    try {
      // Build a clean file name from the document name
      const baseName = sanitizeName(photo.name.replace(/\s+/g, '_'));
      const ext = baseName.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? '' : '.jpg';
      await saveFileToDevice(photo.displayUrl, contactName, `${baseName}${ext}`);
      saved++;
    } catch (err) {
      console.warn('localFiles: failed to save photo:', photo.name, err);
      failed++;
    }
    onProgress?.({ done: i + 1, total: photos.length, failed });
  }

  return { saved, failed };
}
