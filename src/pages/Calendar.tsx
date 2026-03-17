import React, { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, Clock, MapPin, User } from 'lucide-react';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, addDays, parseISO } from 'date-fns';
import { useAuth } from '../context/AuthContext';
import NoProfileState from '../components/NoProfileState';
import NewAppointmentModal from '../components/NewAppointmentModal';

export default function CalendarPage() {
  const { profile, loading: loadingAuth } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [appointments, setAppointments] = useState<any[]>([
    { id: 1, title: 'Roof Inspection', time: '10:00 AM', type: 'inspection', contact: 'John Smith', location: '123 Main St', date: new Date().toISOString() },
    { id: 2, title: 'Estimate Presentation', time: '02:00 PM', type: 'estimate', contact: 'Sarah Johnson', location: '456 Oak Ave', date: new Date().toISOString() },
    { id: 3, title: 'Follow-up Call', time: '04:30 PM', type: 'follow_up', contact: 'Mike Miller', location: 'Remote', date: new Date().toISOString() },
  ]);

  const filteredAppointments = appointments.filter(appt => 
    isSameDay(parseISO(appt.date), selectedDate)
  );

  const handleAddAppointment = (newAppt: any) => {
    setAppointments(prev => [...prev, newAppt]);
  };

  const renderHeader = () => {
    return (
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-primary">{format(currentMonth, 'MMMM yyyy')}</h1>
          <p className="text-slate-500 text-sm">You have 3 appointments today</p>
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
  };

  const renderDays = () => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return (
      <div className="grid grid-cols-7 mb-4">
        {days.map(day => (
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
          const hasEvent = appointments.some(appt => isSameDay(parseISO(appt.date), day));

          return (
            <div
              key={i}
              onClick={() => setSelectedDate(day)}
              className={`h-12 flex flex-col items-center justify-center rounded-xl transition-all cursor-pointer relative ${
                isSelected ? 'bg-accent text-white shadow-lg shadow-accent/20' : 
                isCurrentMonth ? 'bg-white text-primary' : 'text-slate-300'
              }`}
            >
              <span className="text-sm font-bold">{format(day, 'd')}</span>
              {hasEvent && !isSelected && (
                <div className="absolute bottom-2 h-1 w-1 rounded-full bg-accent" />
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

  if (!profile?.company_id) {
    return <NoProfileState />;
  }

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
          <button 
            onClick={() => setIsModalOpen(true)}
            className="text-accent text-xs font-bold flex items-center gap-1 active:scale-95 transition-transform"
          >
            <Plus size={14} /> Add New
          </button>
        </div>

        <div className="space-y-3">
          {filteredAppointments.length > 0 ? (
            filteredAppointments.map((appt) => (
              <div key={appt.id} className="card p-4 flex gap-4 active:bg-slate-50 transition-colors">
                <div className={`w-1 rounded-full ${
                  appt.type === 'inspection' ? 'bg-amber-500' : 
                  appt.type === 'estimate' ? 'bg-emerald-500' : 
                  appt.type === 'installation' ? 'bg-indigo-500' : 'bg-blue-500'
                }`} />
                <div className="flex-1 space-y-2">
                  <div className="flex justify-between items-start">
                    <h4 className="font-bold text-primary text-sm">{appt.title}</h4>
                    <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                      <Clock size={10} /> {appt.time}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <div className="flex items-center gap-1.5 text-slate-500">
                      <User size={12} />
                      <span className="text-[11px] font-medium">{appt.contact}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-500">
                      <MapPin size={12} />
                      <span className="text-[11px] font-medium truncate max-w-[150px]">{appt.location}</span>
                    </div>
                    {appt.assigned_to_name && (
                      <div className="flex items-center gap-1.5 text-accent">
                        <User size={12} />
                        <span className="text-[11px] font-bold">{appt.assigned_to_name}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="card p-8 flex flex-col items-center justify-center text-center space-y-2 border-2 border-dashed border-slate-200 bg-transparent shadow-none">
              <CalendarIcon size={32} className="text-slate-200" />
              <p className="text-slate-400 text-xs font-medium italic">No appointments for this day</p>
            </div>
          )}
        </div>
      </div>

      <NewAppointmentModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleAddAppointment}
        selectedDate={selectedDate}
      />
    </div>
  );
}
