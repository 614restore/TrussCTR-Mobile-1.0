/**
 * Supabase Edge Function — noaa-storms
 *
 * Fetches and parses NOAA Storm Prediction Center storm reports server-side,
 * bypassing the CORS restriction that prevents browser clients from calling
 * spc.noaa.gov directly.
 *
 * Returns parsed HAIL and WIND events for today and yesterday as JSON.
 * Response is cached for 10 minutes to avoid hammering NOAA on busy days.
 *
 * Called by: src/lib/noaaStormService.ts via supabase.functions.invoke()
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SPC_TODAY_URL     = 'https://www.spc.noaa.gov/climo/reports/today.csv';
const SPC_YESTERDAY_URL = 'https://www.spc.noaa.gov/climo/reports/yesterday.csv';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParsedEvent {
  type: 'HAIL' | 'WIND';
  magnitude: number;   // inches for HAIL, mph for WIND
  lat: number;
  lng: number;
  location: string;
  state: string;
  eventDate: string;   // YYYY-MM-DD
  fingerprint: string;
}

// ─── CSV parser ───────────────────────────────────────────────────────────────
//
// SPC CSV has 3 sections (Wind, Hail, Tornado), each preceded by a header row:
//   Wind:    Time, F_Scale, Speed,  Location, County, State, Lat, Lon, Comments
//   Hail:    Time, Size,    Speed,  Location, County, State, Lat, Lon, Comments
//   Tornado: Time, F_Scale, Speed,  Location, County, State, Lat, Lon, Comments
//
// Hail Size = hundredths of an inch (100 → 1.00", 175 → 1.75")
// Wind Speed = mph

function parseSpcCsv(csvText: string, reportDate: string): ParsedEvent[] {
  const events: ParsedEvent[] = [];
  const lines = csvText.split('\n');

  let fScaleCount = 0;
  let section: 'WIND' | 'HAIL' | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Section header detection
    if (line.startsWith('Time,')) {
      const cols = line.split(',');
      const col2 = (cols[1] ?? '').trim();
      if (col2 === 'Size') {
        section = 'HAIL';
      } else if (col2 === 'F_Scale') {
        fScaleCount++;
        section = fScaleCount === 1 ? 'WIND' : null; // 2nd = Tornado, skip
      } else {
        section = null;
      }
      continue;
    }

    if (!section) continue;

    // Data row
    const parts = line.split(',');
    if (parts.length < 8) continue;

    const timeStr = parts[0].trim();
    if (!/^\d{3,4}$/.test(timeStr)) continue;

    const col2     = parts[1].trim();
    const speedStr = parts[2].trim();
    const locName  = parts[3].trim();
    const county   = parts[4].trim();
    const state    = parts[5].trim().toUpperCase();
    const lat      = parseFloat(parts[6]);
    const lng      = parseFloat(parts[7]);

    if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) continue;
    if (!state || state.length < 2) continue;

    if (section === 'HAIL') {
      const sizeHundredths = parseInt(col2, 10);
      if (isNaN(sizeHundredths) || sizeHundredths < 25) continue;
      const sizeInches = sizeHundredths / 100;
      events.push({
        type:        'HAIL',
        magnitude:   sizeInches,
        lat, lng,
        location:    locName || county,
        state,
        eventDate:   reportDate,
        fingerprint: `HAIL_${reportDate}_${lat.toFixed(2)}_${lng.toFixed(2)}_${sizeHundredths}`,
      });

    } else if (section === 'WIND') {
      if (/^[EF]\d/.test(col2)) continue; // skip tornado F-scale rows
      const windMph = parseInt(speedStr, 10);
      if (isNaN(windMph) || windMph < 35) continue;
      events.push({
        type:        'WIND',
        magnitude:   windMph,
        lat, lng,
        location:    locName || county,
        state,
        eventDate:   reportDate,
        fingerprint: `WIND_${reportDate}_${lat.toFixed(2)}_${lng.toFixed(2)}_${windMph}`,
      });
    }
  }

  return events;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const todayStr     = new Date().toISOString().split('T')[0];
    const yesterdayStr = new Date(Date.now() - 86_400_000).toISOString().split('T')[0];

    const fetchCsv = async (url: string, date: string): Promise<ParsedEvent[]> => {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'TrussCTR/1.0 (storm alert system)' },
        });
        if (!res.ok) return [];
        return parseSpcCsv(await res.text(), date);
      } catch {
        return [];
      }
    };

    const [todayEvents, yesterdayEvents] = await Promise.all([
      fetchCsv(SPC_TODAY_URL,     todayStr),
      fetchCsv(SPC_YESTERDAY_URL, yesterdayStr),
    ]);

    const events = [...todayEvents, ...yesterdayEvents];

    return new Response(
      JSON.stringify({ events, fetchedAt: new Date().toISOString() }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=600', // cache 10 minutes
        },
      },
    );

  } catch (err) {
    console.error('[noaa-storms] Error:', err);
    return new Response(
      JSON.stringify({ events: [], error: String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
