/**
 * NOAA SPC Storm Service
 *
 * Fetches verified storm reports from the NOAA Storm Prediction Center via a
 * Supabase Edge Function (supabase/functions/noaa-storms/index.ts).
 *
 * The Edge Function fetches and parses the SPC CSV server-side, eliminating
 * the CORS restriction that previously blocked web browser clients. Both
 * native (Capacitor) and web clients now receive storm data identically.
 *
 * Designed to be called:
 *   1. On app foreground (visibility change listener in Layout.tsx)
 *   2. When the user navigates to the Notifications page
 *
 * Rate-limited to once per 15 minutes in-memory.
 * Dedup is handled via localStorage (48-hour TTL on seen fingerprints).
 */

import { supabase, supabaseUrl, supabaseAnonKey } from './supabase';

const MIN_CHECK_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const DEDUP_TTL_MS          = 48 * 60 * 60 * 1000; // 48 hours

let lastCheckEpoch = 0;

// ─── Haversine distance (miles) ───────────────────────────────────────────────

function distanceMiles(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Dedup via localStorage ───────────────────────────────────────────────────

function getSeenFingerprints(): Set<string> {
  try {
    const raw = localStorage.getItem('noaa_seen_fps');
    if (!raw) return new Set();
    const entries: { fp: string; ts: number }[] = JSON.parse(raw);
    const cutoff = Date.now() - DEDUP_TTL_MS;
    return new Set(entries.filter((e) => e.ts > cutoff).map((e) => e.fp));
  } catch {
    return new Set();
  }
}

function markSeen(fingerprint: string) {
  try {
    const raw = localStorage.getItem('noaa_seen_fps');
    const entries: { fp: string; ts: number }[] = raw ? JSON.parse(raw) : [];
    const cutoff = Date.now() - DEDUP_TTL_MS;
    const fresh = entries.filter((e) => e.ts > cutoff);
    fresh.push({ fp: fingerprint, ts: Date.now() });
    localStorage.setItem('noaa_seen_fps', JSON.stringify(fresh));
  } catch {
    // localStorage unavailable — dedup misses this event, acceptable
  }
}

// ─── Event type (matches Edge Function response shape) ────────────────────────

interface ParsedEvent {
  type: 'HAIL' | 'WIND';
  magnitude: number; // inches for HAIL, mph for WIND
  lat: number;
  lng: number;
  location: string;
  state: string;
  eventDate: string; // YYYY-MM-DD
  fingerprint: string;
}

// ─── Edge Function fetch ──────────────────────────────────────────────────────

/**
 * Fetch storm events via the Supabase Edge Function.
 * Pass date=YYYY-MM-DD to fetch a specific archive day; omit for today+yesterday.
 */
async function fetchEventsFromEdgeFunction(date?: string): Promise<ParsedEvent[]> {
  try {
    const { data, error } = await (supabase.functions as any).invoke('noaa-storms', {
      ...(date ? { headers: {}, body: null, method: 'GET' } : {}),
      ...(date ? { queryParams: { date } } : {}),
    } as any);
    if (error) {
      console.warn('[NOAA] Edge Function error:', error.message);
      return [];
    }
    return (data?.events as ParsedEvent[]) ?? [];
  } catch (err) {
    console.warn('[NOAA] Edge Function call failed:', err);
    return [];
  }
}

async function fetchEventsForDate(date: string): Promise<ParsedEvent[]> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? supabaseAnonKey;
    const res = await fetch(
      `${supabaseUrl}/functions/v1/noaa-storms?date=${encodeURIComponent(date)}`,
      {
        headers: {
          'apikey':        supabaseAnonKey,
          'Authorization': `Bearer ${token}`,
        },
      },
    );
    if (!res.ok) {
      console.warn(`[NOAA] Archive fetch failed for ${date}: HTTP ${res.status}`);
      return [];
    }
    const json = await res.json();
    const events = (json?.events as ParsedEvent[]) ?? [];
    console.log(`[NOAA] ${date}: ${events.length} events`);
    return events;
  } catch (err) {
    console.warn(`[NOAA] Archive fetch error for ${date}:`, err);
    return [];
  }
}

// ─── Geocoding (same approach as hailAlertService) ────────────────────────────

