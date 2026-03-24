export type InspectionPhotoStorageMode = 'app_files' | 'photo_library';
export type ElevationStyle = 'cardinal' | 'relative';

const STORAGE_MODE_KEY  = 'trussctr.inspectionPhotoStorageMode';
const ELEVATION_STYLE_KEY = 'trussctr.elevationStyle';

export function getInspectionPhotoStorageMode(): InspectionPhotoStorageMode {
  if (typeof window === 'undefined') return 'app_files';
  const stored = window.localStorage.getItem(STORAGE_MODE_KEY);
  return stored === 'photo_library' ? 'photo_library' : 'app_files';
}

export function setInspectionPhotoStorageMode(mode: InspectionPhotoStorageMode) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_MODE_KEY, mode);
}

export function getElevationStyle(): ElevationStyle {
  if (typeof window === 'undefined') return 'cardinal';
  const stored = window.localStorage.getItem(ELEVATION_STYLE_KEY);
  return stored === 'relative' ? 'relative' : 'cardinal';
}

export function setElevationStyle(style: ElevationStyle) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ELEVATION_STYLE_KEY, style);
}

/** The four compass-style elevation labels for the chosen style. */
export const CARDINAL_DIRS  = ['North', 'South', 'East', 'West'] as const;
export const RELATIVE_DIRS  = ['Front', 'Back', 'Left', 'Right'] as const;
export const FIXED_DIRS     = ['Garage', 'Detached'] as const;

export function getMainElevations(style: ElevationStyle): string[] {
  return style === 'cardinal' ? [...CARDINAL_DIRS] : [...RELATIVE_DIRS];
}

export function getAllElevations(style: ElevationStyle): string[] {
  return [...getMainElevations(style), ...FIXED_DIRS];
}
