import { createClient } from '@supabase/supabase-js';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Database } from '../types/supabase';

export const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL     as string;
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials missing. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment.');
}

const TIMEOUT_MS = 20000;

// Forbidden response-header names per the Fetch spec.
// WebKit throws "The string did not match the expected pattern" if any of
// these are passed to the new Response() constructor on iOS.
const FORBIDDEN_RESPONSE_HEADERS = new Set([
  'set-cookie', 'set-cookie2',
]);

// Native HTTP path — uses NSURLSession via CapacitorHttp instead of the
// WKWebView network layer, which is significantly faster for Supabase writes.
// Only used for REST/storage URLs — auth endpoints stay on standard fetch
// because Supabase auth returns Set-Cookie and other forbidden headers that
// break the new Response() constructor in WebKit.
const nativeFetch = async (url: string, options: RequestInit = {}): Promise<Response> => {
  const method = ((options.method as string) || 'GET').toUpperCase();

  const headers: Record<string, string> = {};
  new Headers(options.headers).forEach((v, k) => { headers[k] = v; });

  let data: unknown = undefined;
  if (options.body) {
    try { data = JSON.parse(options.body as string); }
    catch { data = options.body; }
  }

  const res = await CapacitorHttp.request({
    url,
    method,
    headers,
    data,
    // 'text' avoids JSON parse errors on empty 204 bodies from
    // minimal insert/update responses — Supabase parses the body itself.
    responseType:   'text',
    connectTimeout: TIMEOUT_MS,
    readTimeout:    TIMEOUT_MS,
  });

  // Strip forbidden headers before constructing the JS Response object.
  const safeHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(res.headers || {})) {
    if (!FORBIDDEN_RESPONSE_HEADERS.has(k.toLowerCase())) {
      safeHeaders[k] = v as string;
    }
  }

  return new Response(
    res.data != null && (res.data as string).length > 0 ? (res.data as string) : null,
    { status: res.status, headers: safeHeaders },
  );
};

// Standard fetch with AbortController timeout — used for auth and web.
const webFetch = (url: RequestInfo | URL, options?: RequestInit): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return fetch(url as RequestInfo, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
};

const fetchWithTimeout = (url: RequestInfo | URL, options?: RequestInit): Promise<Response> => {
  const urlStr = url.toString();

  // On native, route REST + storage through NSURLSession for speed.
  // Auth endpoints (/auth/v1/) always use WebKit fetch — they return
  // Set-Cookie and other forbidden headers that break new Response() on iOS.
  if (Capacitor.isNativePlatform() && !urlStr.includes('/auth/v1/')) {
    return nativeFetch(urlStr, options ?? {});
  }

  return webFetch(url, options);
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
