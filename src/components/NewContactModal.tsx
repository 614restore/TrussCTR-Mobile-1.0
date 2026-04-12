import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { X, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Capacitor } from '@capacitor/core';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

interface NewContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
}

export default function NewContactModal({ isOpen, onClose, onSuccess }: NewContactModalProps) {
  const { profile, user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Section collapse toggles — insurance + schedule start collapsed
  const [showInsurance, setShowInsurance] = useState(false);
  const [showSchedule, setShowSchedule]   = useState(false);

  const initialFormData = {
    // Basic
    first_name: '',
    last_name: '',
    phone1: '',
    email: '',
    // Address
    address: '',
    city: '',
    state: '',
    zip: '',
    // Project
    project_type: 'Roofing',
    status: 'lead' as any,
    // Insurance
    insurance_company: '',
    policy_number: '',
    claim_number: '',
    adjuster_name: '',
    adjuster_phone: '',
    adjuster_email: '',
    deductible: '',
    // Schedule
    appt_date: '',
    appt_time: '09:00',
    appt_type: 'inspection' as 'inspection' | 'build' | 'other',
    appt_notes: '',
  };
  const [formData, setFormData] = useState(initialFormData);

  useEffect(() => {
    if (!isOpen) {
      setFormData(initialFormData);
      setLoading(false);
      setSaveError(null);
      setShowInsurance(false);
      setShowSchedule(false);
      return;
    }
    // Pre-warm the Supabase PostgREST connection on native iOS so the
    // TCP/TLS handshake is done while the user fills the form, not when
    // they tap Save.  HEAD request — no rows transferred.
    if (Capacitor.isNativePlatform()) {
      (supabase.from('contacts') as any)
        .select('id', { count: 'exact', head: true })
        .limit(1)
        .then(() => {})
        .catch(() => {});
    }
  }, [isOpen]);

  const set = (patch: Partial<typeof initialFormData>) =>
    setFormData(prev => ({ ...prev, ...patch }));

  const describeSaveError = (err: any) => {
    if (err?.name === 'AbortError') {
      return 'Request timed out — the mobile app could not reach Supabase in time. Check connection and try again.';
    }
    if (typeof err?.message === 'string' && err.message.trim()) return err.message;
    if (typeof err?.details === 'string' && err.details.trim())  return err.details;
    if (typeof err === 'string' && err.trim())                   return err;
    try {
      const s = JSON.stringify(err);
      if (s && s !== '{}') return s;
    } catch { /* ignore */ }
    return 'Failed to create contact. Please try again.';
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();

    const firstName = formData.first_name.trim();
    const lastName  = formData.last_name.trim();
    const companyId = profile?.company_id || profile?.companies?.id || null;

    if (!firstName || !lastName) {
      setSaveError('First name and last name are required.');
      return;
    }
    if (!companyId) {
      setSaveError('Your account is not linked to a company yet. Refresh and try again.');
      return;
    }

    setLoading(true);
    setSaveError(null);
    // Safety valve: never spin longer than 15 seconds regardless of what hangs
    const saveTimer = setTimeout(() => {
      setLoading(false);
      setSaveError('Save timed out — check your connection and try again.');
    }, 15000);
    try {
      // Use cached user ID — skipping getSession() avoids an extra network round-trip
      // on slow mobile connections that eats into the timeout budget.
      const currentUserId: string | null = user?.id ?? profile?.id ?? null;

      const shouldAdvanceToAppointmentSet =
        Boolean(formData.appt_date) &&
        formData.appt_type === 'inspection' &&
        ['lead', 'new_lead', 'contacted'].includes(formData.status);

      // Generate UUID client-side so we don't need .select('id').single() after insert.
      // This uses Prefer: return=minimal (no response body), which is faster on mobile
      // and avoids the RLS SELECT policy evaluation on the insert response.
      const contactId = crypto.randomUUID();

      const payload = {
        id:         contactId,
        first_name: firstName,
        last_name:  lastName,
        phone1:  formData.phone1.trim()  || null,
        phone2:  null,
        email:   formData.email.trim()   || null,
        address: formData.address.trim() || null,
        city:    formData.city.trim()    || null,
        state:   formData.state.trim()   || null,
        zip:     formData.zip.trim()     || null,
        project_type: formData.project_type.trim() || null,
        status: shouldAdvanceToAppointmentSet ? 'appt_set' : formData.status,
        company_id:  companyId,
        assigned_to: currentUserId,
        lead_source: 'mobile_app',
        tags:        [],
        project_value:          null,
        deposit_amount:         null,
        deposit_paid:           false,
        deposit_date:           null,
        final_payment_amount:   null,
        final_payment_paid:     false,
        final_payment_date:     null,
        insurance_company: formData.insurance_company.trim() || null,
        policy_number:     formData.policy_number.trim()     || null,
        claim_number:      formData.claim_number.trim()      || null,
        adjuster_name:     formData.adjuster_name.trim()     || null,
        adjuster_phone:    formData.adjuster_phone.trim()    || null,
        adjuster_email:    formData.adjuster_email.trim()    || null,
        deductible: formData.deductible ? parseFloat(formData.deductible) : null,
        is_retail:    false,
        retail_notes: null,
        notes:        null,
        status_changed_at: new Date().toISOString(),
      };

      const { error } = await (supabase.from('contacts') as any)
        .insert(payload);

      if (error) throw error;

      // Save appointment BEFORE closing so any error can be shown to the user
      if (formData.appt_date) {
        const aptTitle =
          formData.appt_type === 'inspection' ? 'Inspection'
          : formData.appt_type === 'build'    ? 'Build / Installation'
          : formData.appt_notes.trim()        || 'Appointment';

        const timePart = formData.appt_time.length === 5
          ? `${formData.appt_time}:00`
          : formData.appt_time;
        const startISO = new Date(`${formData.appt_date}T${timePart}`).toISOString();
        const endISO   = new Date(new Date(`${formData.appt_date}T${timePart}`).getTime() + 60 * 60 * 1000).toISOString();

        const { error: aptErr } = await (supabase as any).from('appointments').insert({
          contact_id:  contactId,
          company_id:  companyId,
          date:        formData.appt_date,
          time:        timePart,
          start_time:  startISO,
          end_time:    endISO,
          title:       aptTitle,
          type:        formData.appt_type,
          status:      'scheduled',
          location:    formData.address.trim() || null,
          assigned_to: currentUserId,
        });

        if (aptErr) {
          console.error('[NewContact] Appointment insert error:', aptErr);
          setSaveError(`Contact saved but appointment could not be scheduled: ${aptErr.message || 'Unknown error'}`);
          setLoading(false);
          return;
        }
      }

      setLoading(false);
      onClose();
      Promise.resolve(onSuccess()).catch((refreshErr) => {
        console.error('[NewContact] Post-save refresh error:', refreshErr);
      });
      return;
    } catch (err: any) {
      console.error('[NewContact] Save error:', {
        name: err?.name, message: err?.message,
        details: err?.details, hint: err?.hint, code: err?.code, raw: err,
      });
      setSaveError(describeSaveError(err));
    } finally {
      clearTimeout(saveTimer);
      setLoading(false);
    }
  };

  const inputCls = 'w-full bg-slate-50 border-none rounded-2xl p-4 text-sm focus:ring-2 focus:ring-accent/20';
  const labelCls = 'text-xs font-bold text-slate-600 ml-1';
  const sectionHdr = 'text-[10px] font-bold text-slate-400 uppercase tracking-widest';

  return ReactDOM.createPortal(
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-[9999] flex items-end justify-center"
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
            className="relative w-full bg-white rounded-t-[32px] shadow-2xl flex flex-col overflow-hidden"
            style={{
              maxWidth: '100vw',
              overflowX: 'hidden',
              maxHeight: 'calc(100dvh - env(safe-area-inset-top, 44px) - 1rem)',
              paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            }}
          >
            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-slate-100 flex justify-between items-center bg-white flex-shrink-0">
              <h2 className="text-xl font-bold text-primary">New Lead</h2>
              <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                <X size={20} className="text-slate-400" />
              </button>
            </div>

            {/* Error banner — always visible below header */}
            {saveError && (
              <div className="mx-6 mt-3 rounded-2xl bg-red-50 border border-red-100 px-4 py-3 flex items-start gap-2">
                <span className="text-red-500 text-xs font-bold mt-0.5">⚠</span>
                <p className="text-xs text-red-700 font-medium flex-1">{saveError}</p>
                <button type="button" onClick={() => setSaveError(null)} className="text-red-400 text-xs">✕</button>
              </div>
            )}

            {/* Scrollable form body */}
            <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
              <div
                className="min-h-0 flex-1 overflow-y-auto no-scrollbar px-6 pt-4"
                style={{ overflowX: 'hidden', paddingBottom: '1rem' }}
              >
                <div className="space-y-6">

                  {/* ── Basic Information ── */}
                  <div className="space-y-4">
                    <h3 className={sectionHdr}>Basic Information</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className={labelCls}>First Name</label>
                        <input required type="text" className={inputCls} placeholder="John"
                          value={formData.first_name} onChange={e => set({ first_name: e.target.value })} />
                      </div>
                      <div className="space-y-1.5">
                        <label className={labelCls}>Last Name</label>
                        <input required type="text" className={inputCls} placeholder="Doe"
                          value={formData.last_name} onChange={e => set({ last_name: e.target.value })} />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className={labelCls}>Phone Number</label>
                      <input type="tel" className={inputCls} placeholder="(555) 000-0000"
                        value={formData.phone1} onChange={e => set({ phone1: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <label className={labelCls}>Email Address</label>
                      <input type="email" className={inputCls} placeholder="john@example.com"
                        value={formData.email} onChange={e => set({ email: e.target.value })} />
                    </div>
                  </div>

                  {/* ── Property Address ── */}
                  <div className="space-y-4">
                    <h3 className={sectionHdr}>Property Address</h3>
                    <div className="space-y-1.5">
                      <label className={labelCls}>Street Address</label>
                      <input type="text" className={inputCls} placeholder="123 Main St"
                        value={formData.address} onChange={e => set({ address: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className={labelCls}>City</label>
                        <input type="text" className={inputCls} placeholder="City"
                          value={formData.city} onChange={e => set({ city: e.target.value })} />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1.5">
                          <label className={labelCls}>State</label>
                          <input type="text" maxLength={2}
                            className="w-full bg-slate-50 border-none rounded-2xl p-4 text-sm focus:ring-2 focus:ring-accent/20 text-center uppercase"
                            placeholder="OH"
                            value={formData.state}
                            onChange={e => set({ state: e.target.value.toUpperCase() })} />
                        </div>
                        <div className="space-y-1.5">
                          <label className={labelCls}>Zip</label>
                          <input type="text"
                            className="w-full bg-slate-50 border-none rounded-2xl p-4 text-sm focus:ring-2 focus:ring-accent/20 text-center"
                            placeholder="00000"
                            value={formData.zip}
                            onChange={e => set({ zip: e.target.value })} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ── Project Type ── */}
                  <div className="space-y-4">
                    <h3 className={sectionHdr}>Project Type</h3>
                    <div className="grid grid-cols-2 gap-2">
                      {['Roofing', 'Siding', 'Gutters', 'Windows'].map(type => (
                        <button key={type} type="button"
                          onClick={() => set({ project_type: type })}
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

                  {/* ── Insurance Information (collapsible) ── */}
                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={() => setShowInsurance(v => !v)}
                      className="w-full flex items-center justify-between py-2"
                    >
                      <h3 className={sectionHdr}>Insurance Information</h3>
                      {showInsurance
                        ? <ChevronUp size={16} className="text-slate-400" />
                        : <ChevronDown size={16} className="text-slate-400" />}
                    </button>

                    <AnimatePresence initial={false}>
                      {showInsurance && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="space-y-4 pt-1">
                            <div className="space-y-1.5">
                              <label className={labelCls}>Insurance Company</label>
                              <input type="text" className={inputCls} placeholder="State Farm, Allstate…"
                                value={formData.insurance_company}
                                onChange={e => set({ insurance_company: e.target.value })} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-1.5">
                                <label className={labelCls}>Policy Number</label>
                                <input type="text" className={inputCls} placeholder="POL-123456"
                                  value={formData.policy_number}
                                  onChange={e => set({ policy_number: e.target.value })} />
                              </div>
                              <div className="space-y-1.5">
                                <label className={labelCls}>Claim Number</label>
                                <input type="text" className={inputCls} placeholder="CLM-789"
                                  value={formData.claim_number}
                                  onChange={e => set({ claim_number: e.target.value })} />
                              </div>
                            </div>
                            <div className="space-y-1.5">
                              <label className={labelCls}>Deductible ($)</label>
                              <input type="number" min="0" step="0.01" className={inputCls} placeholder="1000.00"
                                value={formData.deductible}
                                onChange={e => set({ deductible: e.target.value })} />
                            </div>
                            <div className="space-y-1.5">
                              <label className={labelCls}>Adjuster Name</label>
                              <input type="text" className={inputCls} placeholder="Jane Smith"
                                value={formData.adjuster_name}
                                onChange={e => set({ adjuster_name: e.target.value })} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-1.5">
                                <label className={labelCls}>Adjuster Phone</label>
                                <input type="tel" className={inputCls} placeholder="(555) 000-0000"
                                  value={formData.adjuster_phone}
                                  onChange={e => set({ adjuster_phone: e.target.value })} />
                              </div>
                              <div className="space-y-1.5">
                                <label className={labelCls}>Adjuster Email</label>
                                <input type="email" className={inputCls} placeholder="adj@ins.com"
                                  value={formData.adjuster_email}
                                  onChange={e => set({ adjuster_email: e.target.value })} />
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* ── Schedule (collapsible) ── */}
                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={() => setShowSchedule(v => !v)}
                      className="w-full flex items-center justify-between py-2"
                    >
                      <h3 className={sectionHdr}>Schedule Appointment</h3>
                      {showSchedule
                        ? <ChevronUp size={16} className="text-slate-400" />
                        : <ChevronDown size={16} className="text-slate-400" />}
                    </button>

                    <AnimatePresence initial={false}>
                      {showSchedule && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="space-y-4 pt-1">
                            {/* Appointment type pills */}
                            <div className="space-y-1.5">
                              <label className={labelCls}>Appointment Type</label>
                              <div className="grid grid-cols-3 gap-2">
                                {(['inspection', 'build', 'other'] as const).map(t => (
                                  <button key={t} type="button"
                                    onClick={() => set({ appt_type: t })}
                                    className={`py-3 rounded-2xl text-xs font-bold border capitalize transition-all ${
                                      formData.appt_type === t
                                        ? 'bg-accent border-accent text-white shadow-lg shadow-accent/20'
                                        : 'bg-white border-slate-100 text-slate-600'
                                    }`}
                                  >
                                    {t === 'inspection' ? 'Inspection' : t === 'build' ? 'Build' : 'Other'}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-1.5">
                                <label className={labelCls}>Date</label>
                                <input type="date" className={inputCls}
                                  value={formData.appt_date}
                                  onChange={e => set({ appt_date: e.target.value })} />
                              </div>
                              <div className="space-y-1.5">
                                <label className={labelCls}>Time</label>
                                <input type="time" className={inputCls}
                                  value={formData.appt_time}
                                  onChange={e => set({ appt_time: e.target.value })} />
                              </div>
                            </div>

                            {formData.appt_type === 'other' && (
                              <div className="space-y-1.5">
                                <label className={labelCls}>Notes / Title</label>
                                <input type="text" className={inputCls} placeholder="e.g. Follow-up visit"
                                  value={formData.appt_notes}
                                  onChange={e => set({ appt_notes: e.target.value })} />
                              </div>
                            )}

                            <p className="text-xs text-slate-400 ml-1">
                              Optional — leave date blank to skip scheduling for now.
                            </p>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                </div>
              </div>

              {/* Footer */}
              <div className="border-t border-slate-100 bg-white px-6 pt-4 pb-6">
                <button
                  type="button"
                  onClick={() => handleSubmit()}
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
    </AnimatePresence>,
    document.body
  );
}
