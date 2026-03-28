// EagleView API client — lightweight version for mobile app

export interface EagleViewOrder {
  orderId: string;
  status: string;
  statusMessage?: string;
  downloadUrl?: string;
}

export class EagleViewClient {
  private apiKey: string;
  private clientId: string;
  private baseUrl: string;

  constructor(apiKey: string, clientId: string, environment: 'production' | 'sandbox' = 'production') {
    this.apiKey = apiKey;
    this.clientId = clientId;
    this.baseUrl = environment === 'sandbox'
      ? 'https://api-sandbox.eagleview.com/v1'
      : 'https://api.eagleview.com/v1';
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'X-Client-Id': this.clientId,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  async orderReport(
    address: string,
    reportType: 'standard' | 'premium',
    meta?: { contact_id?: string; customer_name?: string }
  ): Promise<EagleViewOrder> {
    const res = await fetch(`${this.baseUrl}/orders`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        address,
        report_type: reportType,
        reference_id: meta?.contact_id,
        customer_name: meta?.customer_name,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`EagleView order failed (${res.status}): ${text}`);
    }
    const data = await res.json();
    return {
      orderId: String(data.order_id ?? data.id ?? ''),
      status: data.status ?? 'pending',
      statusMessage: data.status_message ?? data.message,
      downloadUrl: data.download_url ?? data.report_url,
    };
  }

  async getOrderStatus(orderId: string): Promise<EagleViewOrder> {
    const res = await fetch(`${this.baseUrl}/orders/${orderId}`, { headers: this.headers() });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`EagleView status failed (${res.status}): ${text}`);
    }
    const data = await res.json();
    return {
      orderId,
      status: data.status ?? 'pending',
      statusMessage: data.status_message ?? data.message,
      downloadUrl: data.download_url ?? data.report_url,
    };
  }

  async downloadReport(orderId: string): Promise<Blob> {
    const res = await fetch(`${this.baseUrl}/orders/${orderId}/download`, { headers: this.headers() });
    if (!res.ok) throw new Error(`Download failed (${res.status})`);
    return res.blob();
  }

  async getAccountCredits(): Promise<number | null> {
    try {
      const res = await fetch(`${this.baseUrl}/account`, { headers: this.headers() });
      if (!res.ok) return null;
      const data = await res.json();
      return data.credits_available ?? data.balance ?? null;
    } catch { return null; }
  }
}
