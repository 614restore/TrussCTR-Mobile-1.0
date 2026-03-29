import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ChevronLeft, Phone, MessageSquare, Mail, Edit2,
  Info, History, FileText, DollarSign, Shield,
  MapPin, User, CheckCircle2, MoreVertical, Plus, ChevronRight, Calendar,
  ClipboardList, PenLine, Wrench, TrendingUp, Image as ImageIcon, CloudSun,
  Trash2, Camera, RefreshCw, X, Star,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { CustomerStatus } from '../types/supabase';
import { formatPhone, formatCurrency } from '../lib/utils';
import { buildDocumentDisplayUrl, buildStoredDocumentUrl } from '../lib/documentAccess';
import { parseContactSchedule, serializeContactSchedule, updateScheduleMilestone, type ContactMilestone, type ContactMilestoneId } from '../lib/contactSchedule';
import { getNextPipelineStageLabel, getPipelineStageLabel, getPipelineStageOrder, getReachedPipelineStatuses, normalizePipelineStatus, toPipelineBoardStage } from '../lib/pipelineStages';
import { buildContactPipelineEvents, getUpcomingPipelineEvents } from '../lib/scheduleEvents';
import { applyMention, extractMentionHandles, findActiveMentionQuery, getMentionSuggestions, getMentionTargets, parseNoteMentions, serializeNoteMentions, validateMentions } from '../lib/noteMentions';
import { Capacitor } from '@capacitor/core';
import { buildLegalDocumentStats, getSignatureParentName, isLegalDocument, LEGAL_DOCUMENT_TEMPLATES } from '../lib/documentVisibility';
import { compressImageWithLightCompressor, PHOTO_POLICY_PRESETS, validateVideoForCloud } from '../lib/lightCompressor';
import EagleViewPanel from '../components/EagleViewPanel';
import RoofrPanel from '../components/RoofrPanel';

const TABS = [
  { id: 'overview', label: 'Overview', icon: Info },
  { id: 'inspection', label: 'Inspection', icon: Shield },
  { id: 'status', label: 'Job Status', icon: CheckCircle2 },
  { id: 'timeline', label: 'Timeline', icon: History },
  { id: 'documents', label: 'Docs', icon: FileText },
  { id: 'financial', label: 'Financial', icon: DollarSign },
  { id: 'insurance', label: 'Insurance', icon: Shield },
];

const TAB_IDS = new Set(TABS.map((tab) => tab.id));

function normalizeContactTab(value: string | null) {
  if (!value) return 'overview';
  return TAB_IDS.has(value) ? value : 'overview';
}

function sortPhotosForDisplay<T extends { starred?: boolean | null; created_at?: string | null }>(photos: T[]) {
  return [...photos].sort((a, b) => {
    const starDelta = Number(Boolean(b.starred)) - Number(Boolean(a.starred));
    if (starDelta !== 0) return starDelta;
    return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
  });
}

function pickCoverPhoto(photos: Array<{ starred?: boolean | null; displayUrl?: string | null; url?: string | null }>) {
  const preferred = sortPhotosForDisplay(photos)[0];
  return preferred ? preferred.displayUrl || preferred.url || null : null;
}

