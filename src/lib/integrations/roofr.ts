// Roofr API client — lightweight version for mobile app
// Full docs: https://dev.roofr.com/

export interface RoofrReportOrder {
  address: string;
  city: string;
  state: string;
  zip: string;
  contactId?: string;
  reportType?: 'standard' | 'premium';
}

export interface RoofrReport {
  id: string;
  status: string;
  address: string;
  reportType: string;
  orderedAt: string;
  completedAt?: string;
  downloadUrl?: string;
  measurements?: {
    totalSquares: number;
    totalSqFt: number;
    ridgeLength: number;
    hipLength: number;
    valleyLength: number;
    eaveLength: number;
    rakeLength: number;
    flashingLength: number;
    predominantPitch: string;
    facetCount: number;
  };
}

export class RoofrClient {
  private apiKey: string;
  private baseUrl = 'https://api.roofr.com/v1';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  async testConnection(): Promise<boolean> {
    const res = await fetch(`${this.baseUrl}/account`, { headers: this.headers() });
    return res.ok;
  }

  async orderReport(order: RoofrReportOrder): Promise<RoofrReport> {
    const res = await fetch(`${this.baseUrl}/reports`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        address: order.address,
        city: order.city,
        state: order.state,
        zip: order.zip,
        report_type: order.reportType ?? 'standard',
        reference_id: order.contactId,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`Roofr order failed (${res.status}): ${text}`);
    }
    return this.normalize(await res.json());
  }

  async getReport(reportId: string): Promise<RoofrReport> {
    const res = await fetch(`${this.baseUrl}/reports/${reportId}`, { headers: this.headers() });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`Roofr fetch failed (${res.status}): ${text}`);
    }
    return this.normalize(await res.json());
  }

  private normalize(raw: any): RoofrReport {
    const m = raw.measurements ?? raw.report_data ?? null;
    return {
      id: String(raw.id ?? raw.report_id ?? ''),
      status: raw.status ?? 'pending',
      address: [raw.address, raw.city, raw.state, raw.zip].filter(Boolean).join(', '),
      reportType: raw.report_type ?? 'standard',
      orderedAt: raw.created_at ?? new Date().toISOString(),
      completedAt: raw.completed_at ?? undefined,
      downloadUrl: raw.download_url ?? raw.pdf_url ?? raw.report_url ?? undefined,
      measurements: m ? {
        totalSquares: m.total_squares ?? m.squares ?? 0,
        totalSqFt: m.total_sq_ft ?? m.square_footage ?? 0,
        ridgeLength: m.ridge_length ?? 0,
        hipLength: m.hip_length ?? 0,
        valleyLength: m.valley_length ?? 0,
        eaveLength: m.eave_length ?? m.perimeter ?? 0,
        rakeLength: m.rake_length ?? 0,
        flashingLength: m.flashing_length ?? 0,
        predominantPitch: m.predominant_pitch ?? m.pitch ?? '—',
        facetCount: m.facet_count ?? m.facets ?? 0,
      } : undefined,
    };
  }
}
