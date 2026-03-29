import React, { useEffect, useState } from 'react';
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
  const { profile, user } = useAuth();
  const [loading, setLoading] = useState(false);
  const initialFormData = {
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
  };
  const [formData, setFormData] = useState(initialFormData);

  useEffect(() => {
    if (!isOpen) {
      setFormData(initialFormData);
      setLoading(false);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const firstName = formData.first_name.trim();
    const lastName = formData.last_name.trim();

    if (!firstName || !lastName) {
      alert('First name and last name are required.');
      return;
    }

    if (!profile?.company_id) {
      alert('Your account is not linked to a company yet. Refresh your profile and try again.');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        first_name: firstName,
        last_name: lastName,
        phone1: formData.phone1.trim() || null,
        email: formData.email.trim() || null,
        address: formData.address.trim() || null,
        city: formData.city.trim() || null,
        state: formData.state.trim() || null,
        zip: formData.zip.trim() || null,
        project_type: formData.project_type.trim() || null,
        status: formData.status,
        company_id: profile.company_id,
        assigned_to: user?.id ?? profile?.id ?? null,
        lead_source: 'mobile_app',
        tags: [],
        project_value: null,
        deposit_amount: null,
        deposit_paid: false,
        deposit_date: null,
        final_payment_amount: null,
        final_payment_paid: false,
        final_payment_date: null,
        insurance_company: null,
        policy_number: null,
        claim_number: null,
        adjuster_name: null,
        adjuster_phone: null,
        adjuster_email: null,
        deductible: null,
        is_retail: false,
        retail_notes: null,
        notes: null,
        status_changed_at: new Date().toISOString(),
      };

      const { error } = await supabase.from('contacts').insert(payload as any);

      if (error) throw error;
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error creating contact:', err);
      const message = err instanceof Error ? err.message : 'Failed to create contact';
      alert(`Failed to create contact: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center px-0 sm:px-4 sm:pb-0"
          style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))', overflowX: 'hidden' }}
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
            className="relative w-full max-w-lg bg-white rounded-t-[32px] sm:rounded-[32px] shadow-2xl flex max-h-[88dvh] flex-col overflow-hidden"
            style={{ maxWidth: '100vw', overflowX: 'hidden' }}
          >
            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-slate-100 flex justify-between items-center bg-white flex-shrink-0">
              <h2 className="text-xl font-bold text-primary">New Lead</h2>
              <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                <X size={20} className="text-slate-400" />
              </button>
            </div>

            {/* Scrollable form body */}
            <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
              <div
                className="min-h-0 flex-1 overflow-y-auto no-scrollbar px-6 pt-4"
                style={{ overflowX: 'hidden', paddingBottom: '1rem' }}
              >
                <div className="space-y-6">
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
                </div>
              </div>

              <div className="border-t border-slate-100 bg-white px-6 pt-4 pb-6">
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
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
