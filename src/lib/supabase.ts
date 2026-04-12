import { createClient } from '@supabase/supabase-js';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Database } from '../types/supabase';

export const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL     as string;
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials missing. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment.');
}

const TIMEOUT_MS = Capacitor.isNativePlatform() ? 15000 : 20000;

// On native iOS/Android: route through CapacitorHttp (NSURLSession) instead of
// WKWebView's fetch — avoids the WebKit network layer and gives us true native
// HTTP/2 connection pooling, which is significantly faster for Supabase writes.
//
// On web: plain fetch with an AbortController timeout.
const fetchWithTimeout = Capacitor.isNativePlatform()
  ? async (url: RequestInfo | URL, options: RequestInit = {}): Promise<Response> => {
      const method = ((options.method as string) || 'GET').toUpperCase();

      // Flatten headers into a plain object for CapacitorHttp
      const headers: Record<string, string> = {};
      new Headers(options.headers).forEach((v, k) => { headers[k] = v; });

      // Parse JSON body if present; CapacitorHttp wants a plain object, not a string
      let data: unknown = undefined;
      if (options.body) {
        try { data = JSON.parse(options.body as string); }
        catch { data = options.body; }
      }

      const res = await CapacitorHttp.request({
        url:            url.toString(),
        method,
        headers,
        data,
        // Use 'text' so empty 204 bodies (minimal insert/update responses) don't
        // throw a JSON parse error — Supabase calls .text()/.json() itself.
        responseType:   'text',
        connectTimeout: TIMEOUT_MS,
        readTimeout:    TIMEOUT_MS,
      });

      return new Response(
        res.data != null && (res.data as string).length > 0 ? res.data as string : null,
        { status: res.status, headers: res.headers as HeadersInit }
      );
    }
  : (url: RequestInfo | URL, options?: RequestInit): Promise<Response> => {
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
      // Native Capacitor bundles serve from a local WebView with no real URL, so
      // hash-based token detection must be disabled there. For the browser/web
      // version (where invite and reset links actually land), it must be enabled
      // so Supabase can auto-process the access_token / code in the URL.
      detectSessionInUrl: !Capacitor.isNativePlatform(),
      autoRefreshToken: true,
      storage: window.localStorage,
      // Use implicit flow so password-reset emails contain #access_token=...
      // in the URL hash.
      flowType: 'implicit',
    },
    global: {
      fetch: fetchWithTimeout,
    },
  }
);
