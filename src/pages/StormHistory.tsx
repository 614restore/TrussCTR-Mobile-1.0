import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  ChevronLeft,
  CloudRain,
  Wind,
  History,
  MapPin,
  RefreshCw,
  Radio,
  BookOpen,
  AlertTriangle,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  fetchStormHistory,
  fetchLiveNoaaFeed,
  forceCheckForNoaaStorms,
  backfillNoaaHistory,
  type BackfillProgress,
  type BackfillOptions,
  type LiveNoaaEvent,
} from '../lib/noaaStormService';

// ─── types ────────────────────────────────────────────────────────────────────

type MainTab   = 'live' | 'history';
type FilterTab = 'all' | 'hail' | 'wind';
type DateRange = '7d' | '30d' | '90d' | '6m' | '12m' | 'custom';

const DATE_RANGE_LABELS: Record<DateRange, string> = {
  '7d':  '7 Days',
  '30d': '30 Days',
  '90d': '90 Days',
  '6m':  '6 Months',
  '12m': '12 Months',
  custom: 'Custom',
};

function rangeStart(range: DateRange, customFrom: string): Date {
  const now = Date.now();
  if (range === '7d')    return new Date(now - 7   * 86_400_000);
  if (range === '30d')   return new Date(now - 30  * 86_400_000);
  if (range === '90d')   return new Date(now - 90  * 86_400_000);
  if (range === '6m')    return new Date(now - 180 * 86_400_000);
  if (range === '12m')   return new Date(now - 365 * 86_400_000);
  if (range === 'custom' && customFrom) return new Date(customFrom + 'T00:00:00');
  return new Date(0);
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatMagnitude(type: string, magnitude: number): string {
  if (type === 'HAIL' || type === 'hail_alert') {
    const n = Number(magnitude);
    if (n >= 4.5)  return `${n}" — Baseball+`;
    if (n >= 2.75) return `${n}" — Baseball`;
    if (n >= 1.75) return `${n}" — Golf Ball`;
    if (n >= 1.5)  return `${n}" — Walnut`;
    if (n >= 1.0)  return `${n}" — Quarter`;
    if (n >= 0.75) return `${n}" — Penny`;
    return `${n}"`;
  }
  return `${Math.round(magnitude)} mph`;
}

function getEventType(notification: any): 'HAIL' | 'WIND' | null {
  if (notification.type === 'hail_alert') return 'HAIL';
  if (notification.type === 'storm_alert') return notification.metadata?.event_type ?? null;
  return null;
}
function getMagnitude(n: any): number {
  if (n.type === 'hail_alert') return n.metadata?.max_size_inches ?? 0;
  return n.metadata?.magnitude ?? 0;
}
function getLocation(n: any): string {
  const city  = n.metadata?.city  || n.metadata?.location || '';
  const state = n.metadata?.state || '';
  return [city, state].filter(Boolean).join(', ');
}
function getSource(n: any): string {
  if (n.type === 'hail_alert') return 'HailTrace';
  return n.metadata?.source === 'noaa_spc' ? 'NOAA SPC' : 'Storm Report';
}
function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}
function formatTime(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// ─── shared card component ────────────────────────────────────────────────────

function StormCard({
  isHail,
  magnitude,
  type,
  location,
  dateLabel,
  distMiles,
  badge,
  source,
}: {
  isHail: boolean;
  magnitude: number;
  type: string;
  location: string;
  dateLabel: string;
  distMiles?: number | null;
  badge?: React.ReactNode;
  source?: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-start gap-4">
      {/* Icon */}
      <div
        className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${
          isHail ? 'bg-red-500' : 'bg-blue-500'
        }`}
      >
        {isHail
          ? <CloudRain size={20} className="text-white" />
          : <Wind      size={20} className="text-white" />}
      </div>

      <div className="flex-1 min-w-0">
        {/* Top row */}
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-bold text-primary leading-tight">
            {formatMagnitude(type, magnitude)}
          </p>
          <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
            {badge}
            <span
              className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                isHail ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-500'
              }`}
            >
              {isHail ? 'Hail' : 'Wind'}
            </span>
          </div>
        </div>

        {/* Location */}
        {location && (
          <div className="flex items-center gap-1 mt-1">
            <MapPin size={11} className="text-slate-400 shrink-0" />
            <p className="text-xs text-slate-500 truncate">{location}</p>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
          <span className="text-[10px] text-slate-400">{dateLabel}</span>
          {distMiles != null && (
            <span
              className={`text-[10px] font-semibold ${
                distMiles <= 10
                  ? 'text-red-500'
                  : distMiles <= 25
                  ? 'text-amber-500'
                  : 'text-slate-400'
              }`}
            >
              {distMiles < 1 ? '<1 mi away' : `${distMiles} mi away`}
            </span>
          )}
          {source && (
            <span className="text-[10px] font-medium text-slate-300">{source}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Live Feed tab ────────────────────────────────────────────────────────────

const RADIUS_OPTIONS  = [25, 50, 75, 100, 0]   as const; // 0 = All
const MIN_WIND_OPTIONS= [35, 58, 75, 100, 0]   as const; // 0 = Any mph
const MIN_HAIL_OPTIONS= [0.25, 0.75, 1.0, 1.75, 2.75, 0] as const; // 0 = Any inches

type RadiusOption  = typeof RADIUS_OPTIONS[number];
type WindOption    = typeof MIN_WIND_OPTIONS[number];
type HailOption    = typeof MIN_HAIL_OPTIONS[number];

function radiusLabel(r: RadiusOption): string {
  return r === 0 ? 'All' : `${r} mi`;
}
function windLabel(w: WindOption): string {
  return w === 0 ? 'Any' : `${w}+`;
}
function hailLabel(h: HailOption): string {
  if (h === 0)    return 'Any';
  if (h === 0.25) return '¼"';
  if (h === 0.75) return '¾"';
  if (h === 1.0)  return '1"';
  if (h === 1.75) return '1¾"';
  if (h === 2.75) return '2¾"';
  return `${h}"`;
}

function LiveFeedTab({ companyId, location }: {
  companyId: string;
  location?: { city?: string | null; state?: string | null; zip?: string | null };
}) {
  const [events,    setEvents]    = useState<LiveNoaaEvent[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [refreshing,setRefreshing]= useState(false);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const [filter,    setFilter]    = useState<FilterTab>('all');
  const [noLocation,setNoLocation]= useState(false);
  const [radiusMiles, setRadiusMiles] = useState<RadiusOption>(() => {
    const saved = parseInt(localStorage.getItem('stormRadiusMiles') ?? '50', 10);
    return (RADIUS_OPTIONS as readonly number[]).includes(saved) ? saved as RadiusOption : 50;
  });
  const [minWind, setMinWind] = useState<WindOption>(() => {
    const saved = parseFloat(localStorage.getItem('stormMinWind') ?? '0');
    return (MIN_WIND_OPTIONS as readonly number[]).includes(saved) ? saved as WindOption : 0;
  });
  const [minHail, setMinHail] = useState<HailOption>(() => {
    const saved = parseFloat(localStorage.getItem('stormMinHail') ?? '0');
    return (MIN_HAIL_OPTIONS as readonly number[]).includes(saved) ? saved as HailOption : 0;
  });

  const handleRadiusChange = (r: RadiusOption) => {
    setRadiusMiles(r);
    localStorage.setItem('stormRadiusMiles', String(r));
  };
  const handleWindChange = (w: WindOption) => {
    setMinWind(w);
    localStorage.setItem('stormMinWind', String(w));
  };
  const handleHailChange = (h: HailOption) => {
    setMinHail(h);
    localStorage.setItem('stormMinHail', String(h));
  };

  const load = useCallback(async (force = false) => {
    if (force) setRefreshing(true); else setLoading(true);
    try {
      const result = await fetchLiveNoaaFeed(companyId, location);
      setEvents(result.events);
      setFetchedAt(result.fetchedAt);
      // If no distances were calculated the company has no city/state set
      setNoLocation(result.events.length > 0 && result.events[0].distanceMiles === null);
      if (force) {
        // Also trigger a check to save new nearby alerts
        forceCheckForNoaaStorms(companyId).catch(() => {});
      }
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  // Apply all filters: radius → magnitude thresholds → type
  const withinRadius = events.filter((e) => {
    if (radiusMiles === 0 || e.distanceMiles === null) return true;
    return e.distanceMiles <= radiusMiles;
  });

  const aboveThreshold = withinRadius.filter((e) => {
    if (e.type === 'HAIL' && minHail > 0) return e.magnitude >= minHail;
    if (e.type === 'WIND' && minWind > 0) return e.magnitude >= minWind;
    return true;
  });

  const filtered = aboveThreshold.filter((e) => {
    if (filter === 'hail') return e.type === 'HAIL';
    if (filter === 'wind') return e.type === 'WIND';
    return true;
  });

  const hailCount = aboveThreshold.filter((e) => e.type === 'HAIL').length;
  const windCount = aboveThreshold.filter((e) => e.type === 'WIND').length;

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        {[1,2,3,4,5].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl border border-slate-100 bg-white" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* No location warning */}
      {noLocation && (
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex gap-3 items-start">
          <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-bold text-amber-700">No company location set</p>
            <p className="text-[11px] text-amber-600 mt-0.5">
              Go to <strong>More → Company Profile</strong> and fill in your City, State, and ZIP to see distances.
            </p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="flex gap-3">
        <div className="flex-1 bg-red-50 rounded-xl p-3 text-center">
          <p className="text-lg font-bold text-red-600">{hailCount}</p>
          <p className="text-[10px] font-bold text-red-400 uppercase tracking-wider">Hail</p>
        </div>
        <div className="flex-1 bg-blue-50 rounded-xl p-3 text-center">
          <p className="text-lg font-bold text-blue-600">{windCount}</p>
          <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">Wind</p>
        </div>
        <div className="flex-1 bg-slate-100 rounded-xl p-3 text-center">
          <p className="text-lg font-bold text-slate-700">{events.length}</p>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total</p>
        </div>
      </div>

      {/* Last updated */}
      {fetchedAt && (
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-slate-400">
            Updated {formatTime(fetchedAt)} · Today + Yesterday
          </p>
          <button
            disabled={refreshing}
            onClick={() => load(true)}
            className="flex items-center gap-1.5 text-[10px] font-bold text-accent active:opacity-70 transition-opacity disabled:opacity-40"
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="space-y-3 bg-slate-50 rounded-2xl p-3">
        {/* Radius */}
        {!noLocation && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Radius</p>
            <div className="flex gap-1.5">
              {RADIUS_OPTIONS.map((r) => (
                <button
                  key={r}
                  onClick={() => handleRadiusChange(r)}
                  className={`flex-1 py-1.5 rounded-xl text-[11px] font-bold transition-colors ${
                    radiusMiles === r ? 'bg-accent text-white' : 'bg-white text-slate-500 border border-slate-200'
                  }`}
                >
                  {radiusLabel(r)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Min hail size */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-bold text-red-400 uppercase tracking-widest ml-1">Min Hail Size</p>
          <div className="flex gap-1.5">
            {MIN_HAIL_OPTIONS.map((h) => (
              <button
                key={h}
                onClick={() => handleHailChange(h)}
                className={`flex-1 py-1.5 rounded-xl text-[11px] font-bold transition-colors ${
                  minHail === h ? 'bg-red-500 text-white' : 'bg-white text-slate-500 border border-slate-200'
                }`}
              >
                {hailLabel(h)}
              </button>
            ))}
          </div>
        </div>

        {/* Min wind speed */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest ml-1">Min Wind Speed</p>
          <div className="flex gap-1.5">
            {MIN_WIND_OPTIONS.map((w) => (
              <button
                key={w}
                onClick={() => handleWindChange(w)}
                className={`flex-1 py-1.5 rounded-xl text-[11px] font-bold transition-colors ${
                  minWind === w ? 'bg-blue-500 text-white' : 'bg-white text-slate-500 border border-slate-200'
                }`}
              >
                {windLabel(w)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Type filter tabs */}
      <div className="flex gap-2">
        {(['all','hail','wind'] as FilterTab[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-1 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors ${
              filter === f ? 'bg-primary text-white' : 'bg-slate-100 text-slate-500'
            }`}
          >
            {f === 'all' ? 'All' : f === 'hail' ? 'Hail' : 'Wind'}
          </button>
        ))}
      </div>

      {/* Event list */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center">
          <Radio size={36} className="mx-auto text-slate-200 mb-3" />
          <p className="text-sm font-bold text-slate-400">No events reported</p>
          <p className="text-xs text-slate-300 mt-1">
            NOAA SPC has no {filter !== 'all' ? filter : ''} reports for today or yesterday
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((ev, idx) => (
            <StormCard
              key={`${ev.fingerprint}-${idx}`}
              isHail={ev.type === 'HAIL'}
              magnitude={ev.magnitude}
              type={ev.type}
              location={[ev.location, ev.state].filter(Boolean).join(', ')}
              dateLabel={formatDate(ev.eventDate)}
              distMiles={ev.distanceMiles}
              source="NOAA SPC"
              badge={
                ev.isToday ? (
                  <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-green-50 text-green-600">
                    Today
                  </span>
                ) : (
                  <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-400">
                    Yesterday
                  </span>
                )
              }
            />
          ))}
          <p className="text-center text-[10px] text-slate-300 pb-4 uppercase tracking-widest font-bold">
            {filtered.length} report{filtered.length !== 1 ? 's' : ''} · {radiusMiles === 0 ? 'All distances' : `Within ${radiusMiles} mi`} · NOAA SPC
          </p>
        </div>
      )}
    </div>
  );
}

// ─── History tab ──────────────────────────────────────────────────────────────

const SEARCH_RADIUS_OPTIONS = [25, 50, 75, 100] as const;
type SearchRadius = typeof SEARCH_RADIUS_OPTIONS[number];

function HistoryTab({ companyId, location }: {
  companyId: string;
  location?: { city?: string | null; state?: string | null; zip?: string | null };
}) {
  const today     = new Date().toISOString().slice(0, 10);
  const thirtyAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);

  // ── Events from DB ──────────────────────────────────────────────────────────
  const [events,  setEvents]  = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState<FilterTab>('all');

  // ── Search / import panel ───────────────────────────────────────────────────
  const [searchZip,    setSearchZip]    = useState(location?.zip    ?? '');
  const [searchRadius, setSearchRadius] = useState<SearchRadius>(50);
  const [searchFrom,   setSearchFrom]   = useState(thirtyAgo);
  const [searchTo,     setSearchTo]     = useState(today);
  const [searchMinHail,setSearchMinHail]= useState<HailOption>(0);
  const [searchMinWind,setSearchMinWind]= useState<WindOption>(0);

  // ── Backfill state ──────────────────────────────────────────────────────────
  const [backfilling,      setBackfilling]      = useState(false);
  const [backfillProgress, setBackfillProgress] = useState<BackfillProgress | null>(null);
  const [backfillResult,   setBackfillResult]   = useState<{ saved: number } | null>(null);

  // Sync ZIP when profile location loads in
  useEffect(() => {
    if (location?.zip && !searchZip) setSearchZip(location.zip);
  }, [location?.zip]);

  const reload = () => {
    setLoading(true);
    fetchStormHistory(companyId).then((data) => {
      setEvents(data);
      setLoading(false);
    });
  };
  useEffect(() => { reload(); }, [companyId]);

  const handleImport = async () => {
    setBackfilling(true);
    setBackfillResult(null);
    setBackfillProgress({ total: 1, done: 0, saved: 0 });
    try {
      const opts: BackfillOptions = {
        fromDate:      searchFrom,
        toDate:        searchTo,
        searchZip:     searchZip  || undefined,
        searchCity:    !searchZip ? (location?.city  ?? undefined) : undefined,
        searchState:   !searchZip ? (location?.state ?? undefined) : undefined,
        radiusMiles:   searchRadius,
        minHailInches: searchMinHail === 0 ? 0.25 : searchMinHail,
        minWindMph:    searchMinWind === 0 ? 35   : searchMinWind,
      };
      const result = await backfillNoaaHistory(
        companyId,
        location ?? {},
        opts,
        (p) => setBackfillProgress(p),
      );
      setBackfillResult(result);
      reload();
    } finally {
      setBackfilling(false);
    }
  };

  // Filter displayed events by current search date range + type
  const filtered = events.filter((n) => {
    if (filter !== 'all') {
      const t = getEventType(n);
      if (filter === 'hail' && t !== 'HAIL') return false;
      if (filter === 'wind' && t !== 'WIND') return false;
    }
    const eventDate = n.metadata?.event_date
      ? new Date(n.metadata.event_date + 'T12:00:00')
      : new Date(n.created_at);
    if (searchFrom && eventDate < new Date(searchFrom + 'T00:00:00')) return false;
    if (searchTo   && eventDate > new Date(searchTo   + 'T23:59:59')) return false;
    return true;
  });

  const hailCount = filtered.filter((n) => getEventType(n) === 'HAIL').length;
  const windCount = filtered.filter((n) => getEventType(n) === 'WIND').length;

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        {[1,2,3,4].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl border border-slate-100 bg-white" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">

      {/* ── Search & Import panel ────────────────────────────────────────────── */}
      <div className="bg-slate-50 rounded-2xl p-4 space-y-4 border border-slate-100">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Search & Import</p>

        {/* ZIP code + radius */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-0.5">Location (ZIP)</p>
          <div className="flex gap-2 items-center">
            <input
              type="text"
              inputMode="numeric"
              placeholder={location?.zip ?? 'Enter ZIP code'}
              maxLength={10}
              value={searchZip}
              onChange={(e) => setSearchZip(e.target.value)}
              className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-medium text-primary focus:ring-2 focus:ring-accent/20"
            />
            <div className="flex gap-1">
              {SEARCH_RADIUS_OPTIONS.map((r) => (
                <button
                  key={r}
                  onClick={() => setSearchRadius(r)}
                  className={`px-2 py-2 rounded-xl text-[11px] font-bold transition-colors ${
                    searchRadius === r ? 'bg-accent text-white' : 'bg-white text-slate-500 border border-slate-200'
                  }`}
                >
                  {r}mi
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Date range */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-0.5">Date Range</p>
          <div className="flex gap-2">
            <div className="flex-1 space-y-1">
              <p className="text-[10px] text-slate-400 ml-0.5">From</p>
              <input
                type="date"
                value={searchFrom}
                max={searchTo}
                onChange={(e) => setSearchFrom(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-medium text-primary focus:ring-2 focus:ring-accent/20"
              />
            </div>
            <div className="flex-1 space-y-1">
              <p className="text-[10px] text-slate-400 ml-0.5">To</p>
              <input
                type="date"
                value={searchTo}
                min={searchFrom}
                max={today}
                onChange={(e) => setSearchTo(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-medium text-primary focus:ring-2 focus:ring-accent/20"
              />
            </div>
          </div>
        </div>

        {/* Min thresholds */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <p className="text-[10px] font-bold text-red-400 uppercase tracking-widest ml-0.5">Min Hail</p>
            <div className="flex gap-1 flex-wrap">
              {MIN_HAIL_OPTIONS.map((h) => (
                <button key={h} onClick={() => setSearchMinHail(h)}
                  className={`flex-1 py-1.5 rounded-xl text-[11px] font-bold transition-colors min-w-0 ${
                    searchMinHail === h ? 'bg-red-500 text-white' : 'bg-white text-slate-500 border border-slate-200'
                  }`}
                >{hailLabel(h)}</button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest ml-0.5">Min Wind</p>
            <div className="flex gap-1 flex-wrap">
              {MIN_WIND_OPTIONS.map((w) => (
                <button key={w} onClick={() => setSearchMinWind(w)}
                  className={`flex-1 py-1.5 rounded-xl text-[11px] font-bold transition-colors min-w-0 ${
                    searchMinWind === w ? 'bg-blue-500 text-white' : 'bg-white text-slate-500 border border-slate-200'
                  }`}
                >{windLabel(w)}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Import button */}
        <button
          onClick={handleImport}
          disabled={backfilling || (!searchZip && !location?.city)}
          className="w-full bg-primary text-white py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50"
        >
          {backfilling
            ? <><div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Importing…</>
            : <><BookOpen size={15} /> Import Data for This Range</>
          }
        </button>

        {/* Progress bar */}
        {backfilling && backfillProgress && (
          <div className="space-y-1.5">
            {/* Geocode confirmation */}
            {backfillProgress.geocodeLabel && (
              <p className="text-[10px] text-slate-400 flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Searching near {backfillProgress.geocodeLabel}
              </p>
            )}
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-slate-500">
                {backfillProgress.status ?? `Day ${backfillProgress.done}/${backfillProgress.total}`}
              </p>
              <p className="text-[11px] font-bold text-primary">{backfillProgress.saved} saved</p>
            </div>
            <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${backfillProgress.total > 0 ? Math.round((backfillProgress.done / backfillProgress.total) * 100) : 0}%` }}
              />
            </div>
            {/* Running diagnostics */}
            {(backfillProgress.rawTotal ?? 0) > 0 && (
              <p className="text-[10px] text-slate-400">
                {backfillProgress.rawTotal} national reports found · {backfillProgress.distanceFiltered ?? 0} outside radius · {backfillProgress.thresholdFiltered ?? 0} below threshold
              </p>
            )}
          </div>
        )}

        {/* Result banner */}
        {backfillResult && !backfilling && backfillProgress && (
          <div className={`rounded-xl p-3 space-y-1 ${backfillResult.saved > 0 ? 'bg-emerald-50' : 'bg-amber-50'}`}>
            <div className="flex items-center gap-2">
              <History size={14} className={backfillResult.saved > 0 ? 'text-emerald-600' : 'text-amber-500'} />
              <p className={`text-[11px] font-bold ${backfillResult.saved > 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                {backfillProgress.status ?? (backfillResult.saved > 0
                  ? `${backfillResult.saved} new storm report${backfillResult.saved !== 1 ? 's' : ''} imported`
                  : 'No new reports found for these search criteria')}
              </p>
            </div>
            {backfillResult.saved === 0 && (backfillProgress.rawTotal ?? 0) > 0 && (
              <p className="text-[10px] text-amber-600 ml-5">
                {backfillProgress.rawTotal} national SPC reports checked — {backfillProgress.distanceFiltered ?? 0} outside your {searchRadius}mi radius, {backfillProgress.thresholdFiltered ?? 0} below wind/hail thresholds.
                Try increasing radius or setting thresholds to Any.
              </p>
            )}
            {backfillResult.saved === 0 && (backfillProgress.rawTotal ?? 0) === 0 && (
              <p className="text-[10px] text-amber-600 ml-5">
                NOAA SPC had no verified storm damage reports for this date range. SPC only records events with confirmed ground reports — not all high-wind days are in the database.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Results ─────────────────────────────────────────────────────────── */}

      {/* Stats */}
      <div className="flex gap-3">
        <div className="flex-1 bg-red-50 rounded-xl p-3 text-center">
          <p className="text-lg font-bold text-red-600">{hailCount}</p>
          <p className="text-[10px] font-bold text-red-400 uppercase tracking-wider">Hail</p>
        </div>
        <div className="flex-1 bg-blue-50 rounded-xl p-3 text-center">
          <p className="text-lg font-bold text-blue-600">{windCount}</p>
          <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">Wind</p>
        </div>
        <div className="flex-1 bg-slate-100 rounded-xl p-3 text-center">
          <p className="text-lg font-bold text-slate-700">{filtered.length}</p>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total</p>
        </div>
      </div>

      {/* Type filter */}
      <div className="flex gap-2">
        {(['all','hail','wind'] as FilterTab[]).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`flex-1 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors ${
              filter === f ? 'bg-primary text-white' : 'bg-slate-100 text-slate-500'
            }`}
          >
            {f === 'all' ? 'All' : f === 'hail' ? 'Hail' : 'Wind'}
          </button>
        ))}
      </div>

      {/* Event list */}
      {filtered.length === 0 ? (
        <div className="py-12 text-center">
          <History size={36} className="mx-auto text-slate-200 mb-3" />
          <p className="text-sm font-bold text-slate-400">No storms in this range</p>
          <p className="text-xs text-slate-300 mt-1 px-8">
            Try adjusting the date range, ZIP, or radius above and tap Import
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((n) => {
            const evType    = getEventType(n);
            const isHail    = evType === 'HAIL';
            const mag       = getMagnitude(n);
            const loc       = getLocation(n);
            const src       = getSource(n);
            const dist      = n.metadata?.distance_miles;
            const dateLabel = n.metadata?.event_date
              ? formatDate(n.metadata.event_date)
              : new Date(n.created_at).toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric', year: 'numeric',
                });
            return (
              <StormCard
                key={n.id}
                isHail={isHail}
                magnitude={mag}
                type={evType ?? 'HAIL'}
                location={loc}
                dateLabel={dateLabel}
                distMiles={dist}
                source={src}
              />
            );
          })}
          <p className="text-center text-[10px] text-slate-300 pb-4 uppercase tracking-widest font-bold">
            {filtered.length} report{filtered.length !== 1 ? 's' : ''} · {searchFrom} → {searchTo}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function StormHistory() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [tab, setTab] = useState<MainTab>('live');

  const companyId = profile?.company_id ?? '';

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 sticky top-0 z-10">
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(-1)}
              className="p-2 -ml-2 text-slate-400 active:scale-90 transition-transform"
            >
              <ChevronLeft size={24} />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-primary">Storm Data</h1>
              <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mt-0.5">
                NOAA SPC · Live + 12-month history
              </p>
            </div>
          </div>

          {/* Main tabs */}
          <div className="flex gap-0 mt-4 bg-slate-100 rounded-xl p-1">
            <button
              onClick={() => setTab('live')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all ${
                tab === 'live'
                  ? 'bg-white shadow-sm text-primary'
                  : 'text-slate-500'
              }`}
            >
              <Radio size={13} />
              Live Feed
              {tab === 'live' && (
                <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              )}
            </button>
            <button
              onClick={() => setTab('history')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all ${
                tab === 'history'
                  ? 'bg-white shadow-sm text-primary'
                  : 'text-slate-500'
              }`}
            >
              <BookOpen size={13} />
              My History
            </button>
          </div>
        </div>
      </div>

      {/* Tab content */}
      {!companyId ? (
        <div className="py-20 text-center px-6">
          <p className="text-sm font-bold text-slate-400">Not signed in</p>
        </div>
      ) : tab === 'live' ? (
        <LiveFeedTab
          companyId={companyId}
          location={{
            city:  (profile?.companies as any)?.city  ?? null,
            state: (profile?.companies as any)?.state ?? null,
            zip:   (profile?.companies as any)?.zip   ?? null,
          }}
        />
      ) : (
        <HistoryTab
          companyId={companyId}
          location={{
            city:  (profile?.companies as any)?.city  ?? null,
            state: (profile?.companies as any)?.state ?? null,
            zip:   (profile?.companies as any)?.zip   ?? null,
          }}
        />
      )}
    </div>
  );
}
