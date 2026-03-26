import { createClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { Database } from '../types/supabase';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials missing. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment.');
}

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
  }
);
