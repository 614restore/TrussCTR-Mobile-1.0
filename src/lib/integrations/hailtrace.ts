/**
 * HailTrace API client
 *
 * Docs / API key: https://hailtrace.com
 *
 * HailTrace exposes hail-event data by lat/lon + radius.
 * The request format below matches their REST API.
 * If your account uses a different endpoint or auth header,
 * update HAILTRACE_BASE and the fetch call below accordingly.
 *
 * Endpoint:  GET https://api.hailtrace.com/v1/events
 * Auth:      query param  api_key={key}
 * Params:    lat, lng, radius (miles), from (YYYY-MM-DD), to (YYYY-MM-DD, optional)
 */

const HAILTRACE_BASE = 'https://api.hailtrace.com/v1';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface HailEvent {
  /** Unique event ID from HailTrace */
  id: string;
  /** ISO date string of the hail event */
  eventDate: string;
  /** Largest hail stone measured in inches */
  maxSizeInches: number;
  /** Human-readable size label e.g. "1¼ inch" */
  sizeLabel: string;
  /** City nearest to the hail event */
  city: string;
  state: string;
  lat: number;
  lng: number;
  /** Distance in miles from the query center */
  distanceMiles: number;
}

// ─── Internal API shape ───────────────────────────────────────────────────────

interface RawHailEvent {
  id: string;
  date: string;
  max_hail_size: number;    // inches
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  distance_miles: number;
}

interface HailTraceResponse {
  success: boolean;
  events: RawHailEvent[];
  message?: string;
}

// ─── Size formatting ──────────────────────────────────────────────────────────

function formatHailSize(inches: number): string {
  if (inches >= 4.5)  return `${inches}" (Baseball+)`;
  if (inches >= 2.75) return `${inches}" (Baseball)`;
  if (inches >= 1.75) return `${inches}" (Golf Ball)`;
  if (inches >= 1.5)  return `${inches}" (Walnut)`;
  if (inches >= 1.0)  return `${inches}" (Quarter)`;
  if (inches >= 0.75) return `${inches}" (Penny)`;
  return `${inches}"`;
}

// ─── API call ─────────────────────────────────────────────────────────────────

/**
 * Fetch hail events within a radius of a lat/lng since a given date.
 * Returns an empty array (never throws) on API error so the app degrades
 * gracefully when HailTrace is unreachable.
 */
export async function fetchRecentHailEvents(
  apiKey: string,
  lat: number,
  lng: number,
  radiusMiles: number,
  since: Date,
): Promise<HailEvent[]> {
  const from = since.toISOString().split('T')[0]; // YYYY-MM-DD
  const params = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
    radius: String(radiusMiles),
    from,
    api_key: apiKey,
  });

  const res = await fetch(`${HAILTRACE_BASE}/events?${params}`, {
    headers: { Accept: 'application/json' },
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error('HailTrace API key is invalid or expired.');
  }
  if (!res.ok) {
    throw new Error(`HailTrace API error (${res.status})`);
  }

  const json: HailTraceResponse = await res.json();

  if (!json.success) {
    throw new Error(json.message ?? 'HailTrace returned an error response');
  }

  return (json.events ?? []).map((e) => ({
    id: e.id,
    eventDate: e.date,
    maxSizeInches: e.max_hail_size,
    sizeLabel: formatHailSize(e.max_hail_size),
    city: e.city,
    state: e.state,
    lat: e.latitude,
    lng: e.longitude,
    distanceMiles: Math.round(e.distance_miles),
  }));
}

/**
 * Validate that an API key works by requesting events for a tiny radius.
 * Returns true if the key is accepted, false if invalid, throws on network error.
 */
export async function validateHailTraceKey(
  apiKey: string,
  lat: number,
  lng: number,
): Promise<boolean> {
  try {
    await fetchRecentHailEvents(apiKey, lat, lng, 1, new Date(Date.now() - 86_400_000));
    return true;
  } catch (err) {
    if (err instanceof Error && err.message.includes('invalid')) return false;
    throw err;
  }
}
