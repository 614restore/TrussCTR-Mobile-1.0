import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ChevronLeft, Phone, MessageSquare, Mail, Edit2, 
  Info, History, FileText, DollarSign, Shield, 
  MapPin, User, CheckCircle2, MoreVertical, Plus
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { CustomerStatus } from '../types/supabase';
import { formatPhone, formatCurrency } from '../lib/utils';
import { Capacitor, registerPlugin } from '@capacitor/core';

const MultiShotCamera = registerPlugin<{ open: () => Promise<{ photos: string[] }> }>('MultiShotCamera');

const TABS = [
  { id: 'overview', label: 'Overview', icon: Info },
  { id: 'inspection', label: 'Inspection', icon: Shield },
  { id: 'status', label: 'Job Status', icon: CheckCircle2 },
  { id: 'timeline', label: 'Timeline', icon: History },
  { id: 'documents', label: 'Docs', icon: FileText },
  { id: 'financial', label: 'Financial', icon: DollarSign },
  { id: 'insurance', label: 'Insurance', icon: Shield },
];

const STAGES: CustomerStatus[] = [
  'lead', 'contacted', 'appointment_set', 'inspected', 'estimate_sent', 
  'approved', 'scheduled', 'in_progress', 'completed', 'paid'
];

export default function ContactDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [contact, setContact] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<any[]>([]);
  const [documentsWithUrls, setDocumentsWithUrls] = useState<any[]>([]);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>(null);
  const [showActions, setShowActions] = useState(false);

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
        if (doc.type === 'photo' && typeof doc.url === 'string') {
          const bucket = 'projectceo-photos';
          const marker = `/${bucket}/`;
          const idx = doc.url.indexOf(marker);
          if (idx !== -1) {
            const path = decodeURIComponent(doc.url.substring(idx + marker.length));
            const { data: signedData } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60);
            return { ...doc, displayUrl: signedData?.signedUrl || doc.url };
          }
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

  const openEdit = () => {
    setEditForm({ ...contact });
    setIsEditing(true);
  };

  const saveEdit = async () => {
    if (!editForm?.id) return;
    try {
      const updates = { ...editForm };
      const numericFields = ['project_value', 'deposit_amount', 'final_payment_amount', 'deductible'];
      numericFields.forEach((f) => {
        if (updates[f] === '') updates[f] = null;
        if (updates[f] !== null && updates[f] !== undefined) {
          const n = Number(updates[f]);
          updates[f] = Number.isNaN(n) ? null : n;
        }
      });
      const { error } = await supabase.from('contacts').update(updates).eq('id', editForm.id);
      if (error) throw error;
      setIsEditing(false);
      fetchContact();
    } catch (err) {
      console.error('Error saving contact:', err);
      alert('Failed to save contact changes.');
    }
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
        url: publicUrl,
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
        url: publicUrl,
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
            { icon: Phone, label: 'Call', color: 'bg-emerald-500', action: () => contact.phone1 && (window.location.href = `tel:${contact.phone1}`) },
            { icon: MessageSquare, label: 'SMS', color: 'bg-accent', action: () => contact.phone1 && (window.location.href = `sms:${contact.phone1}`) },
            { icon: Mail, label: 'Email', color: 'bg-amber-500', action: () => contact.email && (window.location.href = `mailto:${contact.email}`) },
          ].map((action) => (
            <button key={action.label} onClick={action.action} className="flex-1 bg-white p-4 rounded-2xl shadow-lg flex flex-col items-center gap-1 active:scale-95 transition-transform">
              <div className={`${action.color} h-10 w-10 rounded-xl flex items-center justify-center text-white mb-1`}><action.icon size={20} /></div>
              <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">{action.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-12 px-6 overflow-x-auto no-scrollbar border-b border-slate-100 bg-white">
        <div className="flex gap-8 min-w-max">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`py-4 flex items-center gap-2 border-b-2 transition-all ${isActive ? 'border-accent text-accent' : 'border-transparent text-slate-400'}`}>
                <Icon size={18} />
                <span className="text-sm font-bold whitespace-nowrap">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 no-scrollbar">
        <AnimatePresence mode="wait">
          <motion.div key={activeTab} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.2 }}>
            {activeTab === 'overview' && <OverviewTab contact={contact} />}
            {activeTab === 'inspection' && <InspectionTab contact={contact} userId={user?.id} />}
            {activeTab === 'status' && <StatusTab contact={contact} />}
            {activeTab === 'timeline' && <TimelineTab timeline={timeline} onRefresh={fetchTimeline} contact={contact} userId={user?.id} />}
            {activeTab === 'documents' && <DocumentsTab documents={documentsWithUrls.length ? documentsWithUrls : documents} onUpload={handleUpload} onLegalUpload={handleLegalUpload} />}
            {activeTab === 'financial' && <FinancialTab contact={contact} onEdit={openEdit} />}
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
                  {STAGES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
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
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end">
          <div className="bg-white w-full rounded-t-3xl p-6 space-y-3">
            <button onClick={() => { setShowActions(false); openEdit(); }} className="w-full bg-slate-50 py-3 rounded-xl text-sm font-bold">Edit Contact</button>
            <button onClick={() => { setShowActions(false); setActiveTab('documents'); }} className="w-full bg-slate-50 py-3 rounded-xl text-sm font-bold">Legal Documents</button>
            <button onClick={() => setShowActions(false)} className="w-full bg-white border border-slate-200 py-3 rounded-xl text-sm font-bold">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

function OverviewTab({ contact }: { contact: any }) {
  return (
    <div className="space-y-6">
      <div className="card p-5 space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Current Status</h3>
          <span className="bg-accent/10 text-accent text-[10px] font-bold px-2 py-1 rounded-md uppercase">{contact.status.replace(/_/g, ' ')}</span>
        </div>
        <div className="flex gap-1">
          {STAGES.map((stage, i) => {
            const currentIndex = STAGES.indexOf(contact.status);
            return <div key={stage} className={`h-1.5 flex-1 rounded-full ${i <= currentIndex ? 'bg-accent' : 'bg-slate-100'}`} />;
          })}
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
          <textarea className="w-full bg-slate-50 border-none rounded-xl p-4 text-sm focus:ring-2 focus:ring-accent/20 min-h-[100px]" placeholder="Tap to add a note..." defaultValue={contact.notes || ''} />
        </div>
      </div>
    </div>
  );
}

function InspectionTab({ contact, userId }: { contact: any; userId?: string }) {
  const [step, setStep] = useState<'questions' | 'photos' | 'report'>('questions');
  const [checklist, setChecklist] = useState({ roofAge: '', material: '', damageTypes: [] as string[], leaks: false });
  const [saving, setSaving] = useState(false);
  const [pitch, setPitch] = useState({ rise: 4, run: 12 });
  const [footprintArea, setFootprintArea] = useState<number | ''>('');
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
  const roofSurfaceArea = footprintArea ? (Number(footprintArea) * pitchMultiplier) : 0;

  const loadInspectionData = (data: any) => {
    if (!data) return;
    if (data.pitch) setPitch(data.pitch);
    if (typeof data.footprintArea !== 'undefined') setFootprintArea(data.footprintArea);
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
        angle: angle.toFixed(1),
        rafterLength: rafterLength.toFixed(2),
        pitchMultiplier: pitchMultiplier.toFixed(3),
        footprintArea,
        roofSurfaceArea: roofSurfaceArea ? roofSurfaceArea.toFixed(1) : null,
        checklist,
      };
      const content = `ROOF INSPECTION REPORT:\nPitch: ${pitch.rise}/${pitch.run} (${angle.toFixed(1)}°)\nRafter: ${rafterLength.toFixed(2)}\nPitch Multiplier: ${pitchMultiplier.toFixed(3)}\n${footprintArea ? `Footprint: ${footprintArea} sq ft\nRoof Surface: ${roofSurfaceArea.toFixed(1)} sq ft\n` : ''}Age: ${checklist.roofAge}\nMaterial: ${checklist.material}\nDamage: ${checklist.damageTypes.length ? checklist.damageTypes.join(', ') : 'None'}\nLeaks: ${checklist.leaks ? 'Yes' : 'No'}`;
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
        const { data } = await supabase.from('inspections').upsert({
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
    if (!Capacitor.isPluginAvailable('MultiShotCamera')) {
      alert('Multi-shot camera is not available on this build. Please rebuild the iOS app.');
      return;
    }
    setUploading(true);
    try {
      const result = await MultiShotCamera.open();
      const photosToUpload = result?.photos || [];
      for (const url of photosToUpload) {
        const resp = await fetch(url);
        const blob = await resp.blob();
        await uploadInspectionBlob(blob, url);
      }
    } catch (err) {
      console.error('Camera capture error:', err);
      const message = (err as any)?.message || 'Camera capture failed.';
      alert(`Camera capture failed. ${message}`);
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
      const { error: statusError } = await supabase.from('contacts').update({ status: 'inspection_complete' }).eq('id', contact.id);
      if (statusError) {
        await supabase.from('contacts').update({ status: 'inspected' }).eq('id', contact.id);
      }
      try {
        const { data } = await supabase.from('inspections').upsert({
          contact_id: contact.id,
          company_id: contact.company_id,
          user_id: userId,
          status: 'completed',
          data: {
            pitch,
            angle: angle.toFixed(1),
            rafterLength: rafterLength.toFixed(2),
            pitchMultiplier: pitchMultiplier.toFixed(3),
            footprintArea,
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
        <div className="flex justify-between items-center">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Pitch Calculator</h3>
          <div className="bg-accent px-2 py-1 rounded text-[10px] font-bold">FIELD TOOL</div>
        </div>
        <div className="flex items-center justify-around py-4">
          <div className="text-center">
            <p className="text-[10px] text-slate-400 uppercase mb-1">Rise</p>
            <input type="number" className="w-16 bg-white/10 border-none rounded-lg text-center font-bold text-xl p-2" value={pitch.rise} onChange={(e) => setPitch({...pitch, rise: parseFloat(e.target.value) || 0})} />
          </div>
          <div className="text-2xl font-light text-slate-600">/</div>
          <div className="text-center">
            <p className="text-[10px] text-slate-400 uppercase mb-1">Run</p>
            <input type="number" className="w-16 bg-white/10 border-none rounded-lg text-center font-bold text-xl p-2" value={pitch.run} onChange={(e) => setPitch({...pitch, run: parseFloat(e.target.value) || 0})} />
          </div>
          <div className="h-12 w-px bg-white/10" />
          <div className="text-center">
            <p className="text-[10px] text-slate-400 uppercase mb-1">Angle</p>
            <p className="text-2xl font-bold text-accent">{angle.toFixed(1)}\u00b0</p>
          </div>
        </div>
        <div className="flex gap-2">
          {[4, 6, 8, 10, 12].map(r => (
            <button key={r} onClick={() => setPitch({...pitch, rise: r})} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors ${pitch.rise === r ? 'bg-accent text-white' : 'bg-white/5 text-slate-400'}`}>{r}/12</button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs text-slate-300">
          <div>Rafter: <span className="text-white font-bold">{rafterLength.toFixed(2)}</span></div>
          <div>Multiplier: <span className="text-white font-bold">{pitchMultiplier.toFixed(3)}</span></div>
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-400 uppercase">Footprint Area (sq ft)</label>
          <input type="number" className="w-full bg-white/10 border-none rounded-lg text-sm p-2 mt-1" value={footprintArea} onChange={(e) => setFootprintArea(e.target.value === '' ? '' : Number(e.target.value))} />
          {!!footprintArea && <p className="text-[10px] text-slate-400 mt-1">Roof Surface: <span className="text-white font-bold">{roofSurfaceArea.toFixed(1)} sq ft</span></p>}
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
          <label className="block w-full cursor-pointer">
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoUpload} />
            <div className="aspect-[4/3] bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center gap-3 text-slate-400 active:bg-slate-100 transition-colors">
              <span className="text-sm font-bold text-slate-500">{uploading ? 'Uploading...' : `Tap to add ${activeElevation} photo`}</span>
            </div>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={capturePhoto} disabled={uploading} className="bg-primary text-white py-3 rounded-xl text-xs font-bold disabled:opacity-50">Capture Photo</button>
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

function StatusTab({ contact }: { contact: any }) {
  return (
    <div className="space-y-6">
      <h3 className="text-sm font-bold text-primary">Job Timeline</h3>
      <div className="space-y-8 relative before:absolute before:left-4 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100">
        {STAGES.map((stage, i) => {
          const currentIndex = STAGES.indexOf(contact.status);
          const isDone = i <= currentIndex;
          return (
            <div key={stage} className="flex gap-6 relative">
              <div className={`h-8 w-8 rounded-full flex items-center justify-center z-10 ${isDone ? 'bg-accent text-white' : 'bg-white border-2 border-slate-100 text-slate-300'}`}>
                {isDone ? <CheckCircle2 size={16} /> : <div className="h-2 w-2 rounded-full bg-current" />}
              </div>
              <div className="flex-1 pt-1">
                <p className={`text-sm font-bold ${isDone ? 'text-primary' : 'text-slate-400'}`}>{stage.replace(/_/g, ' ').toUpperCase()}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TimelineTab({ timeline, onRefresh, contact, userId }: { timeline: any[]; onRefresh: () => void; contact: any; userId?: string }) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const addNote = async () => {
    if (!note.trim() || !userId) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('communications').insert({
        contact_id: contact.id,
        company_id: contact.company_id,
        type: 'note',
        content: note.trim(),
        user_id: userId,
        direction: 'outbound',
      } as any);
      if (error) throw error;
      setNote('');
      onRefresh();
    } catch (err) {
      console.error('Error saving note:', err);
      alert('Failed to save note.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="card p-4 space-y-3">
        <textarea className="w-full bg-slate-50 border-none rounded-xl p-3 text-sm focus:ring-2 focus:ring-accent/20 min-h-[80px]" placeholder="Add a note..." value={note} onChange={(e) => setNote(e.target.value)} />
        <button onClick={addNote} disabled={!note.trim() || saving} className="w-full bg-accent text-white py-3 rounded-xl text-xs font-bold active:scale-95 transition-transform disabled:opacity-50">
          {saving ? 'Saving...' : 'Add Note'}
        </button>
      </div>
      <div className="space-y-4">
        {timeline.length > 0 ? timeline.map((item, i) => (
          <div key={i} className="card p-4 space-y-2">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-md bg-slate-100 flex items-center justify-center text-slate-500">
                  {item.type === 'call' && <Phone size={12} />}
                  {item.type === 'note' && <FileText size={12} />}
                  {item.type === 'sms' && <MessageSquare size={12} />}
                </div>
                <span className="text-[10px] font-bold text-slate-400 uppercase">{item.type}</span>
              </div>
              <span className="text-[10px] text-slate-400">{new Date(item.created_at).toLocaleDateString()}</span>
            </div>
            <p className="text-sm text-primary">{item.content}</p>
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

function DocumentsTab({ documents, onUpload, onLegalUpload }: { documents: any[]; onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void; onLegalUpload: (label: string, docType: string, e: React.ChangeEvent<HTMLInputElement>) => void }) {
  const [filter, setFilter] = useState<'all' | 'photos' | 'docs' | 'legal'>('all');
  const LEGAL_DOCS = [
    { label: 'Contingency Agreement', type: 'other' },
    { label: 'Retail Contract', type: 'contract' },
    { label: '3 Day Right to Rescind', type: 'other' },
    { label: 'Completion Certificate', type: 'other' },
    { label: 'Change Order', type: 'other' },
  ];
  const legalLabels = new Set(LEGAL_DOCS.map((d) => d.label));
  const filteredDocs = documents.filter((doc) => {
    if (filter === 'photos') return doc.type === 'photo';
    if (filter === 'docs') return doc.type !== 'photo' && !legalLabels.has(doc.name);
    if (filter === 'legal') return legalLabels.has(doc.name);
    return true;
  });
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
          <span className="text-[10px] font-bold text-slate-400 uppercase">Templates / Uploads</span>
        </div>
        <div className="space-y-2">
          {LEGAL_DOCS.map((doc) => (
            <label key={doc.label} className="flex items-center justify-between bg-white rounded-xl p-3 border border-slate-100 cursor-pointer">
              <span className="text-xs font-bold text-slate-600">{doc.label}</span>
              <span className="text-[10px] text-accent font-bold">Upload</span>
              <input type="file" className="hidden" onChange={(e) => onLegalUpload(doc.label, doc.type, e)} />
            </label>
          ))}
        </div>
      </div>
      <div className="bg-primary/5 border border-primary/10 rounded-2xl p-5 space-y-3">
        <div className="flex justify-between items-center">
          <h4 className="text-xs font-bold text-primary uppercase tracking-wider">EagleView Report</h4>
          <span className="text-[10px] font-bold text-slate-400 uppercase">Not Requested</span>
        </div>
        <button className="w-full bg-primary text-white py-3 rounded-xl text-xs font-bold active:scale-95 transition-transform">Order Aerial Measurement</button>
      </div>
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-bold text-primary">Files & Photos</h3>
        <label className="bg-accent text-white p-2 rounded-xl cursor-pointer active:scale-95 transition-transform">
          <Plus size={18} />
          <input type="file" className="hidden" onChange={onUpload} accept="image/*" />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {filteredDocs.length > 0 ? filteredDocs.map((doc, i) => (
          <div key={i} className="card p-3 space-y-2">
            <div className="h-24 bg-slate-50 rounded-xl overflow-hidden flex items-center justify-center text-slate-300">
              {doc.type === 'photo' ? <img src={doc.displayUrl || doc.url} alt={doc.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <FileText size={32} />}
            </div>
            <div>
              <p className="text-xs font-bold text-primary truncate">{doc.name}</p>
              <p className="text-[10px] text-slate-400">{(doc.size / 1024 / 1024).toFixed(1)} MB</p>
            </div>
          </div>
        )) : (
          <div className="col-span-2 text-center py-12 text-slate-400">
            <FileText size={48} className="mx-auto mb-4 opacity-20" />
            <p className="text-sm">No documents uploaded yet</p>
          </div>
        )}
      </div>
    </div>
  );
}

function FinancialTab({ contact, onEdit }: { contact: any; onEdit: () => void }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4">
        <div className="card p-5 space-y-4">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Project Value</h3>
          <div className="flex items-center justify-between">
            <span className="text-2xl font-bold text-primary">{formatCurrency(contact.project_value)}</span>
            <button onClick={onEdit} className="text-accent text-xs font-bold">Edit</button>
          </div>
        </div>
        <div className="card p-5 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Deposit</h3>
            <span className={`text-[10px] font-bold px-2 py-1 rounded-md uppercase ${contact.deposit_paid ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>{contact.deposit_paid ? 'Paid' : 'Pending'}</span>
          </div>
          <span className="text-xl font-bold text-primary">{formatCurrency(contact.deposit_amount)}</span>
        </div>
        <div className="card p-5 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Final Payment</h3>
            <span className={`text-[10px] font-bold px-2 py-1 rounded-md uppercase ${contact.final_payment_paid ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>{contact.final_payment_paid ? 'Paid' : 'Pending'}</span>
          </div>
          <span className="text-xl font-bold text-primary">{formatCurrency(contact.final_payment_amount)}</span>
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
