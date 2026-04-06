import React, { useEffect, useMemo, useState } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, MapPin, Trash2, User, Plus, X, Check } from 'lucide-react';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, parseISO } from 'date-fns';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import NoProfileState from '../components/NoProfileState';
import { buildContactPipelineEvents, getUpcomingPipelineEvents, type PipelineEvent } from '../lib/scheduleEvents';
import { parseContactSchedule, serializeContactSchedule, updateScheduleMilestone, type ContactMilestoneId } from '../lib/contactSchedule';
import type { Database } from '../types/supabase';

const MILESTONE_TYPES: ContactMilestoneId[] = ['inspection', 'build', 'cleanup', 'pick_up_check', 'coc'];
type ContactRow = Database['public']['Tables']['contacts']['Row'];
type WorkOrderRow = Database['public']['Tables']['work_orders']['Row'];

export default function CalendarPage() {
  const addHourToTime = (timeValue: string) => {
    const [hours, minutes] = timeValue.split(':').map(Number);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return '10:00';
    const next = new Date();
    next.setHours(hours, minutes, 0, 0);
    next.setMinutes(next.getMinutes() + 60);
    return format(next, 'HH:mm');
  };

  const navigate = useNavigate();
  const { profile, user, loading: loadingAuth } = useAuth();
  const [searchParams] = useSearchParams();
  const contactId = searchParams.get('contactId');
  const actionParam = searchParams.get('action');
  const nextStepParam = searchParams.get('nextStep') || 'inspection';
  const labelParam = searchParams.get('label') || 'Event';
  const decodedLabel = decodeURIComponent(labelParam);

  // Always load ALL events — the calendar always shows the full company schedule.
  // contactId is used only for color-coding (green = this customer, blue = others)
  // and for saving when action=schedule.
  const displayContactFilter = null;
  const saveContactId = contactId;
  // The "featured" contact whose events are highlighted green
  const highlightContactId = contactId;

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [events, setEvents] = useState<PipelineEvent[]>([]);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Add-event sheet state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [eventDate, setEventDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [eventTime, setEventTime] = useState('09:00');
  const [eventEndTime, setEventEndTime] = useState('10:00');
  const [selectedContactId, setSelectedContactId] = useState(contactId || '');
  const [contactSearch, setContactSearch] = useState('');
  const [eventNotes, setEventNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Reschedule sheet state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [rescheduleEvent, setRescheduleEvent] = useState<PipelineEvent | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [rescheduleEndTime, setRescheduleEndTime] = useState('');
  const [rescheduleSaving, setRescheduleSaving] = useState(false);
  const [rescheduleSavedOk, setRescheduleSavedOk] = useState(false);
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);

  // When navigated here with action=schedule, do NOT auto-open the sheet.
  // The user needs to see all calendar events first, then tap a day to pick a
  // date, then hit Add. A scheduling banner is shown instead (see JSX below).

  // Keep selected date in sync with the date picker in the sheet
  useEffect(() => {
    if (eventDate) {
      const d = new Date(eventDate + 'T' + eventTime);
      setSelectedDate(d);
      setCurrentMonth(d);
    }
  }, [eventDate, eventTime]);

  useEffect(() => {
    setSelectedContactId(contactId || '');
  }, [contactId]);

  const fetchEvents = async () => {
    if (!profile?.company_id) return;
    setLoading(true);
    setLoadError(null);
    console.log('[Calendar] fetchEvents:start', {
      companyId: profile.company_id,
      highlightContactId: highlightContactId ?? null,
      actionParam: actionParam ?? null,
    });
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const [
        { data: contacts, error: contactError },
        { data: workOrders, error: workOrderError },
        { data: appointments, error: appointmentError },
      ] = await Promise.all([
        (supabase.from('contacts') as any).select('*').eq('company_id', profile.company_id).neq('status', 'archived'),
        supabase.from('work_orders').select('*').eq('company_id', profile.company_id).order('scheduled_date', { ascending: true }),
        db.from('appointments').select('*').eq('company_id', profile.company_id),
      ]);

      console.log('[Calendar] fetchEvents:query_status', {
        companyId: profile.company_id,
        contactsCount: contacts?.length ?? 0,
        contactsError: contactError?.message ?? null,
        workOrdersCount: workOrders?.length ?? 0,
        workOrdersError: workOrderError?.message ?? null,
        appointmentsCount: appointments?.length ?? 0,
        appointmentsError: appointmentError?.message ?? null,
      });

      if (contactError) throw contactError;
      if (workOrderError) throw workOrderError;

      // Diagnostic — visible in Xcode console so we can confirm the table exists and data is returned
      if (appointmentError) {
        console.error('[Calendar] appointments query error:', JSON.stringify(appointmentError));
      } else {
        console.log(`[Calendar] appointments fetched: ${(appointments || []).length} rows for company_id=${profile.company_id}`);
        if ((appointments || []).length > 0) {
          console.log('[Calendar] first appointment sample:', JSON.stringify((appointments as any[])[0]));
        }
      }

      const workOrderRows = (workOrders || []) as WorkOrderRow[];
      const contactRows = (contacts || []) as ContactRow[];
      setContacts(contactRows);
      const workOrdersByContact = new Map<string, WorkOrderRow[]>();
      for (const order of workOrderRows) {
        const current = workOrdersByContact.get(order.contact_id) || [];
        current.push(order);
        workOrdersByContact.set(order.contact_id, current);
      }

      // Build a contact lookup map for appointment display
      const contactMap = new Map<string, ContactRow>();
      for (const c of contactRows) {
        contactMap.set(c.id, c);
      }

      const nextEvents = contactRows
        .flatMap((contact) => buildContactPipelineEvents(contact, workOrdersByContact.get(contact.id) || []))
        .filter((event) => (displayContactFilter ? event.contactId === displayContactFilter : true))
        .sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime());

      // Convert appointments into PipelineEvent objects
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const aptRows = ((appointments || []) as any[]).filter((apt) => apt.status !== 'cancelled');
      const appointmentEvents: PipelineEvent[] = aptRows
        .filter((apt) => !displayContactFilter || apt.contact_id === displayContactFilter)
        .map((apt) => {
          const contactRow = contactMap.get(apt.contact_id);
          const contactName = contactRow
            ? `${(contactRow as any).first_name || ''} ${(contactRow as any).last_name || ''}`.trim()
            : 'Unknown Contact';
          const location = contactRow ? (contactRow as any).address || '' : '';

          let eventType: PipelineEvent['type'] = 'inspection';
          if (apt.type === 'inspection' || apt.type === 'damage_assessment') {
            eventType = 'inspection';
          } else if (apt.type === 'build' || apt.type === 'construction') {
            eventType = 'build';
          }

          // Mobile rows may come back with date/time columns or only start_time/end_time.
          const startDate = apt.start_time ? new Date(apt.start_time) : null;
          const derivedDate = !apt.date && startDate && !Number.isNaN(startDate.getTime())
            ? startDate.toISOString().split('T')[0]
            : apt.date;
          const derivedTime = !apt.time && startDate && !Number.isNaN(startDate.getTime())
            ? `${String(startDate.getHours()).padStart(2, '0')}:${String(startDate.getMinutes()).padStart(2, '0')}:00`
            : apt.time;

          // Build a safe ISO datetime — apt.time may be "HH:mm", "HH:mm:ss", or null
          const timeStr = derivedTime
            ? derivedTime.length === 5   // "HH:mm"
              ? `${derivedTime}:00`
              : derivedTime              // already "HH:mm:ss"
            : '09:00:00';                // fallback when time is missing
          const eventDate = derivedDate || new Date().toISOString().split('T')[0];

          return {
            id: `apt-${apt.id}`,
            contactId: apt.contact_id,
            contactName,
            title: apt.title || 'Appointment',
            date: `${eventDate}T${timeStr}`,
            endDate: apt.end_time || undefined,
            type: eventType,
            location: apt.location || location,
            crew: apt.assigned_to || null,   // required by PipelineEvent
            source: 'schedule',              // required by PipelineEvent
          } as PipelineEvent;
        });

      // Merge pipeline events and appointment events, deduplicate by id, then sort
      const existingIds = new Set(nextEvents.map((e) => e.id));
      const merged = [...nextEvents];
      for (const aptEvent of appointmentEvents) {
        if (!existingIds.has(aptEvent.id)) {
          merged.push(aptEvent);
          existingIds.add(aptEvent.id);
        }
      }
      merged.sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime());

      console.log('[Calendar] fetchEvents:merged', {
        companyId: profile.company_id,
        pipelineEventCount: nextEvents.length,
        appointmentEventCount: appointmentEvents.length,
        mergedCount: merged.length,
        selectedDate: selectedDate.toISOString(),
      });
      setEvents(merged);

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
      const message = err instanceof Error ? err.message : 'Unknown error';
      setLoadError(`Unable to load calendar events. ${message}`);
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
    const targetContactId = saveContactId || selectedContactId;
    if (!targetContactId || !profile?.company_id) {
      setSaveError('Choose a customer before saving this calendar appointment.');
      console.warn('[Calendar] handleSaveEvent:missing_context', {
        saveContactId: targetContactId ?? null,
        companyId: profile?.company_id ?? null,
      });
      return;
    }
    if (!eventDate || !eventTime || !eventEndTime) {
      setSaveError('Start and end time are required.');
      return;
    }

    const parsedDateTime = new Date(`${eventDate}T${eventTime}`);
    const parsedEndDateTime = new Date(`${eventDate}T${eventEndTime}`);
    if (Number.isNaN(parsedDateTime.getTime())) {
      setSaveError('Selected date/time is invalid. Please choose a valid schedule slot.');
      return;
    }
    if (Number.isNaN(parsedEndDateTime.getTime()) || parsedEndDateTime <= parsedDateTime) {
      setSaveError('End time must be after the start time.');
      return;
    }

    setSaveError(null);
    setSaving(true);
    console.log('[Calendar] handleSaveEvent:start', {
      companyId: profile.company_id,
      saveContactId: targetContactId,
      eventDate,
      eventTime,
      eventEndTime,
      nextStepParam,
      decodedLabel,
    });

    // Helper: race any Supabase promise against a 15-second timeout
    const withTimeout = <T,>(promise: Promise<T>): Promise<T> =>
      Promise.race([
        promise,
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error('Save timed out — check your connection and try again.')), 15000)
        ),
      ]);

    try {
      const isoDateTime = parsedDateTime.toISOString();
      const endDateTime = parsedEndDateTime.toISOString();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const appointmentType = MILESTONE_TYPES.includes(nextStepParam as ContactMilestoneId)
        ? nextStepParam
        : 'inspection';

      console.log('[Calendar] handleSaveEvent:mode', { mode: 'appointment', nextStepParam, appointmentType });

      const { data: contactData, error: contactFetchErr } = await withTimeout<any>(
        db.from('contacts').select('address, city, state, zip').eq('id', targetContactId).single()
      );

      if (contactFetchErr) throw contactFetchErr;

      const location = [
        (contactData as { address?: string | null } | null)?.address,
        (contactData as { city?: string | null } | null)?.city,
        (contactData as { state?: string | null } | null)?.state,
        (contactData as { zip?: string | null } | null)?.zip,
      ]
        .filter(Boolean)
        .join(', ') || null;

      const { error: insertErr } = await withTimeout<any>(
        db.from('appointments').insert({
          contact_id: targetContactId,
          company_id: profile.company_id,
          title: decodedLabel,
          type: appointmentType,
          status: 'scheduled',
          start_time: isoDateTime,
          end_time: endDateTime,
          notes: eventNotes || null,
          location,
          assigned_to: user?.id || null,
        })
      );

      if (insertErr) throw insertErr;

      // Advance contact pipeline status when a key step is scheduled
      const STATUS_ADVANCEMENT: Record<string, { from: string[]; to: string }> = {
        inspection: { from: ['new_lead', 'lead', 'contacted'], to: 'appointment_set' },
        build:      { from: ['approved', 'signed_won'],        to: 'scheduled' },
      };
      const advancement = STATUS_ADVANCEMENT[nextStepParam];
      if (advancement && targetContactId) {
        try {
          const { data: contactRow } = await db
            .from('contacts')
            .select('status')
            .eq('id', targetContactId)
            .single();
          if (contactRow && advancement.from.includes((contactRow as any).status)) {
            await db
              .from('contacts')
              .update({ status: advancement.to, status_changed_at: new Date().toISOString() })
              .eq('id', targetContactId);
          }
        } catch (err) {
          console.error('Error advancing contact status from calendar:', err);
        }
      }

      setSavedOk(true);
      setSaveError(null);
      console.log('[Calendar] handleSaveEvent:success', {
        companyId: profile.company_id,
        saveContactId: targetContactId,
      });
      await fetchEvents();

      // Close sheet and only navigate back when launched from a customer context.
      setTimeout(() => {
        setSavedOk(false);
        setSheetOpen(false);
        if (saveContactId) {
          navigate(`/contacts/${saveContactId}`);
        }
      }, 1200);
    } catch (err) {
      console.error('Failed to save event:', err);
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('[Calendar] handleSaveEvent:error', {
        companyId: profile?.company_id ?? null,
        saveContactId: targetContactId ?? null,
        message,
      });
      setSaveError(`Save failed. ${message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleReschedule = async () => {
    if (!rescheduleEvent || !rescheduleDate || !rescheduleTime) return;
    const parsedDT = new Date(`${rescheduleDate}T${rescheduleTime}`);
    const parsedEndDT = rescheduleEvent.id.startsWith('apt-')
      ? new Date(`${rescheduleDate}T${rescheduleEndTime}`)
      : null;
    if (Number.isNaN(parsedDT.getTime())) {
      setRescheduleError('Invalid date/time. Please try again.');
      return;
    }
    if (rescheduleEvent.id.startsWith('apt-') && (!rescheduleEndTime || !parsedEndDT || Number.isNaN(parsedEndDT.getTime()) || parsedEndDT <= parsedDT)) {
      setRescheduleError('End time must be after the start time.');
      return;
    }
    setRescheduleError(null);
    setRescheduleSaving(true);

    const withTimeout = <T,>(promise: Promise<T>): Promise<T> =>
      Promise.race([
        promise,
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error('Save timed out — check your connection and try again.')), 15000)
        ),
      ]);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const newISO = parsedDT.toISOString();

      if (rescheduleEvent.id.startsWith('apt-')) {
        // appointments table — store start/end timestamps
        const aptId = rescheduleEvent.id.replace('apt-', '');
        const endISO = parsedEndDT!.toISOString();
        const { error } = await withTimeout<any>(
          db.from('appointments').update({ start_time: newISO, end_time: endISO }).eq('id', aptId)
        );
        if (error) throw error;
      } else if (rescheduleEvent.source === 'work_order') {
        // work_orders table — single ISO datetime column
        const { error } = await withTimeout<any>(db.from('work_orders').update({ scheduled_date: newISO }).eq('id', rescheduleEvent.id));
        if (error) throw error;
      } else {
        // schedule source — milestone stored in contact notes
        const milestoneId = rescheduleEvent.type as ContactMilestoneId;
        const { data: contactData, error: fetchErr } = await withTimeout<any>(db.from('contacts').select('notes').eq('id', rescheduleEvent.contactId).single());
        if (fetchErr) throw fetchErr;
        const { schedule, plainNotes } = parseContactSchedule((contactData as { notes: string | null }).notes);
        const updated = updateScheduleMilestone(schedule, milestoneId, { date: newISO });
        const newNotes = serializeContactSchedule(updated, plainNotes);
        const { error: updateErr } = await withTimeout<any>(db.from('contacts').update({ notes: newNotes }).eq('id', rescheduleEvent.contactId));
        if (updateErr) throw updateErr;
      }

      setRescheduleSavedOk(true);
      await fetchEvents();
      setTimeout(() => {
        setRescheduleSavedOk(false);
        setRescheduleEvent(null);
      }, 1200);
    } catch (err) {
      console.error('Reschedule failed:', err);
      setRescheduleError(err instanceof Error ? err.message : 'Reschedule failed. Please try again.');
    } finally {
      setRescheduleSaving(false);
    }
  };

  const handleDeleteEvent = async (event: PipelineEvent) => {
    setDeletingId(event.id);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      if (event.id.startsWith('apt-')) {
        const aptId = event.id.replace('apt-', '');
        await db.from('appointments').delete().eq('id', aptId);
      } else if (event.source === 'work_order') {
        await db.from('work_orders').delete().eq('id', event.id);
      } else {
        const milestoneId = event.type as ContactMilestoneId;
        const { data: contactData } = await db.from('contacts').select('notes').eq('id', event.contactId).single();
        if (contactData) {
          const { schedule, plainNotes } = parseContactSchedule(contactData.notes);
          const updated = updateScheduleMilestone(schedule, milestoneId, { date: undefined });
          const newNotes = serializeContactSchedule(updated, plainNotes);
          await db.from('contacts').update({ notes: newNotes }).eq('id', event.contactId);
        }
      }
      await fetchEvents();
    } catch (err) {
      console.error('Delete event failed:', err);
    } finally {
      setDeletingId(null);
    }
  };

  const filteredEvents = useMemo(
    () => events.filter((event) => isSameDay(parseISO(event.date), selectedDate)),
    [events, selectedDate]
  );

  const upcomingEvents = useMemo(() => getUpcomingPipelineEvents(events).slice(0, 5), [events]);
  const filteredContacts = useMemo(() => {
    const query = contactSearch.trim().toLowerCase();
    if (!query) return contacts;

    return contacts.filter((contact) => {
      const fullName = `${contact.first_name} ${contact.last_name}`.trim().toLowerCase();
      const address = `${contact.address || ''} ${contact.city || ''} ${contact.state || ''} ${contact.zip || ''}`.toLowerCase();
      return fullName.includes(query) || address.includes(query);
    });
  }, [contactSearch, contacts]);

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
          const dayEvents = events.filter((event) => isSameDay(parseISO(event.date), day));
          const hasHighlight = highlightContactId
            ? dayEvents.some((e) => e.contactId === highlightContactId)
            : false;
          // Count distinct other appointments (capped at 3 dots max)
          const otherCount = Math.min(
            dayEvents.filter((e) => !highlightContactId || e.contactId !== highlightContactId).length,
            3
          );

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
              {!isSelected && (hasHighlight || otherCount > 0) && (
                <div className="absolute bottom-2 flex gap-0.5 items-center">
                  {/* Green dot always first when this customer has an event */}
                  {hasHighlight && (
                    <div className="h-2 w-2 rounded-full bg-green-500" />
                  )}
                  {/* One blue dot per other appointment, up to 3 */}
                  {Array.from({ length: otherCount }).map((_, idx) => (
                    <div key={idx} className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                  ))}
                </div>
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

      {/* Scheduling banner — shown when navigated here from a contact */}
      {actionParam === 'schedule' && saveContactId && (
        <div className="rounded-2xl bg-accent/10 border border-accent/20 px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-black text-accent uppercase tracking-widest">Scheduling Mode</p>
            <p className="text-sm font-semibold text-primary mt-0.5 truncate">
              Tap a date on the calendar, then tap <span className="text-accent font-black">+ Add</span> to save.
            </p>
          </div>
          <button
            onClick={() => navigate(`/contacts/${saveContactId}`)}
            className="shrink-0 text-xs font-bold text-slate-500 bg-white rounded-xl px-3 py-2 border border-slate-200 active:scale-95 transition-transform"
          >
            Cancel
          </button>
        </div>
      )}

      {loadError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-widest text-red-600">Load Error</p>
          <p className="mt-1 text-sm text-red-700">{loadError}</p>
        </div>
      )}

      <div className="card p-4">
        {renderDays()}
        {renderCells()}
        {highlightContactId && (
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              <span className="text-[10px] font-bold text-slate-500">This Customer</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-blue-400" />
              <span className="text-[10px] font-bold text-slate-500">Other Appointments</span>
            </div>
          </div>
        )}
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
              onClick={() => {
                setSaveError(null);
                setSavedOk(false);
                if (!saveContactId) {
                  setSelectedContactId('');
                  setContactSearch('');
                }
                setEventEndTime(addHourToTime(eventTime));
                setSheetOpen(true);
              }}
              className="flex items-center gap-1 bg-accent text-white text-xs font-bold px-3 py-1.5 rounded-xl active:scale-95 transition-transform"
            >
              <Plus size={13} /> Add
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {filteredEvents.length > 0 ? (
            filteredEvents.map((event) => {
              const isHighlighted = highlightContactId && event.contactId === highlightContactId;
              return (
              <div
                key={event.id}
                className={`card flex items-stretch border-l-4 ${
                  isHighlighted ? 'border-l-green-500' : highlightContactId ? 'border-l-blue-400' : 'border-l-transparent'
                }`}
              >
                <button
                  onClick={() => {
                    const d = parseISO(event.date);
                    setRescheduleEvent(event);
                    setRescheduleDate(format(d, 'yyyy-MM-dd'));
                    setRescheduleTime(format(d, 'HH:mm'));
                    setRescheduleEndTime(
                      event.endDate && !Number.isNaN(new Date(event.endDate).getTime())
                        ? format(new Date(event.endDate), 'HH:mm')
                        : addHourToTime(format(d, 'HH:mm'))
                    );
                    setRescheduleError(null);
                    setRescheduleSavedOk(false);
                  }}
                  className="flex-1 p-4 text-left active:bg-slate-50 transition-colors"
                >
                  <div className="flex gap-4">
                    <div className={`w-1 rounded-full shrink-0 ${isHighlighted ? 'bg-green-500' : event.type === 'inspection' ? 'bg-amber-500' : event.type === 'build' ? 'bg-teal-500' : 'bg-blue-400'}`} />
                    <div className="flex-1 space-y-2">
                      <div className="flex justify-between items-start gap-3">
                        <div>
                          <h4 className="font-bold text-primary text-sm">{event.title}</h4>
                          {isHighlighted && (
                            <span className="text-[9px] font-black uppercase tracking-widest text-green-600">This Customer</span>
                          )}
                        </div>
                        <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                          <Clock size={10} /> {format(parseISO(event.date), 'p')}{event.endDate ? ` - ${format(parseISO(event.endDate), 'p')}` : ''}
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
                <button
                  onClick={() => handleDeleteEvent(event)}
                  disabled={deletingId === event.id}
                  className="flex items-center justify-center w-10 shrink-0 pr-2 text-slate-300 active:text-red-500 active:bg-red-50 transition-colors disabled:opacity-40 rounded-r-2xl"
                >
                  {deletingId === event.id
                    ? <div className="h-3.5 w-3.5 rounded-full border-2 border-slate-300 border-t-transparent animate-spin" />
                    : <Trash2 size={15} />}
                </button>
              </div>
              );
            })
          ) : (
            <div className="card p-8 flex flex-col items-center justify-center text-center space-y-2 border-2 border-dashed border-slate-200 bg-transparent shadow-none">
              <CalendarIcon size={32} className="text-slate-200" />
              <p className="text-slate-400 text-xs font-medium italic">No scheduled items for this day</p>
            </div>
          )}
        </div>
      </div>

      {/* Reschedule Bottom Sheet */}
      {rescheduleEvent && (
        <div className="fixed inset-0 z-[70] flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setRescheduleEvent(null)} />
          <div className="relative flex max-h-[75vh] min-h-0 flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl">
            <div className="absolute top-3 left-1/2 -translate-x-1/2 w-10 h-1 bg-slate-200 rounded-full" />

            {/* Fixed header — always visible, save button lives here */}
            <div className="shrink-0 px-6 pt-8 pb-4 border-b border-slate-100">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Reschedule</p>
                  <h2 className="text-xl font-black text-primary truncate">{rescheduleEvent.title}</h2>
                  <p className="text-sm text-slate-500 mt-0.5 truncate">{rescheduleEvent.contactName}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={handleReschedule}
                    disabled={rescheduleSaving || rescheduleSavedOk || !rescheduleDate || !rescheduleTime || (rescheduleEvent.id.startsWith('apt-') && !rescheduleEndTime)}
                    className={`rounded-xl px-3 py-2 text-xs font-black uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50 flex items-center gap-1.5 ${
                      rescheduleSavedOk ? 'bg-green-500 text-white' : 'bg-accent text-white'
                    }`}
                  >
                    {rescheduleSavedOk ? (
                      <><Check size={13} /> Saved</>
                    ) : rescheduleSaving ? (
                      <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    ) : (
                      'Save'
                    )}
                  </button>
                  <button
                    onClick={() => setRescheduleEvent(null)}
                    className="p-2 rounded-xl bg-slate-100 active:scale-95 transition-transform"
                  >
                    <X size={18} className="text-slate-500" />
                  </button>
                </div>
              </div>
            </div>

            {/* Scrollable body */}
            <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-5"
              style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))' }}>

              {rescheduleError && (
                <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
                  <p className="text-xs font-bold uppercase tracking-widest text-red-600">Error</p>
                  <p className="mt-1 text-sm text-red-700">{rescheduleError}</p>
                </div>
              )}

              {/* Date */}
              <div className="space-y-1.5 mb-5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">New Date</label>
                <input
                  type="date"
                  value={rescheduleDate}
                  onChange={(e) => { setRescheduleError(null); setRescheduleDate(e.target.value); }}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base font-medium text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>

              {/* Time */}
              <div className="space-y-1.5 mb-6">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">New Time</label>
                <input
                  type="time"
                  value={rescheduleTime}
                  onChange={(e) => { setRescheduleError(null); setRescheduleTime(e.target.value); }}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base font-medium text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>

              {rescheduleEvent.id.startsWith('apt-') && (
                <div className="space-y-1.5 mb-6">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">End Time</label>
                  <input
                    type="time"
                    value={rescheduleEndTime}
                    onChange={(e) => { setRescheduleError(null); setRescheduleEndTime(e.target.value); }}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base font-medium text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
              )}

              {/* Large save button in scroll area — always reachable */}
              <button
                onClick={handleReschedule}
                disabled={rescheduleSaving || rescheduleSavedOk || !rescheduleDate || !rescheduleTime || (rescheduleEvent.id.startsWith('apt-') && !rescheduleEndTime)}
                className={`w-full rounded-2xl py-4 text-sm font-black uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 mb-4 ${
                  rescheduleSavedOk ? 'bg-green-500 text-white' : 'bg-accent text-white'
                }`}
              >
                {rescheduleSavedOk ? (
                  <><Check size={16} /> Rescheduled!</>
                ) : rescheduleSaving ? (
                  <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  'Save New Time'
                )}
              </button>

              {/* Go to Contact link */}
              <button
                onClick={() => { setRescheduleEvent(null); navigate(`/contacts/${rescheduleEvent.contactId}`); }}
                className="w-full text-center text-sm font-bold text-accent py-2"
              >
                Go to {rescheduleEvent.contactName}'s Profile →
              </button>
            </div>
          </div>
        </div>
      )}

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
                    disabled={saving || savedOk || !eventDate || !eventTime || !eventEndTime || (!saveContactId && !selectedContactId)}
                    className={`rounded-xl px-3 py-2 text-xs font-black uppercase tracking-widest transition-all active:scale-95 ${
                      savedOk
                        ? 'bg-green-500 text-white'
                        : 'bg-accent text-white disabled:opacity-50'
                    }`}
                  >
                    {savedOk ? 'Saved' : saving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={() => {
                      setSaveError(null);
                      setSheetOpen(false);
                    }}
                    className="p-2 rounded-xl bg-slate-100 active:scale-95 transition-transform"
                  >
                    <X size={18} className="text-slate-500" />
                  </button>
                </div>
              </div>

              {saveError && (
                <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
                  <p className="text-xs font-bold uppercase tracking-widest text-red-600">Save Error</p>
                  <p className="mt-1 text-sm text-red-700">{saveError}</p>
                </div>
              )}

              {!saveContactId && (
                <div className="mt-5 space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Search Customer</label>
                  <input
                    type="text"
                    value={contactSearch}
                    onChange={(e) => {
                      setSaveError(null);
                      setContactSearch(e.target.value);
                    }}
                    placeholder="Search by name or address"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base font-medium text-primary placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent"
                  />

                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Customer</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <select
                      value={selectedContactId}
                      onChange={(e) => {
                        setSaveError(null);
                        setSelectedContactId(e.target.value);
                      }}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-base font-medium text-primary focus:outline-none focus:ring-2 focus:ring-accent appearance-none"
                    >
                      <option value="">Select customer</option>
                      {filteredContacts.map((contact) => (
                        <option key={contact.id} value={contact.id}>
                          {`${contact.first_name} ${contact.last_name}`.trim()}
                        </option>
                      ))}
                    </select>
                  </div>
                  {contactSearch && filteredContacts.length === 0 && (
                    <p className="text-xs font-medium text-slate-500">No customers match that search.</p>
                  )}
                </div>
              )}

              {/* Date */}
              <div className="mt-5 space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Date</label>
                <input
                  type="date"
                  value={eventDate}
                  onChange={(e) => {
                    setSaveError(null);
                    setEventDate(e.target.value);
                  }}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base font-medium text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>

              {/* Time */}
              <div className="mt-5 space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Time</label>
                <input
                  type="time"
                  value={eventTime}
                  onChange={(e) => {
                    setSaveError(null);
                    setEventTime(e.target.value);
                  }}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base font-medium text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>

              <div className="mt-5 space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">End Time</label>
                <input
                  type="time"
                  value={eventEndTime}
                  onChange={(e) => {
                    setSaveError(null);
                    setEventEndTime(e.target.value);
                  }}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base font-medium text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>

              {/* Notes / Crew */}
              <div className="mt-5 space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Notes / Crew (optional)</label>
                <textarea
                  value={eventNotes}
                  onChange={(e) => {
                    setSaveError(null);
                    setEventNotes(e.target.value);
                  }}
                  placeholder="Add crew name, address notes, or instructions…"
                  rows={3}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base font-medium text-primary placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-accent resize-none"
                />
              </div>

              {/* Upcoming Appointments — visible inside the sheet so users can spot conflicts */}
              {(() => {
                const now = new Date();
                now.setHours(0, 0, 0, 0);
                const upcoming = events
                  .filter((e) => new Date(e.date) >= now)
                  .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                  .slice(0, 15);
                if (upcoming.length === 0) return null;
                return (
                  <div className="mt-6 space-y-2">
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400">All Upcoming Appointments</p>
                    <div className="space-y-2">
                      {upcoming.map((event) => (
                        <div key={event.id} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
                          <div
                            className={`w-1 self-stretch rounded-full ${
                              event.type === 'inspection'
                                ? 'bg-amber-500'
                                : event.type === 'build'
                                ? 'bg-teal-500'
                                : 'bg-primary'
                            }`}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-primary truncate">{event.contactName}</p>
                            <p className="text-[11px] text-slate-500 truncate">{event.title}</p>
                            {event.location ? (
                              <p className="text-[10px] text-slate-400 truncate">{event.location}</p>
                            ) : null}
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-[11px] font-bold text-slate-600">
                              {format(parseISO(event.date), 'MMM d')}
                            </p>
                            <p className="text-[10px] text-slate-400">
                              {format(parseISO(event.date), 'p')}{event.endDate ? ` - ${format(parseISO(event.endDate), 'p')}` : ''}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>

            <div
              className="shrink-0 border-t border-slate-100 bg-white px-6 py-4"
              style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
            >
              <button
                onClick={handleSaveEvent}
                disabled={saving || savedOk || !eventDate || !eventTime || !eventEndTime || (!saveContactId && !selectedContactId)}
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
                  saveContactId ? `Add ${decodedLabel} to Calendar` : 'Add Appointment To Calendar'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