/** Strips serialization markers and returns the clean human-readable text. */
function formatTimelineMessage(item: any): string {
  if (item?.type === 'stage_change') {
    const content = String(item?.content || '').trim();
    const match = content.match(/^Stage updated:\s*(.+?)\s*→\s*(.+)$/i);
    if (match) {
      return `Job status moved from ${match[1]} to ${match[2]}.`;
    }
    return content;
  }

  const parsedMentions = parseNoteMentions(String(item?.content || ''));
  const parsedSchedule = parseContactSchedule(parsedMentions.plainContent);
  // If the content contained a schedule marker, only return plainNotes (never the raw JSON)
  if (parsedMentions.plainContent.includes('[TRUSSCTR_SCHEDULE]')) {
    return parsedSchedule.plainNotes || 'Schedule updated.';
  }
  // Last-resort strip in case any other serialization marker slipped through
  const stripped = parsedMentions.plainContent.replace(/\[TRUSSCTR_[A-Z_]+\]\{[\s\S]*$/, '').trim();
  return parsedSchedule.plainNotes || stripped || 'Activity updated.';
}

/** Infers a human-readable event label + lucide icon name from the item. */
function getTimelineEventMeta(item: any): { label: string; iconName: string; color: string } {
  if (item?.type === 'stage_change') {
    return { label: 'Stage Change', iconName: 'trending_up', color: 'text-accent bg-accent/10' };
  }
  const content = String(item?.content || '').toLowerCase();
  if (content.startsWith('roof inspection report') || content.includes('smart inspection') || content.includes('inspection report')) {
    return { label: 'Inspection', iconName: 'shield', color: 'text-blue-600 bg-blue-50' };
  }
  if (content.startsWith('work order') || content.includes('work order')) {
    return { label: 'Work Order', iconName: 'wrench', color: 'text-amber-600 bg-amber-50' };
  }
  if (content.includes('estimate signed') || content.includes('signed') || content.includes('document')) {
    return { label: 'Document', iconName: 'file_signature', color: 'text-violet-600 bg-violet-50' };
  }
  if (content.includes('estimate sent') || content.includes('estimate') || content.includes('quote')) {
    return { label: 'Estimate', iconName: 'file_text', color: 'text-teal-600 bg-teal-50' };
  }
  if (content.includes('deposit') || content.includes('payment') || content.includes('paid')) {
    return { label: 'Payment', iconName: '💵', color: 'bg-green-50' };
  }
  if (content.includes('before & after') || content.includes('report saved')) {
    return { label: 'Report', iconName: '📸', color: 'bg-pink-50' };
  }
  if (item?.type === 'call') {
    return { label: 'Call', iconName: 'phone', color: 'text-slate-500 bg-slate-100' };
  }
  if (item?.type === 'sms') {
    return { label: 'SMS', iconName: 'message_square', color: 'text-slate-500 bg-slate-100' };
  }
  return { label: 'Note', iconName: 'file_text', color: 'text-slate-500 bg-slate-100' };
}

const STAGES: CustomerStatus[] = getPipelineStageOrder();

// All valid statuses available in the status dropdown (includes aliases and terminal stages)
const ALL_STATUSES: { value: CustomerStatus; label: string }[] = [
  { value: 'lead', label: 'Lead' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'appointment_set', label: 'Appointment Set' },
  { value: 'inspection_scheduled', label: 'Inspection Scheduled' },
  { value: 'inspected', label: 'Inspection' },
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
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, profile } = useAuth();
  const [activeTab, setActiveTab] = useState(() => normalizeContactTab(searchParams.get('tab')));
  const [contact, setContact] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<any[]>([]);
  const [documentsWithUrls, setDocumentsWithUrls] = useState<any[]>([]);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
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
    if (activeTab === 'documents') fetchDocuments();
    // Always pull fresh contact when the status tab opens — the status may have
    // been updated by handleAutoMove (signing docs, submitting inspection) while
    // the user was on another route, leaving local state stale.
    if (activeTab === 'status') fetchContact();
  }, [activeTab]);

  // Re-sync contact when the app returns to the foreground (e.g. after signing a
  // document which calls handleAutoMove in a different route and then navigating
  // back here while the component was kept alive in the hash-router tree).
  useEffect(() => {
    const handleFocus = () => fetchContact();
    document.addEventListener('visibilitychange', handleFocus);
    return () => document.removeEventListener('visibilitychange', handleFocus);
  }, [id]);

  useEffect(() => {
    const nextTab = normalizeContactTab(searchParams.get('tab'));
    setActiveTab((current) => (current === nextTab ? current : nextTab));
  }, [searchParams]);

  const changeTab = (tabId: string) => {
    const nextTab = normalizeContactTab(tabId);
    setActiveTab(nextTab);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (nextTab === 'overview') {
        next.delete('tab');
      } else {
        next.set('tab', nextTab);
      }
      return next;
    }, { replace: true });
  };

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
      // Optimistic update — reflect the new status instantly so the stage
      // buttons re-render correctly without waiting for the async fetchContact.
      setContact((c: any) => c ? { ...c, status: newStatus, status_changed_at: now } : c);
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
    if (!editForm?.id || isSavingEdit) return;
    const statusChanged = editForm.status !== contact?.status;
    const prevStatus: string = contact?.status ?? '';
    const nextStatus: string = editForm.status ?? '';
    setIsSavingEdit(true);
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
      // Strip any accidental schedule markers from the plain notes before re-serializing
      const rawPlainNotes = String(updates.notes || '').replace(/\[TRUSSCTR_SCHEDULE\]\{[\s\S]*$/, '').trim();
      updates.notes = serializeContactSchedule(parsed.schedule, rawPlainNotes);
      if (statusChanged) {
        updates.status_changed_at = new Date().toISOString();
      }

      // Race the Supabase call against a 15-second timeout so it never hangs forever on iOS
      const updatePromise = (supabase.from('contacts') as any).update(updates).eq('id', editForm.id);
      const timeoutPromise = new Promise<{ error: Error }>((_resolve, reject) =>
        setTimeout(() => reject(new Error('Save timed out — check your connection and try again.')), 15000)
      );
      const { error } = await Promise.race([updatePromise, timeoutPromise]);
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
      alert(err instanceof Error ? err.message : 'Failed to save contact changes.');
    } finally {
      setIsSavingEdit(false);
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
    const files = Array.from(e.target.files || []);
    if (!files.length || !id) return;

    const uploadOne = async (file: File) => {
      const videoError = await validateVideoForCloud(file);
      if (videoError) {
        alert(videoError);
        return false;
      }
      const isImage = file.type.startsWith('image/');
      const uploadFile = isImage
        ? new File(
            [await compressImageWithLightCompressor(file, {
              maxWidth: PHOTO_POLICY_PRESETS.high8mp.width,
              maxHeight: PHOTO_POLICY_PRESETS.high8mp.height,
              quality: PHOTO_POLICY_PRESETS.high8mp.quality,
            })],
            file.name.replace(/\.[^.]+$/, '') + '.jpg',
            { type: 'image/jpeg' }
          )
        : file;
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `${id}/${fileName}`;
      const bucket = isImage ? 'projectceo-photos' : 'documents';
      const { error: uploadError } = await supabase.storage.from(bucket).upload(filePath, uploadFile);
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(filePath);
      const { error: dbError } = await supabase.from('documents').insert({
        contact_id: id,
        company_id: contact.company_id,
        name: file.name,
        type: isImage ? 'photo' : 'document',
        url: buildStoredDocumentUrl(publicUrl, bucket, filePath),
        size: uploadFile.size,
        uploaded_by: user?.id ?? 'unknown',
      } as any);
      if (dbError) throw dbError;
      return true;
    };

    let failed = 0;
    for (let i = 0; i < files.length; i++) {
      try {
        await uploadOne(files[i]);
      } catch (err) {
        failed++;
        console.error(`Error uploading file ${i + 1}/${files.length}:`, err);
      }
    }
    fetchDocuments();
    e.target.value = '';
    if (failed > 0) {
      alert(`${failed} of ${files.length} file(s) failed to upload. The rest were saved.`);
    }
  };

  const uploadContactPhoto = async (file: File) => {
    if (!id || !contact?.company_id) return;

    const uploadFile = new File(
      [await compressImageWithLightCompressor(file, {
        maxWidth: PHOTO_POLICY_PRESETS.high8mp.width,
        maxHeight: PHOTO_POLICY_PRESETS.high8mp.height,
        quality: PHOTO_POLICY_PRESETS.high8mp.quality,
      })],
      file.name.replace(/\.[^.]+$/, '') + '.jpg',
      { type: 'image/jpeg' }
    );

    const fileName = `${Math.random()}.jpg`;
    const filePath = `${id}/${fileName}`;
    const bucket = 'projectceo-photos';
    const { error: uploadError } = await supabase.storage.from(bucket).upload(filePath, uploadFile);
    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(filePath);
    const { error: dbError } = await supabase.from('documents').insert({
      contact_id: id,
      company_id: contact.company_id,
      name: `Contact photo ${new Date().toLocaleDateString()}`,
      type: 'photo',
      url: buildStoredDocumentUrl(publicUrl, bucket, filePath),
      size: uploadFile.size,
      uploaded_by: user?.id ?? 'unknown',
      starred: true,
    } as any);
    if (dbError) throw dbError;
  };

  const handleEditPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadContactPhoto(file);
      await fetchDocuments();
    } catch (err) {
      console.error('Error uploading contact photo:', err);
      alert('Failed to upload contact photo.');
    } finally {
      e.target.value = '';
    }
  };

  const handleDeleteDocument = async (docId: string, storedUrl: string) => {
    try {
      // Parse bucket and path from the stored URL (supports both #hash metadata and plain public URLs)
      const parseBucketAndPath = (url: string): { bucket: string; path: string } | null => {
        try {
          const parsed = new URL(url);
          // Try #bucket=...&path=... hash format first
          const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ''));
          const b = hashParams.get('bucket');
          const p = hashParams.get('path');
          if (b && p) return { bucket: b, path: decodeURIComponent(p.replace(/^\/+/, '').trim()) };
          // Fallback: find bucket name in pathname
          for (const bkt of ['documents', 'projectceo-photos']) {
            const marker = `/object/public/${bkt}/`;
            const idx = parsed.pathname.indexOf(marker);
            if (idx !== -1) return { bucket: bkt, path: decodeURIComponent(parsed.pathname.slice(idx + marker.length).split('?')[0]) };
          }
        } catch { /* ignore */ }
        return null;
      };

      const metadata = parseBucketAndPath(storedUrl);
      if (metadata) {
        await supabase.storage.from(metadata.bucket).remove([metadata.path]);
      }
      await supabase.from('documents').delete().eq('id', docId);
      await fetchDocuments();
    } catch (err) {
      console.error('[handleDeleteDocument]', err);
      alert('Failed to delete. Please try again.');
    }
  };

  const handleLegalUpload = async (label: string, docType: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    try {
      const videoError = await validateVideoForCloud(file);
      if (videoError) {
        alert(videoError);
        e.target.value = '';
        return;
      }

      const isImage = file.type.startsWith('image/');
      const uploadFile = isImage
        ? new File(
            [await compressImageWithLightCompressor(file, {
              maxWidth: PHOTO_POLICY_PRESETS.high8mp.width,
              maxHeight: PHOTO_POLICY_PRESETS.high8mp.height,
              quality: PHOTO_POLICY_PRESETS.high8mp.quality,
            })],
            file.name.replace(/\.[^.]+$/, '') + '.jpg',
            { type: 'image/jpeg' }
          )
        : file;
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `${id}/${fileName}`;
      const bucket = isImage ? 'projectceo-photos' : 'documents';
      const { error: uploadError } = await supabase.storage.from(bucket).upload(filePath, uploadFile);
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(filePath);
      const { error: dbError } = await supabase.from('documents').insert({
        contact_id: id,
        company_id: contact.company_id,
        name: label,
        type: docType as any,
        url: buildStoredDocumentUrl(publicUrl, bucket, filePath),
        size: uploadFile.size,
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

  const coverPhotoUrl = pickCoverPhoto((documentsWithUrls.length ? documentsWithUrls : documents).filter((doc) => doc.type === 'photo'));

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
        <div className="flex items-center gap-4">
          <div className="h-20 w-20 overflow-hidden rounded-3xl border border-white/15 bg-white/10 shadow-lg">
            {coverPhotoUrl ? (
              <img src={coverPhotoUrl} alt={`${contact.first_name} ${contact.last_name}`} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-2xl font-black text-white/85">
                {(contact.first_name?.[0] || '').toUpperCase()}{(contact.last_name?.[0] || '').toUpperCase()}
              </div>
            )}
          </div>
          <div className="space-y-1 min-w-0">
            <h1 className="text-2xl font-bold">{contact.first_name} {contact.last_name}</h1>
            <p className="text-slate-300 text-sm flex items-center gap-1.5"><MapPin size={14} />{contact.address}, {contact.city}</p>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">
              {coverPhotoUrl ? 'Cover photo set' : 'No cover photo'}
            </p>
          </div>
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
          style={{ touchAction: 'pan-x', overscrollBehaviorX: 'contain' }}
        >
        <div className="flex gap-6 min-w-max">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const normalizedContactStatus = normalizePipelineStatus(contact.status);
            const inspectionDone =
              tab.id === 'inspection' &&
              ['inspected', 'estimate_sent', 'approved', 'scheduled', 'in_progress', 'completed'].includes(normalizedContactStatus);
            return (
              <button key={tab.id} onClick={() => changeTab(tab.id)} className={`py-4 flex items-center gap-2 border-b-2 transition-all ${isActive ? 'border-accent text-accent' : 'border-transparent text-slate-400'}`}>
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
            {activeTab === 'status' && <StatusTab contact={contact} onAdvance={advanceStatus} canUndo={profile?.role === 'owner' || profile?.role === 'admin' || profile?.role === 'manager'} />}
            {activeTab === 'timeline' && <TimelineTab timeline={timeline} onRefresh={fetchTimeline} contact={contact} userId={user?.id} companyId={profile?.company_id} />}
            {activeTab === 'documents' && <DocumentsTab contactId={contact.id} companyId={contact.company_id ?? profile?.company_id ?? ''} address={contact.address ?? ''} city={contact.city ?? ''} state={contact.state ?? ''} zip={contact.zip ?? ''} contactName={[contact.first_name, contact.last_name].filter(Boolean).join(' ')} userId={user?.id} documents={documentsWithUrls.length ? documentsWithUrls : documents} onUpload={handleUpload} onLegalUpload={handleLegalUpload} onDocumentSaved={fetchDocuments} onDeleteDocument={handleDeleteDocument} />}
            {activeTab === 'financial' && <FinancialTab contact={contact} userId={user?.id} onEdit={openEdit} onRefresh={fetchContact} canUndo={profile?.role === 'owner' || profile?.role === 'admin' || profile?.role === 'manager'} />}
            {activeTab === 'financing' && <FinancingTab contact={contact} userId={user?.id} companyId={contact.company_id ?? profile?.company_id ?? ''} onRefresh={fetchContact} />}
            {activeTab === 'insurance' && <InsuranceTab contact={contact} />}
          </motion.div>
        </AnimatePresence>
      </div>

      {isEditing && editForm && (
        <div className="fixed inset-0 z-50 bg-white">
          <div className="flex h-full flex-col">
            <div
              className="border-b border-slate-100 bg-white px-5 pb-4 pt-3"
              style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <button onClick={() => setIsEditing(false)} className="rounded-full bg-slate-100 px-4 py-2 text-sm font-bold text-slate-600">
                  Cancel
                </button>
                <h3 className="text-lg font-bold text-primary">Edit Customer</h3>
                <div className="w-[76px]" />
              </div>

              <div className="flex items-center gap-4">
                <label className="relative block h-20 w-20 cursor-pointer overflow-hidden rounded-3xl bg-slate-100 shadow-sm">
                  {coverPhotoUrl ? (
                    <img src={coverPhotoUrl} alt="Contact cover" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-primary text-2xl font-black text-white">
                      {(contact.first_name?.[0] || '').toUpperCase()}{(contact.last_name?.[0] || '').toUpperCase()}
                    </div>
                  )}
                  <div className="absolute bottom-1 right-1 flex h-7 w-7 items-center justify-center rounded-full bg-accent text-white shadow-lg">
                    <Camera size={14} />
                  </div>
                  <input type="file" className="hidden" accept="image/*" onChange={handleEditPhotoUpload} />
                </label>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-primary">Tap to update contact photo</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Upload a customer photo or a photo of the home. Favorited photos become the cover photo in the contact list.
                  </p>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 px-5 py-5">
              <div className="space-y-6 pb-10">
                <div className="grid grid-cols-2 gap-3">
                  <input className="bg-white rounded-xl p-3 text-sm" placeholder="First name" value={editForm.first_name || ''} onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })} />
                  <input className="bg-white rounded-xl p-3 text-sm" placeholder="Last name" value={editForm.last_name || ''} onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })} />
                </div>
                <input className="w-full bg-white rounded-xl p-3 text-sm" placeholder="Email" value={editForm.email || ''} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
                <div className="grid grid-cols-2 gap-3">
                  <input className="bg-white rounded-xl p-3 text-sm" placeholder="Primary phone" value={editForm.phone1 || ''} onChange={(e) => setEditForm({ ...editForm, phone1: e.target.value })} />
                  <input className="bg-white rounded-xl p-3 text-sm" placeholder="Secondary phone" value={editForm.phone2 || ''} onChange={(e) => setEditForm({ ...editForm, phone2: e.target.value })} />
                </div>
                <input className="w-full bg-white rounded-xl p-3 text-sm" placeholder="Address" value={editForm.address || ''} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} />
                <div className="grid grid-cols-3 gap-3">
                  <input className="bg-white rounded-xl p-3 text-sm" placeholder="City" value={editForm.city || ''} onChange={(e) => setEditForm({ ...editForm, city: e.target.value })} />
                  <input className="bg-white rounded-xl p-3 text-sm" placeholder="State" value={editForm.state || ''} onChange={(e) => setEditForm({ ...editForm, state: e.target.value })} />
                  <input className="bg-white rounded-xl p-3 text-sm" placeholder="Zip" value={editForm.zip || ''} onChange={(e) => setEditForm({ ...editForm, zip: e.target.value })} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <input className="bg-white rounded-xl p-3 text-sm" placeholder="Lead source" value={editForm.lead_source || ''} onChange={(e) => setEditForm({ ...editForm, lead_source: e.target.value })} />
                  <input className="bg-white rounded-xl p-3 text-sm" placeholder="Project type" value={editForm.project_type || ''} onChange={(e) => setEditForm({ ...editForm, project_type: e.target.value })} />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase">Status</label>
                  <select className="mt-1 w-full bg-white rounded-xl p-3 text-sm" value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
                    {ALL_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <input className="bg-white rounded-xl p-3 text-sm" placeholder="Project value" value={editForm.project_value ?? ''} onChange={(e) => setEditForm({ ...editForm, project_value: e.target.value })} />
                  <input className="bg-white rounded-xl p-3 text-sm" placeholder="Deposit amount" value={editForm.deposit_amount ?? ''} onChange={(e) => setEditForm({ ...editForm, deposit_amount: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input className="bg-white rounded-xl p-3 text-sm" placeholder="Final payment amount" value={editForm.final_payment_amount ?? ''} onChange={(e) => setEditForm({ ...editForm, final_payment_amount: e.target.value })} />
                  <input className="bg-white rounded-xl p-3 text-sm" placeholder="Deductible" value={editForm.deductible ?? ''} onChange={(e) => setEditForm({ ...editForm, deductible: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex items-center gap-2 rounded-xl bg-white p-3 text-sm">
                    <input type="checkbox" checked={!!editForm.deposit_paid} onChange={(e) => setEditForm({ ...editForm, deposit_paid: e.target.checked })} />
                    Deposit Paid
                  </label>
                  <label className="flex items-center gap-2 rounded-xl bg-white p-3 text-sm">
                    <input type="checkbox" checked={!!editForm.final_payment_paid} onChange={(e) => setEditForm({ ...editForm, final_payment_paid: e.target.checked })} />
                    Final Paid
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <input className="bg-white rounded-xl p-3 text-sm" placeholder="Insurance company" value={editForm.insurance_company || ''} onChange={(e) => setEditForm({ ...editForm, insurance_company: e.target.value })} />
                  <input className="bg-white rounded-xl p-3 text-sm" placeholder="Policy number" value={editForm.policy_number || ''} onChange={(e) => setEditForm({ ...editForm, policy_number: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input className="bg-white rounded-xl p-3 text-sm" placeholder="Claim number" value={editForm.claim_number || ''} onChange={(e) => setEditForm({ ...editForm, claim_number: e.target.value })} />
                  <input className="bg-white rounded-xl p-3 text-sm" placeholder="Adjuster name" value={editForm.adjuster_name || ''} onChange={(e) => setEditForm({ ...editForm, adjuster_name: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input className="bg-white rounded-xl p-3 text-sm" placeholder="Adjuster phone" value={editForm.adjuster_phone || ''} onChange={(e) => setEditForm({ ...editForm, adjuster_phone: e.target.value })} />
                  <input className="bg-white rounded-xl p-3 text-sm" placeholder="Adjuster email" value={editForm.adjuster_email || ''} onChange={(e) => setEditForm({ ...editForm, adjuster_email: e.target.value })} />
                </div>

                <label className="flex items-center gap-2 rounded-xl bg-white p-3 text-sm">
                  <input type="checkbox" checked={!!editForm.is_retail} onChange={(e) => setEditForm({ ...editForm, is_retail: e.target.checked })} />
                  Retail Job
                </label>
                <textarea className="w-full bg-white rounded-xl p-3 text-sm" placeholder="Retail notes" value={editForm.retail_notes || ''} onChange={(e) => setEditForm({ ...editForm, retail_notes: e.target.value })} />
                <textarea className="w-full bg-white rounded-xl p-3 text-sm" placeholder="Notes" value={editForm.notes || ''} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
              </div>
            </div>

            <div
              className="border-t border-slate-100 bg-white px-5 pb-4 pt-4"
              style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
            >
              <button onClick={saveEdit} disabled={isSavingEdit} className="w-full bg-primary text-white py-4 rounded-2xl text-sm font-bold disabled:opacity-60 flex items-center justify-center gap-2">
                {isSavingEdit && <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />}
                {isSavingEdit ? 'Saving...' : 'Save Changes'}
              </button>
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
                <button onClick={() => { setShowActions(false); changeTab('documents'); }} className="w-full bg-slate-50 py-3 rounded-xl text-sm font-bold">Legal Documents</button>
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
  const [scheduleSyncError, setScheduleSyncError] = useState<string | null>(null);
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
      setScheduleSyncError(null);
    } catch (err) {
      console.error('Error syncing customer schedule:', err);
      const message = err instanceof Error ? err.message : 'Unknown error';
      setScheduleSyncError(`Schedule sync failed. ${message}`);
    } finally {
      setSyncingSchedule(false);
    }
  };

  useEffect(() => {
    if (!contact?.id) return;

    const reachedStatuses = getReachedPipelineStatuses(contact.status);

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
  const normalizedStatus = normalizePipelineStatus(contact.status);
  const boardStatus = toPipelineBoardStage(contact.status);
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
      case 'paid':
        return {
          route: `/contacts/${id}?tab=financial`,
          icon: DollarSign,
          cta: 'Review Final Ledger',
          detail: 'Confirm final payment and close out any remaining balance details.',
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

  const nextStepAction = getNextStepAction(normalizedStatus);
  const NextStepIcon = nextStepAction.icon;
  const currentProgressIndex = STAGES.indexOf(boardStatus);

  return (
    <div className="space-y-6">
      <div className="card p-5 space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Current Status</h3>
          <span className="bg-accent/10 text-accent text-[10px] font-bold px-2 py-1 rounded-md uppercase">
            {currentStageLabel}
          </span>
        </div>
        <div className="flex gap-1">
          {STAGES.map((stage, i) => {
            return <div key={stage} className={`h-1.5 flex-1 rounded-full ${i <= currentProgressIndex ? 'bg-accent' : 'bg-slate-100'}`} />;
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
          {scheduleSyncError && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-red-600">Sync Error</p>
              <p className="mt-1 text-xs text-red-700">{scheduleSyncError}</p>
            </div>
          )}
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
        <WeatherCard contact={contact} />
        <button
          type="button"
          onClick={() => navigate(`/contacts/${contact.id}/tools`)}
          className="card p-5 w-full text-left flex items-center justify-between active:scale-[0.98] transition-transform"
        >
          <div className="flex items-center gap-4">
            <div className="h-11 w-11 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Wrench size={20} className="text-primary" />
            </div>
            <div>
              <p className="text-sm font-bold text-primary">Field Tools</p>
              <p className="text-[11px] text-slate-400 font-medium">Work orders, estimates, crew & more</p>
            </div>
          </div>
          <ChevronRight size={18} className="text-slate-300" />
        </button>
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

// WMO weather interpretation codes → label + emoji
const WMO_LABELS: Record<number, { label: string; icon: string }> = {
  0:  { label: 'Clear Sky',           icon: '☀️'  },
  1:  { label: 'Mainly Clear',        icon: '🌤️'  },
  2:  { label: 'Partly Cloudy',       icon: '⛅'  },
  3:  { label: 'Overcast',            icon: '☁️'  },
  45: { label: 'Foggy',               icon: '🌫️'  },
  48: { label: 'Icy Fog',             icon: '🌫️'  },
  51: { label: 'Light Drizzle',       icon: '🌦️'  },
  53: { label: 'Drizzle',             icon: '🌦️'  },
  55: { label: 'Heavy Drizzle',       icon: '🌧️'  },
  61: { label: 'Light Rain',          icon: '🌧️'  },
  63: { label: 'Rain',                icon: '🌧️'  },
  65: { label: 'Heavy Rain',          icon: '🌧️'  },
  71: { label: 'Light Snow',          icon: '🌨️'  },
  73: { label: 'Snow',                icon: '❄️'  },
  75: { label: 'Heavy Snow',          icon: '❄️'  },
  77: { label: 'Snow Grains',         icon: '🌨️'  },
  80: { label: 'Light Showers',       icon: '🌦️'  },
  81: { label: 'Showers',             icon: '🌧️'  },
  82: { label: 'Heavy Showers',       icon: '⛈️'  },
  85: { label: 'Snow Showers',        icon: '🌨️'  },
  86: { label: 'Heavy Snow Showers',  icon: '❄️'  },
  95: { label: 'Thunderstorm',        icon: '⛈️'  },
  96: { label: 'Thunderstorm w/ Hail',icon: '⛈️'  },
  99: { label: 'Severe Thunderstorm', icon: '🌩️'  },
};

function wmoLabel(code: number): string {
  return WMO_LABELS[code]?.label ?? 'Unknown';
}
function wmoIcon(code: number): string {
  return WMO_LABELS[code]?.icon ?? '🌡️';
}

function WeatherCard({ contact }: { contact: any }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [weather, setWeather] = useState<{
    city: string;
    tempF: number;
    windMph: number;
    precipChance: number;
    code: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchWithTimeout = async (url: string, ms = 10000): Promise<Response> => {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), ms);
      try {
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(tid);
        return res;
      } catch (e) {
        clearTimeout(tid);
        throw e;
      }
    };

    const loadWeather = async () => {
      // Open-Meteo geocoding works best with a plain city name.
      // Using ZIP alone or comma-separated addresses often returns no results.
      const city = contact?.city?.trim();
      const state = contact?.state?.trim();
      if (!city) {
        setError('Add a city to view weather.');
        return;
      }

      setLoading(true);
      setError(null);
      try {
        // "Columbus OH" (space-separated, no comma) gives better results than "Columbus, OH"
        const cityQuery = encodeURIComponent(state ? `${city} ${state}` : city);
        // countryCode=US narrows results for US addresses; ignored for non-US contacts
        const isUsState = state && state.length === 2 && /^[A-Za-z]{2}$/.test(state);
        const countryParam = isUsState ? '&countryCode=US' : '';
        const geoRes = await fetchWithTimeout(
          `https://geocoding-api.open-meteo.com/v1/search?name=${cityQuery}&count=1&language=en&format=json${countryParam}`
        );
        if (!geoRes.ok) throw new Error(`Geocoding failed (${geoRes.status})`);
        const geoJson = await geoRes.json();
        let first = geoJson?.results?.[0];

        // Fallback: try city-only if city+state returned nothing
        if (!first && state) {
          const fallbackRes = await fetchWithTimeout(
            `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json${countryParam}`
          );
          if (fallbackRes.ok) {
            const fallbackJson = await fallbackRes.json();
            first = fallbackJson?.results?.[0];
          }
        }

        if (!first) throw new Error('Location not found — check city name');

        const weatherRes = await fetchWithTimeout(
          `https://api.open-meteo.com/v1/forecast?latitude=${first.latitude}&longitude=${first.longitude}&current=temperature_2m,wind_speed_10m,weather_code&hourly=precipitation_probability&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&forecast_days=1`
        );
        if (!weatherRes.ok) throw new Error(`Weather fetch failed (${weatherRes.status})`);
        const weatherJson = await weatherRes.json();
        const current = weatherJson?.current;
        const precip = Array.isArray(weatherJson?.hourly?.precipitation_probability)
          ? Math.max(0, ...(weatherJson.hourly.precipitation_probability as number[]).slice(0, 8))
          : 0;

        if (!cancelled) {
          setWeather({
            city: [first.name, first.admin1].filter(Boolean).join(', ') || city,
            tempF: Number(current?.temperature_2m ?? 0),
            windMph: Number(current?.wind_speed_10m ?? 0),
            code: Number(current?.weather_code ?? 0),
            precipChance: Number(precip ?? 0),
          });
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Unable to load weather';
          setError(msg.includes('abort') ? 'Weather request timed out — check connection.' : msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadWeather();
    return () => {
      cancelled = true;
    };
  }, [contact?.city, contact?.state]);

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Jobsite Weather</h3>
        <CloudSun size={16} className="text-accent" />
      </div>
      {loading && <p className="text-sm text-slate-500">Loading weather...</p>}
      {!loading && error && <p className="text-sm text-amber-600">{error}</p>}
      {!loading && !error && weather && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-[10px] font-bold uppercase text-slate-400">Location</p>
            <p className="text-sm font-bold text-primary">{weather.city}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-[10px] font-bold uppercase text-slate-400">Conditions</p>
            <p className="text-sm font-bold text-primary">{wmoIcon(weather.code)} {wmoLabel(weather.code)}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-[10px] font-bold uppercase text-slate-400">Temp</p>
            <p className="text-sm font-bold text-primary">{Math.round(weather.tempF)}°F</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-[10px] font-bold uppercase text-slate-400">Wind</p>
            <p className="text-sm font-bold text-primary">{Math.round(weather.windMph)} mph</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3 col-span-2">
            <p className="text-[10px] font-bold uppercase text-slate-400">Precip Chance (Next Hours)</p>
            <p className="text-sm font-bold text-primary">{Math.round(weather.precipChance)}%</p>
          </div>
        </div>
      )}
    </div>
  );
}

function InspectionTab({ contact, userId, onDocumentsChanged }: { contact: any; userId?: string; onDocumentsChanged?: () => void }) {
  const navigate = useNavigate();
  const usesNativeInspectionCamera = Capacitor.isNativePlatform();
  const isIosInspectionCapture = Capacitor.getPlatform() === 'ios';
  const cameraFallbackInputRef = React.useRef<HTMLInputElement | null>(null);
  const inlineVideoRef = React.useRef<HTMLVideoElement | null>(null);
  const inlineCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const inlineStreamRef = React.useRef<MediaStream | null>(null);
  const pendingCaptureBlobsRef = React.useRef<Blob[]>([]);
  const DRAFT_KEY = `trussctr_inspection_draft_${contact.id}`;

  // Load any saved draft from localStorage as the initial state
  const loadDraft = () => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  };
  const savedDraft = React.useMemo(loadDraft, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [step, setStep] = useState<'questions' | 'photos' | 'report'>(savedDraft?.step ?? 'questions');
  const [checklist, setChecklist] = useState(savedDraft?.checklist ?? { roofAge: '', material: '', damageTypes: [] as string[], leaks: false });
  const [saving, setSaving] = useState(false);
  const [pitch, setPitch] = useState(savedDraft?.pitch ?? { rise: 4, run: 12 });
  const [footprintArea, setFootprintArea] = useState<number | ''>(savedDraft?.footprintArea ?? '');
  const [roofLength, setRoofLength] = useState<number | ''>(savedDraft?.roofLength ?? '');
  const [roofWidth, setRoofWidth] = useState<number | ''>(savedDraft?.roofWidth ?? '');
  const [overhangFt, setOverhangFt] = useState<number | ''>(savedDraft?.overhangFt ?? '');
  const [inspectionSection, setInspectionSection] = useState<'exterior' | 'detached' | 'interior'>(savedDraft?.inspectionSection ?? 'exterior');
  const [activeElevation, setActiveElevation] = useState<string>(savedDraft?.activeElevation ?? 'Front');
  const [customRoom, setCustomRoom] = useState<string>(savedDraft?.customRoom ?? '');
  const [photos, setPhotos] = useState<{ url: string; displayUrl: string; note: string; elevation: string; size: number }[]>(savedDraft?.photos ?? []);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');
  const [inlineCameraOpen, setInlineCameraOpen] = useState(false);
  const [inlineCaptureCount, setInlineCaptureCount] = useState(0);
  const [markupIndex, setMarkupIndex] = useState<number | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  // Synchronous guard — prevents "Lock was stolen by another request" when
  // the user taps the camera button twice before the async state update re-renders.
  const cameraOpenRef = React.useRef(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [lastPoint, setLastPoint] = useState<{ x: number; y: number } | null>(null);
  const [completedInspection, setCompletedInspection] = useState<any>(null);
  const [confirmDeleteIndex, setConfirmDeleteIndex] = useState<number | null>(null);
  const [replacingIndex, setReplacingIndex] = useState<number | null>(null);
  const hasDraft = !!(savedDraft && (
    savedDraft.step !== 'questions' ||
    savedDraft.checklist?.material ||
    savedDraft.checklist?.roofAge ||
    (savedDraft.checklist?.damageTypes?.length ?? 0) > 0 ||
    (savedDraft.photos?.length ?? 0) > 0 ||
    savedDraft.pitch?.rise !== 4
  ));

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

  const withLockRetry = async <T,>(fn: () => Promise<T>, retries = 2, delayMs = 250): Promise<T> => {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes('Lock was stolen') || attempt === retries) {
          throw error;
        }
        await new Promise((resolve) => window.setTimeout(resolve, delayMs * (attempt + 1)));
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  };

  const withTimeout = async <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
    let timeoutId: number | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = window.setTimeout(() => {
        reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`));
      }, ms);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    }
  };

  const ensureInspectionSession = async () => {
    const { data, error } = await withTimeout(supabase.auth.getSession(), 8000, 'Session check');
    if (error) throw error;
    if (!data.session) {
      throw new Error('No active session. Please sign in again.');
    }
    return data.session;
  };

  const stopInlineCamera = () => {
    inlineStreamRef.current?.getTracks().forEach((track) => track.stop());
    inlineStreamRef.current = null;
    if (inlineVideoRef.current) {
      inlineVideoRef.current.srcObject = null;
    }
    pendingCaptureBlobsRef.current = [];
    setInlineCaptureCount(0);
    setInlineCameraOpen(false);
  };

  const attachInlineStream = async (stream: MediaStream) => {
    const video = inlineVideoRef.current;
    if (!video) return;

    video.srcObject = stream;
    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;

    await new Promise<void>((resolve) => {
      if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
        resolve();
        return;
      }

      const handleLoadedMetadata = () => {
        video.removeEventListener('loadedmetadata', handleLoadedMetadata);
        resolve();
      };

      video.addEventListener('loadedmetadata', handleLoadedMetadata);
    });

    await video.play().catch(() => undefined);
  };

  const startInlineCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      cameraFallbackInputRef.current?.click();
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    });

    inlineStreamRef.current = stream;
    pendingCaptureBlobsRef.current = [];
    setInlineCaptureCount(0);
    setInlineCameraOpen(true);
    window.requestAnimationFrame(() => {
      void attachInlineStream(stream);
    });
  };

  const captureInlineFrame = async () => {
    const video = inlineVideoRef.current;
    const canvas = inlineCanvasRef.current;
    if (!video || !canvas) return;

    const width = video.videoWidth || 1920;
    const height = video.videoHeight || 1080;
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) return;
    context.drawImage(video, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.9);
    });
    if (!blob) return;

    pendingCaptureBlobsRef.current = [...pendingCaptureBlobsRef.current, blob];
    setInlineCaptureCount(pendingCaptureBlobsRef.current.length);
  };

  const finishInlineCamera = async () => {
    const capturedBlobs = [...pendingCaptureBlobsRef.current];
    stopInlineCamera();

    if (!capturedBlobs.length) {
      return;
    }

    setUploading(true);
    try {
      let failed = 0;
      for (const [index, rawBlob] of capturedBlobs.entries()) {
        try {
          setUploadMessage(`Compressing photo ${index + 1} of ${capturedBlobs.length}...`);
          const blob = await compressImageWithLightCompressor(rawBlob, {
            maxWidth: PHOTO_POLICY_PRESETS.standard3mp.width,
            maxHeight: PHOTO_POLICY_PRESETS.standard3mp.height,
            quality: PHOTO_POLICY_PRESETS.standard3mp.quality,
          }).catch(() => rawBlob);
          setUploadMessage(`Uploading photo ${index + 1} of ${capturedBlobs.length}...`);
          await uploadInspectionBlob(blob, `capture_${Date.now()}_${index + 1}.jpg`);
        } catch (err) {
          failed += 1;
          console.error(`Inline camera upload ${index + 1} failed:`, err);
        }
      }

      if (failed > 0) {
        alert(`${failed} of ${capturedBlobs.length} photo(s) failed to upload. The rest were saved.`);
      }
    } finally {
      setUploading(false);
      setUploadMessage('');
    }
  };

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

  // Auto-save inspection draft to localStorage whenever form state changes.
  // Only persists while the inspection is in-progress (not the report view).
  useEffect(() => {
    if (step === 'report') return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        step, checklist, pitch, footprintArea, roofLength, roofWidth, overhangFt,
        inspectionSection, activeElevation, customRoom, photos,
      }));
    } catch { /* localStorage unavailable */ }
  }, [step, checklist, pitch, footprintArea, roofLength, roofWidth, overhangFt, inspectionSection, activeElevation, customRoom, photos]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearDraft = () => { try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ } };

  useEffect(() => () => {
    inlineStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  useEffect(() => {
    if (!inlineCameraOpen || !inlineStreamRef.current) return;
    void attachInlineStream(inlineStreamRef.current);
  }, [inlineCameraOpen]);

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
      clearDraft();
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
    setUploadMessage('Checking session...');
    await ensureInspectionSession();

    const ext = (originalName?.split('.').pop() || blob.type.split('/').pop() || 'jpg').toLowerCase();
    const elevation = activeElevation === 'Custom' ? (customRoom.trim() || 'Custom') : activeElevation;
    const fileName = `${elevation}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const filePath = `${contact.id}/${fileName}`;
    const uploadBytes = await blob.arrayBuffer();

    setUploadMessage('Sending photo to cloud...');
    const { error: uploadError } = await withTimeout(withLockRetry(() =>
      supabase.storage
        .from('projectceo-photos')
        .upload(filePath, uploadBytes, { contentType: blob.type || 'image/jpeg' })
    ), 30000, 'Photo upload');
    if (uploadError) throw uploadError;
    const { data: { publicUrl } } = supabase.storage.from('projectceo-photos').getPublicUrl(filePath);
    const displayUrl = URL.createObjectURL(blob);

    setUploadMessage('Saving photo record...');
    const { error: dbError } = await withTimeout(withLockRetry(async () => (
      await supabase.from('documents').insert({
        contact_id: contact.id,
        company_id: contact.company_id,
        name: `${elevation} Inspection Photo`,
        type: 'photo',
        url: publicUrl,
        size: blob.size,
        uploaded_by: userId,
      } as any)
    )), 15000, 'Photo record save');
    if (dbError) throw dbError;
    setPhotos((prev) => [{ url: publicUrl, displayUrl, note: '', elevation, size: blob.size }, ...prev]);
    onDocumentsChanged?.();
  };

  // Extract Supabase storage path from a public URL
  const extractStoragePath = (publicUrl: string): string | null => {
    const marker = '/object/public/projectceo-photos/';
    const idx = publicUrl.indexOf(marker);
    if (idx === -1) return null;
    return decodeURIComponent(publicUrl.slice(idx + marker.length).split('?')[0]);
  };

  const deleteInspectionPhoto = async (index: number) => {
    const photo = photos[index];
    // Optimistically remove from UI immediately
    setPhotos((prev) => prev.filter((_, i) => i !== index));
    setConfirmDeleteIndex(null);
    try {
      const path = extractStoragePath(photo.url);
      if (path) {
        await supabase.storage.from('projectceo-photos').remove([path]);
      }
      await supabase.from('documents').delete().eq('url', photo.url);
      onDocumentsChanged?.();
    } catch (err) {
      console.error('[deleteInspectionPhoto]', err);
      // Silent fail — photo is already removed from local state
    }
  };

  const replaceInspectionPhoto = async (index: number, file: File) => {
    const old = photos[index];
    setReplacingIndex(index);
    try {
      await ensureInspectionSession();
      const rawExt = (file.name.split('.').pop() || file.type.split('/').pop() || 'jpg').toLowerCase();
      const ext = rawExt === 'heic' || rawExt === 'heif' ? 'jpg' : rawExt;
      const elevation = old.elevation;
      const fileName = `${elevation}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const filePath = `${contact!.id}/${fileName}`;
      const uploadBytes = await file.arrayBuffer();

      const { error: uploadError } = await supabase.storage
        .from('projectceo-photos')
        .upload(filePath, uploadBytes, { contentType: file.type || 'image/jpeg' });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('projectceo-photos').getPublicUrl(filePath);
      const displayUrl = URL.createObjectURL(file);

      // Save new document record
      await supabase.from('documents').insert({
        contact_id: contact!.id,
        company_id: contact!.company_id,
        name: `${elevation} Inspection Photo`,
        type: 'photo',
        url: publicUrl,
        size: file.size,
        uploaded_by: userId,
      } as any);

      // Remove old storage file + document record (best-effort)
      try {
        const oldPath = extractStoragePath(old.url);
        if (oldPath) await supabase.storage.from('projectceo-photos').remove([oldPath]);
        await supabase.from('documents').delete().eq('url', old.url);
      } catch { /* ignore cleanup failures */ }

      // Swap in-place
      setPhotos((prev) => {
        const next = [...prev];
        next[index] = { url: publicUrl, displayUrl, note: old.note, elevation, size: file.size };
        return next;
      });
      onDocumentsChanged?.();
    } catch (err) {
      console.error('[replaceInspectionPhoto]', err);
      alert('Replace failed. Please try again.');
    } finally {
      setReplacingIndex(null);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length || !contact?.id || !userId) return;
    setUploading(true);
    let failed = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setUploadMessage(`Uploading photo ${i + 1} of ${files.length}...`);
      try {
        const compressed = file.type.startsWith('image/')
          ? await compressImageWithLightCompressor(file, {
              maxWidth: PHOTO_POLICY_PRESETS.high8mp.width,
              maxHeight: PHOTO_POLICY_PRESETS.high8mp.height,
              quality: PHOTO_POLICY_PRESETS.high8mp.quality,
            })
          : file;
        await uploadInspectionBlob(compressed, file.name);
      } catch (err) {
        failed += 1;
        console.error(`Photo upload error (${i + 1}/${files.length}):`, err);
      }
    }
    if (failed > 0) {
      const message = `${failed} of ${files.length} photo(s) failed to upload. The rest were saved.`;
      alert(message);
    }
    setUploading(false);
    setUploadMessage('');
    e.target.value = '';
  };

  const capturePhoto = async () => {
    if (!contact?.id || !userId) return;
    try {
      await startInlineCamera();
    } catch (err) {
      console.error('Inline camera error:', err);
      cameraFallbackInputRef.current?.click();
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
      // Move to canonical inspected status. If DB enum is older, fall back to legacy aliases.
      const now = new Date().toISOString();
      const { error: statusError } = await (supabase.from('contacts') as any)
        .update({ status: 'inspected', status_changed_at: now })
        .eq('id', contact.id);
      if (statusError) {
        console.error('completeInspection: inspected status failed, trying legacy fallback:', statusError);
        const fallbackCandidates = ['inspection_complete', 'inspection_completed', 'inspection_scheduled'];
        for (const fallbackStatus of fallbackCandidates) {
          const { error: fallbackError } = await (supabase.from('contacts') as any)
            .update({ status: fallbackStatus, status_changed_at: now })
            .eq('id', contact.id);
          if (!fallbackError) break;
          console.error(`completeInspection: ${fallbackStatus} fallback failed:`, fallbackError);
        }
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
      onDocumentsChanged?.();
      clearDraft();
      alert('Inspection completed and saved to timeline!');
      setStep('report');
    } catch (err) {
      console.error('Error completing inspection:', err);
      alert('Failed to complete inspection.');
    } finally {
      setSaving(false);
    }
  };

  const quickMarkComplete = async () => {
    if (!userId) return;
    setSaving(true);
    try {
      const timeout = <T,>(p: Promise<T>): Promise<T> =>
        Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Timed out')), 15000))]);

      const { error: commError } = await timeout<any>(
        supabase.from('communications').insert({
          contact_id: contact.id,
          company_id: contact.company_id,
          type: 'note',
          content: '✅ Inspection marked complete.',
          user_id: userId,
          direction: 'outbound',
        } as any) as any
      );
      if (commError) throw commError;

      const now = new Date().toISOString();
      const { error: statusError } = await timeout<any>(
        (supabase.from('contacts') as any)
          .update({ status: 'inspected', status_changed_at: now })
          .eq('id', contact.id)
      );
      if (statusError) throw statusError;

      onDocumentsChanged?.();
      clearDraft();
      alert('Inspection marked complete!');
    } catch (err) {
      console.error('quickMarkComplete error:', err);
      alert(err instanceof Error ? err.message : 'Failed to mark inspection complete.');
    } finally {
      setSaving(false);
    }
  };

  // Statuses that mean the inspection was already completed (regardless of which flow was used)
  const INSPECTION_DONE_STATUSES = ['inspected', 'inspection_complete', 'estimate_sent', 'approved', 'signed_won', 'scheduled', 'in_progress', 'completed', 'paid'];
  const isInspectionDone = INSPECTION_DONE_STATUSES.includes(contact.status);

  return (
    <div className="space-y-6">
      {/* ── Inspection Complete Banner ── shown whenever status indicates done */}
      {isInspectionDone ? (
        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center">
              <CheckCircle2 size={16} className="text-emerald-600" />
            </div>
            <div>
              <p className="text-xs font-bold text-emerald-700 uppercase">Inspection Complete</p>
              <p className="text-[10px] text-emerald-600">Status has been updated on this contact.</p>
            </div>
          </div>
          {completedInspection?.data && (
            <button
              onClick={() => { loadInspectionData(completedInspection.data); setStep('report'); }}
              className="text-xs font-bold text-emerald-700 shrink-0"
            >
              View
            </button>
          )}
        </div>
      ) : (
        /* ── Quick "Mark Complete" button — visible before the form is filled ── */
        <button
          onClick={quickMarkComplete}
          disabled={saving}
          className="w-full bg-emerald-600 text-white font-black py-4 rounded-2xl shadow-lg flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50"
        >
          <CheckCircle2 size={20} />
          {saving ? 'Marking Complete...' : 'Mark Inspection Complete'}
        </button>
      )}
      {/* ── Draft Restored Banner ── */}
      {hasDraft && !isInspectionDone && (
        <div className="bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">📋</span>
            <div>
              <p className="text-xs font-bold text-blue-700 uppercase">Draft Restored</p>
              <p className="text-[10px] text-blue-600">Your previous inspection progress has been reloaded.</p>
            </div>
          </div>
          <button
            onClick={() => { clearDraft(); window.location.reload(); }}
            className="text-[10px] font-bold text-blue-500 underline shrink-0 ml-2"
          >
            Start fresh
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
          <div className="text-[10px] text-slate-500">Select a location, then add as many photos as needed.</div>

          {/* Section tabs */}
          <div className="flex gap-2">
            {(['exterior', 'detached', 'interior'] as const).map((s) => (
              <button
                key={s}
                onClick={() => {
                  setInspectionSection(s);
                  if (s === 'exterior') setActiveElevation('Front');
                  else if (s === 'detached') setActiveElevation('Det. Front');
                  else setActiveElevation('Bedroom');
                }}
                className={`flex-1 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wide border transition-all ${inspectionSection === s ? 'bg-accent text-white border-accent' : 'bg-white border-slate-100 text-slate-500'}`}
              >
                {s === 'exterior' ? 'Exterior' : s === 'detached' ? 'Detached' : 'Interior'}
              </button>
            ))}
          </div>

          {/* Exterior directions */}
          {inspectionSection === 'exterior' && (
            <div className="grid grid-cols-2 gap-2">
              {(['Front', 'Back', 'Left', 'Right'] as const).map((dir) => (
                <button key={dir} onClick={() => setActiveElevation(dir)} className={`py-2 rounded-lg text-xs font-bold border transition-all ${activeElevation === dir ? 'bg-accent text-white border-accent' : 'bg-white border-slate-100 text-slate-600'}`}>
                  {dir}
                  <span className="ml-1 text-[10px] opacity-70">({photos.filter(p => p.elevation === dir).length})</span>
                </button>
              ))}
            </div>
          )}

          {/* Detached directions */}
          {inspectionSection === 'detached' && (
            <div className="grid grid-cols-2 gap-2">
              {(['Det. Front', 'Det. Back', 'Det. Left', 'Det. Right'] as const).map((dir) => (
                <button key={dir} onClick={() => setActiveElevation(dir)} className={`py-2 rounded-lg text-xs font-bold border transition-all ${activeElevation === dir ? 'bg-accent text-white border-accent' : 'bg-white border-slate-100 text-slate-600'}`}>
                  {dir}
                  <span className="ml-1 text-[10px] opacity-70">({photos.filter(p => p.elevation === dir).length})</span>
                </button>
              ))}
            </div>
          )}

          {/* Interior rooms */}
          {inspectionSection === 'interior' && (
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                {(['Bedroom', 'Bathroom', 'Kitchen', 'Living Room', 'Dining Room', 'Attic'] as const).map((room) => (
                  <button key={room} onClick={() => setActiveElevation(room)} className={`py-2 rounded-lg text-xs font-bold border transition-all ${activeElevation === room ? 'bg-accent text-white border-accent' : 'bg-white border-slate-100 text-slate-600'}`}>
                    {room}
                    <span className="ml-1 text-[10px] opacity-70">({photos.filter(p => p.elevation === room).length})</span>
                  </button>
                ))}
                <button onClick={() => setActiveElevation('Custom')} className={`py-2 rounded-lg text-xs font-bold border transition-all ${activeElevation === 'Custom' ? 'bg-accent text-white border-accent' : 'bg-white border-slate-100 text-slate-600'}`}>
                  + Custom
                  {customRoom.trim() && <span className="ml-1 text-[10px] opacity-70">({photos.filter(p => p.elevation === customRoom.trim()).length})</span>}
                </button>
              </div>
              {activeElevation === 'Custom' && (
                <input
                  type="text"
                  placeholder="Enter room name…"
                  value={customRoom}
                  onChange={(e) => setCustomRoom(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-accent"
                  autoFocus
                />
              )}
            </div>
          )}
          {usesNativeInspectionCamera ? (
            <button
              type="button"
              onClick={capturePhoto}
              disabled={uploading}
              className="aspect-[4/3] w-full bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center gap-3 text-slate-400 active:bg-slate-100 transition-colors disabled:opacity-60"
            >
              <span className="text-sm font-bold text-slate-500">
                {uploading ? uploadMessage || 'Uploading...' : `Tap to capture ${activeElevation === 'Custom' ? (customRoom.trim() || 'Custom') : activeElevation} photos`}
              </span>
              <span className="text-[10px] text-slate-400">Keep shooting, then tap Done once that location is complete.</span>
            </button>
          ) : (
            <label className="block w-full cursor-pointer">
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoUpload} />
              <div className="aspect-[4/3] bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center gap-3 text-slate-400 active:bg-slate-100 transition-colors">
                <span className="text-sm font-bold text-slate-500">{uploading ? uploadMessage || 'Uploading...' : `Tap to add ${activeElevation === 'Custom' ? (customRoom.trim() || 'Custom') : activeElevation} photo`}</span>
              </div>
            </label>
          )}
          <div className="grid grid-cols-2 gap-3">
            <button onClick={capturePhoto} disabled={uploading} className="bg-primary text-white py-3 rounded-xl text-xs font-bold disabled:opacity-50">Capture Photo</button>
            <label className="bg-white border border-slate-200 text-slate-700 py-3 rounded-xl text-xs font-bold text-center cursor-pointer">
              Choose from Library
              <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload} />
            </label>
            <input
              ref={cameraFallbackInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handlePhotoUpload}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {photos.map((p, i) => (
              <div key={`${p.url}-${i}`} className="card p-2 space-y-2">

                {/* Photo thumbnail with action overlay */}
                <div className="relative">
                  <img
                    src={p.displayUrl || p.url}
                    alt="Inspection"
                    className="w-full h-32 object-cover rounded-xl"
                    referrerPolicy="no-referrer"
                  />

                  {/* Replace spinner overlay */}
                  {replacingIndex === i && (
                    <div className="absolute inset-0 bg-black/60 rounded-xl flex items-center justify-center">
                      <RefreshCw size={20} className="text-white animate-spin" />
                    </div>
                  )}

                  {/* Delete confirm overlay */}
                  {confirmDeleteIndex === i ? (
                    <div className="absolute inset-0 bg-black/70 rounded-xl flex flex-col items-center justify-center gap-2 p-2">
                      <p className="text-white text-[11px] font-bold text-center">Delete this photo?</p>
                      <div className="flex gap-2 w-full">
                        <button
                          onClick={() => deleteInspectionPhoto(i)}
                          className="flex-1 bg-red-500 text-white text-[11px] font-black py-1.5 rounded-lg"
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => setConfirmDeleteIndex(null)}
                          className="flex-1 bg-white/20 text-white text-[11px] font-black py-1.5 rounded-lg"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Normal action buttons — top-right corner */
                    <div className="absolute top-1.5 right-1.5 flex gap-1">
                      {/* Replace button */}
                      <label className="cursor-pointer">
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) replaceInspectionPhoto(i, file);
                            e.target.value = '';
                          }}
                        />
                        <div className="w-7 h-7 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center transition-colors">
                          <Camera size={13} className="text-white" />
                        </div>
                      </label>
                      {/* Delete button */}
                      <button
                        onClick={() => setConfirmDeleteIndex(i)}
                        className="w-7 h-7 bg-black/60 hover:bg-red-600 rounded-full flex items-center justify-center transition-colors"
                      >
                        <Trash2 size={13} className="text-white" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Location reassignment dropdown */}
                <select
                  value={p.elevation}
                  onChange={(e) => setPhotos((prev) => {
                    const next = [...prev];
                    next[i] = { ...next[i], elevation: e.target.value };
                    return next;
                  })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-[11px] font-bold text-slate-600 focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <optgroup label="Exterior">
                    {(['Front', 'Back', 'Left', 'Right'] as const).map((dir) => (
                      <option key={dir} value={dir}>{dir}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Detached">
                    {(['Det. Front', 'Det. Back', 'Det. Left', 'Det. Right'] as const).map((dir) => (
                      <option key={dir} value={dir}>{dir}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Interior">
                    {(['Bedroom', 'Bathroom', 'Kitchen', 'Living Room', 'Dining Room', 'Attic'] as const).map((room) => (
                      <option key={room} value={room}>{room}</option>
                    ))}
                    {p.elevation && !['Front','Back','Left','Right','Det. Front','Det. Back','Det. Left','Det. Right','Bedroom','Bathroom','Kitchen','Living Room','Dining Room','Attic'].includes(p.elevation) && (
                      <option value={p.elevation}>{p.elevation}</option>
                    )}
                  </optgroup>
                </select>
                <textarea
                  className="w-full bg-slate-50 border-none rounded-lg p-2 text-xs"
                  placeholder="Add note..."
                  value={p.note}
                  onChange={(e) => setPhotos((prev) => {
                    const next = [...prev];
                    next[i] = { ...next[i], note: e.target.value };
                    return next;
                  })}
                />
                <button onClick={() => openMarkup(i)} className="w-full text-xs font-bold text-accent">Markup Photo</button>
              </div>
            ))}
          </div>
          <button onClick={completeInspection} disabled={saving || uploading} className="w-full bg-primary text-white py-3 rounded-xl text-sm font-bold shadow-lg active:scale-95 transition-transform disabled:opacity-50">
            {uploading ? (uploadMessage || 'Uploading photos...') : saving ? 'Saving...' : 'Complete Inspection'}
          </button>
        </div>
      )}

      {inlineCameraOpen && (
        <div className="fixed inset-0 z-[120] bg-black flex flex-col">
          <div
            className="flex items-center justify-between px-4 pb-3 text-white border-b border-white/10"
            style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}
          >
            <button onClick={stopInlineCamera} className="text-sm font-bold">Cancel</button>
            <div className="text-center">
              <p className="text-sm font-bold">{activeElevation === 'Custom' ? (customRoom.trim() || 'Custom') : activeElevation} Photos</p>
              <p className="text-xs text-white/70">{inlineCaptureCount} captured</p>
            </div>
            <button onClick={finishInlineCamera} className="text-sm font-bold text-accent">Done</button>
          </div>
          <div className="flex-1 relative bg-black">
            <video
              ref={inlineVideoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-cover"
            />
            <div
              className="absolute inset-x-0 bottom-0 px-6 pt-6 bg-gradient-to-t from-black/80 to-transparent"
              style={{ paddingBottom: 'calc(3.5rem + env(safe-area-inset-bottom))' }}
            >
              <div className="flex items-center justify-center gap-6">
                <button
                  onClick={captureInlineFrame}
                  className="h-20 w-20 rounded-full border-4 border-white bg-white/20"
                  aria-label="Capture photo"
                />
              </div>
              <p className="mt-4 text-center text-xs text-white/80">
                Keep taking photos, then tap Done to upload this {(activeElevation === 'Custom' ? (customRoom.trim() || 'Custom') : activeElevation).toLowerCase()} set.
              </p>
            </div>
          </div>
          <canvas ref={inlineCanvasRef} className="hidden" />
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

function StatusTab({ contact, onAdvance, canUndo }: { contact: any; onAdvance: (status: CustomerStatus) => Promise<void>; canUndo?: boolean }) {
  const [advancing, setAdvancing] = useState(false);
  const [revertTarget, setRevertTarget] = useState<CustomerStatus | null>(null);
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

  const confirmRevert = async () => {
    if (!revertTarget) return;
    const target = revertTarget;
    setRevertTarget(null);
    await handleAdvance(target);
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
      {canUndo && (
        <p className="text-[10px] text-amber-600 font-bold uppercase tracking-widest -mt-4">
          Tap any past stage to revert
        </p>
      )}
      <div className="space-y-1 relative before:absolute before:left-4 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100">
        {STAGES.map((stage, i) => {
          const isDone = i < currentIndex;
          const isCurrent = i === currentIndex;
          const isFuture = i > currentIndex;
          const stageLabel = ALL_STATUSES.find(s => s.value === stage)?.label || stage.replace(/_/g, ' ');
          const canRevert = isDone && canUndo;

          return (
            <button
              key={stage}
              type="button"
              disabled={advancing || (!isFuture && !canRevert)}
              onClick={() => {
                if (isFuture) handleAdvance(stage);
                else if (canRevert) setRevertTarget(stage);
              }}
              className={`w-full flex gap-4 relative py-2 px-2 rounded-xl text-left transition-colors ${isFuture ? 'active:bg-slate-50' : canRevert ? 'active:bg-amber-50' : 'cursor-default'}`}
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
                {canRevert && <p className="text-[10px] text-amber-500 mt-0.5">Tap to revert</p>}
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

      {/* Revert stage confirmation bottom sheet */}
      {revertTarget && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/50" onClick={() => setRevertTarget(null)}>
          <div className="w-full bg-white rounded-t-3xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto h-1 w-10 rounded-full bg-slate-200 mb-2" />
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                <span className="text-amber-600 text-lg">↩</span>
              </div>
              <div>
                <h3 className="text-base font-bold text-primary">Revert Job Stage?</h3>
                <p className="text-sm text-slate-500 mt-1">
                  Move this job back to{' '}
                  <span className="font-bold text-primary">
                    {ALL_STATUSES.find(s => s.value === revertTarget)?.label || revertTarget.replace(/_/g, ' ')}
                  </span>
                  . This will be logged in the timeline.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => setRevertTarget(null)}
                className="py-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-600"
              >
                Cancel
              </button>
              <button
                onClick={confirmRevert}
                disabled={advancing}
                className="py-3 rounded-xl bg-amber-500 text-white text-sm font-bold disabled:opacity-50"
              >
                {advancing ? 'Reverting...' : 'Yes, Revert'}
              </button>
            </div>
          </div>
        </div>
      )}
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
            <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar pb-1" style={{ touchAction: 'pan-y', overscrollBehaviorX: 'contain' }}>
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
        {localTimeline.length > 0 ? localTimeline.map((item, i) => {
          const meta = getTimelineEventMeta(item);
          const message = formatTimelineMessage(item);
          // Split message into lines, then each line into @mention segments
          const lines = message.split('\n');
          const ts = item.created_at ? new Date(item.created_at) : null;
          const dateStr = ts ? ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
          const timeStr = ts ? ts.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';

          return (
          <div key={item.id || i} className="card p-4 space-y-2.5">
            {/* Header row */}
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-2">
                <div className={`h-6 w-6 rounded-md flex items-center justify-center shrink-0 ${meta.color}`}>
                  {meta.iconName === 'trending_up'    && <TrendingUp    size={12} />}
                  {meta.iconName === 'shield'         && <Shield        size={12} />}
                  {meta.iconName === 'wrench'         && <Wrench        size={12} />}
                  {meta.iconName === 'file_signature' && <FileText      size={12} />}
                  {meta.iconName === 'file_text'      && <FileText      size={12} />}
                  {meta.iconName === 'phone'          && <Phone         size={12} />}
                  {meta.iconName === 'message_square' && <MessageSquare size={12} />}
                  {(meta.iconName === '💵' || meta.iconName === '📸') && (
                    <span className="text-[13px] leading-none">{meta.iconName}</span>
                  )}
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-wider ${meta.iconName === 'trending_up' ? 'text-accent' : 'text-slate-500'}`}>
                  {meta.label}
                </span>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-slate-400 font-medium">{dateStr}</p>
                {timeStr && <p className="text-[10px] text-slate-300">{timeStr}</p>}
              </div>
            </div>

            {/* Message — newlines rendered as real line breaks */}
            <div className="text-sm text-primary leading-relaxed space-y-1">
              {lines.map((line, li) => {
                if (!line.trim()) return null;
                const segments = line.split(/(@[a-zA-Z0-9_]+)/g);
                return (
                  <p key={`${item.id || i}-line-${li}`}>
                    {segments.map((seg, si) => (
                      <span key={`${item.id || i}-${li}-${si}`} className={seg.startsWith('@') ? 'font-bold text-accent' : ''}>
                        {seg}
                      </span>
                    ))}
                  </p>
                );
              })}
            </div>
          </div>
          );
        }) : (
          <div className="text-center py-12 text-slate-400">
            <History size={48} className="mx-auto mb-4 opacity-20" />
            <p className="text-sm">No activity recorded yet</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// iPhone-style full-screen photo album modal
// ─────────────────────────────────────────────
function PhotoAlbumModal({ photos: initialPhotos, initialIndex, onClose, onDelete, onMetadataUpdated }: {
  photos: any[];
  initialIndex: number;
  onClose: () => void;
  onDelete?: (docId: string, url: string) => Promise<void>;
  onMetadataUpdated?: () => void;
}) {
  const [photos, setPhotos] = React.useState(initialPhotos);
  const [index, setIndex] = React.useState(Math.min(initialIndex, Math.max(0, initialPhotos.length - 1)));
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [noteDraft, setNoteDraft] = React.useState('');
  const [savingNote, setSavingNote] = React.useState(false);
  const [togglingStar, setTogglingStar] = React.useState(false);
  const touchStartX = React.useRef(0);
  const touchStartY = React.useRef(0);
  const thumbsRef = React.useRef<HTMLDivElement>(null);

  const current = photos[index];

  // Scroll thumbnail strip to keep active thumb visible
  React.useEffect(() => {
    if (!thumbsRef.current) return;
    const el = thumbsRef.current.children[index] as HTMLElement | undefined;
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [index]);

  React.useEffect(() => {
    setNoteDraft(String(current?.photo_notes || ''));
  }, [current?.id]);

  // Prevent body scroll while album is open
  React.useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const go = (i: number) => {
    setConfirmDelete(false);
    setIndex(Math.max(0, Math.min(i, photos.length - 1)));
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = touchStartX.current - e.changedTouches[0].clientX;
    const dy = Math.abs(touchStartY.current - e.changedTouches[0].clientY);
    if (Math.abs(dx) > 50 && Math.abs(dx) > dy) {
      if (dx > 0 && index < photos.length - 1) go(index + 1);
      if (dx < 0 && index > 0) go(index - 1);
    }
  };

  const handleDelete = async () => {
    if (!onDelete || !current) return;
    setDeleting(true);
    try {
      await onDelete(current.id, current.url);
      const next = photos.filter((_: any, i: number) => i !== index);
      if (next.length === 0) { onClose(); return; }
      setPhotos(next);
      setIndex(Math.min(index, next.length - 1));
      setConfirmDelete(false);
    } catch (err) {
      console.error('Album delete failed:', err);
    } finally {
      setDeleting(false);
    }
  };

  const persistPhotoUpdate = async (docId: string, updates: Record<string, unknown>) => {
    const { error } = await (supabase.from('documents') as any).update(updates).eq('id', docId);
    if (error) throw error;
  };

  const handleToggleFavorite = async () => {
    if (!current?.id || togglingStar) return;
    const nextStarred = !current.starred;
    setTogglingStar(true);
    const previous = photos;
    const optimistic = sortPhotosForDisplay(photos.map((photo: any, i: number) => {
      if (i !== index) return photo;
      return { ...photo, starred: nextStarred };
    }));
    setPhotos(optimistic);
    setIndex(Math.max(0, optimistic.findIndex((photo: any) => photo.id === current.id)));

    try {
      await persistPhotoUpdate(current.id, { starred: nextStarred });
      await onMetadataUpdated?.();
    } catch (err) {
      console.error('Favorite toggle failed:', err);
      setPhotos(previous);
      setIndex(index);
      alert('Unable to update favorite photo. If this is a new setup, run the latest documents migration first.');
    } finally {
      setTogglingStar(false);
    }
  };

  const handleSaveNotes = async () => {
    if (!current?.id || savingNote) return;
    setSavingNote(true);
    const previous = photos;
    const trimmed = noteDraft.trim();
    const optimistic = photos.map((photo: any, i: number) => (
      i === index ? { ...photo, photo_notes: trimmed || null } : photo
    ));
    setPhotos(optimistic);
    try {
      await persistPhotoUpdate(current.id, { photo_notes: trimmed || null });
      await onMetadataUpdated?.();
    } catch (err) {
      console.error('Photo note save failed:', err);
      setPhotos(previous);
      alert('Unable to save photo notes. If this is a new setup, run the latest documents migration first.');
    } finally {
      setSavingNote(false);
    }
  };

  if (!current) return null;

  return (
    <div
      className="fixed inset-0 z-[300] bg-black flex flex-col select-none"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-3 py-2 bg-black/80 backdrop-blur-sm shrink-0">
        <button
          onClick={onClose}
          className="w-9 h-9 flex items-center justify-center rounded-full active:bg-white/20"
        >
          <X size={22} className="text-white" />
        </button>
        <div className="text-center">
          <p className="text-sm font-bold text-white">{index + 1} / {photos.length}</p>
          {current.name && (
            <p className="text-[10px] text-white/50 truncate max-w-[180px]">{current.name}</p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleToggleFavorite}
            disabled={togglingStar}
            className="flex h-9 w-9 items-center justify-center rounded-full active:bg-white/20 disabled:opacity-60"
            aria-label="Favorite photo"
          >
            <Star size={18} className={current.starred ? 'text-amber-400' : 'text-white'} fill={current.starred ? 'currentColor' : 'none'} />
          </button>
          {onDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="w-9 h-9 flex items-center justify-center rounded-full active:bg-white/20"
            >
              <Trash2 size={18} className="text-red-400" />
            </button>
          ) : (
            <div className="w-9" />
          )}
        </div>
      </div>

      {/* ── Main photo with swipe ── */}
      <div
        className="flex-1 flex items-center justify-center overflow-hidden relative"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <img
          key={current.id || index}
          src={current.displayUrl || current.url}
          alt={current.name || 'Photo'}
          className="max-h-full max-w-full object-contain"
          draggable={false}
          referrerPolicy="no-referrer"
        />

        {/* Prev tap zone */}
        {index > 0 && (
          <button
            onClick={() => go(index - 1)}
            className="absolute left-0 top-0 h-full w-16 flex items-center justify-start pl-2"
            aria-label="Previous"
          >
            <div className="w-8 h-8 bg-black/50 rounded-full flex items-center justify-center">
              <ChevronLeft size={20} className="text-white" />
            </div>
          </button>
        )}

        {/* Next tap zone */}
        {index < photos.length - 1 && (
          <button
            onClick={() => go(index + 1)}
            className="absolute right-0 top-0 h-full w-16 flex items-center justify-end pr-2"
            aria-label="Next"
          >
            <div className="w-8 h-8 bg-black/50 rounded-full flex items-center justify-center">
              <ChevronRight size={20} className="text-white" />
            </div>
          </button>
        )}
      </div>

      {/* ── Thumbnail filmstrip ── */}
      {photos.length > 1 && (
        <div
          ref={thumbsRef}
          className="flex gap-1.5 overflow-x-auto px-4 py-3 no-scrollbar shrink-0"
        >
          {photos.map((p: any, i: number) => (
            <button
              key={p.id || i}
              onClick={() => go(i)}
              className={`shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-all ${
                i === index
                  ? 'border-white scale-110 shadow-lg'
                  : 'border-transparent opacity-50'
              }`}
            >
              <img
                src={p.displayUrl || p.url}
                alt=""
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
                draggable={false}
              />
            </button>
          ))}
        </div>
      )}

      <div className="shrink-0 border-t border-white/10 bg-black/85 px-4 py-3 backdrop-blur-sm">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/55">Photo Notes</p>
          {current.starred ? (
            <span className="rounded-full bg-amber-400/20 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-300">
              Cover Photo
            </span>
          ) : null}
        </div>
        <textarea
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          placeholder="Add notes, highlight what matters, or describe why this photo is important."
          className="min-h-[88px] w-full rounded-2xl border border-white/10 bg-white/8 p-3 text-sm text-white placeholder:text-white/35"
        />
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={handleSaveNotes}
            disabled={savingNote}
            className="rounded-2xl bg-accent px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {savingNote ? 'Saving…' : 'Save Notes'}
          </button>
          <p className="text-[11px] text-white/45">
            Favorite a photo to pin it to the contact.
          </p>
        </div>
      </div>

      {/* ── Delete confirmation overlay ── */}
      {confirmDelete && (
        <div className="absolute inset-0 bg-black/80 z-10 flex items-center justify-center p-6">
          <div className="bg-slate-900 border border-white/10 rounded-3xl p-6 w-full max-w-xs text-center space-y-4">
            <div className="w-14 h-14 bg-red-500/20 rounded-full flex items-center justify-center mx-auto">
              <Trash2 size={26} className="text-red-400" />
            </div>
            <div>
              <p className="text-white font-black text-base">Delete Photo?</p>
              <p className="text-slate-400 text-sm mt-1">This cannot be undone.</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 bg-white/10 text-white font-bold py-3 rounded-2xl text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 bg-red-500 text-white font-black py-3 rounded-2xl text-sm disabled:opacity-60"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DocumentsTab({ contactId, companyId, address, city, state, zip, contactName, userId, documents, onUpload, onLegalUpload, onDocumentSaved, onDeleteDocument }: { contactId: string; companyId: string; address: string; city: string; state: string; zip: string; contactName?: string; userId?: string; documents: any[]; onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void; onLegalUpload: (label: string, docType: string, e: React.ChangeEvent<HTMLInputElement>) => void; onDocumentSaved?: () => void; onDeleteDocument?: (docId: string, url: string) => Promise<void> }) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'all' | 'photos' | 'docs' | 'legal'>('all');
  const [editMode, setEditMode] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [albumOpen, setAlbumOpen] = useState(false);
  const [albumIndex, setAlbumIndex] = useState(0);

  const handleDelete = async (doc: any) => {
    if (!onDeleteDocument) return;
    setDeleting(true);
    try {
      await onDeleteDocument(doc.id, doc.url);
    } finally {
      setDeleting(false);
      setConfirmDeleteId(null);
    }
  };

  // Base document lists — strip signature attachments from visible set
  const allVisible = documents.filter((doc) => !getSignatureParentName(String(doc.name || '')));
  const photos = sortPhotosForDisplay(allVisible.filter((doc) => doc.type === 'photo'));
  const starredPhotos = photos.filter((doc) => !!doc.starred);
  const nonLegalDocs = allVisible.filter((doc) => doc.type !== 'photo' && !isLegalDocument(doc));
  const legalDocStats = buildLegalDocumentStats(allVisible);
  const signedLegalDocs = LEGAL_DOCUMENT_TEMPLATES
    .map((t) => ({ ...t, signedPdf: legalDocStats[t.id]?.latestSignedPdf || null }))
    .filter((e) => e.signedPdf);
  // Docs tab: signed docs rise to the top
  const sortedDocs = [
    ...nonLegalDocs.filter((d) => d.type === 'contract' || d.type === 'signed'),
    ...nonLegalDocs.filter((d) => d.type !== 'contract' && d.type !== 'signed'),
  ];

  const TABS_CONFIG = [
    { id: 'all',    label: 'All' },
    { id: 'photos', label: `Photos${photos.length ? ` (${photos.length})` : ''}` },
    { id: 'docs',   label: `Docs${nonLegalDocs.length ? ` (${nonLegalDocs.length})` : ''}` },
    { id: 'legal',  label: `Legal${signedLegalDocs.length ? ` ✓` : ''}` },
  ];

  return (
    <div className="space-y-5">
      {/* ── Filter tabs ── */}
      <div className="flex gap-2 overflow-x-auto pb-0.5">
        {TABS_CONFIG.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setFilter(id as any)}
            className={`shrink-0 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              filter === id ? 'bg-accent text-white shadow-sm' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════
          ALL TAB
      ══════════════════════════════════ */}
      {filter === 'all' && (
        <div className="space-y-5">
          {/* Photos summary */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Photos</h3>
              <button onClick={() => setFilter('photos')} className="text-[10px] font-bold text-accent uppercase tracking-widest">
                {photos.length > 0 ? `View all ${photos.length}` : 'View'}
              </button>
            </div>
            {photos.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {photos.slice(0, 6).map((doc, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => { setAlbumIndex(i); setAlbumOpen(true); }}
                    className="relative aspect-square rounded-xl overflow-hidden bg-slate-100 active:opacity-80"
                  >
                    <img src={doc.displayUrl || doc.url} alt={doc.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    {doc.photo_notes ? (
                      <div className="absolute left-1.5 top-1.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[9px] font-bold text-white">
                        Note
                      </div>
                    ) : null}
                    {doc.starred ? (
                      <div className="absolute right-1.5 top-1.5 rounded-full bg-amber-400 p-1 text-white shadow-lg">
                        <Star size={10} fill="currentColor" />
                      </div>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-400">No photos yet</div>
            )}
          </div>

          {/* Docs summary */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Docs</h3>
              <button onClick={() => setFilter('docs')} className="text-[10px] font-bold text-accent uppercase tracking-widest">
                {nonLegalDocs.length > 0 ? `View all ${nonLegalDocs.length}` : 'View'}
              </button>
            </div>
            {nonLegalDocs.length > 0 ? (
              <div className="space-y-2">
                {nonLegalDocs.slice(0, 3).map((doc, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => navigate(`/documents/view/${doc.id}`)}
                    className="w-full flex items-center gap-3 p-3 bg-white border border-slate-100 rounded-xl text-left active:bg-slate-50"
                  >
                    <div className="h-10 w-10 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
                      <FileText size={18} className="text-slate-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-primary truncate">{doc.name}</p>
                      <p className="text-[10px] text-slate-400">{(doc.size / 1024 / 1024).toFixed(1)} MB</p>
                    </div>
                    <ChevronRight size={14} className="text-slate-300 shrink-0" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-400">No documents yet</div>
            )}
          </div>

          {/* Legal summary */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Legal</h3>
              <button onClick={() => setFilter('legal')} className="text-[10px] font-bold text-accent uppercase tracking-widest">
                Open Legal Center
              </button>
            </div>
            <div className="space-y-2">
              {LEGAL_DOCUMENT_TEMPLATES.map((doc) => {
                const stat = legalDocStats[doc.id];
                const isSigned = !!stat?.isSigned;
                return (
                  <button
                    key={doc.id}
                    type="button"
                    onClick={() => navigate(`/contacts/${contactId}/documents/${doc.id}`)}
                    className="w-full flex items-center gap-3 p-3 bg-white border border-slate-100 rounded-xl text-left active:bg-slate-50"
                  >
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${isSigned ? 'bg-emerald-50' : 'bg-slate-50'}`}>
                      <CheckCircle2 size={16} className={isSigned ? 'text-emerald-500' : 'text-slate-300'} />
                    </div>
                    <p className="flex-1 text-xs font-bold text-primary truncate">{doc.title}</p>
                    <span className={`text-[10px] font-bold uppercase tracking-wide ${isSigned ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {isSigned ? 'Signed' : 'Pending'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Upload button */}
          <label className="flex items-center justify-center gap-2 w-full py-3 bg-slate-100 rounded-xl text-xs font-bold text-slate-600 cursor-pointer active:bg-slate-200">
            <Plus size={16} />
            Upload File or Photo
            <input type="file" multiple className="hidden" onChange={onUpload} accept="image/*,application/pdf" />
          </label>
        </div>
      )}

      {/* ══════════════════════════════════
          PHOTOS TAB
      ══════════════════════════════════ */}
      {filter === 'photos' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              {photos.length} photo{photos.length !== 1 ? 's' : ''} on file
            </p>
            <div className="flex items-center gap-2">
              {starredPhotos.length > 0 && (
                <div className="rounded-xl bg-amber-50 px-3 py-1.5 text-[11px] font-bold text-amber-700">
                  {starredPhotos.length} starred
                </div>
              )}
              {photos.length > 0 && onDeleteDocument && (
                <button
                  onClick={() => { setEditMode((m) => !m); setConfirmDeleteId(null); }}
                  className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all ${editMode ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-600'}`}
                >
                  {editMode ? 'Done' : 'Edit'}
                </button>
              )}
              {!editMode && (
                <label className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white rounded-xl text-[11px] font-bold cursor-pointer active:opacity-80">
                  <Plus size={14} />
                  Add
                  <input type="file" multiple className="hidden" onChange={onUpload} accept="image/*" />
                </label>
              )}
            </div>
          </div>

          {editMode && (
            <p className="text-[10px] text-slate-400 bg-slate-50 rounded-xl px-3 py-2">
              Tap the <strong>🗑</strong> on any photo to delete it. Tap <strong>Done</strong> when finished.
            </p>
          )}

          {photos.length > 0 ? (
            <div className="grid grid-cols-3 gap-2">
              {photos.map((doc, i) => (
                <div key={`${doc.id}-${i}`} className="aspect-square rounded-xl overflow-hidden bg-slate-100 relative">
                  {/* Tapping the photo when NOT in edit mode opens the album */}
                  {!editMode ? (
                    <button
                      type="button"
                      onClick={() => { setAlbumIndex(i); setAlbumOpen(true); }}
                      className="absolute inset-0 w-full h-full"
                    >
                      <img
                        src={doc.displayUrl || doc.url}
                        alt={doc.name}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                      {doc.photo_notes ? (
                        <div className="absolute left-1.5 top-1.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[9px] font-bold text-white">
                          Note
                        </div>
                      ) : null}
                      {doc.starred ? (
                        <div className="absolute right-1.5 top-1.5 rounded-full bg-amber-400 p-1 text-white shadow-lg">
                          <Star size={10} fill="currentColor" />
                        </div>
                      ) : null}
                      {doc.name && (
                        <div className="absolute bottom-0 inset-x-0 bg-black/40 px-1.5 py-1">
                          <p className="text-[8px] font-bold text-white truncate">{doc.name}</p>
                        </div>
                      )}
                    </button>
                  ) : (
                    <>
                      <img
                        src={doc.displayUrl || doc.url}
                        alt={doc.name}
                        className="w-full h-full object-cover opacity-70"
                        referrerPolicy="no-referrer"
                      />

                      {/* Delete confirm overlay */}
                      {confirmDeleteId === doc.id ? (
                        <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center gap-1.5 p-2">
                          <p className="text-white text-[10px] font-bold text-center leading-tight">Delete this photo?</p>
                          <button
                            onClick={() => handleDelete(doc)}
                            disabled={deleting}
                            className="w-full bg-red-500 text-white text-[10px] font-black py-1.5 rounded-lg disabled:opacity-60"
                          >
                            {deleting ? '…' : 'Delete'}
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="w-full bg-white/20 text-white text-[10px] font-black py-1.5 rounded-lg"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        /* Delete badge */
                        <button
                          onClick={() => setConfirmDeleteId(doc.id)}
                          className="absolute top-1.5 right-1.5 w-7 h-7 bg-red-500 rounded-full flex items-center justify-center shadow-lg active:bg-red-700"
                        >
                          <Trash2 size={13} className="text-white" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-16 space-y-3">
              <ImageIcon size={48} className="mx-auto text-slate-200" />
              <div>
                <p className="text-sm font-bold text-slate-400">No photos yet</p>
                <p className="text-xs text-slate-300 mt-1">Photos taken during inspection will appear here</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════
          DOCS TAB
      ══════════════════════════════════ */}
      {filter === 'docs' && (
        <div className="space-y-5">
          {/* Aerial Measurement Reports */}
          <EagleViewPanel
            contactId={contactId}
            companyId={companyId}
            address={address}
            city={city}
            state={state}
            zip={zip}
            contactName={contactName}
            userId={userId}
            onDocumentSaved={onDocumentSaved}
          />
          <RoofrPanel
            contactId={contactId}
            companyId={companyId}
            address={address}
            city={city}
            state={state}
            zip={zip}
            contactName={contactName}
            userId={userId}
            onDocumentSaved={onDocumentSaved}
          />

          {/* Before & After Report */}
          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5 space-y-3">
            <div className="flex justify-between items-center">
              <h4 className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Before & After Report</h4>
              <span className="text-[10px] font-bold text-emerald-600 uppercase">Shareable PDF</span>
            </div>
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

          {/* Files list — signed docs first */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Files ({sortedDocs.length})
              </h3>
              <label className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white rounded-xl text-[11px] font-bold cursor-pointer active:opacity-80">
                <Plus size={14} />
                Upload
                <input type="file" multiple className="hidden" onChange={onUpload} accept="image/*,application/pdf" />
              </label>
            </div>
            {sortedDocs.length > 0 ? (
              <div className="space-y-2">
                {sortedDocs.map((doc, i) => {
                  const isSigned = doc.type === 'contract' || doc.type === 'signed';
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => navigate(`/documents/view/${doc.id}`)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left active:opacity-80 ${
                        isSigned ? 'bg-emerald-50 border-emerald-100' : 'bg-white border-slate-100'
                      }`}
                    >
                      <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${isSigned ? 'bg-emerald-100' : 'bg-slate-50'}`}>
                        <FileText size={18} className={isSigned ? 'text-emerald-600' : 'text-slate-400'} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-primary truncate">{doc.name}</p>
                        <p className="text-[10px] text-slate-400">
                          {isSigned ? '✓ Signed · ' : ''}{(doc.size / 1024 / 1024).toFixed(1)} MB
                        </p>
                      </div>
                      <ChevronRight size={14} className="text-slate-300 shrink-0" />
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12 space-y-3">
                <FileText size={40} className="mx-auto text-slate-200" />
                <p className="text-sm text-slate-400">No documents yet</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════
          LEGAL TAB
      ══════════════════════════════════ */}
      {filter === 'legal' && (
        <div className="space-y-5">
          {/* Signed legal PDFs — shown first and prominently */}
          {signedLegalDocs.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Signed Documents</h3>
              {signedLegalDocs.map(({ id, title, signedPdf }) => (
                <div key={id} className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-emerald-900">{title}</p>
                      <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">Signed ✓</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate(`/documents/view/${(signedPdf as any).id}`)}
                      className="rounded-xl bg-emerald-600 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-white shrink-0"
                    >
                      View PDF
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Legal document templates */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Legal Templates</h3>
              <button
                type="button"
                onClick={() => navigate(`/contacts/${contactId}/documents`)}
                className="text-[10px] font-bold text-accent uppercase tracking-widest"
              >
                Open All
              </button>
            </div>
            <div className="space-y-2">
              {LEGAL_DOCUMENT_TEMPLATES.map((doc) => {
                const stat = legalDocStats[doc.id];
                const isSigned = !!stat?.isSigned;
                return (
                  <div key={doc.id} className={`rounded-xl border p-4 space-y-3 ${isSigned ? 'bg-emerald-50 border-emerald-100' : 'bg-white border-slate-100'}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-primary">{doc.title}</p>
                        <p className="text-[10px] text-slate-400">{doc.description}</p>
                      </div>
                      {isSigned
                        ? <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide shrink-0">✓ Signed</span>
                        : <button
                            type="button"
                            onClick={() => navigate(`/contacts/${contactId}/documents/${doc.id}`)}
                            className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-[10px] font-bold text-white uppercase tracking-wide"
                          >
                            Sign Now
                          </button>
                      }
                    </div>
                    {!isSigned && (
                      <label className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 cursor-pointer">
                        <span className="text-[11px] font-semibold text-slate-500">Upload existing signed copy</span>
                        <span className="text-[10px] text-slate-400 font-bold">Upload</span>
                        <input type="file" className="hidden" onChange={(e) => onLegalUpload(doc.title, 'contract', e)} />
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {signedLegalDocs.length === 0 && (
            <div className="rounded-xl bg-slate-50 px-4 py-4 text-center space-y-1">
              <p className="text-xs font-bold text-slate-500">No signed documents yet</p>
              <p className="text-[11px] text-slate-400">Tap "Sign Now" on any template above to get a signature in the app.</p>
            </div>
          )}
        </div>
      )}

      {/* ── Photo Album Modal ── */}
      {albumOpen && (
        <PhotoAlbumModal
          photos={photos}
          initialIndex={albumIndex}
          onClose={() => setAlbumOpen(false)}
          onDelete={onDeleteDocument}
          onMetadataUpdated={onDocumentSaved}
        />
      )}
    </div>
  );
}

function FinancialTab({ contact, userId, onEdit, onRefresh, canUndo }: { contact: any; userId?: string; onEdit: () => void; onRefresh: () => void; canUndo?: boolean }) {
  const navigate = useNavigate();
  const [estimates, setEstimates] = useState<any[]>([]);
  const [latestEstimate, setLatestEstimate] = useState<any>(null);
  const [latestWorkOrder, setLatestWorkOrder] = useState<any>(null);
  const [financialDocuments, setFinancialDocuments] = useState<any[]>([]);
  const [savingField, setSavingField] = useState<'deposit' | 'final' | null>(null);
  const [creatingWorkOrder, setCreatingWorkOrder] = useState(false);
  const [loadingArtifacts, setLoadingArtifacts] = useState(true);
  const [undoPaymentTarget, setUndoPaymentTarget] = useState<'deposit' | 'final' | null>(null);

  const isFinancialDocument = (doc: any) => {
    const type = String(doc?.type || '').toLowerCase();
    const name = String(doc?.name || '').toLowerCase();
    return ['estimate', 'invoice', 'contract'].includes(type) || /(invoice|estimate|contract|payment|receipt|finance)/.test(name);
  };

  useEffect(() => {
    const fetchFinancialArtifacts = async () => {
      if (!contact?.id) return;
      setLoadingArtifacts(true);
      try {
        const [{ data: estimateRows }, { data: workOrder }, { data: documentRows }] = await Promise.all([
          supabase
            .from('estimates')
            .select('*')
            .eq('contact_id', contact.id)
            .order('created_at', { ascending: false })
            .returns<any[]>(),
          supabase
            .from('work_orders')
            .select('*')
            .eq('contact_id', contact.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('documents')
            .select('*')
            .eq('contact_id', contact.id)
            .order('created_at', { ascending: false })
            .returns<any[]>(),
        ]);
        const allEstimates = estimateRows || [];
        const allFinancialDocuments = (documentRows || []).filter(isFinancialDocument);
        setEstimates(allEstimates);
        setLatestEstimate(allEstimates[0] || null);
        setLatestWorkOrder(workOrder || null);
        setFinancialDocuments(allFinancialDocuments);
      } catch (err) {
        console.error('Error loading financial data:', err);
      } finally {
        setLoadingArtifacts(false);
      }
    };

    fetchFinancialArtifacts();
  }, [contact?.id]);

  const paymentEntries = [
    {
      key: 'deposit' as const,
      label: 'Deposit',
      amount: Number(contact.deposit_amount || 0),
      paid: !!contact.deposit_paid,
      date: contact.deposit_date,
    },
    {
      key: 'final' as const,
      label: 'Final Payment',
      amount: Number(contact.final_payment_amount || 0),
      paid: !!contact.final_payment_paid,
      date: contact.final_payment_date,
    },
  ].filter((entry) => entry.amount > 0 || entry.paid || entry.date);

  const contractValue = Number(contact.project_value || latestEstimate?.total || 0);
  const totalPaid = paymentEntries.reduce((sum, entry) => sum + (entry.paid ? entry.amount : 0), 0);
  const outstandingBalance = Math.max(contractValue - totalPaid, 0);
  const deductible = Number(contact.deductible || 0);

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

      // Auto-advance job status when payments are marked paid:
      //   deposit paid  → move to 'in_progress' (work has started)
      //   final payment → move to 'paid'        (job is fully closed)
      if (nextPaid) {
        const currentStatus = contact.status as string;
        const PIPELINE = ['lead','contacted','appointment_set','inspected','estimate_sent','approved','scheduled','in_progress','completed','paid'];
        const currentIdx = PIPELINE.indexOf(currentStatus);
        const targetStatus = kind === 'final' ? 'paid' : 'in_progress';
        const targetIdx = PIPELINE.indexOf(targetStatus);
        // Only advance — never move backwards
        if (targetIdx > currentIdx) {
          await (supabase.from('contacts') as any)
            .update({ status: targetStatus, status_changed_at: new Date().toISOString() })
            .eq('id', contact.id);
        }
      }

      if (userId) {
        await (supabase.from('communications') as any).insert({
          contact_id: contact.id,
          company_id: contact.company_id,
          type: 'stage_change',
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
          Review all estimates, financial documents, payment status, and outstanding balance for this customer in one place.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="card p-5 space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Contract Value</p>
          <p className="text-2xl font-black text-primary">{formatCurrency(contractValue)}</p>
          <p className="text-xs text-slate-500">Project total on file for this customer.</p>
        </div>
        <div className="card p-5 space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Total Paid</p>
          <p className="text-2xl font-black text-emerald-600">{formatCurrency(totalPaid)}</p>
          <p className="text-xs text-slate-500">Combined recorded customer payments.</p>
        </div>
        <div className="card p-5 space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Outstanding Balance</p>
          <p className="text-2xl font-black text-rose-600">{formatCurrency(outstandingBalance)}</p>
          <p className="text-xs text-slate-500">
            {deductible > 0 ? `Deductible on file: ${formatCurrency(deductible)}` : 'Based on project value minus recorded payments.'}
          </p>
        </div>
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
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Payments</h3>
              <p className="mt-1 text-sm text-slate-600">
                Payments are recorded directly on this customer. An invoice document is optional and does not block payment entry.
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold uppercase text-slate-500">
              {paymentEntries.length} tracked
            </span>
          </div>
          <div className="space-y-3">
            {paymentEntries.length > 0 ? paymentEntries.map((entry) => (
              <div key={entry.key} className="rounded-2xl bg-slate-50 p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="text-sm font-bold text-primary">{entry.label}</h4>
                    <p className="text-[11px] text-slate-500">
                      {entry.date ? `Updated ${new Date(entry.date).toLocaleDateString()}` : 'No payment recorded yet'}
                    </p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-md uppercase ${entry.paid ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                    {entry.paid ? 'Paid' : 'Pending'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xl font-bold text-primary">{formatCurrency(entry.amount)}</span>
                  <button
                    onClick={() => {
                      if (entry.paid) {
                        // Undo direction — require admin confirmation
                        if (canUndo) setUndoPaymentTarget(entry.key);
                      } else {
                        togglePayment(entry.key);
                      }
                    }}
                    disabled={savingField === entry.key || (entry.paid && !canUndo)}
                    className={`rounded-xl px-4 py-2 text-xs font-bold disabled:opacity-50 ${entry.paid ? 'bg-amber-50 border border-amber-200 text-amber-700' : 'bg-white border border-slate-200 text-accent'}`}
                  >
                    {savingField === entry.key ? 'Saving...' : entry.paid ? (canUndo ? 'Undo Payment' : 'Paid ✓') : `Record ${entry.label}`}
                  </button>
                </div>
              </div>
            )) : (
              <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
                No payment schedule is on file yet. Add the customer financial amounts from the edit screen to start tracking payments here.
              </div>
            )}
          </div>
        </div>
        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Financial Documents</h3>
              <p className="text-sm text-slate-600">Estimates, invoices, contracts, receipts, and money-related files for this customer.</p>
            </div>
            <button onClick={() => navigate(`/documents?contactId=${contact.id}`)} className="text-accent text-xs font-bold">
              View All Docs
            </button>
          </div>
          <div className="space-y-3">
            {loadingArtifacts ? (
              <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Loading financial documents...</div>
            ) : financialDocuments.length > 0 ? financialDocuments.map((doc) => (
              <button
                key={doc.id}
                onClick={() => navigate(`/documents/view/${doc.id}`)}
                className="w-full rounded-2xl border border-slate-100 bg-slate-50 p-4 text-left transition-colors hover:bg-white"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-primary">{doc.name}</p>
                    <p className="text-[11px] text-slate-500">
                      {String(doc.type || 'document').toUpperCase()} • {new Date(doc.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="text-[11px] font-bold text-accent">Open</span>
                </div>
              </button>
            )) : (
              <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
                No customer financial documents have been saved yet.
              </div>
            )}
          </div>
        </div>
        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Estimate History</h3>
              <p className="text-sm text-slate-600">All saved estimates for this customer, newest first.</p>
            </div>
            <button onClick={() => navigate(`/estimates-list?contactId=${contact.id}`)} className="text-accent text-xs font-bold">
              View Estimates
            </button>
          </div>
          <div className="space-y-3">
            {loadingArtifacts ? (
              <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Loading estimate history...</div>
            ) : estimates.length > 0 ? estimates.map((estimate) => (
              <button
                key={estimate.id}
                onClick={() => navigate(`/estimates/${estimate.id}`)}
                className="w-full rounded-2xl border border-slate-100 bg-slate-50 p-4 text-left transition-colors hover:bg-white"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-primary">{estimate.title}</p>
                    <p className="text-[11px] text-slate-500">
                      {String(estimate.status || 'draft').replace('_', ' ')} • {new Date(estimate.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-accent">{formatCurrency(estimate.total)}</span>
                </div>
              </button>
            )) : (
              <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
                No estimates have been created for this customer yet.
              </div>
            )}
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

      {/* Undo payment confirmation bottom sheet */}
      {undoPaymentTarget && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/50" onClick={() => setUndoPaymentTarget(null)}>
          <div className="w-full bg-white rounded-t-3xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto h-1 w-10 rounded-full bg-slate-200 mb-2" />
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                <span className="text-amber-600 text-lg">↩</span>
              </div>
              <div>
                <h3 className="text-base font-bold text-primary">Undo Payment?</h3>
                <p className="text-sm text-slate-500 mt-1">
                  Mark the{' '}
                  <span className="font-bold text-primary">
                    {undoPaymentTarget === 'deposit' ? 'deposit' : 'final payment'}
                  </span>{' '}
                  as unpaid. This will be logged in the timeline and the job status may need to be adjusted manually.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => setUndoPaymentTarget(null)}
                className="py-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-600"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const target = undoPaymentTarget;
                  setUndoPaymentTarget(null);
                  togglePayment(target);
                }}
                disabled={savingField !== null}
                className="py-3 rounded-xl bg-amber-500 text-white text-sm font-bold disabled:opacity-50"
              >
                {savingField !== null ? 'Saving...' : 'Yes, Mark Unpaid'}
              </button>
            </div>
          </div>
        </div>
      )}
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
