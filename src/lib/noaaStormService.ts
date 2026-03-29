/**
 * NOAA SPC Storm Service
 *
 * Fetches verified storm reports from the NOAA Storm Prediction Center:
 *   https://www.spc.noaa.gov/climo/reports/today.csv
 *   https://www.spc.noaa.gov/climo/reports/yesterday.csv
 *
 * These are ground-truth post-storm reports (not forecasts), making them
 * the gold standard for roofing lead generation. Both hail (size in inches)
 * and damaging wind (mph) events are captured.
 *
 * CSV format — 3 sections, each starts with a header row:
 *   Wind:    Time, F_Scale, Speed,  Location, County, State, Lat, Lon, Comments
 *   Hail:    Time, Size,    Speed,  Location, County, State, Lat, Lon, Comments
 *   Tornado: Time, F_Scale, Speed,  Location, County, State, Lat, Lon, Comments
 *
 * Hail Size is encoded as hundredths of an inch (e.g. 100 = 1.00", 175 = 1.75").
 * Wind Speed is in mph.
 *
 * Designed to be called:
 *   1. On app foreground (visibility change listener in Layout.tsx)
 *   2. When the user navigates to the Notifications page
 *
 * Rate-limited to once per 15 minutes in-memory.
 * Dedup is handled via localStorage (48-hour TTL on seen fingerprints).
 *
 * NOTE: On native (Capacitor), cross-origin requests to spc.noaa.gov work
 * fine — no CORS restriction in native WebViews. On web dev (localhost),
 * the browser will block the request; this fails silently.
 */

import { supabase } from './supabase';

const SPC_TODAY_URL     = 'https://www.spc.noaa.gov/climo/reports/today.csv';
const SPC_YESTERDAY_URL = 'https://www.spc.noaa.gov/climo/reports/yesterday.csv';
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

// ─── NOAA SPC CSV parser ──────────────────────────────────────────────────────

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

/**
 * Parse SPC CSV text into typed storm events.
 *
 * Section detection:
 *  - Header `Time,F_Scale,...`  → Wind (first occurrence), Tornado (second — skip)
 *  - Header `Time,Size,...`     → Hail
 *
 * We skip Tornado because an F-scale value is not a useful magnitude for
 * roofing lead generation.
 */
function parseSpcCsv(csvText: string, reportDate: string): ParsedEvent[] {
  const events: ParsedEvent[] = [];
  const lines = csvText.split('\n');

  let fScaleCount = 0;
  let section: 'WIND' | 'HAIL' | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // ── Section header detection ─────────────────────────────────────────────
    if (line.startsWith('Time,')) {
      const cols = line.split(',');
      const col2 = cols[1]?.trim() ?? '';
      if (col2 === 'Size') {
        section = 'HAIL';
      } else if (col2 === 'F_Scale') {
        fScaleCount++;
        section = fScaleCount === 1 ? 'WIND' : null; // 2nd occurrence = Tornado, skip
      } else {
        section = null;
      }
      continue;
    }

    if (!section) continue;

    // ── Data row parsing ─────────────────────────────────────────────────────
    const parts = line.split(',');
    if (parts.length < 8) continue;

    const timeStr  = parts[0].trim();
    if (!/^\d{3,4}$/.test(timeStr)) continue; // Must look like HHMM

    const col2     = parts[1].trim(); // Size (hail) or F_Scale (wind)
    const speedStr = parts[2].trim(); // mph for wind
    const locName  = parts[3].trim();
    const county   = parts[4].trim();
    const state    = parts[5].trim().toUpperCase();
    const lat      = parseFloat(parts[6]);
    const lng      = parseFloat(parts[7]);

    if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) continue;
    if (!state || state.length < 2) continue;

    if (section === 'HAIL') {
      // Size is in hundredths of an inch: 100 → 1.00", 175 → 1.75"
      const sizeHundredths = parseInt(col2, 10);
      if (isNaN(sizeHundredths) || sizeHundredths < 25) continue; // skip < 0.25"
      const sizeInches = sizeHundredths / 100;
      events.push({
        type: 'HAIL',
        magnitude: sizeInches,
        lat, lng,
        location: locName || county,
        state,
        eventDate: reportDate,
        fingerprint: `HAIL_${reportDate}_${lat.toFixed(2)}_${lng.toFixed(2)}_${sizeHundredths}`,
      });

    } else if (section === 'WIND') {
      // Skip if col2 looks like a tornado F/EF scale (e.g. "F2", "EF1")
      if (/^[EF]\d/.test(col2)) continue;
      const windMph = parseInt(speedStr, 10);
      if (isNaN(windMph) || windMph < 35) continue; // skip sub-advisory winds
      events.push({
        type: 'WIND',
        magnitude: windMph,
        lat, lng,
        location: locName || county,
        state,
        eventDate: reportDate,
        fingerprint: `WIND_${reportDate}_${lat.toFixed(2)}_${lng.toFixed(2)}_${windMph}`,
      });
    }
  }

  return events;
}

// ─── Geocoding (same approach as hailAlertService) ────────────────────────────

async function geocodeAddress(
  city?: string | null,
  state?: string | null,
  zip?: string | null,
): Promise<{ lat: number; lng: number } | null> {
  const query = [city, state, zip].filter(Boolean).join(' ');
  if (!query) return null;
  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`,
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
    const { data: company } = await supabase
      .from('companies')
      .select('city, state, zip')
      .eq('id', companyId)
      .single();

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

    // ── 3. Fetch SPC CSV for today and yesterday ──────────────────────────────
    const todayStr     = new Date().toISOString().split('T')[0];
    const yesterdayStr = new Date(Date.now() - 86_400_000).toISOString().split('T')[0];

    const fetchCsv = async (url: string, dateStr: string): Promise<ParsedEvent[]> => {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) return [];
        return parseSpcCsv(await res.text(), dateStr);
      } catch {
        // CORS on web dev or network error — fail silently
        return [];
      }
    };

    const [todayEvents, yesterdayEvents] = await Promise.all([
      fetchCsv(SPC_TODAY_URL,     todayStr),
      fetchCsv(SPC_YESTERDAY_URL, yesterdayStr),
    ]);

    const allEvents = [...todayEvents, ...yesterdayEvents];
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