async function geocodeQuery(query: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json&countryCode=US`,
    );
    if (!res.ok) return null;
    const json = await res.json();
    const first = json?.results?.[0];
    if (!first) return null;
    return { lat: Number(first.latitude), lng: Number(first.longitude) };
  } catch {
    return null;
  }
}

async function geocodeAddress(
  city?: string | null,
  state?: string | null,
  zip?: string | null,
): Promise<{ lat: number; lng: number } | null> {
  // Try multiple strategies in order of reliability
  // 1. ZIP code alone — most precise for US locations
  if (zip?.trim()) {
    const result = await geocodeQuery(zip.trim());
    if (result) return result;
  }
  // 2. City + State — very reliable for open-meteo
  if (city?.trim() && state?.trim()) {
    const result = await geocodeQuery(`${city.trim()}, ${state.trim()}, US`);
    if (result) return result;
  }
  // 3. City alone
  if (city?.trim()) {
    const result = await geocodeQuery(city.trim());
    if (result) return result;
  }
  return null;
}

// ─── Hail size label ──────────────────────────────────────────────────────────

function hailSizeLabel(inches: number): string {
  if (inches >= 4.5)  return `${inches}" (Baseball+)`;
  if (inches >= 2.75) return `${inches}" (Baseball)`;
  if (inches >= 1.75) return `${inches}" (Golf Ball)`;
  if (inches >= 1.5)  return `${inches}" (Walnut)`;
  if (inches >= 1.0)  return `${inches}" (Quarter)`;
  if (inches >= 0.75) return `${inches}" (Penny)`;
  return `${inches}"`;
}

// ─── Integration settings shape ───────────────────────────────────────────────

interface NoaaConfig {
  noaa_enabled: boolean;
  noaa_min_hail_inches: number;
  noaa_min_wind_mph: number;
  noaa_radius_miles: number;
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Run a NOAA SPC storm check for the given company.
 * Safe to call at any time — returns immediately if:
 *   - NOAA alerts are disabled for the company
 *   - The call is within the 15-minute rate-limit window
 */
export async function checkForNoaaStorms(companyId: string): Promise<void> {
  const now = Date.now();
  if (now - lastCheckEpoch < MIN_CHECK_INTERVAL_MS) return;
  lastCheckEpoch = now;

  try {
    // ── 1. Load NOAA settings from company_integrations ──────────────────────
    const { data: row } = await (supabase.from('company_integrations') as any)
      .select('noaa_enabled, noaa_min_hail_inches, noaa_min_wind_mph, noaa_radius_miles')
      .eq('company_id', companyId)
      .maybeSingle() as { data: NoaaConfig | null };

    // Default to enabled / standard thresholds if no row exists yet
    const cfg: NoaaConfig = {
      noaa_enabled:         row?.noaa_enabled         ?? true,
      noaa_min_hail_inches: row?.noaa_min_hail_inches ?? 1.0,
      noaa_min_wind_mph:    row?.noaa_min_wind_mph    ?? 58,
      noaa_radius_miles:    row?.noaa_radius_miles    ?? 25,
    };

    if (!cfg.noaa_enabled) return;

    // ── 2. Geocode company location ──────────────────────────────────────────
    const { data: company } = await (supabase
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .single() as unknown as Promise<{ data: Record<string, any> | null }>);

    const geo = company
      ? await geocodeAddress(
          (company as any).city,
          (company as any).state,
          (company as any).zip,
        )
      : null;

    if (!geo) {
      console.warn('[NOAA] Storm check skipped: set city/state in Company Profile.');
      return;
    }

    // ── 3. Fetch events via Edge Function (no CORS, works on web + native) ────
    const allEvents = await fetchEventsFromEdgeFunction();
    if (allEvents.length === 0) return;

    // ── 4. Filter by proximity and threshold ─────────────────────────────────
    const seen = getSeenFingerprints();
    let newCount = 0;

    for (const event of allEvents) {
      if (seen.has(event.fingerprint)) continue;

      const dist = distanceMiles(geo.lat, geo.lng, event.lat, event.lng);
      if (dist > cfg.noaa_radius_miles) continue;

      if (event.type === 'HAIL' && event.magnitude < cfg.noaa_min_hail_inches) continue;
      if (event.type === 'WIND' && event.magnitude < cfg.noaa_min_wind_mph)     continue;

      // ── 5. Write notification ─────────────────────────────────────────────
      const distStr = dist < 1
        ? 'within 1 mile'
        : `${Math.round(dist)} miles away`;
      const dateStr = new Date(event.eventDate + 'T12:00:00').toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      });

      const title   = event.type === 'HAIL'
        ? `Hail Confirmed — ${event.location}, ${event.state}`
        : `Wind Damage — ${event.location}, ${event.state}`;

      const message = event.type === 'HAIL'
        ? `NOAA reports ${hailSizeLabel(event.magnitude)} ${distStr} on ${dateStr}. Check pipeline for nearby contacts.`
        : `NOAA reports ${Math.round(event.magnitude)} mph winds ${distStr} on ${dateStr}. Inspect for damage.`;

      try {
        await (supabase.from('notifications') as any).insert({
          company_id: companyId,
          user_id:    null, // broadcast — all users on this account see it
          type:       'storm_alert',
          title,
          message,
          read:       false,
          metadata: {
            fingerprint:    event.fingerprint,
            event_type:     event.type,
            magnitude:      event.magnitude,
            lat:            event.lat,
            lng:            event.lng,
            location:       event.location,
            state:          event.state,
            event_date:     event.eventDate,
            distance_miles: Math.round(dist),
            source:         'noaa_spc',
          },
        });
        markSeen(event.fingerprint);
        newCount++;
      } catch {
        // Likely a duplicate — ignore
        markSeen(event.fingerprint);
      }
    }

