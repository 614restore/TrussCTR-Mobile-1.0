function normalizeBaseUrl(rawUrl?: string | null) {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/+$/, '');
}

export function getPasswordResetRedirectUrl(): string | null {
  const configuredBaseUrl = normalizeBaseUrl(import.meta.env.VITE_APP_URL);

  if (configuredBaseUrl) {
    return `${configuredBaseUrl}/reset-password`;
  }

  const proto = window.location.protocol;
  if (proto === 'http:' || proto === 'https:') {
    return `${window.location.origin}/reset-password`;
  }

  // Capacitor/native: protocol is "capacitor:" — no origin-based URL is valid.
  // Return null so the caller omits redirectTo and Supabase uses the URL
  // configured in the dashboard (Authentication → URL Configuration → Redirect URLs).
  return null;
}
