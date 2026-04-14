import { createClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { Database } from '../types/supabase';

export const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL     as string;
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials missing. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment.');
}

const TIMEOUT_MS = 20000;

// Standard fetch with AbortController timeout on all platforms.
// CapacitorHttp was previously used here for native performance but caused
// WebKit to throw "The string did not match the expected pattern" when
// constructing a Response with forbidden headers (e.g. Set-Cookie) returned
// by the Supabase auth server.
const fetchWithTimeout = (url: RequestInfo | URL, options?: RequestInit): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return fetch(url as RequestInfo, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
};

export const supabase = createClient<Database>(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder',
  {
    auth: {
      persistSession: true,
      detectSessionInUrl: !Capacitor.isNativePlatform(),
      autoRefreshToken: true,
      storage: window.localStorage,
      flowType: 'implicit',
    },
    global: {
      fetch: fetchWithTimeout,
    },
  }
);
