import React, { useEffect, useMemo, useState } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, MapPin, User, Plus, X, Check } from 'lucide-react';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, parseISO } from 'date-fns';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import NoProfileState from '../components/NoProfileState';
import { buildContactPipelineEvents, getUpcomingPipelineEvents, type PipelineEvent } from '../lib/scheduleEvents';
import { parseContactSchedule, serializeContactSchedule, updateScheduleMilestone, type ContactMilestoneId } from '../lib/contactSchedule';

const MILESTONE_TYPES: ContactMilestoneId[] = ['inspection', 'build', 'cleanup', 'pick_up_check', 'coc'];

export default function CalendarPage() {
  const navigate = useNavigate();
  const { profile, loading: loadingAuth } = useAuth();
  const [searchParams] = useSearchParams();
  const contactId = searchParams.get('contactId');
  const actionParam = searchParams.get('action');
  const nextStepParam = searchParams.get('nextStep') || 'inspection';
  const labelParam = searchParams.get('label') || 'Event';
  const decodedLabel = decodeURIComponent(labelParam);

  // When scheduling a next step, show ALL events on the calendar so you
  // can spot conflicts. Keep the original contactId for saving and return nav.
  const displayContactFilter = actionParam === 'schedule' ? null : contactId;
  const saveContactId = contactId;

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [events, setEvents] = useState<PipelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  // Add-event sheet state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [eventDate, setEventDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [eventTime, setEventTime] = useState('09:00');
  const [eventNotes, setEventNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);

  // Auto-open the sheet when navigated here with action=schedule
  useEffect(() => {
    if (actionParam === 'schedule' && saveContactId) {
      setSheetOpen(true);
    }
  }, [actionParam, saveContactId]);

  // Keep selected date in sync with the date picker in the sheet
  useEffect(() => {
    if (eventDate) {
      const d = new Date(eventDate + 'T' + eventTime);
      setSelectedDate(d);
      setCurrentMonth(d);
    }
  }, [eventDate, eventTime]);

  const fetchEvents = async () => {
    if (!profile?.company_id) return;
    setLoading(true);
    try {
      const [{ data: contacts, error: contactError }, { data: workOrders, error: workOrderError }] = await Promise.all([
        supabase.from('contacts').select('*').eq('company_id', profile.company_id),
        supabase.from('work_orders').select('*').eq('company_id', profile.company_id).order('scheduled_date', { ascending: true }),
      ]);

      if (contactError) throw contactError;
      if (workOrderError) throw workOrderError;

      const workOrdersByContact = new Map<string, any[]>();
      for (const order of workOrders || []) {
        const current = workOrdersByContact.get(order.contact_id) || [];
        current.push(order);
        workOrdersByContact.set(order.contact_id, current);
      }

      const nextEvents = (contacts || [])
        .flatMap((contact: any) => buildContactPipelineEvents(contact, workOrdersByContact.get(contact.id) || []))
        .filter((event) => (displayContactFilter ? event.contactId === displayContactFilter : true))
        .sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime());

      setEvents(nextEvents);

      if (!actionParam) {
        const firstUpcoming = getUpcomingPipelineEvents(nextEvents)[0];
        if (firstUpcoming) {
          const firstDate = new Date(firstUpcoming.date);
          setSelectedDate(firstDate);
          setCurrentMonth(firstDate);
        }
      }
    } catch (err) {
      console.error('Error fetching calendar events:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!profile?.company_id) {
      if (!loadingAuth) setLoading(false);
      return;
    }
    fetchEvents();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.company_id, loadingAuth, displayContactFilter]);

  const handleSaveEvent = async () => {
    if (!saveContactId || !profile?.company_id) return;
    setSaving(true);

    try {
      const isoDateTime = new Date(eventDate + 'T' + eventTime).toISOString();
      const isMilestone = MILESTONE_TYPES.includes(nextStepParam as ContactMilestoneId);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;

      if (isMilestone) {
        // Save as a contact schedule milestone (stored in notes field)
        const { data: contactData, error: fetchErr } = await db
          .from('contacts')
          .select('notes')
          .eq('id', saveContactId)
          .single();

        if (fetchErr) throw fetchErr;
        if (!contactData) throw new Error('Contact not found');

        const { schedule, plainNotes } = parseContactSchedule(
          (contactData as { notes: string | null }).notes
        );
        const updated = updateScheduleMilestone(schedule, nextStepParam as ContactMilestoneId, { date: isoDateTime });
        const newNotes = serializeContactSchedule(updated, eventNotes || plainNotes);

        const { error: updateErr } = await db
          .from('contacts')
          .update({ notes: newNotes })
          .eq('id', saveContactId);

        if (updateErr) throw updateErr;
      } else {
        // Save as a work order
        const { error: insertErr } = await db
          .from('work_orders')
          .insert({
            contact_id: saveContactId,
            company_id: profile.company_id,
            title: decodedLabel,
            scheduled_date: isoDateTime,
            notes: eventNotes || null,
            status: 'scheduled',
          });

        if (insertErr) throw insertErr;
      }

      setSavedOk(true);
      await fetchEvents();

      // Close sheet and navigate back to contact after brief success flash
      setTimeout(() => {
        setSavedOk(false);
        setSheetOpen(false);
        navigate(`/contacts/${saveContactId}`);
      }, 1200);
    } catch (err) {
      console.error('Failed to save event:', err);
    } finally {
      setSaving(false);
    }
  };

  const filteredEvents = useMemo(
    () => events.filter((event) => isSameDay(parseISO(event.date), selectedDate)),
    [events, selectedDate]
  );

  const upcomingEvents = useMemo(() => getUpcomingPipelineEvents(events).slice(0, 5), [events]);

  const renderHeader = () => (
    <div className="mb-8 flex justify-between items-center">
      <div>
        <h1 className="text-2xl font-bold text-primary">{format(currentMonth, 'MMMM yyyy')}</h1>
        <p className="text-slate-500 text-sm">
          {saveContactId ? 'Customer schedule' : `${upcomingEvents.length} upcoming scheduled item${upcomingEvents.length === 1 ? '' : 's'}`}
        </p>
      </div>
      <div className="flex gap-2">
        <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-2 bg-white rounded-xl shadow-sm active:scale-90 transition-transform">
          <ChevronLeft size={20} />
        </button>
        <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-2 bg-white rounded-xl shadow-sm active:scale-90 transition-transform">
          <ChevronRight size={20} />
        </button>
      </div>
    </div>
  );

  const renderDays = () => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return (
      <div className="grid grid-cols-7 mb-4">
        {days.map((day) => (
          <div key={day} className="text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            {day}
          </div>
        ))}
      </div>
    );
  };

  const renderCells = () => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);
    const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

    return (
      <div className="grid grid-cols-7 gap-1">
        {calendarDays.map((day, i) => {
          const isSelected = isSameDay(day, selectedDate);
          const isCurrentMonth = isSameMonth(day, monthStart);
          const hasEvent = events.some((event) => isSameDay(parseISO(event.date), day));

          return (
            <div
              key={i}
              onClick={() => {
                setSelectedDate(day);
                setEventDate(format(day, 'yyyy-MM-dd'));
              }}
              className={`h-12 flex flex-col items-center justify-center rounded-xl transition-all cursor-pointer relative ${
                isSelected ? 'bg-accent text-white shadow-lg shadow-accent/20' :
                isCurrentMonth ? 'bg-white text-primary' : 'text-slate-300'
              }`}
            >
              <span className="text-sm font-bold">{format(day, 'd')}</span>
              {hasEvent && !isSelected && (
                <div className="absolute bottom-2 h-1.5 w-1.5 rounded-full bg-accent" />
              )}
            </div>
          );
        })}
      </div>
    );
  };

  if (loadingAuth) return (
    <div className="h-full flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-4 border-accent border-t-transparent"></div>
    </div>
  );

  if (!profile?.company_id) return <NoProfileState />;

  if (loading) return (
    <div className="h-full flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-4 border-accent border-t-transparent"></div>
    </div>
  );

  return (
    <div className="p-6 space-y-8">
      {renderHeader()}

      <div className="card p-4">
        {renderDays()}
        {renderCells()}
      </div>

      <div className="space-y-4">
        <div className="flex justify-between items-center px-1">
          <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest">
            {isSameDay(selectedDate, new Date()) ? "Today's Schedule" : format(selectedDate, 'MMM d, yyyy')}
          </h2>
          <div className="flex items-center gap-3">
            {saveContactId && (
              <button
                onClick={() => navigate(`/contacts/${saveContactId}`)}
                className="text-accent text-xs font-bold"
              >
                Back To Customer
              </button>
            )}
            <button
              onClick={() => setSheetOpen(true)}
              className="flex items-center gap-1 bg-accent text-white text-xs font-bold px-3 py-1.5 rounded-xl active:scale-95 transition-transform"
            >
              <Plus size={13} /> Add
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {filteredEvents.length > 0 ? (
            filteredEvents.map((event) => (
              <button
                key={event.id}
                onClick={() => navigate(`/contacts/${event.contactId}`)}
                className="card w-full p-4 text-left active:bg-slate-50 transition-colors"
              >
                <div className="flex gap-4">
                  <div className={`w-1 rounded-full ${event.type === 'inspection' ? 'bg-amber-500' : event.type === 'build' ? 'bg-teal-500' : 'bg-primary'}`} />
                  <div className="flex-1 space-y-2">
                    <div className="flex justify-between items-start gap-3">
                      <h4 className="font-bold text-primary text-sm">{event.title}</h4>
                      <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                        <Clock size={10} /> {format(parseISO(event.date), 'p')}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      <div className="flex items-center gap-1.5 text-slate-500">
                        <User size={12} />
                        <span className="text-[11px] font-medium">{event.contactName}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-500">
                        <MapPin size={12} />
                        <span className="text-[11px] font-medium truncate max-w-[150px]">{event.location || 'Location pending'}</span>
                      </div>
                      {event.crew && (
                        <div className="flex items-center gap-1.5 text-accent">
                          <User size={12} />
                          <span className="text-[11px] font-bold">Crew: {event.crew}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))
          ) : (
            <div className="card p-8 flex flex-col items-center justify-center text-center space-y-2 border-2 border-dashed border-slate-200 bg-transparent shadow-none">
              <CalendarIcon size={32} className="text-slate-200" />
              <p className="text-slate-400 text-xs font-medium italic">No scheduled items for this day</p>
            </div>
          )}
        </div>
      </div>

      {/* Add Event Bottom Sheet */}
      {sheetOpen && (
        <div className="fixed inset-0 z-[70] flex flex-col justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setSheetOpen(false)}
          />

          {/* Sheet */}
          <div
            className="relative flex max-h-[85vh] min-h-0 flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl"
            style={{ maxHeight: 'min(85vh, calc(100dvh - env(safe-area-inset-top) - 1rem))' }}
          >
            {/* Handle */}
            <div className="absolute top-3 left-1/2 -translate-x-1/2 w-10 h-1 bg-slate-200 rounded-full" />
            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-24 pt-6">
              {/* Header */}
              <div className="flex items-start justify-between gap-3 pt-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Schedule Next Step</p>
                  <h2 className="text-xl font-black text-primary">{decodedLabel}</h2>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSaveEvent}
                    disabled={saving || savedOk || !eventDate}
                    className={`rounded-xl px-3 py-2 text-xs font-black uppercase tracking-widest transition-all active:scale-95 ${
                      savedOk
                        ? 'bg-green-500 text-white'
                        : 'bg-accent text-white disabled:opacity-50'
                    }`}
                  >
                    {savedOk ? 'Saved' : saving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={() => setSheetOpen(false)}
                    className="p-2 rounded-xl bg-slate-100 active:scale-95 transition-transform"
                  >
                    <X size={18} className="text-slate-500" />
                  </button>
                </div>
              </div>

              {/* Date */}
              <div className="mt-5 space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Date</label>
                <input
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base font-medium text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>

              {/* Time */}
              <div className="mt-5 space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Time</label>
                <input
                  type="time"
                  value={eventTime}
                  onChange={(e) => setEventTime(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base font-medium text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>

              {/* Notes / Crew */}
              <div className="mt-5 space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Notes / Crew (optional)</label>
                <textarea
                  value={eventNotes}
                  onChange={(e) => setEventNotes(e.target.value)}
                  placeholder="Add crew name, address notes, or instructions…"
                  rows={3}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base font-medium text-primary placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-accent resize-none"
                />
              </div>
            </div>

            <div
              className="shrink-0 border-t border-slate-100 bg-white px-6 py-4"
              style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
            >
              <button
                onClick={handleSaveEvent}
                disabled={saving || savedOk || !eventDate}
                className={`w-full rounded-2xl py-4 text-sm font-black uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 ${
                  savedOk
                    ? 'bg-green-500 text-white'
                    : 'bg-accent text-white disabled:opacity-50'
                }`}
              >
                {savedOk ? (
                  <><Check size={16} /> Saved - taking you back</>
                ) : saving ? (
                  <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  `Add ${decodedLabel} to Calendar`
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