    if (newCount > 0) {
      console.log(`[NOAA] Created ${newCount} storm notification(s)`);
    }

    // ── 6. Stamp last_checked_at ──────────────────────────────────────────────
    await (supabase.from('company_integrations') as any).upsert(
      { company_id: companyId, noaa_last_checked_at: new Date().toISOString() },
      { onConflict: 'company_id' },
    );

  } catch (err) {
    console.warn('[NOAA] Storm check failed:', err);
    lastCheckEpoch = 0; // reset so next foreground can retry
  }
}

// ─── Storm history query ──────────────────────────────────────────────────────

/**
 * Fetch the last 12 months of storm notifications for a company.
 * Used by the StormHistory page — returns both NOAA (storm_alert)
 * and HailTrace (hail_alert) records so the history is complete.
 */
export async function fetchStormHistory(companyId: string): Promise<any[]> {
  try {
    const since = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await (supabase.from('notifications') as any)
      .select('*')
      .eq('company_id', companyId)
      .in('type', ['storm_alert', 'hail_alert'])
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(200);
    return data ?? [];
  } catch {
    return [];
  }
}

// ─── Live NOAA feed (on-demand, no threshold filter, no rate limit) ───────────

export interface LiveNoaaEvent extends ParsedEvent {
  distanceMiles: number | null;
  isToday: boolean;
}

/**
 * Fetch ALL current NOAA SPC events and annotate each with distance from the
 * company's location.  No radius filter, no threshold filter — returns
 * everything so the user can browse the full live feed on demand.
 *
 * Pass `location` directly from profile.companies to avoid a redundant DB
 * query and any PostgREST schema-cache issues with newly added columns.
 *
 * Returns { events, fetchedAt } so the UI can show "last updated" time.
 */
export async function fetchLiveNoaaFeed(
  companyId: string,
  location?: { city?: string | null; state?: string | null; zip?: string | null },
): Promise<{
  events: LiveNoaaEvent[];
  fetchedAt: Date;
}> {
  // If location was passed in from the profile, use it directly.
  // Otherwise fall back to a DB query (for callers that don't have profile data).
  let city  = location?.city;
  let state = location?.state;
  let zip   = location?.zip;

  if (!city && !state && !zip) {
    const { data: companyData } = await (supabase
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .single() as unknown as Promise<{ data: Record<string, any> | null }>);
    city  = companyData?.city;
    state = companyData?.state;
    zip   = companyData?.zip;
  }

  console.log('[NOAA] Geocoding with:', { city, state, zip });
  const [allEvents, geo] = await Promise.all([
    fetchEventsFromEdgeFunction(),
    geocodeAddress(city, state, zip),
  ]);
  console.log('[NOAA] Geocode result:', geo);

  const todayStr = new Date().toISOString().slice(0, 10);

  const annotated: LiveNoaaEvent[] = allEvents.map((ev) => {
    const dist = geo
      ? Math.round(distanceMiles(geo.lat, geo.lng, ev.lat, ev.lng) * 10) / 10
      : null;
    return {
      ...ev,
      distanceMiles: dist,
      isToday: ev.eventDate === todayStr,
    };
  });

  // Sort nearest first; nulls (no company location) fall to the bottom
  annotated.sort((a, b) => {
    if (a.distanceMiles === null && b.distanceMiles === null) return 0;
    if (a.distanceMiles === null) return 1;
    if (b.distanceMiles === null) return -1;
    return a.distanceMiles - b.distanceMiles;
  });

  return { events: annotated, fetchedAt: new Date() };
}

/**
 * Force a fresh NOAA storm check regardless of the 15-min rate limit.
 * Intended for manual "Refresh" actions from the UI.
 */
export async function forceCheckForNoaaStorms(companyId: string): Promise<void> {
  lastCheckEpoch = 0; // bypass rate limit
  return checkForNoaaStorms(companyId);
}

// ─── Historical backfill ──────────────────────────────────────────────────────

export interface BackfillProgress {
  total: number;
  done: number;
  saved: number;
}

