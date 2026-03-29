import React, { useEffect, useState, useCallback } from 'react';
import { ChevronLeft, CloudRain, Wind, History, MapPin } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { fetchStormHistory } from '../lib/noaaStormService';
import { checkForNoaaStorms } from '../lib/noaaStormService';

type FilterType = 'all' | 'hail' | 'wind';

function formatMagnitude(type: string, magnitude: number): string {
  if (type === 'HAIL' || type === 'hail_alert') {
    const inches = Number(magnitude);
    if (inches >= 4.5)  return `${inches}" — Baseball+`;
    if (inches >= 2.75) return `${inches}" — Baseball`;
    if (inches >= 1.75) return `${inches}" — Golf Ball`;
    if (inches >= 1.5)  return `${inches}" — Walnut`;
    if (inches >= 1.0)  return `${inches}" — Quarter`;
    if (inches >= 0.75) return `${inches}" — Penny`;
    return `${inches}"`;
  }
  return `${Math.round(magnitude)} mph`;
}

function getEventType(notification: any): 'HAIL' | 'WIND' | null {
  if (notification.type === 'hail_alert') return 'HAIL';
  if (notification.type === 'storm_alert') {
    return notification.metadata?.event_type ?? null;
  }
  return null;
}

function getMagnitude(notification: any): number {
  if (notification.type === 'hail_alert') {
    return notification.metadata?.max_size_inches ?? 0;
  }
  return notification.metadata?.magnitude ?? 0;
}

function getLocation(notification: any): string {
  const city  = notification.metadata?.city  || notification.metadata?.location || '';
  const state = notification.metadata?.state || '';
  return [city, state].filter(Boolean).join(', ');
}

function getSource(notification: any): string {
  if (notification.type === 'hail_alert') return 'HailTrace';
  return notification.metadata?.source === 'noaa_spc' ? 'NOAA SPC' : 'Storm Report';
}

export default function StormHistory() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [events, setEvents]       = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [filter, setFilter]       = useState<FilterType>('all');

  const load = useCallback(async () => {
    if (!profile?.company_id) { setLoading(false); return; }
    setLoading(true);
    // Trigger a fresh NOAA check so new storms appear immediately
    checkForNoaaStorms(profile.company_id).catch(() => {});
    const data = await fetchStormHistory(profile.company_id);
    setEvents(data);
    setLoading(false);
  }, [profile?.company_id]);

  useEffect(() => { load(); }, [load]);

  const filtered = events.filter((n) => {
    if (filter === 'all')  return true;
    const evType = getEventType(n);
    if (filter === 'hail') return evType === 'HAIL';
    if (filter === 'wind') return evType === 'WIND';
    return true;
  });

  const hailCount = events.filter((n) => getEventType(n) === 'HAIL').length;
  const windCount = events.filter((n) => getEventType(n) === 'WIND').length;

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 p-6 sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 text-slate-400 active:scale-90 transition-transform"
          >
            <ChevronLeft size={24} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-primary">Storm History</h1>
            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mt-0.5">
              Last 12 months · NOAA SPC + HailTrace
            </p>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex gap-3 mt-4">
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
        <div className="flex gap-2 mt-4">
          {(['all', 'hail', 'wind'] as FilterType[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex-1 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors ${
                filter === f
                  ? 'bg-primary text-white'
                  : 'bg-slate-100 text-slate-500 active:bg-slate-200'
              }`}
            >
              {f === 'all' ? 'All' : f === 'hail' ? 'Hail' : 'Wind'}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 space-y-3">
        {loading ? (
          [1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-2xl border border-slate-100 bg-white"
            />
          ))
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center">
            <History size={36} className="mx-auto text-slate-200 mb-3" />
            <p className="text-sm font-bold text-slate-400">No storms recorded</p>
            <p className="text-xs text-slate-300 mt-1">
              {events.length === 0
                ? 'Storm reports will appear here once detected near your area'
                : 'No events match the selected filter'}
            </p>
          </div>
        ) : (
          filtered.map((n) => {
            const evType   = getEventType(n);
            const mag      = getMagnitude(n);
            const loc      = getLocation(n);
            const src      = getSource(n);
            const dist     = n.metadata?.distance_miles;
            const isHail   = evType === 'HAIL';
            const dateStr  = n.metadata?.event_date
              ? new Date(n.metadata.event_date + 'T12:00:00').toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric', year: 'numeric',
                })
              : new Date(n.created_at).toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric', year: 'numeric',
                });

            return (
              <div
                key={n.id}
                className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-start gap-4"
              >
                {/* Icon badge */}
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
                  {/* Title row */}
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-bold text-primary leading-tight">
                      {formatMagnitude(evType ?? 'HAIL', mag)}
                    </p>
                    <span
                      className={`shrink-0 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        isHail
                          ? 'bg-red-50 text-red-500'
                          : 'bg-blue-50 text-blue-500'
                      }`}
                    >
                      {isHail ? 'Hail' : 'Wind'}
                    </span>
                  </div>

                  {/* Location */}
                  {loc && (
                    <div className="flex items-center gap-1 mt-1">
                      <MapPin size={11} className="text-slate-400 shrink-0" />
                      <p className="text-xs text-slate-500 truncate">{loc}</p>
                    </div>
                  )}

                  {/* Footer row */}
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    <span className="text-[10px] text-slate-400">{dateStr}</span>
                    {dist != null && (
                      <span className="text-[10px] text-slate-400">
                        {dist < 1 ? '&lt;1 mi away' : `${dist} mi away`}
                      </span>
                    )}
                    <span className="text-[10px] font-medium text-slate-300">{src}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}

        {filtered.length > 0 && (
          <p className="text-center text-[10px] text-slate-300 pb-4 uppercase tracking-widest font-bold">
            {filtered.length} report{filtered.length !== 1 ? 's' : ''} · Last 12 months
          </p>
        )}
      </div>
    </div>
  );
}
