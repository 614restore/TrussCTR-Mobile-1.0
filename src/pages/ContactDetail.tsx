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
  const [timeline, setTimeline] = useState<any[]>([]);

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
      setDocuments(data || []);
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

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `${id}/${fileName}`;
      const { error: uploadError } = await supabase.storage.from('documents').upload(filePath, file);
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(filePath);
      const { error: dbError } = await supabase.from('documents').insert({
        contact_id: id,
        company_id: contact.company_id,
        name: file.name,
        type: 'photo',
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
            <button className="p-2 hover:bg-white/10 rounded-full transition-colors"><Edit2 size={20} /></button>
            <button className="p-2 hover:bg-white/10 rounded-full transition-colors"><MoreVertical size={20} /></button>
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
            {activeTab === 'documents' && <DocumentsTab documents={documents} onUpload={handleUpload} />}
            {activeTab === 'financial' && <FinancialTab contact={contact} />}
            {activeTab === 'insurance' && <InsuranceTab contact={contact} />}
          </motion.div>
        </AnimatePresence>
      </div>
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
  const [checklist, setChecklist] = useState({ roofAge: '', material: '', damageTypes: [] as string[], leaks: false, steepness: 'standard' });
  const [saving, setSaving] = useState(false);
  const [pitch, setPitch] = useState({ rise: 4, run: 12 });
  const calculatePitch = () => (Math.atan(pitch.rise / pitch.run) * 180 / Math.PI).toFixed(1);

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
      const content = `ROOF INSPECTION REPORT:\nAge: ${checklist.roofAge}\nMaterial: ${checklist.material}\nDamage: ${checklist.damageTypes.length ? checklist.damageTypes.join(', ') : 'None'}\nLeaks: ${checklist.leaks ? 'Yes' : 'No'}\nSteepness: ${checklist.steepness}\nPitch: ${pitch.rise}/12 (${calculatePitch()}\u00b0)`;
      const { error } = await supabase.from('communications').insert({
        contact_id: contact.id,
        company_id: contact.company_id,
        type: 'note',
        content,
        user_id: userId,
        direction: 'outbound',
      } as any);
      if (error) throw error;
      alert('Inspection report saved to timeline!');
      setChecklist({ roofAge: '', material: '', damageTypes: [], leaks: false, steepness: 'standard' });
    } catch (err) {
      console.error('Error saving inspection:', err);
      alert('Failed to save inspection. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="card p-5 bg-slate-900 text-white space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Pitch Calculator</h3>
          <div className="bg-accent px-2 py-1 rounded text-[10px] font-bold">FIELD TOOL</div>
        </div>
        <div className="flex items-center justify-around py-4">
          <div className="text-center">
            <p className="text-[10px] text-slate-400 uppercase mb-1">Rise</p>
            <input type="number" className="w-16 bg-white/10 border-none rounded-lg text-center font-bold text-xl p-2" value={pitch.rise} onChange={(e) => setPitch({...pitch, rise: parseInt(e.target.value) || 0})} />
          </div>
          <div className="text-2xl font-light text-slate-600">/</div>
          <div className="text-center">
            <p className="text-[10px] text-slate-400 uppercase mb-1">Run</p>
            <div className="w-16 bg-white/5 rounded-lg text-center font-bold text-xl p-2 text-slate-400">12</div>
          </div>
          <div className="h-12 w-px bg-white/10" />
          <div className="text-center">
            <p className="text-[10px] text-slate-400 uppercase mb-1">Angle</p>
            <p className="text-2xl font-bold text-accent">{calculatePitch()}\u00b0</p>
          </div>
        </div>
        <div className="flex gap-2">
          {[4, 6, 8, 10, 12].map(r => (
            <button key={r} onClick={() => setPitch({...pitch, rise: r})} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors ${pitch.rise === r ? 'bg-accent text-white' : 'bg-white/5 text-slate-400'}`}>{r}/12</button>
          ))}
        </div>
      </div>
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
            <label className="text-[10px] font-bold text-slate-400 uppercase">Damage Observed</label>
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
        <button onClick={saveInspection} disabled={!checklist.material || checklist.damageTypes.length === 0 || saving} className="w-full bg-primary text-white py-4 rounded-2xl text-sm font-bold shadow-lg active:scale-95 transition-transform disabled:opacity-50">
          {saving ? 'Saving...' : 'Save Inspection Report'}
        </button>
      </div>
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

function DocumentsTab({ documents, onUpload }: { documents: any[]; onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <div className="space-y-6">
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
        {documents.length > 0 ? documents.map((doc, i) => (
          <div key={i} className="card p-3 space-y-2">
            <div className="h-24 bg-slate-50 rounded-xl overflow-hidden flex items-center justify-center text-slate-300">
              {doc.type === 'photo' ? <img src={doc.url} alt={doc.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <FileText size={32} />}
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

function FinancialTab({ contact }: { contact: any }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4">
        <div className="card p-5 space-y-4">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Project Value</h3>
          <div className="flex items-center justify-between">
            <span className="text-2xl font-bold text-primary">{formatCurrency(contact.project_value)}</span>
            <button className="text-accent text-xs font-bold">Edit</button>
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
