import { createClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { Database } from '../types/supabase';

export const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL     as string;
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials missing. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment.');
}

const SUPABASE_FETCH_TIMEOUT_MS = Capacitor.isNativePlatform() ? 45000 : 20000;

// Custom fetch with a hard timeout on every Supabase request.
// Native Capacitor WebViews can take substantially longer to complete auth or
// PostgREST requests on cold start, so mobile gets a wider timeout window.
const fetchWithTimeout = (url: RequestInfo | URL, options?: RequestInit): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, SUPABASE_FETCH_TIMEOUT_MS);
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
