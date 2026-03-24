import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronLeft, Phone, MessageSquare, Mail, Edit2,
  Info, History, FileText, DollarSign, Shield,
  MapPin, User, CheckCircle2, MoreVertical, Plus, ChevronRight, Calendar,
  ClipboardList, PenLine, Wrench, TrendingUp
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { CustomerStatus } from '../types/supabase';
import { formatPhone, formatCurrency } from '../lib/utils';
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { buildDocumentDisplayUrl, buildStoredDocumentUrl } from '../lib/documentAccess';
import { parseContactSchedule, serializeContactSchedule, updateScheduleMilestone, type ContactMilestone, type ContactMilestoneId } from '../lib/contactSchedule';
import { getNextPipelineStageLabel, getPipelineStageLabel } from '../lib/pipelineStages';
import { buildContactPipelineEvents, getUpcomingPipelineEvents } from '../lib/scheduleEvents';
import { applyMention, extractMentionHandles, findActiveMentionQuery, getMentionSuggestions, getMentionTargets, parseNoteMentions, serializeNoteMentions, validateMentions } from '../lib/noteMentions';


const TABS = [
  { id: 'overview', label: 'Overview', icon: Info },
  { id: 'inspection', label: 'Inspection', icon: Shield },
  { id: 'status', label: 'Job Status', icon: CheckCircle2 },
  { id: 'timeline', label: 'Timeline', icon: History },
  { id: 'documents', label: 'Docs', icon: FileText },
  { id: 'financial', label: 'Financial', icon: DollarSign },
  { id: 'insurance', label: 'Insurance', icon: Shield },
];

// Ordered pipeline stages for progress bar (main path only)
const STAGES: CustomerStatus[] = [
  'lead', 'contacted', 'appointment_set', 'inspected', 'estimate_sent',
  'approved', 'scheduled', 'in_progress', 'completed', 'paid',
];

// All valid statuses available in the status dropdown (includes aliases and terminal stages)
const ALL_STATUSES: { value: CustomerStatus; label: string }[] = [
  { value: 'lead', label: 'Lead' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'appointment_set', label: 'Appointment Set' },
  { value: 'inspection_scheduled', label: 'Inspection Scheduled' },
  { value: 'inspected', label: 'Inspected' },
  { value: 'inspection_complete', label: 'Inspection Complete' },
  { value: 'estimate_sent', label: 'Follow Up / Negotiating' },
  { value: 'approved', label: 'Sold' },
  { value: 'signed_won', label: 'Signed / Won' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'paid', label: 'Paid' },
  { value: 'retail', label: 'Retail' },
  { value: 'lost', label: 'Lost' },
];

// Normalize alias statuses to their canonical stage for progress bar positioning
function normalizeStatusForProgress(status: string): CustomerStatus {
  const aliases: Record<string, CustomerStatus> = {
    new_lead: 'lead',
    inspection_scheduled: 'appointment_set',
    inspection_complete: 'inspected',
    signed_won: 'approved',
    retail: 'approved',
    lost: 'completed',
  };
  return (aliases[status] as CustomerStatus) ?? (status as CustomerStatus);
}

