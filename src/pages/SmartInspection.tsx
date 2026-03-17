import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Camera, ArrowLeft, Crosshair, CheckCircle2, Send } from 'lucide-react';
import { PageTransition } from '../components/PageTransition';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { cn } from '../lib/utils';

type Elevation = 'North' | 'South' | 'East' | 'West' | 'Garage' | 'Detached';

const ELEVATIONS: Elevation[] = ['North', 'South', 'East', 'West', 'Garage', 'Detached'];

export default function SmartInspection() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { profile } = useAuth();
  const [activeElevation, setActiveElevation] = useState<Elevation>('North');
  const [photoCounts, setPhotoCounts] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);

  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id || !profile) return;

    try {
      const ext = file.name.split('.').pop();
      const filePath = `${id}/${activeElevation}_${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('documents')
        .getPublicUrl(filePath);

      await supabase.from('documents').insert({
        contact_id: id,
        company_id: profile.company_id,
        name: `${activeElevation} Slope Photo`,
        type: 'photo',
        url: publicUrl,
        size: file.size,
        uploaded_by: profile.full_name || profile.email,
      } as any);

      setPhotoCounts((prev) => ({
        ...prev,
        [activeElevation]: (prev[activeElevation] || 0) + 1,
      }));
    } catch (err) {
      console.error('Upload error:', err);
      alert('Photo upload failed. Check Supabase storage bucket.');
    }
  };

  const handleSubmit = async () => {
    if (!id || !profile) return;
    setSubmitting(true);
    try {
      const total = Object.values(photoCounts).reduce((a, b) => a + b, 0);
      await supabase.from('communications').insert({
        contact_id: id,
        company_id: profile.company_id,
        type: 'note',
        content: `📸 Smart Inspection completed — ${total} photos uploaded across elevations: ${Object.entries(photoCounts)
          .filter(([, v]) => v > 0)
          .map(([k, v]) => `${k}(${v})`)
          .join(', ')}`,
        user_id: profile.id,
        direction: 'outbound',
      } as any);
      alert('Inspection saved to timeline!');
      navigate(-1);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageTransition>
      <div className="min-h-screen bg-slate-900 text-white flex flex-col">
        <nav className="p-4 flex items-center gap-4 bg-slate-900/80 backdrop-blur-xl border-b border-white/10 sticky top-0 z-20">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-sm font-black uppercase tracking-widest">Smart Inspection</h1>
        </nav>

        {/* Compass Selector */}
        <div className="p-6 flex flex-col items-center">
          <div className="relative w-64 h-64 flex items-center justify-center">
            <div className="absolute inset-0 border-2 border-white/10 rounded-full" />

            {(['North', 'South', 'East', 'West'] as Elevation[]).map((dir, i) => (
              <button
                key={dir}
                onClick={() => setActiveElevation(dir)}
                className={cn(
                  'absolute w-14 h-14 rounded-full flex flex-col items-center justify-center transition-all border-2',
                  activeElevation === dir
                    ? 'bg-accent border-white scale-110 shadow-[0_0_20px_rgba(245,158,11,0.5)]'
                    : 'bg-slate-800 border-white/20 text-slate-400',
                  i === 0 && 'top-0',
                  i === 1 && 'bottom-0',
                  i === 2 && 'right-0',
                  i === 3 && 'left-0'
                )}
              >
                <span className="text-[10px] font-black">{dir[0]}</span>
                {(photoCounts[dir] || 0) > 0 && <CheckCircle2 size={10} className="mt-0.5" />}
              </button>
            ))}

            <div className="text-center z-10">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Target</p>
              <p className="text-xl font-black">{activeElevation}</p>
              <p className="text-[10px] text-slate-500">{photoCounts[activeElevation] || 0} photos</p>
            </div>
          </div>

          {/* Extra elevations */}
          <div className="flex gap-3 mt-4">
            {(['Garage', 'Detached'] as Elevation[]).map((dir) => (
              <button
                key={dir}
                onClick={() => setActiveElevation(dir)}
                className={cn(
                  'px-4 py-2 rounded-full text-xs font-bold border transition-all',
                  activeElevation === dir
                    ? 'bg-accent border-accent text-white'
                    : 'bg-slate-800 border-white/20 text-slate-400'
                )}
              >
                {dir} {(photoCounts[dir] || 0) > 0 && `(${photoCounts[dir]})`}
              </button>
            ))}
          </div>
        </div>

        {/* Camera Panel */}
        <div className="flex-1 bg-white rounded-t-[32px] p-6 text-slate-900">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-black uppercase tracking-tight">{activeElevation} Slope</h2>
            <span className="text-xs font-bold text-slate-400">
              {photoCounts[activeElevation] || 0} captured
            </span>
          </div>

          <label className="block w-full cursor-pointer">
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleCapture}
            />
            <div className="aspect-square bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center gap-3 text-slate-400 active:bg-slate-100 transition-colors">
              <div className="w-16 h-16 bg-accent text-white rounded-full flex items-center justify-center shadow-lg">
                <Camera size={28} />
              </div>
              <span className="text-sm font-bold text-slate-500">Tap to capture {activeElevation} slope</span>
              <span className="text-xs text-slate-400">Photos upload directly to Supabase</span>
            </div>
          </label>

          <button
            onClick={handleSubmit}
            disabled={submitting || Object.values(photoCounts).every((v) => v === 0)}
            className="w-full mt-6 bg-primary text-white font-black py-4 rounded-2xl shadow-xl flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50"
          >
            <Send size={20} />
            {submitting ? 'Saving...' : 'Submit Inspection to Timeline'}
          </button>
        </div>
      </div>
    </PageTransition>
  );
}
