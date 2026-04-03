import React, { useState, useEffect, useRef } from 'react';
import { Camera, ChevronLeft, CheckCircle2, Circle, Trash2, RefreshCw } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { Camera as CapCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { motion } from 'framer-motion';

const CHECKLIST_LABELS = [
  'Front Elevation',
  'Rear Elevation',
  'Left Elevation',
  'Right Elevation',
  'Roof Surface General',
  'Flashing Details',
  'Gutter Condition',
  'Attic / Interior Leaks',
];

const DOC_NAME_PREFIX = 'Photo Checklist: ';

type ChecklistItem = {
  label: string;
  docId: string | null;
  photoUrl: string | null;
  uploading: boolean;
};

export default function PhotoChecklist() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const contactId = searchParams.get('contactId');
  const { user, profile } = useAuth();

  const [contactName, setContactName] = useState<string | null>(null);
  const [items, setItems] = useState<ChecklistItem[]>(
    CHECKLIST_LABELS.map((label) => ({ label, docId: null, photoUrl: null, uploading: false }))
  );
  const [loading, setLoading] = useState(true);
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Load contact name
  useEffect(() => {
    if (!contactId) return;
    supabase
      .from('contacts')
      .select('first_name, last_name')
      .eq('id', contactId)
      .single()
      .then(({ data }) => {
        if (data) setContactName(`${data.first_name || ''} ${data.last_name || ''}`.trim());
      });
  }, [contactId]);

  // Load saved checklist photos for this contact
  const loadPhotos = async () => {
    if (!contactId) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('documents')
        .select('id, name, url')
        .eq('contact_id', contactId)
        .eq('type', 'photo')
        .like('name', `${DOC_NAME_PREFIX}%`);

      if (error) throw error;

      setItems(
        CHECKLIST_LABELS.map((label) => {
          const doc = (data || []).find((d) => d.name === `${DOC_NAME_PREFIX}${label}`);
          return {
            label,
            docId: doc?.id ?? null,
            photoUrl: doc?.url ?? null,
            uploading: false,
          };
        })
      );
    } catch (err) {
      console.error('[PhotoChecklist] loadPhotos error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadPhotos(); }, [contactId]); // eslint-disable-line react-hooks/exhaustive-deps

  const setItemUploading = (label: string, uploading: boolean) =>
    setItems((prev) => prev.map((i) => (i.label === label ? { ...i, uploading } : i)));

  const uploadPhoto = async (label: string, blob: Blob) => {
    if (!contactId || !user?.id || !profile?.company_id) return;
    setItemUploading(label, true);
    try {
      const ext = blob.type === 'image/png' ? 'png' : 'jpg';
      const safeName = label.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const filePath = `${contactId}/checklist/${safeName}_${Date.now()}.${ext}`;

      const { error: storageError } = await supabase.storage
        .from('projectceo-photos')
        .upload(filePath, blob, { contentType: blob.type });
      if (storageError) throw storageError;

      const { data: { publicUrl } } = supabase.storage
        .from('projectceo-photos')
        .getPublicUrl(filePath);

      const docName = `${DOC_NAME_PREFIX}${label}`;

      // Find existing doc for this item to replace it
      const existing = items.find((i) => i.label === label);

      if (existing?.docId) {
        // Update existing record
        const { error: updateError } = await (supabase.from('documents') as any)
          .update({ url: publicUrl, size: blob.size })
          .eq('id', existing.docId);
        if (updateError) throw updateError;
        setItems((prev) =>
          prev.map((i) => (i.label === label ? { ...i, photoUrl: publicUrl, uploading: false } : i))
        );
      } else {
        // Insert new record
        const { data: inserted, error: insertError } = await (supabase.from('documents') as any)
          .insert({
            contact_id: contactId,
            company_id: profile.company_id,
            name: docName,
            type: 'photo',
            url: publicUrl,
            size: blob.size,
            uploaded_by: user.id,
          })
          .select('id')
          .single();
        if (insertError) throw insertError;
        setItems((prev) =>
          prev.map((i) =>
            i.label === label ? { ...i, docId: inserted.id, photoUrl: publicUrl, uploading: false } : i
          )
        );
      }
    } catch (err) {
      console.error('[PhotoChecklist] uploadPhoto error:', err);
      setItemUploading(label, false);
      alert('Failed to upload photo. Please try again.');
    }
  };

  const handleCameraPress = async (label: string, index: number) => {
    if (Capacitor.isNativePlatform()) {
      try {
        const photo = await CapCamera.getPhoto({
          quality: 85,
          allowEditing: false,
          resultType: CameraResultType.Base64,
          source: CameraSource.Prompt, // shows "Take Photo" or "Choose from Library"
        });
        if (!photo.base64String) return;
        const byteCharacters = atob(photo.base64String);
        const byteArray = new Uint8Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteArray[i] = byteCharacters.charCodeAt(i);
        }
        const blob = new Blob([byteArray], { type: 'image/jpeg' });
        await uploadPhoto(label, blob);
      } catch (err: any) {
        // User cancelled — not a real error
        if (!String(err).toLowerCase().includes('cancel') && !String(err).toLowerCase().includes('dismiss')) {
          console.error('[PhotoChecklist] camera error:', err);
          alert('Could not open camera. Please try again.');
        }
      }
    } else {
      // Web fallback — trigger file input
      fileInputRefs.current[index]?.click();
    }
  };

  const handleFileInput = async (label: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadPhoto(label, file);
    e.target.value = '';
  };

  const handleDelete = async (label: string, docId: string) => {
    setItemUploading(label, true);
    try {
      await (supabase.from('documents') as any).delete().eq('id', docId);
      setItems((prev) =>
        prev.map((i) => (i.label === label ? { ...i, docId: null, photoUrl: null, uploading: false } : i))
      );
    } catch (err) {
      console.error('[PhotoChecklist] delete error:', err);
      setItemUploading(label, false);
    }
  };

  const completed = items.filter((i) => i.photoUrl).length;
  const pct = Math.round((completed / items.length) * 100);

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 p-6 sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-slate-400 active:scale-90 transition-transform">
            <ChevronLeft size={24} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-primary">Photo Checklist</h1>
            {contactName && (
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider truncate">{contactName}</p>
            )}
            {!contactId && (
              <p className="text-[11px] font-semibold text-rose-400 uppercase tracking-wider">No contact selected</p>
            )}
          </div>
          <button
            onClick={loadPhotos}
            className="p-2 text-slate-400 active:scale-90 transition-transform"
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      <div className="p-6 space-y-4">
        {/* Progress card */}
        <div className="card p-5 bg-primary text-white flex items-center justify-between">
          <div>
            <p className="text-xs text-white/60 font-bold uppercase tracking-widest">Photos Captured</p>
            <p className="text-2xl font-bold">{completed} / {items.length}</p>
          </div>
          <div className="h-14 w-14 rounded-full border-4 border-white/20 flex items-center justify-center">
            <span className="text-sm font-bold">{pct}%</span>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item, i) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="card p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  {/* Status icon + label */}
                  <div className="flex items-center gap-3 min-w-0">
                    {item.photoUrl ? (
                      <CheckCircle2 className="text-emerald-500 shrink-0" size={22} />
                    ) : (
                      <Circle className="text-slate-200 shrink-0" size={22} />
                    )}
                    <p className={`text-sm font-bold truncate ${item.photoUrl ? 'text-emerald-600' : 'text-primary'}`}>
                      {item.label}
                    </p>
                  </div>

                  {/* Camera / thumbnail */}
                  <div className="flex items-center gap-2 shrink-0">
                    {item.photoUrl && (
                      <div className="relative h-12 w-12 rounded-xl overflow-hidden border border-slate-100 shrink-0">
                        <img
                          src={item.photoUrl}
                          alt={item.label}
                          className="h-full w-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    )}

                    {/* Camera button */}
                    <button
                      onClick={() => handleCameraPress(item.label, i)}
                      disabled={item.uploading || !contactId}
                      className="h-11 w-11 rounded-xl bg-accent/10 flex items-center justify-center text-accent active:scale-90 transition-transform disabled:opacity-40"
                    >
                      {item.uploading ? (
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                      ) : (
                        <Camera size={18} />
                      )}
                    </button>

                    {/* Delete button — only show when photo exists */}
                    {item.docId && item.photoUrl && (
                      <button
                        onClick={() => handleDelete(item.label, item.docId!)}
                        disabled={item.uploading}
                        className="h-11 w-11 rounded-xl bg-rose-50 flex items-center justify-center text-rose-400 active:scale-90 transition-transform disabled:opacity-40"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}

                    {/* Web fallback file input */}
                    <input
                      ref={(el) => { fileInputRefs.current[i] = el; }}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => handleFileInput(item.label, e)}
                    />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