export default function ContactDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [contact, setContact] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<any[]>([]);
  const [documentsWithUrls, setDocumentsWithUrls] = useState<any[]>([]);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>(null);
  const [showActions, setShowActions] = useState(false);
  const tabScrollerRef = useRef<HTMLDivElement | null>(null);
  const [canScrollTabsLeft, setCanScrollTabsLeft] = useState(false);
  const [canScrollTabsRight, setCanScrollTabsRight] = useState(false);
  useEffect(() => {
    fetchContact();
    fetchDocuments();
    fetchTimeline();

    const channel = supabase
      .channel(`public:contacts:id=eq.${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'contacts', filter: `id=eq.${id}` },
        (payload) => { setContact(payload.new); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [id]);

  useEffect(() => {
    if (activeTab === 'documents') {
      fetchDocuments();
    }
  }, [activeTab]);

  useEffect(() => {
    const updateTabOverflow = () => {
      const node = tabScrollerRef.current;
      if (!node) return;
      setCanScrollTabsLeft(node.scrollLeft > 8);
      setCanScrollTabsRight(node.scrollLeft + node.clientWidth < node.scrollWidth - 8);
    };

    const frame = window.requestAnimationFrame(updateTabOverflow);
    window.addEventListener('resize', updateTabOverflow);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', updateTabOverflow);
    };
  }, [contact?.status, activeTab]);

  const fetchContact = async () => {
    try {
      const { data, error } = await supabase.from('contacts').select('*').eq('id', id).single();
      if (error) throw error;
      setContact(data);
    } catch (err) {
      console.error('Error fetching contact:', err);
      navigate('/contacts');
    } finally {
      setLoading(false);
    }
  };

  const fetchDocuments = async () => {
    try {
      const { data, error } = await supabase.from('documents').select('*').eq('contact_id', id).order('created_at', { ascending: false });
      if (error) throw error;
      const docs = data || [];
      setDocuments(docs);

      const withUrls = await Promise.all(docs.map(async (doc: any) => {
        if (typeof doc.url === 'string') {
          return { ...doc, displayUrl: await buildDocumentDisplayUrl(doc.url) };
        }
        return { ...doc, displayUrl: doc.url };
      }));
      setDocumentsWithUrls(withUrls);
    } catch (err) {
      console.error('Error fetching documents:', err);
    }
  };

  const fetchTimeline = async () => {
    try {
      const { data, error } = await supabase.from('communications').select('*').eq('contact_id', id).order('created_at', { ascending: false });
      if (error) throw error;
      setTimeline(data || []);
    } catch (err) {
      console.error('Error fetching timeline:', err);
    }
  };

  // Advance contact to a new pipeline status and log the change in the timeline
  const advanceStatus = async (newStatus: CustomerStatus, logContent?: string) => {
    if (!contact || !user?.id) return;
    const from = contact.status as string;
    if (from === newStatus) return;
    const now = new Date().toISOString();
    try {
      await (supabase.from('contacts') as any)
        .update({ status: newStatus, status_changed_at: now })
        .eq('id', contact.id);
      await (supabase.from('communications') as any).insert({
        contact_id: contact.id,
        company_id: contact.company_id,
        type: 'stage_change',
        content: logContent || `Stage updated: ${from.replace(/_/g, ' ')} → ${newStatus.replace(/_/g, ' ')}`,
        user_id: user.id,
        direction: 'outbound',
      });
      fetchContact();
      fetchTimeline();
    } catch (err) {
      console.error('Error advancing status:', err);
    }
  };

  // Handle Call / SMS / Email actions — auto-advance lead → contacted on first outreach
  const handleContactAction = async (type: 'call' | 'sms' | 'email', value: string | null) => {
    if (!value) return;
    if (['new_lead', 'lead'].includes(contact.status as string) && user?.id) {
      await advanceStatus(
        'contacted',
        `Stage updated: ${(contact.status as string).replace(/_/g, ' ')} → contacted (outbound ${type})`,
      );
    }
    if (type === 'call') window.location.href = `tel:${value}`;
    else if (type === 'sms') window.location.href = `sms:${value}`;
    else window.location.href = `mailto:${value}`;
  };

  const openEdit = () => {
    const parsed = parseContactSchedule(contact?.notes);
    setEditForm({ ...contact, notes: parsed.plainNotes });
    setIsEditing(true);
  };

  const saveEdit = async () => {
    if (!editForm?.id) return;
    const statusChanged = editForm.status !== contact?.status;
    const prevStatus: string = contact?.status ?? '';
    const nextStatus: string = editForm.status ?? '';
    try {
      const parsed = parseContactSchedule(contact?.notes);
      const updates = { ...editForm };
      const numericFields = ['project_value', 'deposit_amount', 'final_payment_amount', 'deductible'];
      numericFields.forEach((f) => {
        if (updates[f] === '') updates[f] = null;
        if (updates[f] !== null && updates[f] !== undefined) {
          const n = Number(updates[f]);
          updates[f] = Number.isNaN(n) ? null : n;
        }
      });
      updates.notes = serializeContactSchedule(parsed.schedule, updates.notes || '');
      if (statusChanged) {
        updates.status_changed_at = new Date().toISOString();
      }
      const { error } = await (supabase.from('contacts') as any).update(updates).eq('id', editForm.id);
      if (error) throw error;

      // Auto-log the stage transition to the timeline
      if (statusChanged && user?.id) {
        const from = prevStatus.replace(/_/g, ' ');
        const to = nextStatus.replace(/_/g, ' ');
        await (supabase.from('communications') as any).insert({
          contact_id: editForm.id,
          company_id: contact?.company_id,
          type: 'stage_change',
          content: `Stage updated: ${from} → ${to}`,
          user_id: user.id,
          direction: 'outbound',
        });
        fetchTimeline();
      }

      setIsEditing(false);
      fetchContact();
    } catch (err) {
      console.error('Error saving contact:', err);
      alert('Failed to save contact changes.');
    }
  };

  const scrollTabs = (direction: 'left' | 'right') => {
    const node = tabScrollerRef.current;
    if (!node) return;
    node.scrollBy({ left: direction === 'left' ? -160 : 160, behavior: 'smooth' });
    window.setTimeout(() => {
      setCanScrollTabsLeft(node.scrollLeft > 8);
      setCanScrollTabsRight(node.scrollLeft + node.clientWidth < node.scrollWidth - 8);
    }, 220);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    try {
      const isImage = file.type.startsWith('image/');
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `${id}/${fileName}`;
      const bucket = isImage ? 'projectceo-photos' : 'documents';
      const { error: uploadError } = await supabase.storage.from(bucket).upload(filePath, file);
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(filePath);
      const { error: dbError } = await supabase.from('documents').insert({
        contact_id: id,
        company_id: contact.company_id,
        name: file.name,
        type: isImage ? 'photo' : 'document',
        url: buildStoredDocumentUrl(publicUrl, bucket, filePath),
        size: file.size,
        uploaded_by: user?.id ?? 'unknown',
      } as any);
      if (dbError) throw dbError;
      fetchDocuments();
    } catch (err) {
      console.error('Error uploading:', err);
      alert('Upload failed. Make sure "documents" bucket exists in Supabase.');
    }
  };

  const handleLegalUpload = async (label: string, docType: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    try {
      const isImage = file.type.startsWith('image/');
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `${id}/${fileName}`;
      const bucket = isImage ? 'projectceo-photos' : 'documents';
      const { error: uploadError } = await supabase.storage.from(bucket).upload(filePath, file);
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(filePath);
      const { error: dbError } = await supabase.from('documents').insert({
        contact_id: id,
        company_id: contact.company_id,
        name: label,
        type: docType as any,
        url: buildStoredDocumentUrl(publicUrl, bucket, filePath),
        size: file.size,
        uploaded_by: user?.id ?? 'unknown',
      } as any);
      if (dbError) throw dbError;
      fetchDocuments();
    } catch (err) {
      console.error('Error uploading legal doc:', err);
      alert('Legal document upload failed.');
    } finally {
      e.target.value = '';
    }
  };

  if (loading) return (
    <div className="h-full flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-4 border-accent border-t-transparent"></div>
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="bg-primary text-white p-6 pb-20 relative">
        <div className="flex justify-between items-center mb-6">
          <button onClick={() => navigate('/contacts')} className="p-2 -ml-2 hover:bg-white/10 rounded-full transition-colors">
            <ChevronLeft size={24} />
          </button>
          <div className="flex gap-2">
            <button onClick={openEdit} className="p-2 hover:bg-white/10 rounded-full transition-colors"><Edit2 size={20} /></button>
            <button onClick={() => setShowActions(true)} className="p-2 hover:bg-white/10 rounded-full transition-colors"><MoreVertical size={20} /></button>
          </div>
        </div>
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">{contact.first_name} {contact.last_name}</h1>
          <p className="text-slate-300 text-sm flex items-center gap-1.5"><MapPin size={14} />{contact.address}, {contact.city}</p>
        </div>
        <div className="absolute -bottom-8 left-6 right-6 flex justify-between gap-3">
          {[
            { icon: Phone, label: 'Call', color: 'bg-emerald-500', action: () => handleContactAction('call', contact.phone1) },
            { icon: MessageSquare, label: 'SMS', color: 'bg-accent', action: () => handleContactAction('sms', contact.phone1) },
            { icon: Mail, label: 'Email', color: 'bg-amber-500', action: () => handleContactAction('email', contact.email) },
          ].map((action) => (
            <button key={action.label} onClick={action.action} className="flex-1 bg-white p-4 rounded-2xl shadow-lg flex flex-col items-center gap-1 active:scale-95 transition-transform">
              <div className={`${action.color} h-10 w-10 rounded-xl flex items-center justify-center text-white mb-1`}><action.icon size={20} /></div>
              <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">{action.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-12 relative border-b border-slate-100 bg-white">
        <div className="px-6 pt-3 flex items-center justify-between">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Sections</p>
          {(canScrollTabsLeft || canScrollTabsRight) && (
            <p className="text-[10px] font-bold uppercase tracking-wider text-accent">Swipe for more</p>
          )}
        </div>
        {canScrollTabsLeft && (
          <button
            type="button"
            onClick={() => scrollTabs('left')}
            className="absolute left-2 top-[calc(50%+8px)] z-10 -translate-y-1/2 rounded-full bg-accent p-2 text-white shadow-lg shadow-accent/30"
          >
            <ChevronLeft size={16} />
          </button>
        )}
        {canScrollTabsRight && (
          <button
            type="button"
            onClick={() => scrollTabs('right')}
            className="absolute right-2 top-[calc(50%+8px)] z-10 -translate-y-1/2 rounded-full bg-accent p-2 text-white shadow-lg shadow-accent/30"
          >
            <ChevronRight size={16} />
          </button>
        )}
        {canScrollTabsLeft && <div className="pointer-events-none absolute inset-y-0 left-0 w-14 bg-gradient-to-r from-white via-white/90 to-transparent" />}
        {canScrollTabsRight && <div className="pointer-events-none absolute inset-y-0 right-0 w-14 bg-gradient-to-l from-white via-white/90 to-transparent" />}
        <div
          ref={tabScrollerRef}
          onScroll={() => {
            const node = tabScrollerRef.current;
            if (!node) return;
            setCanScrollTabsLeft(node.scrollLeft > 8);
            setCanScrollTabsRight(node.scrollLeft + node.clientWidth < node.scrollWidth - 8);
          }}
          className="px-12 pb-1 overflow-x-auto no-scrollbar"
          style={{ touchAction: 'pan-x pan-y' }}
        >
        <div className="flex gap-6 min-w-max">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const inspectionDone = tab.id === 'inspection' && ['inspection_complete', 'inspected', 'estimate_sent', 'approved', 'scheduled', 'in_progress', 'completed', 'paid'].includes(contact.status);
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`py-4 flex items-center gap-2 border-b-2 transition-all ${isActive ? 'border-accent text-accent' : 'border-transparent text-slate-400'}`}>
                <Icon size={18} />
                <span className={`text-sm font-bold whitespace-nowrap ${tab.id === 'inspection' ? (inspectionDone ? 'text-emerald-600' : 'text-rose-500') : ''}`}>{tab.label}</span>
              </button>
            );
          })}
        </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 no-scrollbar">
        <AnimatePresence mode="wait">
          <motion.div key={activeTab} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.2 }}>
            {activeTab === 'overview' && <OverviewTab contact={contact} onRefresh={fetchContact} />}
            {activeTab === 'inspection' && <InspectionTab contact={contact} userId={user?.id} onDocumentsChanged={fetchDocuments} />}
            {activeTab === 'status' && <StatusTab contact={contact} onAdvance={advanceStatus} />}
            {activeTab === 'timeline' && <TimelineTab timeline={timeline} onRefresh={fetchTimeline} contact={contact} userId={user?.id} companyId={profile?.company_id} />}
            {activeTab === 'documents' && <DocumentsTab contactId={contact.id} documents={documentsWithUrls.length ? documentsWithUrls : documents} onUpload={handleUpload} onLegalUpload={handleLegalUpload} />}
            {activeTab === 'financial' && <FinancialTab contact={contact} userId={user?.id} onEdit={openEdit} onRefresh={fetchContact} />}
            {activeTab === 'insurance' && <InsuranceTab contact={contact} />}
          </motion.div>
        </AnimatePresence>
      </div>

      {isEditing && editForm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end">
          <div className="bg-white w-full max-h-[85vh] rounded-t-3xl p-6 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Edit Customer</h3>
              <button onClick={() => setIsEditing(false)} className="text-sm font-bold text-slate-500">Close</button>
            </div>

            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-3">
                <input className="bg-slate-50 rounded-xl p-3 text-sm" placeholder="First name" value={editForm.first_name || ''} onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })} />
                <input className="bg-slate-50 rounded-xl p-3 text-sm" placeholder="Last name" value={editForm.last_name || ''} onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })} />
              </div>
              <input className="bg-slate-50 rounded-xl p-3 text-sm" placeholder="Email" value={editForm.email || ''} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
              <div className="grid grid-cols-2 gap-3">
                <input className="bg-slate-50 rounded-xl p-3 text-sm" placeholder="Primary phone" value={editForm.phone1 || ''} onChange={(e) => setEditForm({ ...editForm, phone1: e.target.value })} />
                <input className="bg-slate-50 rounded-xl p-3 text-sm" placeholder="Secondary phone" value={editForm.phone2 || ''} onChange={(e) => setEditForm({ ...editForm, phone2: e.target.value })} />
              </div>
              <input className="bg-slate-50 rounded-xl p-3 text-sm" placeholder="Address" value={editForm.address || ''} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} />
              <div className="grid grid-cols-3 gap-3">
                <input className="bg-slate-50 rounded-xl p-3 text-sm" placeholder="City" value={editForm.city || ''} onChange={(e) => setEditForm({ ...editForm, city: e.target.value })} />
                <input className="bg-slate-50 rounded-xl p-3 text-sm" placeholder="State" value={editForm.state || ''} onChange={(e) => setEditForm({ ...editForm, state: e.target.value })} />
                <input className="bg-slate-50 rounded-xl p-3 text-sm" placeholder="Zip" value={editForm.zip || ''} onChange={(e) => setEditForm({ ...editForm, zip: e.target.value })} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <input className="bg-slate-50 rounded-xl p-3 text-sm" placeholder="Lead source" value={editForm.lead_source || ''} onChange={(e) => setEditForm({ ...editForm, lead_source: e.target.value })} />
                <input className="bg-slate-50 rounded-xl p-3 text-sm" placeholder="Project type" value={editForm.project_type || ''} onChange={(e) => setEditForm({ ...editForm, project_type: e.target.value })} />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-400 uppercase">Status</label>
                <select className="w-full bg-slate-50 rounded-xl p-3 text-sm mt-1" value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
                  {ALL_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <input className="bg-slate-50 rounded-xl p-3 text-sm" placeholder="Project value" value={editForm.project_value ?? ''} onChange={(e) => setEditForm({ ...editForm, project_value: e.target.value })} />
                <input className="bg-slate-50 rounded-xl p-3 text-sm" placeholder="Deposit amount" value={editForm.deposit_amount ?? ''} onChange={(e) => setEditForm({ ...editForm, deposit_amount: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input className="bg-slate-50 rounded-xl p-3 text-sm" placeholder="Final payment amount" value={editForm.final_payment_amount ?? ''} onChange={(e) => setEditForm({ ...editForm, final_payment_amount: e.target.value })} />
                <input className="bg-slate-50 rounded-xl p-3 text-sm" placeholder="Deductible" value={editForm.deductible ?? ''} onChange={(e) => setEditForm({ ...editForm, deductible: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!editForm.deposit_paid} onChange={(e) => setEditForm({ ...editForm, deposit_paid: e.target.checked })} />
                  Deposit Paid
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!editForm.final_payment_paid} onChange={(e) => setEditForm({ ...editForm, final_payment_paid: e.target.checked })} />
                  Final Paid
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <input className="bg-slate-50 rounded-xl p-3 text-sm" placeholder="Insurance company" value={editForm.insurance_company || ''} onChange={(e) => setEditForm({ ...editForm, insurance_company: e.target.value })} />
                <input className="bg-slate-50 rounded-xl p-3 text-sm" placeholder="Policy number" value={editForm.policy_number || ''} onChange={(e) => setEditForm({ ...editForm, policy_number: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input className="bg-slate-50 rounded-xl p-3 text-sm" placeholder="Claim number" value={editForm.claim_number || ''} onChange={(e) => setEditForm({ ...editForm, claim_number: e.target.value })} />
                <input className="bg-slate-50 rounded-xl p-3 text-sm" placeholder="Adjuster name" value={editForm.adjuster_name || ''} onChange={(e) => setEditForm({ ...editForm, adjuster_name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input className="bg-slate-50 rounded-xl p-3 text-sm" placeholder="Adjuster phone" value={editForm.adjuster_phone || ''} onChange={(e) => setEditForm({ ...editForm, adjuster_phone: e.target.value })} />
                <input className="bg-slate-50 rounded-xl p-3 text-sm" placeholder="Adjuster email" value={editForm.adjuster_email || ''} onChange={(e) => setEditForm({ ...editForm, adjuster_email: e.target.value })} />
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!editForm.is_retail} onChange={(e) => setEditForm({ ...editForm, is_retail: e.target.checked })} />
                Retail Job
              </label>
              <textarea className="bg-slate-50 rounded-xl p-3 text-sm" placeholder="Retail notes" value={editForm.retail_notes || ''} onChange={(e) => setEditForm({ ...editForm, retail_notes: e.target.value })} />
              <textarea className="bg-slate-50 rounded-xl p-3 text-sm" placeholder="Notes" value={editForm.notes || ''} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />

              <button onClick={saveEdit} className="w-full bg-primary text-white py-3 rounded-xl text-sm font-bold">Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {showActions && (
        <div className="fixed inset-0 z-[70] flex items-end bg-black/50">
          <div
            className="flex max-h-[80vh] min-h-0 w-full flex-col overflow-hidden rounded-t-3xl bg-white"
            style={{ maxHeight: 'min(80vh, calc(100dvh - env(safe-area-inset-top) - 1rem))' }}
          >
            <div className="shrink-0 px-6 pt-4">
              <div className="mx-auto h-1 w-10 rounded-full bg-slate-200" />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4 pt-5">
              <div className="space-y-3">
                <button onClick={() => { setShowActions(false); openEdit(); }} className="w-full bg-slate-50 py-3 rounded-xl text-sm font-bold">Edit Contact</button>
                <button onClick={() => { setShowActions(false); setActiveTab('documents'); }} className="w-full bg-slate-50 py-3 rounded-xl text-sm font-bold">Legal Documents</button>
              </div>
            </div>
            <div
              className="shrink-0 border-t border-slate-100 bg-white px-6 py-4"
              style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
            >
              <button onClick={() => setShowActions(false)} className="w-full bg-white border border-slate-200 py-3 rounded-xl text-sm font-bold">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function OverviewTab({ contact, onRefresh }: { contact: any; onRefresh: () => void }) {
  const navigate = useNavigate();
  const parsed = parseContactSchedule(contact?.notes);
  const [schedule, setSchedule] = useState(parsed.schedule);
  const [plainNotes, setPlainNotes] = useState(parsed.plainNotes);
  const [savingNotes, setSavingNotes] = useState(false);
  const [syncingSchedule, setSyncingSchedule] = useState(false);
  const [workOrders, setWorkOrders] = useState<any[]>([]);

  useEffect(() => {
    const nextParsed = parseContactSchedule(contact?.notes);
    setSchedule(nextParsed.schedule);
    setPlainNotes(nextParsed.plainNotes);
  }, [contact?.id, contact?.notes]);

  useEffect(() => {
    const fetchWorkOrders = async () => {
      if (!contact?.id) return;
      try {
        const { data, error } = await supabase
          .from('work_orders')
          .select('*')
          .eq('contact_id', contact.id)
          .order('scheduled_date', { ascending: true });
        if (error) throw error;
        setWorkOrders(data || []);
      } catch (err) {
        console.error('Error fetching contact work orders:', err);
      }
    };

    fetchWorkOrders();
  }, [contact?.id]);

  const syncScheduleForStatus = async (nextSchedule: typeof schedule, nextPlainNotes = plainNotes) => {
    const nextNotes = serializeContactSchedule(nextSchedule, nextPlainNotes || '');
    if (nextNotes === (contact?.notes || '')) return;

    setSyncingSchedule(true);
    try {
      const { error } = await (supabase.from('contacts') as any).update({ notes: nextNotes }).eq('id', contact.id);
      if (error) throw error;
    } catch (err) {
      console.error('Error syncing customer schedule:', err);
    } finally {
      setSyncingSchedule(false);
    }
  };

  useEffect(() => {
    if (!contact?.id) return;

    const reachedStatuses = new Set<string>();
    const statusOrder: CustomerStatus[] = ['appointment_set', 'inspected', 'estimate_sent', 'approved', 'scheduled', 'in_progress', 'completed', 'paid'];
    const currentIndex = statusOrder.indexOf(normalizeStatusForProgress(contact.status) as CustomerStatus);
    if (currentIndex >= 0) {
      for (let index = 0; index <= currentIndex; index += 1) {
        reachedStatuses.add(statusOrder[index]);
      }
    }

    let nextSchedule = parseContactSchedule(contact?.notes).schedule;
    const statusTimestamp = contact.status_changed_at || contact.updated_at || new Date().toISOString();
    const finalPaymentTimestamp = contact.final_payment_date || statusTimestamp;

    if (reachedStatuses.has('appointment_set')) {
      nextSchedule = updateScheduleMilestone(nextSchedule, 'inspection', {
        date: nextSchedule.milestones.find((item) => item.id === 'inspection')?.date || statusTimestamp,
      });
    }

    if (reachedStatuses.has('inspected')) {
      const inspectionMilestone = nextSchedule.milestones.find((item) => item.id === 'inspection');
      nextSchedule = updateScheduleMilestone(nextSchedule, 'inspection', {
        date: inspectionMilestone?.date || statusTimestamp,
        completedAt: inspectionMilestone?.completedAt || statusTimestamp,
      });
    }

    if (reachedStatuses.has('scheduled')) {
      nextSchedule = updateScheduleMilestone(nextSchedule, 'build', {
        date: nextSchedule.milestones.find((item) => item.id === 'build')?.date || statusTimestamp,
      });
    }

    if (reachedStatuses.has('in_progress')) {
      const buildMilestone = nextSchedule.milestones.find((item) => item.id === 'build');
      nextSchedule = updateScheduleMilestone(nextSchedule, 'build', {
        date: buildMilestone?.date || statusTimestamp,
        completedAt: buildMilestone?.completedAt || statusTimestamp,
      });
      nextSchedule = updateScheduleMilestone(nextSchedule, 'cleanup', {
        date: nextSchedule.milestones.find((item) => item.id === 'cleanup')?.date || statusTimestamp,
      });
    }

    if (reachedStatuses.has('completed')) {
      const cleanupMilestone = nextSchedule.milestones.find((item) => item.id === 'cleanup');
      nextSchedule = updateScheduleMilestone(nextSchedule, 'cleanup', {
        date: cleanupMilestone?.date || statusTimestamp,
        completedAt: cleanupMilestone?.completedAt || statusTimestamp,
      });
      nextSchedule = updateScheduleMilestone(nextSchedule, 'coc', {
        date: nextSchedule.milestones.find((item) => item.id === 'coc')?.date || statusTimestamp,
        completedAt: nextSchedule.milestones.find((item) => item.id === 'coc')?.completedAt || statusTimestamp,
      });
    }

    if (reachedStatuses.has('paid')) {
      nextSchedule = updateScheduleMilestone(nextSchedule, 'pick_up_check', {
        date: nextSchedule.milestones.find((item) => item.id === 'pick_up_check')?.date || finalPaymentTimestamp,
        completedAt: nextSchedule.milestones.find((item) => item.id === 'pick_up_check')?.completedAt || finalPaymentTimestamp,
      });
    }

    setSchedule(nextSchedule);
    void syncScheduleForStatus(nextSchedule, parseContactSchedule(contact?.notes).plainNotes);
  }, [
    contact?.id,
    contact?.status,
    contact?.status_changed_at,
    contact?.updated_at,
    contact?.final_payment_date,
    contact?.notes,
  ]);

  const savePlainNotes = async () => {
    setSavingNotes(true);
    try {
      const nextNotes = serializeContactSchedule(schedule, plainNotes);
      const { error } = await (supabase.from('contacts') as any).update({ notes: nextNotes }).eq('id', contact.id);
      if (error) throw error;
      await onRefresh();
    } catch (err) {
      console.error('Error saving notes:', err);
      alert('Unable to save notes right now.');
    } finally {
      setSavingNotes(false);
    }
  };

  const allEvents = buildContactPipelineEvents(contact, workOrders);
  const upcomingEvents = getUpcomingPipelineEvents(allEvents).slice(0, 3);
  const nextEvent = upcomingEvents[0] || allEvents[0] || null;
  const currentStageLabel = getPipelineStageLabel(contact.status);
  const nextStageLabel = getNextPipelineStageLabel(contact.status);

  // Smart navigation: tap the Next Step card to go directly where you need to be
  const getNextStepAction = (status: CustomerStatus): {
    route: string;
    icon: React.ElementType;
    cta: string;
    detail: string;
  } => {
    const id = contact.id;
    switch (status) {
      case 'lead':
        return {
          route: `/calendar?contactId=${id}&action=schedule&nextStep=inspection&label=First+Contact`,
          icon: Calendar,
          cta: 'Schedule First Contact',
          detail: 'Open calendar to book a call or site visit with this lead.',
        };
      case 'contacted':
        return {
          route: `/calendar?contactId=${id}&action=schedule&nextStep=inspection&label=Inspection`,
          icon: Calendar,
          cta: 'Book Appointment',
          detail: 'Open calendar to schedule the inspection appointment.',
        };
      case 'appointment_set':
      case 'inspection_scheduled':
        return {
          route: `/contacts/${id}/inspection`,
          icon: ClipboardList,
          cta: 'Start Inspection',
          detail: 'Open the smart inspection checklist to document damage.',
        };
      case 'inspected':
      case 'inspection_complete':
        return {
          route: `/contacts/${id}/estimate`,
          icon: FileText,
          cta: 'Build Estimate',
          detail: 'Open the estimator to create and send a quote.',
        };
      case 'estimate_sent':
        return {
          route: `/contacts/${id}/documents`,
          icon: PenLine,
          cta: 'Get Signature',
          detail: 'Open documents to collect the customer\'s signature.',
        };
      case 'approved':
      case 'signed_won':
        return {
          route: `/calendar?contactId=${id}&action=schedule&nextStep=build&label=Schedule+Job`,
          icon: Calendar,
          cta: 'Schedule the Job',
          detail: 'Open calendar to book crew and set the work start date.',
        };
      case 'scheduled':
        return {
          route: `/calendar?contactId=${id}&action=schedule&nextStep=build&label=Job+Date`,
          icon: Calendar,
          cta: 'View Job Schedule',
          detail: 'Review crew assignments and job timeline.',
        };
      case 'in_progress':
        return {
          route: `/contacts/${id}/inspection`,
          icon: Wrench,
          cta: 'Update Job Progress',
          detail: 'Log work completed and capture clean-up photos.',
        };
      case 'completed':
        return {
          route: `/contacts/${id}/documents`,
          icon: DollarSign,
          cta: 'Collect Payment',
          detail: 'Open documents to send the final invoice.',
        };
      default:
        return {
          route: `/calendar?contactId=${id}`,
          icon: Calendar,
          cta: 'Open Calendar',
          detail: 'Tap to view upcoming events for this customer.',
        };
    }
  };

  const nextStepAction = getNextStepAction(contact.status);
  const NextStepIcon = nextStepAction.icon;

  return (
    <div className="space-y-6">
      <div className="card p-5 space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Current Status</h3>
          <span className="bg-accent/10 text-accent text-[10px] font-bold px-2 py-1 rounded-md uppercase">{contact.status.replace(/_/g, ' ')}</span>
        </div>
        <div className="flex gap-1">
          {STAGES.map((stage, i) => {
            const currentIndex = STAGES.indexOf(normalizeStatusForProgress(contact.status));
            return <div key={stage} className={`h-1.5 flex-1 rounded-full ${i <= currentIndex ? 'bg-accent' : 'bg-slate-100'}`} />;
          })}
        </div>
      </div>
      <div className="card p-5 space-y-4">
        <button
          type="button"
          onClick={() => navigate(nextStepAction.route)}
          className="w-full rounded-3xl bg-primary p-5 text-left text-white shadow-sm"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-blue-100">Project Status</p>
              <p className="mt-2 text-2xl font-black">{currentStageLabel}</p>
              <p className="mt-1 text-xs font-bold uppercase tracking-[0.2em] text-blue-100">Next — {nextStageLabel}</p>
            </div>
            <div className="rounded-2xl bg-white/15 p-3">
              <NextStepIcon size={20} />
            </div>
          </div>
          <div className="mt-5 rounded-2xl bg-white/10 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-100">
              Next Step
            </p>
            <p className="mt-2 text-sm font-bold">
              {nextStepAction.cta}
            </p>
            <p className="mt-1 text-xs text-blue-100">
              {nextStepAction.detail}
            </p>
          </div>
        </button>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Upcoming</h3>
            {(syncingSchedule || upcomingEvents.length > 0) && (
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                {syncingSchedule ? 'Syncing...' : `${upcomingEvents.length} scheduled`}
              </span>
            )}
          </div>
          {upcomingEvents.length > 0 ? upcomingEvents.map((event) => (
            <button
              key={event.id}
              type="button"
              onClick={() => navigate(`/calendar?contactId=${contact.id}`)}
              className="w-full rounded-2xl border border-slate-100 bg-slate-50 p-4 text-left"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-primary">{event.title}</p>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    {new Date(event.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    {' at '}
                    {new Date(event.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </p>
                </div>
                <ChevronRight size={18} className="text-slate-300" />
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {event.location || 'Location pending'}{event.crew ? ` • Crew: ${event.crew}` : ''}
              </p>
            </button>
          )) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-400">
              No upcoming scheduled items yet for this customer.
            </div>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4">
        <div className="card p-5 space-y-4">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Contact Information</h3>
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400"><Phone size={18} /></div>
              <div className="flex-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase">Primary Phone</p>
                <p className="text-sm font-bold text-primary">{formatPhone(contact.phone1)}</p>
                {contact.phone2 && <p className="text-xs text-slate-500 mt-1">Secondary: {formatPhone(contact.phone2)}</p>}
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400"><Mail size={18} /></div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase">Email Address</p>
                <p className="text-sm font-bold text-primary">{contact.email || 'Not provided'}</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400"><MapPin size={18} /></div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase">Address</p>
                <p className="text-sm font-bold text-primary leading-tight">{contact.address}<br />{contact.city}, {contact.state} {contact.zip}</p>
              </div>
            </div>
          </div>
        </div>
        <div className="card p-5 space-y-4">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Project Details</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase">Project Type</p>
              <p className="text-sm font-bold text-primary">{contact.project_type || 'Roofing'}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase">Lead Source</p>
              <p className="text-sm font-bold text-primary">{contact.lead_source || 'Direct'}</p>
            </div>
          </div>
        </div>
        <div className="card p-5 space-y-4">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Quick Notes</h3>
          <textarea
            className="w-full bg-slate-50 border-none rounded-xl p-4 text-sm focus:ring-2 focus:ring-accent/20 min-h-[100px]"
            placeholder="Tap to add a note..."
            value={plainNotes}
            onChange={(e) => setPlainNotes(e.target.value)}
          />
          <button
            type="button"
            onClick={savePlainNotes}
            disabled={savingNotes}
            className="w-full rounded-xl bg-slate-900 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {savingNotes ? 'Saving Notes...' : 'Save Notes'}
          </button>
        </div>
      </div>
    </div>
  );
}

function InspectionTab({ contact, userId, onDocumentsChanged }: { contact: any; userId?: string; onDocumentsChanged?: () => void }) {
  const navigate = useNavigate();
  const usesNativeInspectionCamera = Capacitor.isNativePlatform();
  const [step, setStep] = useState<'questions' | 'photos' | 'report'>('questions');
  const [checklist, setChecklist] = useState({ roofAge: '', material: '', damageTypes: [] as string[], leaks: false });
  const [saving, setSaving] = useState(false);
  const [pitch, setPitch] = useState({ rise: 4, run: 12 });
  const [footprintArea, setFootprintArea] = useState<number | ''>('');
  const [roofLength, setRoofLength] = useState<number | ''>('');
  const [roofWidth, setRoofWidth] = useState<number | ''>('');
  const [overhangFt, setOverhangFt] = useState<number | ''>('');
  const [activeElevation, setActiveElevation] = useState<'North' | 'South' | 'East' | 'West' | 'Garage' | 'Detached'>('North');
  const [photos, setPhotos] = useState<{ url: string; displayUrl: string; note: string; elevation: string; size: number }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [markupIndex, setMarkupIndex] = useState<number | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [lastPoint, setLastPoint] = useState<{ x: number; y: number } | null>(null);
  const [completedInspection, setCompletedInspection] = useState<any>(null);

  const pitchDecimal = pitch.run ? pitch.rise / pitch.run : 0;
  const angle = pitch.run ? (Math.atan(pitchDecimal) * 180 / Math.PI) : 0;
  const rafterLength = pitch.run ? Math.sqrt(pitch.rise ** 2 + pitch.run ** 2) : 0;
  const pitchMultiplier = pitch.run ? rafterLength / pitch.run : 0;
  // Auto-compute footprint from L × W + overhang; fall back to manual entry
  const adjLength = (roofLength !== '' && roofWidth !== '')
    ? Number(roofLength) + 2 * (overhangFt !== '' ? Number(overhangFt) : 0)
    : 0;
  const adjWidth = (roofLength !== '' && roofWidth !== '')
    ? Number(roofWidth) + 2 * (overhangFt !== '' ? Number(overhangFt) : 0)
    : 0;
  const computedFootprint = adjLength && adjWidth ? adjLength * adjWidth : 0;
  const effectiveFootprint = computedFootprint || (footprintArea ? Number(footprintArea) : 0);
  const roofSurfaceArea = effectiveFootprint ? effectiveFootprint * pitchMultiplier : 0;

  const loadInspectionData = (data: any) => {
    if (!data) return;
    if (data.pitch) setPitch(data.pitch);
    if (typeof data.roofLength !== 'undefined') setRoofLength(data.roofLength);
    if (typeof data.roofWidth !== 'undefined') setRoofWidth(data.roofWidth);
    if (typeof data.overhangFt !== 'undefined') setOverhangFt(data.overhangFt);
    // Legacy: if only manual footprintArea was saved (no L/W), restore it
    if (typeof data.footprintArea !== 'undefined' && !data.roofLength) setFootprintArea(data.footprintArea);
    if (data.checklist) setChecklist(data.checklist);
    if (data.photos) setPhotos(data.photos);
  };

  useEffect(() => {
    const fetchInspection = async () => {
      try {
        const { data } = await supabase
          .from('inspections')
          .select('*')
          .eq('contact_id', contact.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data) setCompletedInspection(data);
      } catch {
        // table may not exist yet
      }
    };
    if (contact?.id) fetchInspection();
  }, [contact?.id]);

  const toggleDamage = (type: string) => {
    setChecklist((prev) => {
      const isNone = type === 'None';
      if (isNone) {
        return { ...prev, damageTypes: prev.damageTypes.includes('None') ? [] : ['None'] };
      }
      const next = prev.damageTypes.filter((d) => d !== 'None');
      return next.includes(type)
        ? { ...prev, damageTypes: next.filter((d) => d !== type) }
        : { ...prev, damageTypes: [...next, type] };
    });
  };

  const saveInspection = async () => {
    if (!userId) { alert('Not authenticated. Please sign in again.'); return; }
    setSaving(true);
    try {
      const inspectionData = {
        pitch,
        pitchMultiplier: pitchMultiplier.toFixed(3),
        roofLength, roofWidth, overhangFt,
        footprintArea: effectiveFootprint || null,
        roofSurfaceArea: roofSurfaceArea ? roofSurfaceArea.toFixed(1) : null,
        checklist,
      };
      const content = `ROOF INSPECTION REPORT:\nPitch: ${pitch.rise}/${pitch.run}\nPitch Multiplier: ${pitchMultiplier.toFixed(3)}\n${effectiveFootprint ? `Footprint: ${effectiveFootprint.toFixed(1)} sq ft\nRoof Surface: ${roofSurfaceArea.toFixed(1)} sq ft\n` : ''}Age: ${checklist.roofAge}\nMaterial: ${checklist.material}\nDamage: ${checklist.damageTypes.length ? checklist.damageTypes.join(', ') : 'None'}\nLeaks: ${checklist.leaks ? 'Yes' : 'No'}`;
      const { error } = await supabase.from('communications').insert({
        contact_id: contact.id,
        company_id: contact.company_id,
        type: 'note',
        content,
        user_id: userId,
        direction: 'outbound',
      } as any);
      if (error) throw error;
      try {
        const { data } = await (supabase.from('inspections') as any).upsert({
          contact_id: contact.id,
          company_id: contact.company_id,
          user_id: userId,
          status: 'in_progress',
          data: inspectionData,
        }, { onConflict: 'contact_id' }).select('*').maybeSingle();
        if (data) setCompletedInspection(data);
      } catch {
        // ignore if inspections table missing
      }
      alert('Inspection report saved! Continue to photos.');
      setStep('photos');
    } catch (err) {
      console.error('Error saving inspection:', err);
      alert('Failed to save inspection. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const uploadInspectionBlob = async (blob: Blob, originalName?: string) => {
    if (!contact?.id || !userId) return;
    const ext = (originalName?.split('.').pop() || blob.type.split('/').pop() || 'jpg').toLowerCase();
    const fileName = `${activeElevation}_${Date.now()}.${ext}`;
    const filePath = `${contact.id}/${fileName}`;
    const { error: uploadError } = await supabase.storage
      .from('projectceo-photos')
      .upload(filePath, blob, { contentType: blob.type || 'image/jpeg' });
    if (uploadError) throw uploadError;
    const { data: { publicUrl } } = supabase.storage.from('projectceo-photos').getPublicUrl(filePath);
    const { data: signedData } = await supabase.storage.from('projectceo-photos').createSignedUrl(filePath, 60 * 60);
    let displayUrl = signedData?.signedUrl || publicUrl;
    try {
      const resp = await fetch(displayUrl);
      if (resp.ok) {
        const fetchedBlob = await resp.blob();
        displayUrl = URL.createObjectURL(fetchedBlob);
      }
    } catch {
      // fall back to signed/public URL
    }
    const { error: dbError } = await supabase.from('documents').insert({
      contact_id: contact.id,
      company_id: contact.company_id,
      name: `${activeElevation} Inspection Photo`,
      type: 'photo',
      url: publicUrl,
      size: blob.size,
      uploaded_by: userId,
    } as any);
    if (dbError) throw dbError;
    setPhotos((prev) => [{ url: publicUrl, displayUrl, note: '', elevation: activeElevation, size: blob.size }, ...prev]);
    onDocumentsChanged?.();
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !contact?.id || !userId) return;
    setUploading(true);
    try {
      await uploadInspectionBlob(file, file.name);
    } catch (err) {
      console.error('Photo upload error:', err);
      const message = (err as any)?.message || 'Check Supabase storage bucket and policies.';
      alert(`Photo upload failed. ${message}`);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const capturePhoto = async () => {
    if (!contact?.id || !userId) return;
    setUploading(true);
    try {
      // Ensure camera permission is granted before opening the camera.
      const perms = await Camera.requestPermissions({ permissions: ['camera'] });
      if (perms.camera === 'denied') {
        alert('Camera access was denied. Please enable it in Settings > Privacy > Camera.');
        return;
      }

      const photo = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera,
      });

      if (!photo.webPath) return;

      // webPath from Camera.getPhoto is already fetchable; file:// paths need conversion
      const webUrl = (photo.webPath.startsWith('capacitor://') || photo.webPath.startsWith('http'))
        ? photo.webPath
        : Capacitor.convertFileSrc(photo.webPath);
      const resp = await fetch(webUrl);
      if (!resp.ok) throw new Error(`Failed to read photo (${resp.status})`);
      const blob = await resp.blob();
      await uploadInspectionBlob(blob, photo.webPath);
    } catch (err: any) {
      // User cancelled — no alert needed
      if (err?.message === 'User cancelled photos app' || err?.errorMessage === 'User cancelled photos app') return;
      console.error('Camera capture error:', err);
      alert(`Camera capture failed. ${err?.message || 'Unknown error'}`);
    } finally {
      setUploading(false);
    }
  };

  const openMarkup = (index: number) => {
    setMarkupIndex(index);
    setTimeout(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
      };
      img.src = photos[index].displayUrl || photos[index].url;
    }, 0);
  };

  const handleDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    const ctx = canvas.getContext('2d');
    if (!ctx || !lastPoint) return;
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(lastPoint.x, lastPoint.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    setLastPoint({ x, y });
  };

  const saveMarkup = async () => {
    if (markupIndex === null || !canvasRef.current || !userId) return;
    const canvas = canvasRef.current;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (!blob) return;
    try {
      const fileName = `${photos[markupIndex].elevation}_markup_${Date.now()}.jpg`;
      const filePath = `${contact.id}/${fileName}`;
      const { error: uploadError } = await supabase.storage.from('projectceo-photos').upload(filePath, blob);
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('projectceo-photos').getPublicUrl(filePath);
      const displayUrl = URL.createObjectURL(blob);
      const { error: dbError } = await supabase.from('documents').insert({
        contact_id: contact.id,
        company_id: contact.company_id,
        name: `${photos[markupIndex].elevation} Markup`,
        type: 'photo',
        url: publicUrl,
        size: blob.size,
        uploaded_by: userId,
      } as any);
      if (dbError) throw dbError;
      setPhotos((prev) => {
        const next = [...prev];
        next[markupIndex] = { ...next[markupIndex], url: publicUrl, displayUrl };
        return next;
      });
      onDocumentsChanged?.();
      setMarkupIndex(null);
    } catch (err) {
      console.error('Markup upload error:', err);
      alert('Failed to save markup.');
    }
  };

  const completeInspection = async () => {
    if (!userId) return;
    setSaving(true);
    try {
      const photoSummary = photos.reduce<Record<string, number>>((acc, p) => {
        acc[p.elevation] = (acc[p.elevation] || 0) + 1;
        return acc;
      }, {});
      const content = `✅ Inspection completed\nPhotos: ${Object.entries(photoSummary).map(([k, v]) => `${k}(${v})`).join(', ') || 'None'}\nDamage: ${checklist.damageTypes.length ? checklist.damageTypes.join(', ') : 'None'}\nLeaks: ${checklist.leaks ? 'Yes' : 'No'}`;
      const { error } = await supabase.from('communications').insert({
        contact_id: contact.id,
        company_id: contact.company_id,
        type: 'note',
        content,
        user_id: userId,
        direction: 'outbound',
      } as any);
      if (error) throw error;
      // Try to move pipeline using web-app status; fallback to mobile status if enum blocks it.
      const now = new Date().toISOString();
      const { error: statusError } = await (supabase.from('contacts') as any)
        .update({ status: 'inspection_complete', status_changed_at: now })
        .eq('id', contact.id);
      if (statusError) {
        await (supabase.from('contacts') as any)
          .update({ status: 'inspected', status_changed_at: now })
          .eq('id', contact.id);
      }
      try {
        const { data } = await (supabase.from('inspections') as any).upsert({
          contact_id: contact.id,
          company_id: contact.company_id,
          user_id: userId,
          status: 'completed',
          data: {
            pitch,
            pitchMultiplier: pitchMultiplier.toFixed(3),
            roofLength, roofWidth, overhangFt,
            footprintArea: effectiveFootprint || null,
            roofSurfaceArea: roofSurfaceArea ? roofSurfaceArea.toFixed(1) : null,
            checklist,
            photos,
          },
        }, { onConflict: 'contact_id' }).select('*').maybeSingle();
        if (data) setCompletedInspection(data);
      } catch {
        // ignore if inspections table missing
      }
      alert('Inspection completed and saved to timeline!');
      setStep('report');
    } catch (err) {
      console.error('Error completing inspection:', err);
      alert('Failed to complete inspection.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {completedInspection?.status === 'completed' && (
        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-emerald-700 uppercase">Inspection Completed</p>
            <p className="text-[10px] text-emerald-600">Tap to view the completed inspection.</p>
          </div>
          <button
            onClick={() => { loadInspectionData(completedInspection.data); setStep('report'); }}
            className="text-xs font-bold text-emerald-700"
          >
            View
          </button>
        </div>
      )}
      <div className="card p-5 bg-slate-900 text-white space-y-4">
        {/* Header */}
        <div className="flex justify-between items-center">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Pitch Multiplier</h3>
          <button
            onClick={() => navigate('/pitch-gauge')}
            className="flex items-center gap-1.5 bg-accent/20 border border-accent/40 text-accent px-3 py-1.5 rounded-lg text-[10px] font-bold active:scale-95 transition-transform"
          >
            📐 Pitch Gauge
          </button>
        </div>

        {/* Rise / Run inputs */}
        <div className="flex items-center justify-around py-2">
          <div className="text-center">
            <p className="text-[10px] text-slate-400 uppercase mb-1">Rise</p>
            <input type="number" inputMode="decimal" className="w-16 bg-white/10 border-none rounded-lg text-center font-bold text-xl p-2 text-white" value={pitch.rise} onChange={(e) => setPitch({...pitch, rise: parseFloat(e.target.value) || 0})} />
          </div>
          <div className="text-2xl font-light text-slate-600">/</div>
          <div className="text-center">
            <p className="text-[10px] text-slate-400 uppercase mb-1">Run</p>
            <input type="number" inputMode="decimal" className="w-16 bg-white/10 border-none rounded-lg text-center font-bold text-xl p-2 text-white" value={pitch.run} onChange={(e) => setPitch({...pitch, run: parseFloat(e.target.value) || 0})} />
          </div>
          <div className="h-12 w-px bg-white/10" />
          <div className="text-center">
            <p className="text-[10px] text-slate-400 uppercase mb-1">Multiplier</p>
            <p className="text-2xl font-black text-accent">{pitchMultiplier.toFixed(3)}</p>
          </div>
        </div>

        {/* Quick-select pitch buttons */}
        <div className="flex gap-1.5">
          {[3, 4, 5, 6, 7, 8, 10, 12].map(r => (
            <button key={r} onClick={() => setPitch({...pitch, rise: r})} className={`flex-1 py-2 rounded-lg text-[10px] font-bold transition-colors ${pitch.rise === r ? 'bg-accent text-white' : 'bg-white/5 text-slate-400'}`}>{r}/12</button>
          ))}
        </div>

        {/* Area Calculator */}
        <div className="border-t border-white/10 pt-4 space-y-3">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Area Calculator</p>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] text-slate-400 uppercase block mb-1">Length (ft)</label>
              <input type="number" inputMode="decimal" className="w-full bg-white/10 border-none rounded-lg text-center text-sm font-bold p-2 text-white" placeholder="0" value={roofLength} onChange={(e) => setRoofLength(e.target.value === '' ? '' : Number(e.target.value))} />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 uppercase block mb-1">Width (ft)</label>
              <input type="number" inputMode="decimal" className="w-full bg-white/10 border-none rounded-lg text-center text-sm font-bold p-2 text-white" placeholder="0" value={roofWidth} onChange={(e) => setRoofWidth(e.target.value === '' ? '' : Number(e.target.value))} />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 uppercase block mb-1">Overhang (ft)</label>
              <input type="number" inputMode="decimal" className="w-full bg-white/10 border-none rounded-lg text-center text-sm font-bold p-2 text-white" placeholder="0" value={overhangFt} onChange={(e) => setOverhangFt(e.target.value === '' ? '' : Number(e.target.value))} />
            </div>
          </div>
          {computedFootprint > 0 && (
            <div className="bg-white/5 rounded-xl p-3 space-y-1.5">
              <div className="flex justify-between text-xs text-slate-400">
                <span>Adj. dimensions</span>
                <span className="text-white font-bold">{adjLength.toFixed(1)} × {adjWidth.toFixed(1)} ft</span>
              </div>
              <div className="flex justify-between text-xs text-slate-400">
                <span>Footprint</span>
                <span className="text-white font-bold">{computedFootprint.toFixed(1)} sq ft</span>
              </div>
              <div className="flex justify-between text-xs text-slate-300 border-t border-white/10 pt-1.5">
                <span className="font-bold">Roof Surface Area</span>
                <span className="text-accent text-sm font-black">{roofSurfaceArea.toFixed(1)} sq ft</span>
              </div>
              <p className="text-[9px] text-slate-500 text-center">Length × Width × {pitchMultiplier.toFixed(3)} (pitch multiplier)</p>
            </div>
          )}
        </div>
      </div>
      {step === 'questions' && (
        <div className="card p-5 space-y-4">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Roof Inspection Checklist</h3>
          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase">Approx. Roof Age</label>
              <select className="w-full bg-slate-50 border-none rounded-xl p-3 text-sm mt-1" value={checklist.roofAge} onChange={(e) => setChecklist({...checklist, roofAge: e.target.value})}>
                <option value="">Select Age</option>
                <option value="0-5">0-5 Years</option>
                <option value="5-10">5-10 Years</option>
                <option value="10-20">10-20 Years</option>
                <option value="20+">20+ Years</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase">Primary Material</label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {['Shingle', 'Metal', 'Tile', 'Flat'].map(m => (
                  <button key={m} onClick={() => setChecklist({...checklist, material: m})} className={`p-3 rounded-xl text-xs font-bold border transition-all ${checklist.material === m ? 'bg-accent border-accent text-white' : 'bg-white border-slate-100 text-slate-600'}`}>{m}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase">Immediate Damage Observed (Select all that apply)</label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {['Hail', 'Wind', 'Wear', 'None'].map(d => (
                  <button key={d} onClick={() => toggleDamage(d)} className={`p-3 rounded-xl text-xs font-bold border transition-all ${checklist.damageTypes.includes(d) ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white border-slate-100 text-slate-600'}`}>{d}</button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
              <span className="text-xs font-bold text-slate-600">Active Leaks?</span>
              <button onClick={() => setChecklist({...checklist, leaks: !checklist.leaks})} className={`w-12 h-6 rounded-full transition-colors relative ${checklist.leaks ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${checklist.leaks ? 'left-7' : 'left-1'}`} />
              </button>
            </div>
          </div>
          <button onClick={saveInspection} disabled={!checklist.material || !checklist.roofAge || checklist.damageTypes.length === 0 || saving} className="w-full bg-primary text-white py-4 rounded-2xl text-sm font-bold shadow-lg active:scale-95 transition-transform disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Inspection Report'}
          </button>
        </div>
      )}

      {step === 'photos' && (
        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Inspection Photos</h3>
            <button onClick={() => setStep('report')} className="text-xs font-bold text-accent">Skip to Report</button>
          </div>
          <div className="text-[10px] text-slate-500">Tap an elevation, then add as many photos as needed. You can come back to any elevation.</div>
          <div className="grid grid-cols-3 gap-2">
            {(['North', 'South', 'East', 'West', 'Garage', 'Detached'] as const).map((dir) => (
              <button key={dir} onClick={() => setActiveElevation(dir)} className={`py-2 rounded-lg text-xs font-bold border ${activeElevation === dir ? 'bg-accent text-white border-accent' : 'bg-white border-slate-100 text-slate-600'}`}>
                {dir}
                <span className="ml-1 text-[10px] opacity-70">({photos.filter(p => p.elevation === dir).length})</span>
              </button>
            ))}
          </div>
          {usesNativeInspectionCamera ? (
            <button
              type="button"
              onClick={capturePhoto}
              disabled={uploading}
              className="aspect-[4/3] w-full bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center gap-3 text-slate-400 active:bg-slate-100 transition-colors disabled:opacity-60"
            >
              <span className="text-sm font-bold text-slate-500">
                {uploading ? 'Uploading...' : `Tap to capture ${activeElevation} photos`}
              </span>
              <span className="text-[10px] text-slate-400">Keep shooting, then tap Done once that elevation is complete.</span>
            </button>
          ) : (
            <label className="block w-full cursor-pointer">
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoUpload} />
              <div className="aspect-[4/3] bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center gap-3 text-slate-400 active:bg-slate-100 transition-colors">
                <span className="text-sm font-bold text-slate-500">{uploading ? 'Uploading...' : `Tap to add ${activeElevation} photo`}</span>
              </div>
            </label>
          )}
          <div className="grid grid-cols-2 gap-3">
            {usesNativeInspectionCamera ? (
              <button onClick={capturePhoto} disabled={uploading} className="bg-primary text-white py-3 rounded-xl text-xs font-bold disabled:opacity-50">Capture Photo</button>
            ) : (
              <label className="bg-primary text-white py-3 rounded-xl text-xs font-bold text-center cursor-pointer">
                Capture Photo
                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoUpload} />
              </label>
            )}
            <label className="bg-white border border-slate-200 text-slate-700 py-3 rounded-xl text-xs font-bold text-center cursor-pointer">
              Choose from Library
              <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {photos.map((p, i) => (
              <div key={`${p.url}-${i}`} className="card p-2 space-y-2">
                <img src={p.displayUrl || p.url} alt="Inspection" className="w-full h-32 object-cover rounded-xl" referrerPolicy="no-referrer" />
                <p className="text-[10px] font-bold text-slate-400">{p.elevation}</p>
                <textarea className="w-full bg-slate-50 border-none rounded-lg p-2 text-xs" placeholder="Add note..." value={p.note} onChange={(e) => setPhotos((prev) => {
                  const next = [...prev];
                  next[i] = { ...next[i], note: e.target.value };
                  return next;
                })} />
                <button onClick={() => openMarkup(i)} className="w-full text-xs font-bold text-accent">Markup Photo</button>
              </div>
            ))}
          </div>
          <button onClick={completeInspection} disabled={saving} className="w-full bg-primary text-white py-3 rounded-xl text-sm font-bold shadow-lg active:scale-95 transition-transform disabled:opacity-50">
            {saving ? 'Saving...' : 'Complete Inspection'}
          </button>
        </div>
      )}

      {step === 'report' && (
        <div className="card p-5 space-y-3">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Inspection Report</h3>
          <div className="text-sm text-slate-700 space-y-1">
            <div>Pitch: <span className="font-bold">{pitch.rise}/{pitch.run}</span> ({angle.toFixed(1)}°)</div>
            <div>Multiplier: <span className="font-bold">{pitchMultiplier.toFixed(3)}</span></div>
            {footprintArea && <div>Roof Surface: <span className="font-bold">{roofSurfaceArea.toFixed(1)} sq ft</span></div>}
            <div>Age: <span className="font-bold">{checklist.roofAge || '—'}</span></div>
            <div>Material: <span className="font-bold">{checklist.material || '—'}</span></div>
            <div>Damage: <span className="font-bold">{checklist.damageTypes.join(', ') || 'None'}</span></div>
            <div>Leaks: <span className="font-bold">{checklist.leaks ? 'Yes' : 'No'}</span></div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {photos.slice(0, 6).map((p, i) => (
              <img key={`${p.url}-${i}`} src={p.displayUrl || p.url} alt="Inspection" className="w-full h-20 object-cover rounded-lg" referrerPolicy="no-referrer" />
            ))}
          </div>
          <button onClick={() => setStep('photos')} className="w-full text-xs font-bold text-accent">Back to Photos</button>
        </div>
      )}

      {markupIndex !== null && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-4 space-y-3">
            <h4 className="text-sm font-bold">Markup Photo</h4>
            <div className="w-full overflow-auto max-h-[60vh] border rounded-xl">
              <canvas
                ref={canvasRef}
                onPointerDown={(e) => { setIsDrawing(true); const rect = (e.target as HTMLCanvasElement).getBoundingClientRect(); setLastPoint({ x: (e.clientX - rect.left) * (canvasRef.current!.width / rect.width), y: (e.clientY - rect.top) * (canvasRef.current!.height / rect.height) }); }}
                onPointerMove={handleDraw}
                onPointerUp={() => { setIsDrawing(false); setLastPoint(null); }}
                onPointerLeave={() => { setIsDrawing(false); setLastPoint(null); }}
                className="w-full h-auto touch-none"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setMarkupIndex(null)} className="flex-1 bg-slate-100 text-slate-700 py-2 rounded-lg text-sm font-bold">Cancel</button>
              <button onClick={saveMarkup} className="flex-1 bg-accent text-white py-2 rounded-lg text-sm font-bold">Save Markup</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusTab({ contact, onAdvance }: { contact: any; onAdvance: (status: CustomerStatus) => Promise<void> }) {
  const [advancing, setAdvancing] = useState(false);
  const currentIndex = STAGES.indexOf(normalizeStatusForProgress(contact.status) as CustomerStatus);
  const nextStage = currentIndex >= 0 && currentIndex < STAGES.length - 1 ? STAGES[currentIndex + 1] : null;
  const nextStageLabel = nextStage ? ALL_STATUSES.find(s => s.value === nextStage)?.label || nextStage.replace(/_/g, ' ') : null;

  const handleAdvance = async (status: CustomerStatus) => {
    setAdvancing(true);
    try {
      await onAdvance(status);
    } finally {
      setAdvancing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Quick-advance to the very next stage */}
      {nextStage ? (
        <button
          type="button"
          disabled={advancing}
          onClick={() => handleAdvance(nextStage)}
          className="w-full bg-accent text-white py-4 rounded-2xl font-bold text-sm shadow-lg shadow-accent/30 active:scale-95 transition-transform disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <CheckCircle2 size={18} />
          {advancing ? 'Updating...' : `Move to ${nextStageLabel}`}
        </button>
      ) : (
        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 text-center">
          <p className="text-sm font-bold text-emerald-700">Job Complete — Paid</p>
          <p className="text-xs text-emerald-600 mt-1">This job has reached the final stage.</p>
        </div>
      )}

      {/* Full pipeline — past stages show as done, future stages are tappable */}
      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Pipeline Stages</h3>
      <div className="space-y-1 relative before:absolute before:left-4 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100">
        {STAGES.map((stage, i) => {
          const isDone = i < currentIndex;
          const isCurrent = i === currentIndex;
          const isFuture = i > currentIndex;
          const stageLabel = ALL_STATUSES.find(s => s.value === stage)?.label || stage.replace(/_/g, ' ');
          return (
            <button
              key={stage}
              type="button"
              disabled={advancing || !isFuture}
              onClick={() => isFuture ? handleAdvance(stage) : undefined}
              className={`w-full flex gap-4 relative py-2 px-2 rounded-xl text-left transition-colors ${isFuture ? 'active:bg-slate-50' : 'cursor-default'}`}
            >
              <div className={`h-8 w-8 rounded-full flex items-center justify-center z-10 flex-shrink-0 ${isCurrent ? 'bg-accent text-white ring-4 ring-accent/20' : isDone ? 'bg-emerald-500 text-white' : 'bg-white border-2 border-slate-100 text-slate-300'}`}>
                {isDone ? <CheckCircle2 size={16} /> : isCurrent ? <div className="h-2.5 w-2.5 rounded-full bg-white" /> : <div className="h-2 w-2 rounded-full bg-current" />}
              </div>
              <div className="flex-1 pt-1">
                <p className={`text-sm font-bold ${isCurrent ? 'text-accent' : isDone ? 'text-slate-400' : 'text-slate-600'}`}>
                  {stageLabel}
                </p>
                {isCurrent && <p className="text-[10px] text-accent/70 font-medium mt-0.5">Current Stage</p>}
                {isFuture && <p className="text-[10px] text-slate-400 mt-0.5">Tap to jump here</p>}
              </div>
              {isFuture && <ChevronRight size={16} className="text-slate-300 mt-2 flex-shrink-0" />}
            </button>
          );
        })}
      </div>

      {/* Other outcomes (Retail / Lost) */}
      <div className="space-y-2">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Other Outcomes</h3>
        <div className="grid grid-cols-2 gap-3">
          {(['retail', 'lost'] as CustomerStatus[]).map(status => {
            const label = ALL_STATUSES.find(s => s.value === status)?.label || status;
            const isActive = contact.status === status;
            return (
              <button
                key={status}
                type="button"
                disabled={advancing || isActive}
                onClick={() => !isActive && handleAdvance(status)}
                className={`py-3 rounded-xl text-xs font-bold border active:scale-95 transition-transform disabled:opacity-50 ${isActive ? 'bg-slate-800 text-white border-slate-800' : 'bg-white border-slate-200 text-slate-600'}`}
              >
                {isActive ? `✓ ${label}` : label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TimelineTab({ timeline, onRefresh, contact, userId, companyId }: { timeline: any[]; onRefresh: () => void; contact: any; userId?: string; companyId?: string | null }) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [localTimeline, setLocalTimeline] = useState<any[]>(timeline);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [mentionQuery, setMentionQuery] = useState<{ start: number; query: string } | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const noteInputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setLocalTimeline(timeline);
  }, [timeline]);

  useEffect(() => {
    const fetchTeamMembers = async () => {
      const activeCompanyId = companyId || contact?.company_id;
      if (!activeCompanyId) return;
      try {
        const { data, error } = await supabase
          .from('team_members')
          .select('id, name, email')
          .eq('company_id', activeCompanyId)
          .eq('is_active', true)
          .order('name', { ascending: true });

        if (!error && data && data.length > 0) {
          setTeamMembers(data);
          return;
        }

        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, email, is_active')
          .eq('company_id', activeCompanyId)
          .order('first_name', { ascending: true });

        if (profileError) throw profileError;

        const normalizedProfiles = (profileData || [])
          .filter((member: any) => member.is_active !== false)
          .map((member: any) => ({
            id: member.id,
            name: [member.first_name, member.last_name].filter(Boolean).join(' ').trim() || member.email || 'Team Member',
            email: member.email || '',
          }));

        setTeamMembers(normalizedProfiles);
      } catch (err) {
        console.error('Error fetching team members for mentions:', err);
        setTeamMembers([]);
      }
    };

    fetchTeamMembers();
  }, [companyId, contact?.company_id]);

  const mentionTargets = getMentionTargets(teamMembers);
  const filteredMentions = mentionQuery ? getMentionSuggestions(mentionTargets, mentionQuery.query) : [];

  const handleNoteChange = (value: string, caretPosition: number) => {
    setNote(value);
    const active = findActiveMentionQuery(value, caretPosition);
    setMentionQuery(active);
    setMentionIndex(0);
  };

  const handleNoteKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!mentionQuery || filteredMentions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setMentionIndex((index) => (index + 1) % filteredMentions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setMentionIndex((index) => (index - 1 + filteredMentions.length) % filteredMentions.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      insertMention(filteredMentions[mentionIndex]);
    } else if (e.key === 'Escape') {
      setMentionQuery(null);
    }
  };

  const insertMention = (member: any) => {
    if (!mentionQuery || !noteInputRef.current) return;
    const result = applyMention(note, mentionQuery.start, noteInputRef.current.selectionStart ?? note.length, member.handle);
    setNote(result.text);
    setMentionQuery(null);
    setMentionIndex(0);

    window.requestAnimationFrame(() => {
      const target = noteInputRef.current;
      if (!target) return;
      target.focus();
      target.setSelectionRange(result.caret, result.caret);
    });
  };

  const addNote = async () => {
    if (!note.trim() || !userId) return;
    setSaving(true);
    try {
      const { invalid, valid } = validateMentions(note.trim(), mentionTargets);
      if (invalid.length > 0) {
        alert(`Unknown mention(s): ${invalid.map((handle) => `@${handle}`).join(', ')}`);
        return;
      }

      const mentions = valid
        .map((handle) => mentionTargets.find((target) => target.handle.toLowerCase() === handle.toLowerCase()))
        .filter(Boolean)
        .map((target) => ({
          id: target!.id,
          handle: target!.handle,
          name: target!.name,
        }));

      const { data: insertedNote, error } = await (supabase.from('communications') as any).insert({
        contact_id: contact.id,
        company_id: contact.company_id,
        type: 'note',
        content: serializeNoteMentions(note.trim(), mentions),
        user_id: userId,
        direction: 'outbound',
      }).select('*').single();
      if (error) throw error;

      for (const mention of mentions) {
        try {
          await (supabase.from('notifications') as any).insert({
            company_id: contact.company_id,
            user_id: mention.id,
            type: 'mention',
            title: 'You were tagged in a note',
            message: `You were mentioned on ${contact.first_name || ''} ${contact.last_name || ''}`.trim(),
            related_id: contact.id,
            related_type: 'contact',
            read: false,
          });
        } catch (notificationErr) {
          console.warn('Mention notification insert skipped:', notificationErr);
        }
      }

      setNote('');
      setMentionQuery(null);
      setMentionIndex(0);
      if (insertedNote) {
        setLocalTimeline((current) => [insertedNote, ...current]);
      }
      await onRefresh();
    } catch (err) {
      console.error('Error saving note:', err);
      alert('Failed to save note.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="card overflow-visible p-4 space-y-3">
        <div className="relative">
          <textarea
            ref={noteInputRef}
            className="w-full bg-slate-50 border-none rounded-xl p-3 text-base focus:ring-2 focus:ring-accent/20 min-h-[80px]"
            placeholder="Add a note... Use @handle to tag team members"
            value={note}
            onChange={(e) => handleNoteChange(e.target.value, e.target.selectionStart || e.target.value.length)}
            onClick={(e) => handleNoteChange((e.target as HTMLTextAreaElement).value, (e.target as HTMLTextAreaElement).selectionStart || 0)}
            onKeyUp={(e) => handleNoteChange((e.target as HTMLTextAreaElement).value, (e.target as HTMLTextAreaElement).selectionStart || 0)}
            onKeyDown={handleNoteKeyDown}
          />
          {mentionTargets.length > 0 && (
            <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar pb-1">
              {mentionTargets.slice(0, 8).map((member) => (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => insertMention(member)}
                  className="shrink-0 rounded-full bg-slate-100 px-3 py-2 text-[11px] font-bold text-slate-600"
                >
                  @{member.handle}
                </button>
              ))}
            </div>
          )}
          {filteredMentions.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-10 mt-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
              {filteredMentions.map((member, index) => (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => insertMention(member)}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left ${index === mentionIndex ? 'bg-slate-100' : 'hover:bg-slate-50'}`}
                >
                  <div>
                    <span className="text-sm font-bold text-primary">{member.name}</span>
                    <p className="text-[11px] text-slate-400">@{member.handle}</p>
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.18em] text-slate-400">{member.email}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button onClick={addNote} disabled={!note.trim() || saving} className="w-full bg-accent text-white py-3 rounded-xl text-xs font-bold active:scale-95 transition-transform disabled:opacity-50">
          {saving ? 'Saving...' : 'Add Note'}
        </button>
      </div>
      <div className="space-y-4">
        {localTimeline.length > 0 ? localTimeline.map((item, i) => (
          <div key={i} className="card p-4 space-y-2">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-2">
                <div className={`h-6 w-6 rounded-md flex items-center justify-center ${item.type === 'stage_change' ? 'bg-accent/10 text-accent' : 'bg-slate-100 text-slate-500'}`}>
                  {item.type === 'call'         && <Phone      size={12} />}
                  {item.type === 'note'         && <FileText   size={12} />}
                  {item.type === 'sms'          && <MessageSquare size={12} />}
                  {item.type === 'stage_change' && <TrendingUp size={12} />}
                </div>
                <span className={`text-[10px] font-bold uppercase ${item.type === 'stage_change' ? 'text-accent' : 'text-slate-400'}`}>
                  {item.type === 'stage_change' ? 'Stage Change' : item.type}
                </span>
              </div>
              <span className="text-[10px] text-slate-400">{new Date(item.created_at).toLocaleDateString()}</span>
            </div>
            <p className="text-sm text-primary">
              {(() => {
                const parsed = parseNoteMentions(item.content);
                const segments = parsed.plainContent.split(/(@[a-zA-Z0-9_]+)/g);
                return segments.map((segment, index) => {
                  const isMention = segment.startsWith('@');
                  return (
                    <span key={`${item.id || i}-${index}`} className={isMention ? 'font-bold text-accent' : ''}>
                      {segment}
                    </span>
                  );
                });
              })()}
            </p>
          </div>
        )) : (
          <div className="text-center py-12 text-slate-400">
            <History size={48} className="mx-auto mb-4 opacity-20" />
            <p className="text-sm">No activity recorded yet</p>
          </div>
        )}
      </div>
    </div>
  );
}

function DocumentsTab({ contactId, documents, onUpload, onLegalUpload }: { contactId: string; documents: any[]; onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void; onLegalUpload: (label: string, docType: string, e: React.ChangeEvent<HTMLInputElement>) => void }) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'all' | 'photos' | 'docs' | 'legal'>('all');
  const LEGAL_DOCS = [
    { id: 'contingency', label: 'Contingency Agreement', type: 'other' },
    { id: 'csa', label: 'Customer Service Agreement', type: 'contract' },
    { id: 'rescind', label: '3 Day Right to Rescind', type: 'other' },
    { id: 'completion', label: 'Completion Certificate', type: 'other' },
    { id: 'change-order', label: 'Change Order', type: 'other' },
  ];
  const getLegalTemplateId = (doc: any) => {
    const name = String(doc?.name || '').toLowerCase();
    if (name.includes('contingency agreement')) return 'contingency';
    if (name.includes('customer service agreement')) return 'csa';
    if (name.includes('notice of cancellation') || name.includes('3 day right to rescind') || name.includes('3-day right to rescind')) return 'rescind';
    if (name.includes('completion certificate')) return 'completion';
    if (name.includes('change order')) return 'change-order';
    return null;
  };
  const isLegalDocument = (doc: any) => {
    return !!getLegalTemplateId(doc);
  };
  const getSignatureParentName = (name: string) => {
    if (name.includes(' Customer Signature - ')) return name.replace(' Customer Signature - ', ' - ');
    if (name.includes(' Contractor Signature - ')) return name.replace(' Contractor Signature - ', ' - ');
    if (name.includes(' Signature - ')) return name.replace(' Signature - ', ' - ');
    return null;
  };
  const filteredDocs = documents.filter((doc) => {
    if (filter === 'photos') return doc.type === 'photo';
    if (filter === 'docs') return doc.type !== 'photo' && !isLegalDocument(doc);
    if (filter === 'legal') return isLegalDocument(doc);
    return true;
  });
  const visibleDocs = filteredDocs.filter((doc) => !getSignatureParentName(String(doc.name || '')));
  const signedLegalDocs = LEGAL_DOCS.map((legalDoc) => {
    const matchingPdfs = visibleDocs
      .filter((doc) => getLegalTemplateId(doc) === legalDoc.id && doc.type === 'contract')
      .sort((left, right) => new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime());

    return {
      ...legalDoc,
      signedPdf: matchingPdfs[0] || null,
    };
  }).filter((entry) => entry.signedPdf);
  const gridDocs = visibleDocs.filter((doc) => !(filter === 'legal' && doc.type === 'contract' && isLegalDocument(doc)));
  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {['all','photos','docs','legal'].map((f) => (
          <button key={f} onClick={() => setFilter(f as any)} className={`px-3 py-2 rounded-lg text-xs font-bold ${filter === f ? 'bg-accent text-white' : 'bg-slate-100 text-slate-600'}`}>
            {f === 'all' ? 'All' : f === 'photos' ? 'Photos' : f === 'docs' ? 'Docs' : 'Legal'}
          </button>
        ))}
      </div>

      <div className="bg-primary/5 border border-primary/10 rounded-2xl p-5 space-y-3">
        <div className="flex justify-between items-center">
          <h4 className="text-xs font-bold text-primary uppercase tracking-wider">Legal Documents</h4>
          <span className="text-[10px] font-bold text-slate-400 uppercase">Signable Templates</span>
        </div>
        <button
          type="button"
          onClick={() => navigate(`/contacts/${contactId}/documents`)}
          className="w-full rounded-xl bg-primary py-3 text-xs font-bold text-white"
        >
          Open Legal Document Center
        </button>
        <div className="space-y-2">
          {LEGAL_DOCS.map((doc) => (
            <div key={doc.label} className="bg-white rounded-xl p-3 border border-slate-100 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-bold text-slate-700">{doc.label}</span>
                <button
                  type="button"
                  onClick={() => navigate(`/contacts/${contactId}/documents/${doc.id}`)}
                  className="text-[10px] font-bold uppercase tracking-wider text-accent"
                >
                  Sign In App
                </button>
              </div>
              <label className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 cursor-pointer">
                <span className="text-[11px] font-semibold text-slate-500">Upload existing file</span>
                <span className="text-[10px] text-slate-400 font-bold">Upload</span>
                <input type="file" className="hidden" onChange={(e) => onLegalUpload(doc.label, doc.type, e)} />
              </label>
            </div>
          ))}
        </div>
      </div>
      {(filter === 'all' || filter === 'legal') && (
        <div className="bg-white border border-slate-100 rounded-2xl p-5 space-y-3">
          <div className="flex justify-between items-center">
            <h4 className="text-xs font-bold text-primary uppercase tracking-wider">Signed Legal PDFs</h4>
            <span className="text-[10px] font-bold text-slate-400 uppercase">Customer View</span>
          </div>
          {signedLegalDocs.length > 0 ? (
            <div className="space-y-3">
              {signedLegalDocs.map(({ id, label, signedPdf }) => (
                <div key={id} className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-emerald-900">{label}</p>
                      <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">Signed and ready to view</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate(`/documents/view/${signedPdf.id}`)}
                      className="rounded-xl bg-emerald-600 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-white"
                    >
                      View Signed PDF
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
              Signed legal documents will appear here after they are completed in the app.
            </div>
          )}
        </div>
      )}
      <div className="bg-primary/5 border border-primary/10 rounded-2xl p-5 space-y-3">
        <div className="flex justify-between items-center">
          <h4 className="text-xs font-bold text-primary uppercase tracking-wider">EagleView Report</h4>
          <span className="text-[10px] font-bold text-slate-400 uppercase">Not Requested</span>
        </div>
        <button className="w-full bg-primary text-white py-3 rounded-xl text-xs font-bold active:scale-95 transition-transform">Order Aerial Measurement</button>
      </div>
      <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5 space-y-3">
        <div className="flex justify-between items-center">
          <h4 className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Before & After Report</h4>
          <span className="text-[10px] font-bold text-emerald-600 uppercase">Shareable PDF</span>
        </div>
        <p className="text-sm text-emerald-800">
          Build a saved progress/completion report using customer photos for homeowners, adjusters, and future file reference.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => navigate(`/contacts/${contactId}/report`)}
            className="rounded-xl bg-emerald-600 py-3 text-xs font-bold text-white"
          >
            Build Report
          </button>
          <button
            type="button"
            onClick={() => navigate(`/documents?contactId=${contactId}`)}
            className="rounded-xl border border-emerald-200 bg-white py-3 text-xs font-bold text-emerald-700"
          >
            View Saved PDFs
          </button>
        </div>
      </div>
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-bold text-primary">Files & Photos</h3>
        <label className="bg-accent text-white p-2 rounded-xl cursor-pointer active:scale-95 transition-transform">
          <Plus size={18} />
          <input type="file" className="hidden" onChange={onUpload} accept="image/*" />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {gridDocs.length > 0 ? gridDocs.map((doc, i) => (
          <button
            key={i}
            type="button"
            className="card p-3 space-y-2 text-left"
            onClick={() => navigate(`/documents/view/${doc.id}`)}
          >
            <div>
              <div className="h-24 bg-slate-50 rounded-xl overflow-hidden flex items-center justify-center text-slate-300">
                {doc.type === 'photo' ? <img src={doc.displayUrl || doc.url} alt={doc.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <FileText size={32} />}
              </div>
              <div>
                <p className="text-xs font-bold text-primary truncate">{doc.name}</p>
                <p className="text-[10px] text-slate-400">{(doc.size / 1024 / 1024).toFixed(1)} MB</p>
              </div>
            </div>
          </button>
        )) : (
          <div className="col-span-2 text-center py-12 text-slate-400">
            <FileText size={48} className="mx-auto mb-4 opacity-20" />
            <p className="text-sm">{filter === 'legal' ? 'No signed legal PDFs yet' : 'No documents uploaded yet'}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function FinancialTab({ contact, userId, onEdit, onRefresh }: { contact: any; userId?: string; onEdit: () => void; onRefresh: () => void }) {
  const navigate = useNavigate();
  const [latestEstimate, setLatestEstimate] = useState<any>(null);
  const [latestWorkOrder, setLatestWorkOrder] = useState<any>(null);
  const [savingField, setSavingField] = useState<'deposit' | 'final' | null>(null);
  const [creatingWorkOrder, setCreatingWorkOrder] = useState(false);

  useEffect(() => {
    const fetchFinancialArtifacts = async () => {
      if (!contact?.id) return;
      try {
        const [{ data: estimate }, { data: workOrder }] = await Promise.all([
          supabase
            .from('estimates')
            .select('*')
            .eq('contact_id', contact.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('work_orders')
            .select('*')
            .eq('contact_id', contact.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);
        setLatestEstimate(estimate || null);
        setLatestWorkOrder(workOrder || null);
      } catch (err) {
        console.error('Error loading financial data:', err);
      }
    };

    fetchFinancialArtifacts();
  }, [contact?.id]);

  const togglePayment = async (kind: 'deposit' | 'final') => {
    setSavingField(kind);
    try {
      const paidField = kind === 'deposit' ? 'deposit_paid' : 'final_payment_paid';
      const dateField = kind === 'deposit' ? 'deposit_date' : 'final_payment_date';
      const nextPaid = !contact[paidField];
      const { error } = await (supabase.from('contacts') as any)
        .update({
          [paidField]: nextPaid,
          [dateField]: nextPaid ? new Date().toISOString() : null,
        })
        .eq('id', contact.id);
      if (error) throw error;
      if (userId) {
        await (supabase.from('communications') as any).insert({
          contact_id: contact.id,
          company_id: contact.company_id,
          type: 'note',
          content: `${kind === 'deposit' ? 'Deposit' : 'Final payment'} ${nextPaid ? 'recorded' : 'marked unpaid'} in mobile app.`,
          user_id: userId,
          direction: 'outbound',
        });
      }
      await onRefresh();
    } catch (err) {
      console.error(`Error updating ${kind} payment:`, err);
      alert(`Unable to update ${kind} payment right now.`);
    } finally {
      setSavingField(null);
    }
  };

  const createWorkOrder = async () => {
    setCreatingWorkOrder(true);
    try {
      const { data, error } = await (supabase.from('work_orders') as any)
        .insert({
          contact_id: contact.id,
          company_id: contact.company_id,
          project_id: null,
          title: `Work Order - ${[contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Customer'}`,
          description: latestEstimate
            ? `Created from mobile workflow based on estimate "${latestEstimate.title}".`
            : 'Created from mobile financial workflow.',
          status: 'scheduled',
          assigned_to: null,
          scheduled_date: null,
          materials: latestEstimate?.items || {},
          labor_cost: null,
          material_cost: null,
        })
        .select('*')
        .single();
      if (error) throw error;

      await (supabase.from('contacts') as any)
        .update({ status: 'scheduled', status_changed_at: new Date().toISOString() })
        .eq('id', contact.id);

      if (userId) {
        await (supabase.from('communications') as any).insert({
          contact_id: contact.id,
          company_id: contact.company_id,
          type: 'note',
          content: `Work order created in mobile app: ${data.title}`,
          user_id: userId,
          direction: 'outbound',
        });
      }

      setLatestWorkOrder(data);
      await onRefresh();
      navigate(`/work-orders/${data.id}`);
    } catch (err) {
      console.error('Error creating work order:', err);
      alert('Unable to create a work order right now.');
    } finally {
      setCreatingWorkOrder(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-slate-900 p-5 text-white">
        <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">Financial & Estimates</p>
        <h3 className="mt-2 text-xl font-black">Customer financial workflow</h3>
        <p className="mt-2 text-sm text-slate-300">
          Create and review estimates, record deposit and final payment, and jump into work orders without leaving this screen.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4">
        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Project Value</h3>
              <p className="text-2xl font-bold text-primary">{formatCurrency(contact.project_value)}</p>
            </div>
            <button onClick={onEdit} className="text-accent text-xs font-bold">Edit</button>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-primary">Estimate Workflow</p>
                <p className="text-[11px] text-slate-500">
                  {latestEstimate ? `${latestEstimate.title} • ${latestEstimate.status}` : 'No estimate created yet'}
                </p>
              </div>
              {latestEstimate && <span className="text-sm font-bold text-accent">{formatCurrency(latestEstimate.total)}</span>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => navigate(`/contacts/${contact.id}/estimate`)} className="rounded-xl bg-primary py-3 text-xs font-bold text-white">
                Create Estimate
              </button>
              <button onClick={() => navigate(`/estimates-list?contactId=${contact.id}`)} className="rounded-xl bg-white border border-slate-200 py-3 text-xs font-bold text-slate-700">
                View Estimates
              </button>
            </div>
          </div>
        </div>
        <div className="card p-5 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Deposit</h3>
            <span className={`text-[10px] font-bold px-2 py-1 rounded-md uppercase ${contact.deposit_paid ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>{contact.deposit_paid ? 'Paid' : 'Pending'}</span>
          </div>
          <span className="text-xl font-bold text-primary">{formatCurrency(contact.deposit_amount)}</span>
          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span>{contact.deposit_date ? `Updated ${new Date(contact.deposit_date).toLocaleDateString()}` : 'No payment recorded yet'}</span>
            <button onClick={() => togglePayment('deposit')} disabled={savingField === 'deposit'} className="font-bold text-accent disabled:opacity-50">
              {savingField === 'deposit' ? 'Saving...' : contact.deposit_paid ? 'Mark Unpaid' : 'Record Deposit'}
            </button>
          </div>
        </div>
        <div className="card p-5 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Final Payment</h3>
            <span className={`text-[10px] font-bold px-2 py-1 rounded-md uppercase ${contact.final_payment_paid ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>{contact.final_payment_paid ? 'Paid' : 'Pending'}</span>
          </div>
          <span className="text-xl font-bold text-primary">{formatCurrency(contact.final_payment_amount)}</span>
          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span>{contact.final_payment_date ? `Updated ${new Date(contact.final_payment_date).toLocaleDateString()}` : 'No payment recorded yet'}</span>
            <button onClick={() => togglePayment('final')} disabled={savingField === 'final'} className="font-bold text-accent disabled:opacity-50">
              {savingField === 'final' ? 'Saving...' : contact.final_payment_paid ? 'Mark Unpaid' : 'Record Final'}
            </button>
          </div>
        </div>
        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Work Orders</h3>
              <p className="text-sm font-bold text-primary">{latestWorkOrder?.title || 'No work order linked yet'}</p>
            </div>
            {latestWorkOrder && (
              <span className="text-[10px] font-bold uppercase text-slate-500">
                {String(latestWorkOrder.status || '').replace('_', ' ')}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={createWorkOrder}
              disabled={creatingWorkOrder}
              className="rounded-xl bg-primary py-3 text-xs font-bold text-white disabled:opacity-50"
            >
              {creatingWorkOrder ? 'Creating...' : 'Create Work Order'}
            </button>
            <button onClick={() => navigate(`/work-orders?contactId=${contact.id}`)} className="rounded-xl bg-white border border-slate-200 py-3 text-xs font-bold text-slate-700">
              View Work Orders
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3">
            {latestWorkOrder ? (
              <button onClick={() => navigate(`/work-orders/${latestWorkOrder.id}`)} className="rounded-xl bg-slate-100 py-3 text-xs font-bold text-slate-700">
                Open Latest
              </button>
            ) : (
              <button onClick={() => navigate(`/documents?contactId=${contact.id}`)} className="rounded-xl bg-slate-100 py-3 text-xs font-bold text-slate-700">
                View Project Docs
              </button>
            )}
          </div>
        </div>
        <div className="card p-5 space-y-4">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Legal Docs & PDFs</h3>
          <p className="text-sm text-slate-600">
            Open legal templates, capture signature in the app, and generate a customer-ready PDF.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => navigate(`/contacts/${contact.id}/documents`)} className="rounded-xl bg-primary py-3 text-xs font-bold text-white">
              Open Legal Docs
            </button>
            <button onClick={() => navigate(`/documents?contactId=${contact.id}`)} className="rounded-xl bg-white border border-slate-200 py-3 text-xs font-bold text-slate-700">
              View Saved PDFs
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function InsuranceTab({ contact }: { contact: any }) {
  return (
    <div className="space-y-6">
      <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5 space-y-3">
        <div className="flex justify-between items-center">
          <h4 className="text-xs font-bold text-amber-800 uppercase tracking-wider">HailTrace Data</h4>
          <span className="text-[10px] font-bold text-amber-600 uppercase">Active Event</span>
        </div>
        <p className="text-xs text-amber-700">1.75" Hail detected on May 14, 2025 at this location.</p>
      </div>
      <div className="card p-5 space-y-4">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Insurance Policy</h3>
        <div className="space-y-4">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase">Carrier</p>
            <p className="text-sm font-bold text-primary">{contact.insurance_company || '\u2014'}</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase">Claim #</p>
              <p className="text-sm font-bold text-primary">{contact.claim_number || '\u2014'}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase">Deductible</p>
              <p className="text-sm font-bold text-primary">{contact.deductible ? formatCurrency(contact.deductible) : '\u2014'}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
