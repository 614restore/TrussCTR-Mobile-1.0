import React, { useState } from 'react';
import { Camera, ChevronLeft, CheckCircle2, Circle, Upload } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Camera as CapCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

interface ChecklistItem {
  id: number;
  label: string;
  completed: boolean;
  photo: string | null;
  uploading?: boolean;
}

export default function PhotoChecklist() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [items, setItems] = useState<ChecklistItem[]>([
    { id: 1, label: 'Front Elevation', completed: false, photo: null },
    { id: 2, label: 'Rear Elevation', completed: false, photo: null },
    { id: 3, label: 'Left Elevation', completed: false, photo: null },
    { id: 4, label: 'Right Elevation', completed: false, photo: null },
    { id: 5, label: 'Roof Surface (General)', completed: false, photo: null },
    { id: 6, label: 'Flashing Details', completed: false, photo: null },
    { id: 7, label: 'Gutter Condition', completed: false, photo: null },
    { id: 8, label: 'Attic/Interior Leaks', completed: false, photo: null },
  ]);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleCapture = async (itemId: number) => {
    setUploadError(null);
    try {
      const photo = await CapCamera.getPhoto({
        quality: 85,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
        promptLabelHeader: 'Take Photo',
        promptLabelPhoto: 'Choose from Library',
        promptLabelPicture: 'Take Photo',
      });

      if (!photo.dataUrl) return;

      // Mark as uploading
      setItems(prev =>
        prev.map(item => item.id === itemId ? { ...item, uploading: true } : item)
      );

      // Convert dataUrl to blob for upload
      const res = await fetch(photo.dataUrl);
      const blob = await res.blob();
      const ext = photo.format || 'jpeg';
      const fileName = `checklist_${itemId}_${Date.now()}.${ext}`;
      const filePath = profile?.company_id
        ? `${profile.company_id}/checklist/${fileName}`
        : `public/checklist/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, blob, { contentType: `image/${ext}`, upsert: false });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('documents')
        .getPublicUrl(filePath);

      setItems(prev =>
        prev.map(item =>
          item.id === itemId
            ? { ...item, completed: true, photo: publicUrl, uploading: false }
            : item
        )
      );
    } catch (err: unknown) {
      // User cancelled camera — not an error
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.toLowerCase().includes('cancel') && !msg.toLowerCase().includes('dismissed')) {
        console.error('Photo capture error:', err);
        setUploadError('Photo upload failed. Please try again.');
      }
      setItems(prev =>
        prev.map(item => item.id === itemId ? { ...item, uploading: false } : item)
      );
    }
  };

  const toggleItem = (id: number) => {
    setItems(prev =>
      prev.map(item => item.id === id ? { ...item, completed: !item.completed } : item)
    );
  };

  const completedCount = items.filter(i => i.completed).length;
  const progressPct = Math.round((completedCount / items.length) * 100);

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 p-6 sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-slate-400 active:scale-90 transition-transform">
            <ChevronLeft size={24} />
          </button>
          <h1 className="text-xl font-bold text-primary">Photo Checklist</h1>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Progress Card */}
        <div className="card p-5 bg-primary text-white flex items-center justify-between">
          <div>
            <p className="text-xs text-white/60 font-bold uppercase tracking-widest">Progress</p>
            <p className="text-2xl font-bold">{completedCount} / {items.length}</p>
          </div>
          <div className="h-14 w-14 rounded-full border-4 border-white/20 flex items-center justify-center">
            <span className="text-sm font-bold">{progressPct}%</span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-accent rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {uploadError && (
          <div className="bg-red-50 border border-red-100 text-red-600 text-xs font-bold p-4 rounded-2xl">
            {uploadError}
          </div>
        )}

        {/* Checklist Items */}
        <div className="space-y-3">
          {items.map((item, i) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="card p-4 flex items-center justify-between active:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-4">
                <button onClick={() => toggleItem(item.id)}>
                  {item.completed ? (
                    <CheckCircle2 className="text-emerald-500" size={24} />
                  ) : (
                    <Circle className="text-slate-200" size={24} />
                  )}
                </button>
                <p className={`text-sm font-bold ${
                  item.completed ? 'text-slate-400 line-through' : 'text-primary'
                }`}>
                  {item.label}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {item.photo ? (
                  <div className="h-10 w-10 rounded-lg overflow-hidden border border-slate-100">
                    <img src={item.photo} alt={item.label} className="h-full w-full object-cover" />
                  </div>
                ) : (
                  <button
                    onClick={() => handleCapture(item.id)}
                    disabled={item.uploading}
                    className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 active:scale-90 transition-transform disabled:opacity-50"
                  >
                    {item.uploading ? (
                      <div className="h-4 w-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Camera size={18} />
                    )}
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Action Bar */}
      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-100 p-4 flex gap-3 z-20">
        <button
          onClick={() => navigate(-1)}
          disabled={completedCount === 0}
          className="flex-1 bg-primary text-white py-4 rounded-2xl text-xs font-bold uppercase tracking-widest active:scale-95 transition-transform flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Upload size={18} />
          Done ({completedCount}/{items.length})
        </button>
      </div>
    </div>
  );
}
