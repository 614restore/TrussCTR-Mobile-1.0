import { Capacitor, registerPlugin } from '@capacitor/core';

type NativeCompressImageResult = {
  base64: string;
  width?: number;
  height?: number;
  size?: number;
};

type NativeLightCompressor = {
  compressImage(options: {
    base64: string;
    maxWidth?: number;
    maxHeight?: number;
    quality?: number;
  }): Promise<NativeCompressImageResult>;
};

const LightCompressor = registerPlugin<NativeLightCompressor>('LightCompressor');

export const PHOTO_POLICY_PRESETS = {
  standard3mp: { width: 2048, height: 1536, quality: 0.84 },
  high8mp: { width: 3264, height: 2448, quality: 0.88 },
} as const;

export const VIDEO_POLICY = {
  maxBytes: 200 * 1024 * 1024,
  maxWidth: 1920,
  maxHeight: 1080,
  maxFrameRate: 30,
} as const;

function stripDataUrlHeader(value: string): string {
  const idx = value.indexOf(',');
  return idx >= 0 ? value.slice(idx + 1) : value;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBlob(base64: string, contentType = 'image/jpeg'): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: contentType });
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return bytesToBase64(bytes);
}

async function compressWithCanvas(
  blob: Blob,
  maxWidth: number,
  maxHeight: number,
  quality: number
): Promise<Blob> {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Image load failed'));
      img.src = objectUrl;
    });

    const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas context unavailable');
    }
    ctx.drawImage(image, 0, 0, width, height);

    const output = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (next) => (next ? resolve(next) : reject(new Error('Canvas compression failed'))),
        'image/jpeg',
        quality
      );
    });
    return output;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function compressImageWithLightCompressor(
  input: Blob,
  options: { maxWidth: number; maxHeight: number; quality: number }
): Promise<Blob> {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios') {
    try {
      const base64 = await blobToBase64(input);
      const result = await LightCompressor.compressImage({
        base64,
        maxWidth: options.maxWidth,
        maxHeight: options.maxHeight,
        quality: options.quality,
      });
      return base64ToBlob(stripDataUrlHeader(result.base64), 'image/jpeg');
    } catch (error) {
      console.warn('Native LightCompressor unavailable, using canvas fallback:', error);
    }
  }

  return compressWithCanvas(input, options.maxWidth, options.maxHeight, options.quality);
}

export async function validateVideoForCloud(file: File): Promise<string | null> {
  if (!file.type.startsWith('video/')) return null;
  if (file.size > VIDEO_POLICY.maxBytes) {
    return 'Video must be 200MB or smaller.';
  }

  try {
    const objectUrl = URL.createObjectURL(file);
    const meta = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => resolve({ width: video.videoWidth, height: video.videoHeight });
      video.onerror = () => reject(new Error('Unable to read video metadata'));
      video.src = objectUrl;
    });
    URL.revokeObjectURL(objectUrl);

    if (meta.width > VIDEO_POLICY.maxWidth || meta.height > VIDEO_POLICY.maxHeight) {
      return 'Cloud video upload supports up to 1080p. 4K should stay local-only.';
    }
  } catch {
    return null;
  }

  return null;
}
