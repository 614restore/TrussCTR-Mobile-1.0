/**
 * Hail Alert Service
 *
 * Checks HailTrace for new hail events near the company's location and
 * writes hail_alert notifications to Supabase so every user on the account
 * sees them in the Notifications page and receives a push notification
 * (delivered by the existing server-side push infrastructure).
 *
 * Designed to be called:
 *  1. On app foreground (visibility change listener in Layout.tsx)
 *  2. When the user navigates to the Notifications page
 *
 * Rate-limited in memory to at most once every 15 minutes so it never
 * hammers the HailTrace API during rapid tab switching.
 */

import { supabase } from './supabase';
import { fetchRecentHailEvents } from './integrations/hailtrace';

// ─── In-memory rate limiter ───────────────────────────────────────────────────
const MIN_CHECK_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
let lastCheckEpoch = 0;

// ─── Geocoding helper (reuses Open-Meteo geocoding, already in ContactDetail) ─

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

// ─── Integration settings shape ───────────────────────────────────────────────

interface HailtraceIntegration {
  hailtrace_api_key: string | null;
  hailtrace_enabled: boolean;
  hailtrace_radius_miles: number;
  hailtrace_lat: number | null;
  hailtrace_lng: number | null;
  hailtrace_last_checked_at: string | null;
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Run a HailTrace check for the given company.
 * Safe to call at any time — returns immediately if:
 *   - HailTrace is not enabled / no API key configured
 *   - The call is within the 15-minute rate-limit window
 */
export async function checkForHailAlerts(companyId: string): Promise<void> {
  const now = Date.now();
  if (now - lastCheckEpoch < MIN_CHECK_INTERVAL_MS) return;
  lastCheckEpoch = now;

  try {
    // ── 1. Load integration config ───────────────────────────────────────────
    const { data: integration } = await (supabase.from('company_integrations') as any)
      .select(
        'hailtrace_api_key, hailtrace_enabled, hailtrace_radius_miles, hailtrace_lat, hailtrace_lng, hailtrace_last_checked_at',
      )
      .eq('company_id', companyId)
      .maybeSingle() as { data: HailtraceIntegration | null };

    if (!integration?.hailtrace_enabled || !integration?.hailtrace_api_key) return;

    // ── 2. Resolve monitoring lat/lng ────────────────────────────────────────
    let lat = integration.hailtrace_lat;
    let lng = integration.hailtrace_lng;

    if (!lat || !lng) {
      // Geocode from company address
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
        console.warn('[HailAlert] Could not geocode company address — set city/state in Company Profile.');
        return;
      }

      lat = geo.lat;
      lng = geo.lng;

      // Cache to avoid re-geocoding every check
      await (supabase.from('company_integrations') as any)
        .update({ hailtrace_lat: lat, hailtrace_lng: lng })
        .eq('company_id', companyId);
    }

    // ── 3. Determine "since" date ────────────────────────────────────────────
    const since = integration.hailtrace_last_checked_at
      ? new Date(integration.hailtrace_last_checked_at)
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // default: last 7 days

    // ── 4. Fetch hail events ─────────────────────────────────────────────────
    const events = await fetchRecentHailEvents(
      integration.hailtrace_api_key,
      lat,
      lng,
      integration.hailtrace_radius_miles || 25,
      since,
    );

    // ── 5. Write notifications for new events ────────────────────────────────
    for (const event of events) {
      const distStr =
        event.distanceMiles <= 1 ? 'within 1 mile' : `${event.distanceMiles} miles away`;
      const dateStr = new Date(event.eventDate).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });

      await (supabase.from('notifications') as any).insert({
        company_id: companyId,
        user_id: null, // broadcast: all users on the account see it
        type: 'hail_alert',
        title: `Hail Alert — ${event.city}, ${event.state}`,
        message: `${event.sizeLabel} reported ${distStr} on ${dateStr}. Check your pipeline for nearby contacts.`,
        read: false,
        metadata: {
          hail_event_id: event.id,
          max_size_inches: event.maxSizeInches,
          city: event.city,
          state: event.state,
          lat: event.lat,
          lng: event.lng,
          distance_miles: event.distanceMiles,
          event_date: event.eventDate,
        },
      });
    }

    // ── 6. Update last_checked_at ────────────────────────────────────────────
    await (supabase.from('company_integrations') as any)
      .upsert(
        {
          company_id: companyId,
          hailtrace_last_checked_at: new Date().toISOString(),
        },
        { onConflict: 'company_id' },
      );
  } catch (err) {
    // Swallow errors — hail checks are best-effort and must not crash the app
    console.warn('[HailAlert] check failed:', err);
    lastCheckEpoch = 0; // reset rate limiter so next foreground can retry
  }
}
