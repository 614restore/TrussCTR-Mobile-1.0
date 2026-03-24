import React, { useState } from 'react';
import { X, Shield, DollarSign, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

interface NewContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type Step = 'info' | 'type' | 'insurance' | 'retail';

const STEP_ORDER: Step[] = ['info', 'type', 'insurance'];

const EMPTY_FORM = {
  first_name: '',
  last_name: '',
  phone1: '',
  email: '',
  address: '',
  city: '',
  state: '',
  zip: '',
  project_type: 'Roofing',
  status: 'prospect' as any,
  is_retail: null as boolean | null,
  retail_notes: '',
  insurance_company: '',
  policy_number: '',
  claim_number: '',
  adjuster_name: '',
  adjuster_phone: '',
  deductible: '',
};

export default function NewContactModal({ isOpen, onClose, onSuccess }: NewContactModalProps) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<Step>('info');
  const [formData, setFormData] = useState({ ...EMPTY_FORM });

  const update = (field: keyof typeof EMPTY_FORM, value: any) =>
    setFormData(prev => ({ ...prev, [field]: value }));

  const reset = () => {
    setFormData({ ...EMPTY_FORM });
    setStep('info');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  // Which numbered step we're on (1-based, for the dot indicator)
  const stepIndex = step === 'info' ? 1 : step === 'type' ? 2 : 3;

  const canAdvance = () => {
    if (step === 'info') {
      return !!(formData.first_name && formData.last_name && formData.phone1 &&
        formData.address && formData.city && formData.state && formData.zip);
    }
    if (step === 'type') return formData.is_retail !== null;
    return true;
  };

  const goNext = () => {
    if (step === 'info') return setStep('type');
    if (step === 'type') return setStep(formData.is_retail ? 'retail' : 'insurance');
  };

  const goBack = () => {
    if (step === 'type') return setStep('info');
    if (step === 'insurance' || step === 'retail') return setStep('type');
  };

  const handleSubmit = async () => {
    if (!profile?.company_id) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from('contacts')
        .insert({
          first_name: formData.first_name,
          last_name: formData.last_name,
          phone1: formData.phone1,
          email: formData.email || undefined,
          address: formData.address,
          city: formData.city,
          state: formData.state,
          zip: formData.zip,
          project_type: formData.project_type,
          status: formData.status,
          is_retail: formData.is_retail ?? false,
          retail_notes: formData.retail_notes || undefined,
          insurance_company: formData.insurance_company || undefined,
          policy_number: formData.policy_number || undefined,
          claim_number: formData.claim_number || undefined,
          adjuster_name: formData.adjuster_name || undefined,
          adjuster_phone: formData.adjuster_phone || undefined,
          deductible: formData.deductible ? parseFloat(formData.deductible) : undefined,
          company_id: profile.company_id,
          assigned_to: profile.id,
          status_changed_at: new Date().toISOString(),
        } as any);

      if (error) throw error;
      onSuccess();
      handleClose();
    } catch (err) {
      console.error('Error creating contact:', err);
      alert('Failed to create contact');
    } finally {
      setLoading(false);
    }
  };

  const inputCls = 'w-full bg-slate-50 border-none rounded-2xl p-4 text-sm focus:ring-2 focus:ring-accent/20';
  const labelCls = 'text-xs font-bold text-slate-600 ml-1';
  const sectionCls = 'text-[10px] font-bold text-slate-400 uppercase tracking-widest';

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center" style={{ overflowX: 'hidden' }}>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
          />

          {/* Sheet */}
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            className="relative w-full max-w-lg bg-white rounded-t-[32px] sm:rounded-[32px] shadow-2xl flex flex-col"
            style={{ maxWidth: '100vw', overflowX: 'hidden', maxHeight: '90vh' }}
          >
            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-slate-100 flex-shrink-0">
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-3">
                  {step !== 'info' && (
                    <button onClick={goBack} className="p-1.5 hover:bg-slate-100 rounded-full transition-colors -ml-1">
                      <ArrowLeft size={18} className="text-slate-500" />
                    </button>
                  )}
                  <h2 className="text-xl font-bold text-primary">
                    {step === 'info' && 'New Lead'}
                    {step === 'type' && 'Job Type'}
                    {step === 'insurance' && 'Insurance Details'}
                    {step === 'retail' && 'Retail Job'}
                  </h2>
                </div>
                <button onClick={handleClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <X size={20} className="text-slate-400" />
                </button>
              </div>

              {/* Step dots */}
              <div className="flex items-center gap-1.5">
                {[1, 2, 3].map(n => (
                  <div
                    key={n}
                    className={`rounded-full transition-all ${
                      n === stepIndex
                        ? 'w-6 h-2 bg-accent'
                        : n < stepIndex
                        ? 'w-2 h-2 bg-accent/40'
                        : 'w-2 h-2 bg-slate-200'
                    }`}
                  />
                ))}
                <span className="text-[10px] text-slate-400 font-medium ml-1">{stepIndex} of 3</span>
              </div>
            </div>

            {/* Scrollable body */}
            <div className="overflow-y-auto no-scrollbar" style={{ overflowX: 'hidden' }}>
              <AnimatePresence mode="wait">
                {/* ── STEP 1: Basic Info + Address + Project Type ── */}
                {step === 'info' && (
                  <motion.div
                    key="info"
                    initial={{ opacity: 0, x: 40 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -40 }}
                    transition={{ duration: 0.2 }}
                    className="px-6 pt-4 pb-2 space-y-6"
                  >
                    <div className="space-y-4">
                      <h3 className={sectionCls}>Basic Information</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className={labelCls}>First Name</label>
                          <input
                            required
                            type="text"
                            className={inputCls}
                            placeholder="John"
                            value={formData.first_name}
                            onChange={e => update('first_name', e.target.value)}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className={labelCls}>Last Name</label>
                          <input
                            required
                            type="text"
                            className={inputCls}
                            placeholder="Doe"
                            value={formData.last_name}
                            onChange={e => update('last_name', e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className={labelCls}>Phone Number</label>
                        <input
                          required
                          type="tel"
                          className={inputCls}
                          placeholder="(555) 000-0000"
                          value={formData.phone1}
                          onChange={e => update('phone1', e.target.value)}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className={labelCls}>Email Address</label>
                        <input
                          type="email"
                          className={inputCls}
                          placeholder="john@example.com"
                          value={formData.email}
                          onChange={e => update('email', e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h3 className={sectionCls}>Property Address</h3>
                      <div className="space-y-1.5">
                        <label className={labelCls}>Street Address</label>
                        <input
                          required
                          type="text"
                          className={inputCls}
                          placeholder="123 Main St"
                          value={formData.address}
                          onChange={e => update('address', e.target.value)}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className={labelCls}>City</label>
                          <input
                            required
                            type="text"
                            className={inputCls}
                            placeholder="City"
                            value={formData.city}
                            onChange={e => update('city', e.target.value)}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1.5">
                            <label className={labelCls}>State</label>
                            <input
                              required
                              type="text"
                              maxLength={2}
                              className={`${inputCls} text-center uppercase`}
                              placeholder="OH"
                              value={formData.state}
                              onChange={e => update('state', e.target.value.toUpperCase())}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className={labelCls}>Zip</label>
                            <input
                              required
                              type="text"
                              className={`${inputCls} text-center`}
                              placeholder="00000"
                              value={formData.zip}
                              onChange={e => update('zip', e.target.value)}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h3 className={sectionCls}>Project Type</h3>
                      <div className="grid grid-cols-2 gap-2">
                        {['Roofing', 'Siding', 'Gutters', 'Windows'].map(type => (
                          <button
                            key={type}
                            type="button"
                            onClick={() => update('project_type', type)}
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

                    <div className="bg-white border-t border-slate-100 -mx-6 px-6" style={{ paddingTop: '1rem', paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
                      <button
                        type="button"
                        disabled={!canAdvance()}
                        onClick={goNext}
                        className="w-full bg-primary text-white py-5 rounded-[24px] font-bold shadow-xl shadow-primary/20 active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                      >
                        Next: Job Type
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* ── STEP 2: Insurance or Retail? ── */}
                {step === 'type' && (
                  <motion.div
                    key="type"
                    initial={{ opacity: 0, x: 40 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -40 }}
                    transition={{ duration: 0.2 }}
                    className="px-6 pt-4 pb-2 space-y-4"
                  >
                    <p className="text-sm text-slate-500">
                      How is <span className="font-semibold text-slate-700">{formData.first_name || 'this customer'}</span> paying for this job?
                    </p>

                    {/* Insurance card */}
                    <button
                      type="button"
                      onClick={() => update('is_retail', false)}
                      className={`w-full p-5 rounded-2xl border-2 text-left transition-all ${
                        formData.is_retail === false
                          ? 'border-blue-500 bg-blue-50 shadow-md shadow-blue-100'
                          : 'border-slate-100 bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                          formData.is_retail === false ? 'bg-blue-500' : 'bg-slate-100'
                        }`}>
                          <Shield size={22} className={formData.is_retail === false ? 'text-white' : 'text-slate-500'} />
                        </div>
                        <div>
                          <p className="font-bold text-slate-800">Insurance Claim</p>
                          <p className="text-xs text-slate-500 mt-0.5">Going through homeowner's insurance</p>
                        </div>
                        {formData.is_retail === false && (
                          <div className="ml-auto w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                            <div className="w-2 h-2 rounded-full bg-white" />
                          </div>
                        )}
                      </div>
                    </button>

                    {/* Retail card */}
                    <button
                      type="button"
                      onClick={() => update('is_retail', true)}
                      className={`w-full p-5 rounded-2xl border-2 text-left transition-all ${
                        formData.is_retail === true
                          ? 'border-green-500 bg-green-50 shadow-md shadow-green-100'
                          : 'border-slate-100 bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                          formData.is_retail === true ? 'bg-green-500' : 'bg-slate-100'
                        }`}>
                          <DollarSign size={22} className={formData.is_retail === true ? 'text-white' : 'text-slate-500'} />
                        </div>
                        <div>
                          <p className="font-bold text-slate-800">Retail / Cash</p>
                          <p className="text-xs text-slate-500 mt-0.5">Customer paying out of pocket</p>
                        </div>
                        {formData.is_retail === true && (
                          <div className="ml-auto w-5 h-5 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                            <div className="w-2 h-2 rounded-full bg-white" />
                          </div>
                        )}
                      </div>
                    </button>

                    <div className="bg-white border-t border-slate-100 -mx-6 px-6" style={{ paddingTop: '1rem', paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
                      <button
                        type="button"
                        disabled={!canAdvance()}
                        onClick={goNext}
                        className="w-full bg-primary text-white py-5 rounded-[24px] font-bold shadow-xl shadow-primary/20 active:scale-95 transition-all disabled:opacity-40"
                      >
                        Next
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* ── STEP 3a: Insurance Details ── */}
                {step === 'insurance' && (
                  <motion.div
                    key="insurance"
                    initial={{ opacity: 0, x: 40 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -40 }}
                    transition={{ duration: 0.2 }}
                    className="px-6 pt-4 pb-2 space-y-6"
                  >
                    <p className="text-xs text-slate-400">Fill in what you know now — you can update the rest later.</p>

                    <div className="space-y-4">
                      <h3 className={sectionCls}>Insurance</h3>
                      <div className="space-y-1.5">
                        <label className={labelCls}>Insurance Company</label>
                        <input
                          type="text"
                          className={inputCls}
                          placeholder="State Farm, Allstate…"
                          value={formData.insurance_company}
                          onChange={e => update('insurance_company', e.target.value)}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className={labelCls}>Claim #</label>
                          <input
                            type="text"
                            className={inputCls}
                            placeholder="CLM-001"
                            value={formData.claim_number}
                            onChange={e => update('claim_number', e.target.value)}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className={labelCls}>Policy #</label>
                          <input
                            type="text"
                            className={inputCls}
                            placeholder="POL-001"
                            value={formData.policy_number}
                            onChange={e => update('policy_number', e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className={labelCls}>Deductible ($)</label>
                        <input
                          type="number"
                          inputMode="decimal"
                          className={inputCls}
                          placeholder="1000"
                          value={formData.deductible}
                          onChange={e => update('deductible', e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h3 className={sectionCls}>Adjuster</h3>
                      <div className="space-y-1.5">
                        <label className={labelCls}>Adjuster Name</label>
                        <input
                          type="text"
                          className={inputCls}
                          placeholder="Jane Smith"
                          value={formData.adjuster_name}
                          onChange={e => update('adjuster_name', e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className={labelCls}>Adjuster Phone</label>
                        <input
                          type="tel"
                          className={inputCls}
                          placeholder="(555) 000-0000"
                          value={formData.adjuster_phone}
                          onChange={e => update('adjuster_phone', e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="bg-white border-t border-slate-100 -mx-6 px-6" style={{ paddingTop: '1rem', paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
                      <button
                        type="button"
                        disabled={loading}
                        onClick={handleSubmit}
                        className="w-full bg-primary text-white py-5 rounded-[24px] font-bold shadow-xl shadow-primary/20 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {loading ? (
                          <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          'Create Lead'
                        )}
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* ── STEP 3b: Retail Notes ── */}
                {step === 'retail' && (
                  <motion.div
                    key="retail"
                    initial={{ opacity: 0, x: 40 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -40 }}
                    transition={{ duration: 0.2 }}
                    className="px-6 pt-4 pb-2 space-y-6"
                  >
                    <div className="flex items-center gap-3 p-4 bg-green-50 rounded-2xl">
                      <div className="w-10 h-10 rounded-xl bg-green-500 flex items-center justify-center flex-shrink-0">
                        <DollarSign size={18} className="text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-green-800">Retail / Cash Job</p>
                        <p className="text-xs text-green-600">No insurance claim involved</p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h3 className={sectionCls}>Notes <span className="normal-case font-normal text-slate-400">(optional)</span></h3>
                      <textarea
                        rows={4}
                        className={`${inputCls} resize-none`}
                        placeholder="Any relevant details about this job…"
                        value={formData.retail_notes}
                        onChange={e => update('retail_notes', e.target.value)}
                      />
                    </div>

                    <div className="bg-white border-t border-slate-100 -mx-6 px-6" style={{ paddingTop: '1rem', paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
                      <button
                        type="button"
                        disabled={loading}
                        onClick={handleSubmit}
                        className="w-full bg-primary text-white py-5 rounded-[24px] font-bold shadow-xl shadow-primary/20 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {loading ? (
                          <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          'Create Lead'
                        )}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