export interface BackfillOptions {
  /** Start date YYYY-MM-DD (inclusive). Defaults to 30 days ago. */
  fromDate?: string;
  /** End date YYYY-MM-DD (inclusive). Defaults to yesterday. */
  toDate?: string;
  /** Override ZIP / city / state for geocoding (e.g. searching a different city). */
  searchZip?: string;
  searchCity?: string;
  searchState?: string;
  /** Radius in miles. Defaults to 50 (more permissive than the alert default of 25). */
  radiusMiles?: number;
  /** Minimum hail size in inches. Defaults to 0.25 — capture all hail. */
  minHailInches?: number;
  /** Minimum wind speed in mph. Defaults to 35 — capture all wind reports. */
  minWindMph?: number;
}

/**
 * Backfill NOAA storm history for a given date range and location.
 * Fetches each day's SPC archive, filters by location + thresholds,
 * and inserts missing notifications.
 *
 * Defaults to very permissive thresholds so users can see all events
 * and filter in the UI rather than missing data during import.
 *
 * Calls onProgress(progress) after each day so the UI can show a progress bar.
 */
export async function backfillNoaaHistory(
  companyId: string,
  location: { city?: string | null; state?: string | null; zip?: string | null },
  options: BackfillOptions = {},
  onProgress?: (p: BackfillProgress) => void,
): Promise<{ saved: number }> {
  const {
    searchZip   = location.zip   ?? undefined,
    searchCity  = location.city  ?? undefined,
    searchState = location.state ?? undefined,
    radiusMiles   = 50,   // wider default for search vs alert default of 25
    minHailInches = 0.25, // capture all NOAA-reported hail (quarter-inch+)
    minWindMph    = 35,   // capture all NOAA-reported wind events
  } = options;

  // Determine date range
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().split('T')[0];
  const toDate   = options.toDate   ?? yesterday;
  const fromDate = options.fromDate ?? new Date(Date.now() - 30 * 86_400_000).toISOString().split('T')[0];

  // 1. Geocode search location (may differ from company address)
  const geo = await geocodeAddress(searchCity, searchState, searchZip);
  if (!geo) {
    console.warn('[NOAA Backfill] Cannot geocode search location — aborting.');
    return { saved: 0 };
  }

  // 2. Load existing notification fingerprints to avoid duplicates
  const since = new Date(fromDate + 'T00:00:00').toISOString();
  const { data: existing } = await (supabase.from('notifications') as any)
    .select('metadata')
    .eq('company_id', companyId)
    .in('type', ['storm_alert'])
    .gte('created_at', since) as { data: { metadata: any }[] | null };

  const existingFingerprints = new Set<string>(
    (existing ?? []).map((n) => n.metadata?.fingerprint).filter(Boolean),
  );

  // 3. Build list of dates in range (inclusive both ends)
  const dates: string[] = [];
  const startMs = new Date(fromDate + 'T12:00:00Z').getTime();
  const endMs   = new Date(toDate   + 'T12:00:00Z').getTime();
  for (let ms = startMs; ms <= endMs; ms += 86_400_000) {
    dates.push(new Date(ms).toISOString().split('T')[0]);
  }

  let saved = 0;
  const total = dates.length;

  // 5. Fetch each day and insert qualifying events (sequentially to avoid rate limiting)
  for (let i = 0; i < dates.length; i++) {
    const dateStr = dates[i];
    onProgress?.({ total, done: i, saved });

    const events = await fetchEventsForDate(dateStr);

    const toInsert: any[] = [];
    for (const event of events) {
      if (existingFingerprints.has(event.fingerprint)) continue;

      const dist = distanceMiles(geo.lat, geo.lng, event.lat, event.lng);
      if (dist > radiusMiles)                                           continue;
      if (event.type === 'HAIL' && event.magnitude < minHailInches)    continue;
      if (event.type === 'WIND' && event.magnitude < minWindMph)       continue;

      const distStr = dist < 1 ? 'within 1 mile' : `${Math.round(dist)} miles away`;
      const dateLabel = new Date(event.eventDate + 'T12:00:00').toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      });

      const title = event.type === 'HAIL'
        ? `Hail Report: ${event.magnitude}" — ${distStr}`
        : `Wind Report: ${Math.round(event.magnitude)} mph — ${distStr}`;

      toInsert.push({
        company_id: companyId,
        type:       'storm_alert',
        title,
        body:       `${event.location}, ${event.state} on ${dateLabel}`,
        read:       true, // backfilled history — don't trigger badge
        metadata: {
          fingerprint:  event.fingerprint,
          event_type:   event.type,
          magnitude:    event.magnitude,
          distance_miles: Math.round(dist),
          city:         event.location,
          state:        event.state,
          source:       'noaa_spc',
          event_date:   event.eventDate,
        },
        created_at: event.eventDate + 'T12:00:00.000Z',
      });

      existingFingerprints.add(event.fingerprint); // prevent intra-batch duplicates
    }

    if (toInsert.length > 0) {
      await (supabase.from('notifications') as any).insert(toInsert);
      saved += toInsert.length;
    }
  }

  onProgress?.({ total, done: total, saved });
  return { saved };
}
