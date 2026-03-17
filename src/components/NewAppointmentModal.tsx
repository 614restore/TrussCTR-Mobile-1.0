import React, { useState, useEffect } from 'react';
import { X, Calendar, Clock, User, MapPin, Type } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

interface NewAppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newAppointment: any) => void;
  selectedDate: Date;
}

export default function NewAppointmentModal({ isOpen, onClose, onSuccess, selectedDate }: NewAppointmentModalProps) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  
  const [formData, setFormData] = useState({
    title: '',
    time: '10:00',
    type: 'inspection',
    contact_id: '',
    location: '',
    assigned_to: '',
    notes: ''
  });

  useEffect(() => {
    if (isOpen && profile?.company_id) {
      fetchTeamMembers();
      fetchContacts();
    }
  }, [isOpen, profile?.company_id]);

  const fetchTeamMembers = async () => {
    try {
      const { data, error } = await supabase
        .from('team_members')
        .select('*')
        .eq('company_id', profile.company_id)
        .eq('is_active', true);
      
      if (error) throw error;
      setTeamMembers(data || []);
    } catch (err) {
      console.error('Error fetching team members:', err);
    }
  };

  const fetchContacts = async () => {
    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, address')
        .eq('company_id', profile.company_id);
      
      if (error) throw error;
      setContacts(data || []);
    } catch (err) {
      console.error('Error fetching contacts:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Since we don't have a dedicated appointments table, 
      // we'll simulate success and pass the data back to the parent.
      // In a real app, you'd insert into an 'appointments' table here.
      
      const selectedContact = contacts.find(c => c.id === formData.contact_id);
      const selectedMember = teamMembers.find(m => m.id === formData.assigned_to);

      const newAppointment = {
        id: Math.random().toString(36).substr(2, 9),
        title: formData.title,
        time: formData.time,
        type: formData.type,
        contact: selectedContact ? `${selectedContact.first_name} ${selectedContact.last_name}` : 'Unknown',
        location: formData.location || selectedContact?.address || 'N/A',
        assigned_to_name: selectedMember?.name || 'Unassigned',
        date: selectedDate.toISOString()
      };

      // Optional: Store as a communication or work order if appropriate
      // For now, we just pass it back to the UI state
      
      onSuccess(newAppointment);
      onClose();
      setFormData({
        title: '',
        time: '10:00',
        type: 'inspection',
        contact_id: '',
        location: '',
        assigned_to: '',
        notes: ''
      });
    } catch (err) {
      console.error('Error creating appointment:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
          />
          
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="relative w-full max-w-lg bg-white rounded-t-[32px] sm:rounded-[32px] shadow-2xl overflow-hidden"
          >
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-primary">New Appointment</h2>
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mt-1">
                  {selectedDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                </p>
              </div>
              <button onClick={onClose} className="p-2 bg-slate-100 rounded-full text-slate-400 active:scale-90 transition-transform">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[70vh] overflow-y-auto no-scrollbar">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Event Title</label>
                  <div className="relative">
                    <Type className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                      required
                      type="text"
                      placeholder="e.g. Roof Inspection"
                      className="w-full bg-slate-50 border-none rounded-2xl py-4 pl-12 pr-4 text-sm focus:ring-2 focus:ring-accent/20"
                      value={formData.title}
                      onChange={e => setFormData({ ...formData, title: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Time</label>
                    <div className="relative">
                      <Clock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input
                        required
                        type="time"
                        className="w-full bg-slate-50 border-none rounded-2xl py-4 pl-12 pr-4 text-sm focus:ring-2 focus:ring-accent/20"
                        value={formData.time}
                        onChange={e => setFormData({ ...formData, time: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Type</label>
                    <select
                      className="w-full bg-slate-50 border-none rounded-2xl py-4 px-4 text-sm focus:ring-2 focus:ring-accent/20 appearance-none"
                      value={formData.type}
                      onChange={e => setFormData({ ...formData, type: e.target.value })}
                    >
                      <option value="inspection">Inspection</option>
                      <option value="estimate">Estimate</option>
                      <option value="follow_up">Follow-up</option>
                      <option value="installation">Installation</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Customer</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <select
                      required
                      className="w-full bg-slate-50 border-none rounded-2xl py-4 pl-12 pr-4 text-sm focus:ring-2 focus:ring-accent/20 appearance-none"
                      value={formData.contact_id}
                      onChange={e => {
                        const contact = contacts.find(c => c.id === e.target.value);
                        setFormData({ 
                          ...formData, 
                          contact_id: e.target.value,
                          location: contact?.address || formData.location
                        });
                      }}
                    >
                      <option value="">Select Customer</option>
                      {contacts.map(c => (
                        <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Location</label>
                  <div className="relative">
                    <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                      type="text"
                      placeholder="Address"
                      className="w-full bg-slate-50 border-none rounded-2xl py-4 pl-12 pr-4 text-sm focus:ring-2 focus:ring-accent/20"
                      value={formData.location}
                      onChange={e => setFormData({ ...formData, location: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Assign Team Member</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <select
                      required
                      className="w-full bg-slate-50 border-none rounded-2xl py-4 pl-12 pr-4 text-sm focus:ring-2 focus:ring-accent/20 appearance-none"
                      value={formData.assigned_to}
                      onChange={e => setFormData({ ...formData, assigned_to: e.target.value })}
                    >
                      <option value="">Select Team Member</option>
                      {teamMembers.map(m => (
                        <option key={m.id} value={m.id}>{m.name} ({m.role})</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <button
                disabled={loading}
                type="submit"
                className="w-full bg-accent text-white py-4 rounded-2xl font-bold uppercase tracking-widest text-xs shadow-lg shadow-accent/20 active:scale-95 transition-transform disabled:opacity-50"
              >
                {loading ? 'Creating...' : 'Create Appointment'}
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
