import { createClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { Database } from '../types/supabase';

export const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL     as string;
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials missing. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment.');
}

// Custom fetch with a 20-second hard timeout on every Supabase request.
// In Capacitor iOS WebViews the autoRefreshToken mechanism can occasionally
// hang indefinitely (no network error is thrown), which causes inserts and
// other operations to spin forever. AbortController gives us a guaranteed
// escape hatch so the Promise.race timeout in callers actually fires.
const fetchWithTimeout = (url: RequestInfo | URL, options?: RequestInit): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, 20000); // 20 s — generous enough for slow connections, tight enough to unblock UI
  return fetch(url as RequestInfo, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
};

export const supabase = createClient<Database>(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder',
  {
    auth: {
      persistSession: true,
      // Native Capacitor bundles serve from a local WebView with no real URL, so
      // hash-based token detection must be disabled there. For the browser/web
      // version (where invite and reset links actually land), it must be enabled
      // so Supabase can auto-process the access_token / code in the URL.
      detectSessionInUrl: !Capacitor.isNativePlatform(),
      autoRefreshToken: true,
      storage: window.localStorage,
      // Use implicit flow so password-reset emails contain #access_token=...
      // in the URL hash. PKCE stores its code_verifier in the originating app's
      // localStorage — when the link opens in a browser that verifier is not
      // present, causing "invalid or expired reset link" on the web app.
      flowType: 'implicit',
    },
    global: {
      // Apply the timeout fetch to ALL Supabase requests (auth token refresh,
      // PostgREST queries, storage, realtime handshake, etc.)
      fetch: fetchWithTimeout,
    },
  }
);
