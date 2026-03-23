import React, { useState, useEffect, useRef } from 'react';
import { Clock, MapPin, Play, Square, CheckCircle, AlertCircle, ChevronRight, Briefcase } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';

interface TimeEntry {
  id: string;
  user_id: string;
  company_id: string;
  work_order_id?: string;
  work_order_title?: string;
  clock_in: string;
  clock_out?: string;
  duration_minutes?: number;
  lat_in?: number;
  lng_in?: number;
  lat_out?: number;
  lng_out?: number;
  notes?: string;
  status: 'active' | 'completed';
}

interface WorkOrderOption {
  id: string;
  title: string;
  address?: string;
}

export default function TimeClock() {
  const { profile } = useAuth();
  const [activeEntry, setActiveEntry] = useState<TimeEntry | null>(null);
  const [todayEntries, setTodayEntries] = useState<TimeEntry[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrderOption[]>([]);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<WorkOrderOption | null>(null);
  const [notes, setNotes] = useState('');
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'getting' | 'got' | 'error'>('idle');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState('00:00:00');
  const [showWorkOrderPicker, setShowWorkOrderPicker] = useState(false);
  const [todayTotal, setTodayTotal] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!profile?.company_id) return;
    fetchActiveEntry();
    fetchTodayEntries();
    fetchWorkOrders();
  }, [profile?.company_id]);

  // Live elapsed timer
  useEffect(() => {
    if (activeEntry) {
      timerRef.current = setInterval(() => {
        const ms = Date.now() - new Date(activeEntry.clock_in).getTime();
        const h = Math.floor(ms / 3600000).toString().padStart(2, '0');
        const m = Math.floor((ms % 3600000) / 60000).toString().padStart(2, '0');
        const s = Math.floor((ms % 60000) / 1000).toString().padStart(2, '0');
        setElapsed(`${h}:${m}:${s}`);
      }, 1000);
    } else {
      setElapsed('00:00:00');
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [activeEntry]);

  const fetchActiveEntry = async () => {
    if (!profile) return;
    const { data } = await supabase
      .from('time_entries')
      .select('*, work_orders(title, address)')
      .eq('user_id', profile.id)
      .eq('status', 'active')
      .maybeSingle();

    if (data) {
      setActiveEntry({
        ...data,
        work_order_title: data.work_orders?.title,
      } as TimeEntry);
    }
  };

  const fetchTodayEntries = async () => {
    if (!profile) return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from('time_entries')
      .select('*, work_orders(title)')
      .eq('user_id', profile.id)
      .gte('clock_in', today.toISOString())
      .order('clock_in', { ascending: false });

    if (data) {
      const entries = data.map((e: any) => ({
        ...e,
        work_order_title: e.work_orders?.title,
      })) as TimeEntry[];
      setTodayEntries(entries);
      const total = entries.reduce((sum, e) => sum + (e.duration_minutes || 0), 0);
      setTodayTotal(total);
    }
  };

  const fetchWorkOrders = async () => {
    if (!profile) return;
    const { data } = await supabase
      .from('work_orders')
      .select('id, title, address')
      .eq('company_id', profile.company_id)
      .in('status', ['scheduled', 'in_progress'])
      .order('created_at', { ascending: false })
      .limit(20);
    if (data) setWorkOrders(data as WorkOrderOption[]);
  };

  const getGPS = (): Promise<{ lat: number; lng: number }> => {
    return new Promise((resolve, reject) => {
      setGpsStatus('getting');
      if (!navigator.geolocation) {
        setGpsStatus('error');
        reject(new Error('Geolocation not supported'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setCoords(c);
          setGpsStatus('got');
          resolve(c);
        },
        (err) => {
          setGpsStatus('error');
          reject(err);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  };

  const handleClockIn = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      let gpsCoords: { lat: number; lng: number } | null = null;
      try { gpsCoords = await getGPS(); } catch { /* GPS optional */ }

      const { data, error } = await supabase
        .from('time_entries')
        .insert({
          user_id: profile.id,
          company_id: profile.company_id,
          work_order_id: selectedWorkOrder?.id || null,
          clock_in: new Date().toISOString(),
          lat_in: gpsCoords?.lat || null,
          lng_in: gpsCoords?.lng || null,
          notes: notes || null,
          status: 'active',
        })
        .select()
        .single();

      if (error) throw error;
      setActiveEntry({ ...data, work_order_title: selectedWorkOrder?.title } as TimeEntry);
      setNotes('');
    } catch (err) {
      console.error('Clock in error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleClockOut = async () => {
    if (!activeEntry || !profile) return;
    setLoading(true);
    try {
      let gpsCoords: { lat: number; lng: number } | null = null;
      try { gpsCoords = await getGPS(); } catch { /* GPS optional */ }

      const clockOut = new Date().toISOString();
      const durationMs = Date.now() - new Date(activeEntry.clock_in).getTime();
      const durationMinutes = Math.round(durationMs / 60000);

      const { error } = await supabase
        .from('time_entries')
        .update({
          clock_out: clockOut,
          lat_out: gpsCoords?.lat || null,
          lng_out: gpsCoords?.lng || null,
          duration_minutes: durationMinutes,
          status: 'completed',
        })
        .eq('id', activeEntry.id);

      if (error) throw error;
      setActiveEntry(null);
      fetchTodayEntries();
    } catch (err) {
      console.error('Clock out error:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatMinutes = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-accent" />
            <h1 className="text-lg font-bold text-primary">Time Clock</h1>
          </div>
          {todayTotal > 0 && (
            <div className="text-sm text-slate-500 font-medium">
              Today: <span className="text-primary font-bold">{formatMinutes(todayTotal)}</span>
            </div>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Active Clock-In Card */}
        {activeEntry ? (
          <div className="bg-green-600 text-white rounded-2xl p-6 shadow-lg">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
              <span className="text-sm font-medium opacity-90">CLOCKED IN</span>
            </div>
            {activeEntry.work_order_title && (
              <p className="text-sm opacity-80 mb-2 truncate">{activeEntry.work_order_title}</p>
            )}
            <div className="text-4xl font-mono font-bold tracking-widest mb-1">{elapsed}</div>
            <p className="text-sm opacity-70">Since {formatTime(activeEntry.clock_in)}</p>

            {activeEntry.lat_in && (
              <div className="flex items-center gap-1 mt-2 text-xs opacity-70">
                <MapPin className="w-3 h-3" />
                <span>GPS recorded at clock-in</span>
              </div>
            )}

            <button
              onClick={handleClockOut}
              disabled={loading}
              className="mt-5 w-full flex items-center justify-center gap-2 bg-white text-green-700 font-bold py-3 rounded-xl shadow transition active:scale-95 disabled:opacity-60"
            >
              <Square className="w-5 h-5" />
              {loading ? 'Clocking Out...' : 'Clock Out'}
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 space-y-4">
            <h2 className="font-semibold text-primary">Clock In</h2>

            {/* Work Order selector */}
            <button
              onClick={() => setShowWorkOrderPicker(true)}
              className="w-full flex items-center justify-between border border-slate-200 rounded-xl px-4 py-3 text-sm text-left"
            >
              <div className="flex items-center gap-2 text-slate-600">
                <Briefcase className="w-4 h-4" />
                {selectedWorkOrder ? selectedWorkOrder.title : 'Select Work Order (optional)'}
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </button>

            {/* Notes */}
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes (optional)"
              rows={2}
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-accent"
            />

            {/* GPS Status */}
            <div className={cn(
              'flex items-center gap-2 text-xs px-3 py-2 rounded-lg',
              gpsStatus === 'got' ? 'bg-green-50 text-green-700' :
              gpsStatus === 'error' ? 'bg-amber-50 text-amber-700' :
              'bg-slate-50 text-slate-500'
            )}>
              {gpsStatus === 'got' ? <CheckCircle className="w-3.5 h-3.5" /> :
               gpsStatus === 'error' ? <AlertCircle className="w-3.5 h-3.5" /> :
               <MapPin className="w-3.5 h-3.5" />}
              {gpsStatus === 'got' ? 'GPS location ready' :
               gpsStatus === 'error' ? 'GPS unavailable — clock-in will proceed without location' :
               gpsStatus === 'getting' ? 'Getting your location...' :
               'GPS location will be captured at clock-in'}
            </div>

            <button
              onClick={handleClockIn}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-accent text-white font-bold py-4 rounded-xl shadow-md active:scale-95 transition disabled:opacity-60 text-lg"
            >
              <Play className="w-5 h-5" />
              {loading ? 'Clocking In...' : 'Clock In'}
            </button>
          </div>
        )}

        {/* Today's Entries */}
        {todayEntries.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <h3 className="font-semibold text-sm text-primary">Today's Entries</h3>
            </div>
            <div className="divide-y divide-slate-50">
              {todayEntries.map((entry) => (
                <div key={entry.id} className="px-4 py-3 flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-primary truncate">
                      {entry.work_order_title || 'General / No job'}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {formatTime(entry.clock_in)}
                      {entry.clock_out ? ` → ${formatTime(entry.clock_out)}` : ' → NOW'}
                    </p>
                  </div>
                  <div className="flex-shrink-0 ml-3">
                    {entry.status === 'active' ? (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">Active</span>
                    ) : (
                      <span className="text-sm font-bold text-primary">
                        {entry.duration_minutes ? formatMinutes(entry.duration_minutes) : '—'}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {todayEntries.length === 0 && !activeEntry && (
          <div className="text-center py-12 text-slate-400">
            <Clock className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No time entries today</p>
            <p className="text-xs mt-1">Clock in to start tracking your hours</p>
          </div>
        )}
      </div>

      {/* Work Order Picker Modal */}
      {showWorkOrderPicker && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end">
          <div className="bg-white w-full rounded-t-2xl max-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
              <h3 className="font-semibold text-primary">Select Work Order</h3>
              <button onClick={() => setShowWorkOrderPicker(false)} className="text-sm text-slate-500">Done</button>
            </div>
            <div className="overflow-y-auto flex-1">
              <button
                onClick={() => { setSelectedWorkOrder(null); setShowWorkOrderPicker(false); }}
                className="w-full px-4 py-3 text-left text-sm text-slate-500 border-b border-slate-50 flex items-center gap-2"
              >
                <Briefcase className="w-4 h-4" />
                No specific job
              </button>
              {workOrders.map((wo) => (
                <button
                  key={wo.id}
                  onClick={() => { setSelectedWorkOrder(wo); setShowWorkOrderPicker(false); }}
                  className={cn(
                    'w-full px-4 py-3 text-left border-b border-slate-50',
                    selectedWorkOrder?.id === wo.id ? 'bg-blue-50' : ''
                  )}
                >
                  <p className="text-sm font-medium text-primary">{wo.title}</p>
                  {wo.address && <p className="text-xs text-slate-500 mt-0.5">{wo.address}</p>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
