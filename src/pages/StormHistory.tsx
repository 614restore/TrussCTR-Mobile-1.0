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
  type LiveNoaaEvent,
} from '../lib/noaaStormService';

// ─── types ────────────────────────────────────────────────────────────────────

type MainTab   = 'live' | 'history';
type FilterTab = 'all' | 'hail' | 'wind';

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

function LiveFeedTab({ companyId }: { companyId: string }) {
  const [events,    setEvents]    = useState<LiveNoaaEvent[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [refreshing,setRefreshing]= useState(false);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const [filter,    setFilter]    = useState<FilterTab>('all');
  const [noLocation,setNoLocation]= useState(false);

  const load = useCallback(async (force = false) => {
    if (force) setRefreshing(true); else setLoading(true);
    try {
      const result = await fetchLiveNoaaFeed(companyId);
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

  const filtered = events.filter((e) => {
    if (filter === 'hail') return e.type === 'HAIL';
    if (filter === 'wind') return e.type === 'WIND';
    return true;
  });

  const hailCount = events.filter((e) => e.type === 'HAIL').length;
  const windCount = events.filter((e) => e.type === 'WIND').length;

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

      {/* Filter tabs */}
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
            {filtered.length} report{filtered.length !== 1 ? 's' : ''} · NOAA SPC live data
          </p>
        </div>
      )}
    </div>
  );
}

// ─── History tab ──────────────────────────────────────────────────────────────

function HistoryTab({ companyId }: { companyId: string }) {
  const [events,  setEvents]  = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState<FilterTab>('all');

  useEffect(() => {
    fetchStormHistory(companyId).then((data) => {
      setEvents(data);
      setLoading(false);
    });
  }, [companyId]);

  const filtered = events.filter((n) => {
    if (filter === 'all')  return true;
    const t = getEventType(n);
    if (filter === 'hail') return t === 'HAIL';
    if (filter === 'wind') return t === 'WIND';
    return true;
  });

  const hailCount = events.filter((n) => getEventType(n) === 'HAIL').length;
  const windCount = events.filter((n) => getEventType(n) === 'WIND').length;

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

      {/* Filter tabs */}
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
          <History size={36} className="mx-auto text-slate-200 mb-3" />
          <p className="text-sm font-bold text-slate-400">No storms recorded</p>
          <p className="text-xs text-slate-300 mt-1 px-6">
            {events.length === 0
              ? 'Storm reports will appear here once detected near your area'
              : 'No events match the selected filter'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((n) => {
            const evType = getEventType(n);
            const isHail = evType === 'HAIL';
            const mag    = getMagnitude(n);
            const loc    = getLocation(n);
            const src    = getSource(n);
            const dist   = n.metadata?.distance_miles;
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
            {filtered.length} report{filtered.length !== 1 ? 's' : ''} · Last 12 months
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
        <LiveFeedTab companyId={companyId} />
      ) : (
        <HistoryTab companyId={companyId} />
      )}
    </div>
  );
}
