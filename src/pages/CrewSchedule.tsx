import React, { useState, useEffect } from 'react';
import { HardHat, ChevronLeft, Calendar as CalendarIcon, ChevronRight, MapPin, Clock, User } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { motion } from 'framer-motion';

export default function CrewSchedule() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const contactId = searchParams.get('contactId');
  const { profile } = useAuth();
  const [scheduledJobs, setScheduledJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());

  useEffect(() => {
    if (profile?.company_id) {
      fetchScheduledJobs();
    }
  }, [profile?.company_id, selectedDate, contactId]);

  const fetchScheduledJobs = async () => {
    try {
      const db = supabase as any;
      let query = db
        .from('work_orders')
        .select(`*, contacts (first_name, last_name, address)`)
        .eq('company_id', profile!.company_id)
        .order('scheduled_date', { ascending: true });

      if (contactId) {
        // When filtered to a contact, show all their scheduled jobs (any date)
        query = query.eq('contact_id', contactId).not('scheduled_date', 'is', null);
      } else {
        // Default: filter to selected day
        const startOfDay = new Date(selectedDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(selectedDate);
        endOfDay.setHours(23, 59, 59, 999);
        query = query
          .gte('scheduled_date', startOfDay.toISOString())
          .lte('scheduled_date', endOfDay.toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;
      setScheduledJobs(data || []);
    } catch (err) {
      console.error('Error fetching crew schedule:', err);
    } finally {
      setLoading(false);
    }
  };

  const changeDate = (days: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + days);
    setSelectedDate(newDate);
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 p-6 sticky top-0 z-10">
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-slate-400 active:scale-90 transition-transform">
            <ChevronLeft size={24} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-primary">Crew Schedule</h1>
            {contactId && <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Filtered to this contact</p>}
          </div>
        </div>

        <div className="flex items-center justify-between bg-slate-100 p-2 rounded-2xl">
          <button onClick={() => changeDate(-1)} className="p-2 text-slate-400 hover:text-primary transition-colors">
            <ChevronLeft size={20} />
          </button>
          <div className="flex items-center gap-2">
            <CalendarIcon size={18} className="text-accent" />
            <span className="font-bold text-primary text-sm">
              {selectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </span>
          </div>
          <button onClick={() => changeDate(1)} className="p-2 text-slate-400 hover:text-primary transition-colors">
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      <div className="p-6 space-y-4">
        {loading ? (
          [1, 2].map(i => (
            <div key={i} className="h-40 bg-white rounded-2xl animate-pulse border border-slate-100" />
          ))
        ) : scheduledJobs.length > 0 ? (
          scheduledJobs.map((job, i) => (
            <motion.div
              key={job.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className="card p-5 space-y-4 border-l-4 border-l-accent"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-primary">{job.title}</h3>
                  <p className="text-xs text-slate-500">{job.contacts?.first_name} {job.contacts?.last_name}</p>
                </div>
                <div className="bg-accent/10 text-accent px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">
                  {new Date(job.scheduled_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>

              <div className="space-y-2.5">
                <div className="flex items-center gap-3 text-slate-600">
                  <MapPin size={16} className="text-slate-400" />
                  <span className="text-xs font-medium">{job.contacts?.address || 'No address provided'}</span>
                </div>
                <div className="flex items-center gap-3 text-slate-600">
                  <User size={16} className="text-slate-400" />
                  <span className="text-xs font-medium">Crew: {job.assigned_to || 'Unassigned'}</span>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-50 flex gap-2">
                <button 
                  onClick={() => navigate(`/work-orders/${job.id}`)}
                  className="flex-1 bg-slate-100 text-primary py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-wider active:scale-95 transition-transform"
                >
                  View Job
                </button>
                <button className="flex-1 bg-primary text-white py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-wider active:scale-95 transition-transform">
                  Navigate
                </button>
              </div>
            </motion.div>
          ))
        ) : (
          <div className="text-center py-20 space-y-4">
            <div className="mx-auto h-20 w-20 bg-white rounded-3xl flex items-center justify-center text-slate-200 shadow-sm">
              <HardHat size={40} />
            </div>
            <div className="space-y-1">
              <p className="text-slate-400 font-bold">No jobs scheduled</p>
              <p className="text-slate-300 text-xs">Try selecting a different date</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
