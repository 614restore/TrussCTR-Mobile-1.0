/**
 * Roof Hub (SRS Distribution) integration client.
 *
 * All calls are proxied through the `roofhub-proxy` Supabase Edge Function
 * so that SIPS credentials never leave the server.
 *
 * Users obtain their Integration Key from:
 *   Roof Hub account → More → Integrations → Copy Integration Key
 *
 * For TrussCTR to enable live order submission, register as a SIPS partner:
 *   Email: APISupportTeam@srsdistribution.com
 *   Docs:  https://apidocs.roofhub.pro
 */

import { supabase, supabaseUrl } from '../supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RoofHubBranch {
  id: string;
  name: string;
  address?: string;
  city?: string;
  state?: string;
  phone?: string;
}

export interface RoofHubProduct {
  id: string;
  name: string;
  sku?: string;
  category?: string;
  unitOfMeasure?: string;
  description?: string;
}

export interface RoofHubPriceItem {
  productId: string;
  productName?: string;
  price: number;
  unitOfMeasure?: string;
  available?: boolean;
}

export interface RoofHubOrderLineItem {
  productId: string;
  productName?: string;
  quantity: number;
  unitOfMeasure?: string;
  unitPrice?: number;
}

export interface RoofHubOrderPayload {
  branchId: string;
  jobAccountNumber?: string;
  deliveryDate?: string;
  contactAddress?: string;
  notes?: string;
  lineItems: RoofHubOrderLineItem[];
}

export interface RoofHubOrderStatus {
  status: string;
  trackingInfo?: string;
  data?: any;
}

// ─── Internal proxy call ──────────────────────────────────────────────────────

async function callProxy(
  action: string,
  integrationKey: string,
  payload?: object,
): Promise<any> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated.');

  const res = await fetch(`${supabaseUrl}/functions/v1/roofhub-proxy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ action, integrationKey, payload }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error ?? `Roof Hub proxy error (${res.status})`);
  }
  return data;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Verify that the integration key is valid.
 */
export async function testRoofHubConnection(
  integrationKey: string,
): Promise<{ connected: boolean; message: string }> {
  const data = await callProxy('test', integrationKey);
  return { connected: !!data.connected, message: data.message ?? '' };
}

/**
 * List SRS branch locations associated with the account.
 */
export async function getRoofHubBranches(
  integrationKey: string,
): Promise<RoofHubBranch[]> {
  const data = await callProxy('get_branches', integrationKey);
  return data.branches ?? [];
}

/**
 * List active products for a given branch.
 */
export async function getRoofHubProducts(
  integrationKey: string,
  branchId?: string,
): Promise<RoofHubProduct[]> {
  const data = await callProxy('get_products', integrationKey, { branchId });
  return data.products ?? [];
}

/**
 * Get real-time pricing for one or more products at a branch.
 */
export async function getRoofHubPricing(
  integrationKey: string,
  branchId: string,
  productIds: string[],
  jobAccountNumber?: string,
): Promise<RoofHubPriceItem[]> {
  const data = await callProxy('get_price', integrationKey, {
    branchId,
    productIds,
    jobAccountNumber,
  });
  return data.pricing ?? [];
}

/**
 * Submit a material order to SRS Distribution through Roof Hub.
 * Returns the Roof Hub order ID and initial status.
 */
export async function submitRoofHubOrder(
  integrationKey: string,
  order: RoofHubOrderPayload,
): Promise<{ roofhubOrderId: string; status: string }> {
  const data = await callProxy('submit_order', integrationKey, order);
  return {
    roofhubOrderId: data.roofhubOrderId ?? '',
    status: data.status ?? 'submitted',
  };
}

/**
 * Get the current status of a submitted Roof Hub order.
 */
export async function getRoofHubOrderStatus(
  integrationKey: string,
  roofhubOrderId: string,
): Promise<RoofHubOrderStatus> {
  const data = await callProxy('get_order_status', integrationKey, { roofhubOrderId });
  return {
    status:       data.status ?? 'unknown',
    trackingInfo: data.trackingInfo,
    data:         data.data,
  };
}
