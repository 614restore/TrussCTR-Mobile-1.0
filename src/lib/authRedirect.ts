function normalizeBaseUrl(rawUrl?: string | null) {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/+$/, '');
}

export function getPasswordResetRedirectUrl() {
  const configuredBaseUrl = normalizeBaseUrl(import.meta.env.VITE_APP_URL);

  if (configuredBaseUrl) {
    return `${configuredBaseUrl}/reset-password`;
  }

  if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
    return `${window.location.origin}/reset-password`;
  }

  return null;
}
