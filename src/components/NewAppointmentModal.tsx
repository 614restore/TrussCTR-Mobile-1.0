import React, { useState } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

interface NewContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function NewContactModal({ isOpen, onClose, onSuccess }: NewContactModalProps) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    phone1: '',
    email: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    project_type: 'Roofing',
    status: 'lead' as any,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.company_id) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('contacts')
        .insert({
          ...formData,
          company_id: profile.company_id,
          assigned_to: profile.id,
          status_changed_at: new Date().toISOString(),
        } as any);

      if (error) throw error;
      onSuccess();
      onClose();
    } catch (err) {
      console.error('Error creating contact:', err);
      alert('Failed to create contact');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center"
          style={{ overflowX: 'hidden' }}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            className="relative w-full max-w-lg bg-white rounded-t-[32px] sm:rounded-[32px] shadow-2xl flex flex-col"
            style={{ maxWidth: '100vw', overflowX: 'hidden', maxHeight: '90vh' }}
          >
            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-slate-100 flex justify-between items-center bg-white flex-shrink-0">
              <h2 className="text-xl font-bold text-primary">New Lead</h2>
              <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                <X size={20} className="text-slate-400" />
              </button>
            </div>

            {/* Scrollable form body */}
            <div
              className="overflow-y-auto no-scrollbar"
              style={{ overflowX: 'hidden' }}
            >
              <form onSubmit={handleSubmit} className="px-6 pt-4 pb-2 space-y-6">
                <div className="space-y-4">
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Basic Information</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-600 ml-1">First Name</label>
                      <input
                        required
                        type="text"
                        className="w-full bg-slate-50 border-none rounded-2xl p-4 text-sm focus:ring-2 focus:ring-accent/20"
                        placeholder="John"
                        value={formData.first_name}
                        onChange={e => setFormData({ ...formData, first_name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-600 ml-1">Last Name</label>
                      <input
                        required
                        type="text"
                        className="w-full bg-slate-50 border-none rounded-2xl p-4 text-sm focus:ring-2 focus:ring-accent/20"
                        placeholder="Doe"
                        value={formData.last_name}
                        onChange={e => setFormData({ ...formData, last_name: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600 ml-1">Phone Number</label>
                    <input
                      required
                      type="tel"
                      className="w-full bg-slate-50 border-none rounded-2xl p-4 text-sm focus:ring-2 focus:ring-accent/20"
                      placeholder="(555) 000-0000"
                      value={formData.phone1}
                      onChange={e => setFormData({ ...formData, phone1: e.target.value })}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600 ml-1">Email Address</label>
                    <input
                      type="email"
                      className="w-full bg-slate-50 border-none rounded-2xl p-4 text-sm focus:ring-2 focus:ring-accent/20"
                      placeholder="john@example.com"
                      value={formData.email}
                      onChange={e => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Property Address</h3>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600 ml-1">Street Address</label>
                    <input
                      required
                      type="text"
                      className="w-full bg-slate-50 border-none rounded-2xl p-4 text-sm focus:ring-2 focus:ring-accent/20"
                      placeholder="123 Main St"
                      value={formData.address}
                      onChange={e => setFormData({ ...formData, address: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-600 ml-1">City</label>
                      <input
                        required
                        type="text"
                        className="w-full bg-slate-50 border-none rounded-2xl p-4 text-sm focus:ring-2 focus:ring-accent/20"
                        placeholder="City"
                        value={formData.city}
                        onChange={e => setFormData({ ...formData, city: e.target.value })}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-600 ml-1">State</label>
                        <input
                          required
                          type="text"
                          maxLength={2}
                          className="w-full bg-slate-50 border-none rounded-2xl p-4 text-sm focus:ring-2 focus:ring-accent/20 text-center uppercase"
                          placeholder="OH"
                          value={formData.state}
                          onChange={e => setFormData({ ...formData, state: e.target.value.toUpperCase() })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-600 ml-1">Zip</label>
                        <input
                          required
                          type="text"
                          className="w-full bg-slate-50 border-none rounded-2xl p-4 text-sm focus:ring-2 focus:ring-accent/20 text-center"
                          placeholder="00000"
                          value={formData.zip}
                          onChange={e => setFormData({ ...formData, zip: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Project Type</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {['Roofing', 'Siding', 'Gutters', 'Windows'].map(type => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setFormData({ ...formData, project_type: type })}
                        className={`p-4 rounded-2xl text-sm font-bold border transition-all ${
                          formData.project_type === type
                            ? 'bg-accent border-accent text-white shadow-lg shadow-accent/20'
                            : 'bg-white border-slate-100 text-slate-600'
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Submit button inside form, outside scroll clip */}
                <div
                  className="bg-white border-t border-slate-100 -mx-6 px-6"
                  style={{ paddingTop: '1rem', paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
                >
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-primary text-white py-5 rounded-[24px] font-bold shadow-xl shadow-primary/20 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      'Create Lead'
                    )}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
