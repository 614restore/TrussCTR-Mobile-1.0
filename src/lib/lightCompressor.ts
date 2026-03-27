// Image compression and video validation utilities

export interface PhotoPreset {
  width: number;
  height: number;
  quality: number;
}

export const PHOTO_POLICY_PRESETS: Record<string, PhotoPreset> = {
  /** High-quality 8MP — for inspection photos and document uploads */
  high8mp: { width: 3264, height: 2448, quality: 0.85 },
  /** Standard 3MP — for thumbnails and timeline photos */
  standard3mp: { width: 2048, height: 1536, quality: 0.80 },
};

/**
 * Resize and compress an image using the browser canvas API.
 * Returns a Blob containing a JPEG at the requested dimensions and quality.
 */
export async function compressImageWithLightCompressor(
  file: File | Blob,
  options: { maxWidth: number; maxHeight: number; quality: number }
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let { width, height } = img;
      const ratio = Math.min(options.maxWidth / width, options.maxHeight / height);
      if (ratio < 1) {
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas 2D context not available'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('canvas.toBlob returned null'));
        },
        'image/jpeg',
        options.quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image for compression'));
    };

    img.src = objectUrl;
  });
}

const MAX_VIDEO_SIZE_MB = 500;

/**
 * Validate a video file before uploading to cloud storage.
 * Returns an error string if invalid, or null if the file is acceptable.
 */
export async function validateVideoForCloud(file: File): Promise<string | null> {
  if (!file.type.startsWith('video/')) return null;
  if (file.size > MAX_VIDEO_SIZE_MB * 1024 * 1024) {
    return `Video file exceeds the ${MAX_VIDEO_SIZE_MB} MB limit. Please trim or compress it before uploading.`;
  }
  return null;
}
