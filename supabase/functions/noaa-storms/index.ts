/**
 * Supabase Edge Function — noaa-storms
 *
 * Fetches and parses NOAA Storm Prediction Center storm reports server-side,
 * bypassing the CORS restriction that prevents browser clients from calling
 * spc.noaa.gov directly.
 *
 * Query params:
 *   ?date=YYMMDD   — fetch a specific archive day (e.g. 260315 for 2026-03-15)
 *                    omit for default: today + yesterday
 *
 * Returns parsed HAIL and WIND events as JSON.
 * Today+yesterday response is cached for 10 minutes.
 *
 * Called by: src/lib/noaaStormService.ts via supabase.functions.invoke()
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SPC_TODAY_URL     = 'https://www.spc.noaa.gov/climo/reports/today.csv';
const SPC_YESTERDAY_URL = 'https://www.spc.noaa.gov/climo/reports/yesterday.csv';

// Archive URL uses 2-digit year: YYMMDD_rpts.csv
function spcArchiveUrl(yymmdd: string): string {
  return `https://www.spc.noaa.gov/climo/reports/${yymmdd}_rpts.csv`;
}

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
// Actual NOAA SPC CSV format — 8 columns per section, 3 sections per file:
//   Tornado: Time, F_Scale, Location, County, State, Lat, Lon, Comments
//   Wind:    Time, Speed,   Location, County, State, Lat, Lon, Comments
//   Hail:    Time, Size,    Location, County, State, Lat, Lon, Comments
//
// Hail Size = hundredths of an inch (100 → 1.00", 175 → 1.75")
// Wind Speed = mph

function parseSpcCsv(csvText: string, reportDate: string): ParsedEvent[] {
  const events: ParsedEvent[] = [];
  const lines = csvText.split('\n');

  let section: 'WIND' | 'HAIL' | 'TORNADO' | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Section header: always starts with "Time,"
    if (line.startsWith('Time,')) {
      const col2 = (line.split(',')[1] ?? '').trim();
      if      (col2 === 'Size')    section = 'HAIL';
      else if (col2 === 'Speed')   section = 'WIND';
      else if (col2 === 'F_Scale') section = 'TORNADO';
      else                         section = null;
      continue;
    }

    if (!section || section === 'TORNADO') continue;

    // Data row — 8 cols: Time, Magnitude, Location, County, State, Lat, Lon, Comments
    const parts = line.split(',');
    if (parts.length < 7) continue;

    const timeStr = parts[0].trim();
    if (!/^\d{3,4}$/.test(timeStr)) continue;

    const magnitude = parts[1].trim();
    const locName   = parts[2].trim();
    const county    = parts[3].trim();
    const state     = parts[4].trim().toUpperCase();
    const lat       = parseFloat(parts[5]);
    const lng       = parseFloat(parts[6]);

    if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) continue;
    if (!state || state.length !== 2) continue;

    if (section === 'HAIL') {
      const sizeHundredths = parseInt(magnitude, 10);
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
      const windMph = parseInt(magnitude, 10);
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

// Convert a YYYY-MM-DD string to YYMMDD archive format
function toYYMMDD(isoDate: string): string {
  const [yyyy, mm, dd] = isoDate.split('-');
  return `${yyyy.slice(2)}${mm}${dd}`;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url       = new URL(req.url);
    const dateParam = url.searchParams.get('date'); // YYMMDD or YYYY-MM-DD

    const fetchCsv = async (csvUrl: string, date: string): Promise<ParsedEvent[]> => {
      try {
        const res = await fetch(csvUrl, {
          headers: { 'User-Agent': 'TrussCTR/1.0 (storm alert system)' },
        });
        if (!res.ok) return [];
        return parseSpcCsv(await res.text(), date);
      } catch {
        return [];
      }
    };

    let events: ParsedEvent[];
    let cacheControl = 'no-store'; // default: no cache for archive requests

    if (dateParam) {
      // ── Archive mode: fetch a specific date ──────────────────────────────────
      // Accept either YYYY-MM-DD or YYMMDD
      let isoDate: string;
      let yymmdd: string;

      if (dateParam.includes('-')) {
        // YYYY-MM-DD format
        isoDate = dateParam;
        yymmdd  = toYYMMDD(dateParam);
      } else {
        // YYMMDD format — convert to YYYY-MM-DD
        const yy   = dateParam.slice(0, 2);
        const mm   = dateParam.slice(2, 4);
        const dd   = dateParam.slice(4, 6);
        const yyyy = parseInt(yy, 10) < 50 ? `20${yy}` : `19${yy}`;
        isoDate = `${yyyy}-${mm}-${dd}`;
        yymmdd  = dateParam;
      }

      events = await fetchCsv(spcArchiveUrl(yymmdd), isoDate);

    } else {
      // ── Live mode: today + yesterday ─────────────────────────────────────────
      const todayStr     = new Date().toISOString().split('T')[0];
      const yesterdayStr = new Date(Date.now() - 86_400_000).toISOString().split('T')[0];

      const [todayEvents, yesterdayEvents] = await Promise.all([
        fetchCsv(SPC_TODAY_URL,     todayStr),
        fetchCsv(SPC_YESTERDAY_URL, yesterdayStr),
      ]);

      events       = [...todayEvents, ...yesterdayEvents];
      cacheControl = 'public, max-age=600'; // cache 10 min for live data
    }

    return new Response(
      JSON.stringify({ events, fetchedAt: new Date().toISOString() }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': cacheControl,
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
