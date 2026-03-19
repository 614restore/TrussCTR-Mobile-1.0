export type InspectionPhotoStorageMode = 'app_files' | 'photo_library';

const STORAGE_MODE_KEY = 'trussctr.inspectionPhotoStorageMode';

export function getInspectionPhotoStorageMode(): InspectionPhotoStorageMode {
  if (typeof window === 'undefined') return 'app_files';
  const stored = window.localStorage.getItem(STORAGE_MODE_KEY);
  return stored === 'photo_library' ? 'photo_library' : 'app_files';
}

export function setInspectionPhotoStorageMode(mode: InspectionPhotoStorageMode) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_MODE_KEY, mode);
}
