/**
 * Supabase Edge Function — roofhub-proxy
 *
 * Server-side proxy for the SRS Distribution / Roof Hub SIPS API.
 * Keeps the TrussCTR SIPS client credentials (Client ID + Secret)
 * out of the browser bundle and handles token refresh.
 *
 * The SIPS API requires a partnership application to SRS Distribution:
 *   Contact: APISupportTeam@srsdistribution.com
 * Once approved, set ROOFHUB_CLIENT_ID and ROOFHUB_CLIENT_SECRET
 * as Supabase Edge Function secrets.
 *
 * Request body (JSON):
 *   {
 *     action: 'test' | 'get_branches' | 'get_products' | 'get_price'
 *             | 'submit_order' | 'get_order_status',
 *     integrationKey: string,   // user's Roof Hub Integration Key
 *     payload?: object,         // action-specific data
 *   }
 *
 * Supported actions:
 *   test             — Verify the integration key is valid
 *   get_branches     — List SRS branch locations for the account
 *   get_products     — List active products for a branch
 *   get_price        — Get real-time pricing for product(s)
 *   submit_order     — Submit an order to SRS
 *   get_order_status — Get status of a submitted order
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// SIPS API base URL — QA for testing, production for live orders
// Update to 'https://services.roofhub.pro' once SIPS credentials are approved
const SIPS_BASE_URL = Deno.env.get('ROOFHUB_API_URL') ?? 'https://services.roofhub.pro';

// Token cache (in-memory, per isolate — refreshes on cold start)
let cachedToken: string | null = null;
let tokenExpiresAt: number = 0;

// ── Get SIPS Auth Token ───────────────────────────────────────────────────────
async function getSipsToken(): Promise<string> {
  const clientId     = Deno.env.get('ROOFHUB_CLIENT_ID');
  const clientSecret = Deno.env.get('ROOFHUB_CLIENT_SECRET');

  // If TrussCTR has not yet registered with SRS Distribution for SIPS access,
  // we fall back to using the user's integration key directly as a bearer token.
  if (!clientId || !clientSecret) {
    return '__use_integration_key__';
  }

  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt - 60_000) {
    return cachedToken;
  }

  const res = await fetch(`${SIPS_BASE_URL}/authentication/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, clientSecret }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`SIPS auth failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  cachedToken    = data.token ?? data.access_token ?? data.accessToken;
  // Tokens are valid for 24 hours per SIPS docs
  tokenExpiresAt = now + (data.expiresIn ? data.expiresIn * 1000 : 23 * 60 * 60 * 1000);
  return cachedToken!;
}

// ── SIPS API Call ─────────────────────────────────────────────────────────────
async function sipsRequest(
  method: string,
  path: string,
  integrationKey: string,
  body?: object,
): Promise<{ ok: boolean; status: number; data: any }> {
  const token = await getSipsToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Integration-Key': integrationKey,
  };

  // Use SIPS OAuth token if available, otherwise use integration key directly
  if (token === '__use_integration_key__') {
    headers['Authorization'] = `Bearer ${integrationKey}`;
  } else {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${SIPS_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data: any;
  try { data = await res.json(); } catch { data = {}; }

  return { ok: res.ok, status: res.status, data };
}

// ─── Handler ──────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ── 1. Authenticate the caller ──────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabaseUrl    = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnon   = Deno.env.get('SUPABASE_ANON_KEY')!;
    const callerClient   = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
      auth:   { persistSession: false },
    });

    const { data: { user }, error: authError } = await callerClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── 2. Parse request ────────────────────────────────────────────────────
    const { action, integrationKey, payload = {} } = await req.json();

    if (!integrationKey || typeof integrationKey !== 'string') {
      return new Response(
        JSON.stringify({ error: 'integrationKey is required.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── 3. Route action ─────────────────────────────────────────────────────
    let result: any;

    switch (action) {

      case 'test': {
        // Verify credentials by fetching branch list
        const r = await sipsRequest('GET', '/v1/branches', integrationKey);
        if (r.ok) {
          result = { connected: true, message: 'Roof Hub integration is active.' };
        } else if (r.status === 401 || r.status === 403) {
          result = { connected: false, message: 'Invalid integration key. Please check your Roof Hub account.' };
        } else {
          result = { connected: false, message: `SRS API returned ${r.status}. Please try again.` };
        }
        break;
      }

      case 'get_branches': {
        const r = await sipsRequest('GET', '/v1/branches', integrationKey);
        if (!r.ok) throw new Error(r.data?.message ?? `SRS API error ${r.status}`);
        result = { branches: r.data?.branches ?? r.data ?? [] };
        break;
      }

      case 'get_products': {
        const branchId = payload.branchId;
        const path = branchId
          ? `/v1/branches/${branchId}/products`
          : '/v1/products';
        const r = await sipsRequest('GET', path, integrationKey);
        if (!r.ok) throw new Error(r.data?.message ?? `SRS API error ${r.status}`);
        result = { products: r.data?.products ?? r.data ?? [] };
        break;
      }

      case 'get_price': {
        // payload: { branchId, productIds: string[], jobAccountNumber?: string }
        const r = await sipsRequest('POST', '/v1/pricing', integrationKey, {
          branchId:         payload.branchId,
          productIds:       payload.productIds,
          jobAccountNumber: payload.jobAccountNumber,
        });
        if (!r.ok) throw new Error(r.data?.message ?? `SRS API error ${r.status}`);
        result = { pricing: r.data?.pricing ?? r.data ?? [] };
        break;
      }

      case 'submit_order': {
        // payload: { branchId, jobAccountNumber, deliveryDate, notes, lineItems, contactAddress }
        const r = await sipsRequest('POST', '/v1/orders', integrationKey, {
          branchId:         payload.branchId,
          jobAccountNumber: payload.jobAccountNumber,
          deliveryDate:     payload.deliveryDate,
          deliveryAddress:  payload.contactAddress,
          notes:            payload.notes,
          lineItems:        payload.lineItems ?? [],
          async:            true, // use async submission per SIPS recommendation
        });
        if (!r.ok) throw new Error(r.data?.message ?? `SRS API error ${r.status}`);
        result = {
          roofhubOrderId: r.data?.orderId ?? r.data?.id ?? r.data?.order_id,
          status:         r.data?.status ?? 'submitted',
          data:           r.data,
        };
        break;
      }

      case 'get_order_status': {
        // payload: { roofhubOrderId }
        const orderId = payload.roofhubOrderId;
        if (!orderId) throw new Error('roofhubOrderId is required.');
        const r = await sipsRequest('GET', `/v1/orders/${orderId}`, integrationKey);
        if (!r.ok) throw new Error(r.data?.message ?? `SRS API error ${r.status}`);
        result = {
          status:       r.data?.status,
          trackingInfo: r.data?.tracking,
          data:         r.data,
        };
        break;
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
    }

    return new Response(
      JSON.stringify({ success: true, ...result }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unexpected error.';
    console.error('[roofhub-proxy]', message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
