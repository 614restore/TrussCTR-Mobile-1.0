import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Camera, ArrowLeft, CheckCircle2, Send, ClipboardCheck, Plus } from 'lucide-react';
import { PageTransition } from '../components/PageTransition';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { cn } from '../lib/utils';
import { buildStoredDocumentUrl } from '../lib/documentAccess';
import { handleAutoMove } from '../lib/store';

type Section = 'exterior' | 'detached' | 'interior';

const EXTERIOR_DIRS = ['Front', 'Back', 'Left', 'Right'] as const;
const DETACHED_DIRS = ['Det. Front', 'Det. Back', 'Det. Left', 'Det. Right'] as const;
const INTERIOR_ROOMS = ['Bedroom', 'Bathroom', 'Kitchen', 'Living Room', 'Dining Room', 'Attic'] as const;

export default function SmartInspection() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { profile } = useAuth();

  const SMART_DRAFT_KEY = `trussctr_smart_inspection_draft_${id ?? 'unknown'}`;
  const loadSmartDraft = () => {
    try { const r = localStorage.getItem(SMART_DRAFT_KEY); return r ? JSON.parse(r) : null; } catch { return null; }
  };
  const smartDraft = React.useMemo(loadSmartDraft, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [section, setSection] = useState<Section>(smartDraft?.section ?? 'exterior');
  const [activeLocation, setActiveLocation] = useState<string>(smartDraft?.activeLocation ?? 'Front');
  const [customRoom, setCustomRoom] = useState<string>(smartDraft?.customRoom ?? '');
  const [photoCounts, setPhotoCounts] = useState<Record<string, number>>(smartDraft?.photoCounts ?? {});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [step, setStep] = useState<'photos' | 'questions'>(smartDraft?.step ?? 'photos');
  const [checklist, setChecklist] = useState(smartDraft?.checklist ?? {
    roofAge: '',
    material: '',
    damageTypes: [] as string[],
  });

  // Auto-save draft whenever state changes
  React.useEffect(() => {
    if (submitted) return;
    try {
      localStorage.setItem(SMART_DRAFT_KEY, JSON.stringify({ step, section, activeLocation, customRoom, photoCounts, checklist }));
    } catch { /* ignore */ }
  }, [step, section, activeLocation, customRoom, photoCounts, checklist]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearSmartDraft = () => { try { localStorage.removeItem(SMART_DRAFT_KEY); } catch { /* ignore */ } };

  const hasDraftProgress = !!(smartDraft && (
    smartDraft.step === 'questions' ||
    Object.values(smartDraft.photoCounts ?? {}).some((v) => (v as number) > 0)
  ));

  // Resolve effective location label (custom room uses typed name)
  const effectiveLocation = section === 'interior' && activeLocation === 'Custom'
    ? (customRoom.trim() || 'Custom')
    : activeLocation;

  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id || !profile) return;

    try {
      const rawExt = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const ext = rawExt === 'heic' || rawExt === 'heif' ? 'jpg' : rawExt;
      const locationLabel = effectiveLocation.replace(/\s+/g, '_');
      const filePath = `${id}/${locationLabel}_${Date.now()}.${ext}`;

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
        name: `${effectiveLocation} Photo`,
        type: 'photo',
        url: buildStoredDocumentUrl(publicUrl, 'documents', filePath),
        size: file.size,
        uploaded_by: profile.id,
      } as any);

      setPhotoCounts((prev) => ({
        ...prev,
        [effectiveLocation]: (prev[effectiveLocation] || 0) + 1,
      }));
    } catch (err) {
      console.error('Upload error:', err);
      alert('Photo upload failed. Check Supabase storage bucket.');
    }
  };

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

  const handleSubmit = async () => {
    if (!id || !profile) {
      alert('Session not ready. Please wait a moment and try again.');
      return;
    }
    if (!profile.company_id) {
      alert('Your account is not linked to a company. Please contact your administrator.');
      return;
    }
    setSubmitting(true);
    try {
      const total = (Object.values(photoCounts) as number[]).reduce((a, b) => a + b, 0);
      const damage = checklist.damageTypes.length ? checklist.damageTypes.join(', ') : 'None';

      const timeout = <T,>(promise: Promise<T>): Promise<T> =>
        Promise.race([
          promise,
          new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error('Save timed out — check your connection and try again.')), 15000)
          ),
        ]);

      const { error: commError } = await timeout<any>(
        supabase.from('communications').insert({
          contact_id: id,
          company_id: profile.company_id,
          type: 'note',
          content: `📸 Smart Inspection completed — ${total} photos uploaded:\n${Object.entries(photoCounts)
            .filter(([, v]) => (v as number) > 0)
            .map(([k, v]) => `  • ${k}: ${v} photo${(v as number) !== 1 ? 's' : ''}`)
            .join('\n')}\n\nChecklist:\nAge: ${checklist.roofAge || '—'}\nMaterial: ${checklist.material || '—'}\nDamage: ${damage}`,
          user_id: profile.id,
          direction: 'outbound',
        } as any) as any
      );
      if (commError) throw commError;

      try {
        await (supabase.from('inspections') as any).upsert({
          contact_id: id,
          company_id: profile.company_id,
          user_id: profile.id,
          status: 'completed',
          data: {
            photoCounts,
            checklist,
            completedAt: new Date().toISOString(),
          },
        }, { onConflict: 'contact_id' });
      } catch {
        // ignore if inspections table is unavailable
      }
      await handleAutoMove(id, 'submit_inspection');
      clearSmartDraft();
      setSubmitted(true);
    } catch (err) {
      console.error('[SmartInspection] submit error:', err);
      const message = err instanceof Error ? err.message : 'Unknown error';
      alert(`Failed to save inspection: ${message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const totalPhotos = (Object.values(photoCounts) as number[]).reduce((a, b) => a + b, 0);

  return (
    <PageTransition>
      <div className="min-h-screen bg-slate-900 text-white flex flex-col">
        <nav className="p-4 flex items-center gap-4 bg-slate-900/80 backdrop-blur-xl border-b border-white/10 sticky top-0 z-20">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <ArrowLeft size={24} />
          </button>
          <div className="flex-1">
            <h1 className="text-sm font-black uppercase tracking-widest">Smart Inspection</h1>
            {hasDraftProgress && !submitted && (
              <p className="text-[10px] text-accent font-bold mt-0.5">📋 Draft restored — pick up where you left off</p>
            )}
          </div>
          {hasDraftProgress && !submitted && (
            <button onClick={() => { clearSmartDraft(); window.location.reload(); }} className="text-[10px] text-slate-400 underline">
              Clear
            </button>
          )}
        </nav>

        {/* Location Selector */}
        {step === 'photos' && (
          <div className="p-4 flex flex-col gap-3">

            {/* Section Tabs */}
            <div className="flex gap-2">
              {(['exterior', 'detached', 'interior'] as Section[]).map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setSection(s);
                    if (s === 'exterior') setActiveLocation('Front');
                    else if (s === 'detached') setActiveLocation('Det. Front');
                    else setActiveLocation('Bedroom');
                  }}
                  className={cn(
                    'flex-1 py-2 rounded-xl text-[11px] font-black uppercase tracking-wide border transition-all',
                    section === s
                      ? 'bg-accent border-accent text-white shadow-[0_0_12px_rgba(245,158,11,0.4)]'
                      : 'bg-white/10 border-white/20 text-slate-400'
                  )}
                >
                  {s === 'exterior' ? 'Exterior' : s === 'detached' ? 'Detached' : 'Interior'}
                </button>
              ))}
            </div>

            {/* Exterior Directions */}
            {section === 'exterior' && (
              <div className="grid grid-cols-2 gap-2">
                {EXTERIOR_DIRS.map((dir) => (
                  <button
                    key={dir}
                    onClick={() => setActiveLocation(dir)}
                    className={cn(
                      'py-3 rounded-2xl flex flex-col items-center gap-1 border-2 transition-all',
                      activeLocation === dir
                        ? 'bg-accent border-white text-white shadow-[0_0_16px_rgba(245,158,11,0.4)]'
                        : 'bg-white/10 border-white/20 text-slate-300'
                    )}
                  >
                    <span className="text-sm font-black">{dir}</span>
                    {(photoCounts[dir] || 0) > 0 && (
                      <span className="flex items-center gap-0.5 text-[10px] font-bold">
                        <CheckCircle2 size={10} />
                        {photoCounts[dir]}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Detached Directions */}
            {section === 'detached' && (
              <div className="grid grid-cols-2 gap-2">
                {DETACHED_DIRS.map((dir) => (
                  <button
                    key={dir}
                    onClick={() => setActiveLocation(dir)}
                    className={cn(
                      'py-3 rounded-2xl flex flex-col items-center gap-1 border-2 transition-all',
                      activeLocation === dir
                        ? 'bg-accent border-white text-white shadow-[0_0_16px_rgba(245,158,11,0.4)]'
                        : 'bg-white/10 border-white/20 text-slate-300'
                    )}
                  >
                    <span className="text-sm font-black">{dir}</span>
                    {(photoCounts[dir] || 0) > 0 && (
                      <span className="flex items-center gap-0.5 text-[10px] font-bold">
                        <CheckCircle2 size={10} />
                        {photoCounts[dir]}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Interior Rooms */}
            {section === 'interior' && (
              <div className="flex flex-col gap-2">
                <div className="grid grid-cols-2 gap-2">
                  {INTERIOR_ROOMS.map((room) => (
                    <button
                      key={room}
                      onClick={() => setActiveLocation(room)}
                      className={cn(
                        'py-3 rounded-2xl flex flex-col items-center gap-1 border-2 transition-all',
                        activeLocation === room
                          ? 'bg-accent border-white text-white shadow-[0_0_16px_rgba(245,158,11,0.4)]'
                          : 'bg-white/10 border-white/20 text-slate-300'
                      )}
                    >
                      <span className="text-xs font-black">{room}</span>
                      {(photoCounts[room] || 0) > 0 && (
                        <span className="flex items-center gap-0.5 text-[10px] font-bold">
                          <CheckCircle2 size={10} />
                          {photoCounts[room]}
                        </span>
                      )}
                    </button>
                  ))}

                  {/* Custom Room */}
                  <button
                    onClick={() => setActiveLocation('Custom')}
                    className={cn(
                      'py-3 rounded-2xl flex flex-col items-center gap-1 border-2 transition-all',
                      activeLocation === 'Custom'
                        ? 'bg-accent border-white text-white shadow-[0_0_16px_rgba(245,158,11,0.4)]'
                        : 'bg-white/10 border-white/20 text-slate-300'
                    )}
                  >
                    <Plus size={14} />
                    <span className="text-xs font-black">Custom</span>
                    {customRoom.trim() && (photoCounts[customRoom.trim()] || 0) > 0 && (
                      <span className="flex items-center gap-0.5 text-[10px] font-bold">
                        <CheckCircle2 size={10} />
                        {photoCounts[customRoom.trim()]}
                      </span>
                    )}
                  </button>
                </div>

                {/* Custom room name input */}
                {activeLocation === 'Custom' && (
                  <input
                    type="text"
                    placeholder="Enter room name…"
                    value={customRoom}
                    onChange={(e) => setCustomRoom(e.target.value)}
                    className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-accent"
                    autoFocus
                  />
                )}
              </div>
            )}
          </div>
        )}

        {/* Camera Panel */}
        <div className="flex-1 bg-white rounded-t-[32px] p-6 text-slate-900">
          {step === 'photos' && (
          <>
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-lg font-black uppercase tracking-tight">{effectiveLocation}</h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">
                {section === 'exterior' ? 'Exterior' : section === 'detached' ? 'Detached Building' : 'Interior'}
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs font-bold text-slate-400">
                {photoCounts[effectiveLocation] || 0} here
              </span>
              {totalPhotos > 0 && (
                <p className="text-[10px] text-slate-400">{totalPhotos} total</p>
              )}
            </div>
          </div>

          {/* Custom room not named warning */}
          {section === 'interior' && activeLocation === 'Custom' && !customRoom.trim() && (
            <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <p className="text-xs font-bold text-amber-700">Enter a room name above before capturing photos.</p>
            </div>
          )}

          <label className={cn('block w-full', section === 'interior' && activeLocation === 'Custom' && !customRoom.trim() ? 'pointer-events-none opacity-50' : 'cursor-pointer')}>
            <input
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
              capture="environment"
              className="hidden"
              onChange={handleCapture}
            />
            <div className="aspect-square bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center gap-3 text-slate-400 active:bg-slate-100 transition-colors">
              <div className="w-16 h-16 bg-accent text-white rounded-full flex items-center justify-center shadow-lg">
                <Camera size={28} />
              </div>
              <span className="text-sm font-bold text-slate-500">Tap to capture {effectiveLocation}</span>
              <span className="text-xs text-slate-400">Photos upload directly to Supabase</span>
            </div>
          </label>

          <button
            onClick={() => setStep('questions')}
            disabled={totalPhotos === 0}
            className="w-full mt-6 bg-primary text-white font-black py-4 rounded-2xl shadow-xl flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50"
          >
            <Send size={20} />
            Next: Inspection Questions
          </button>
          </>
          )}

          {step === 'questions' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black uppercase tracking-tight">Final Questions</h2>
              <button onClick={() => setStep('photos')} className="text-xs font-bold text-slate-500 underline">Back to Photos</button>
            </div>

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
              <label className="text-[10px] font-bold text-slate-400 uppercase">Damage Observed (Select all that apply)</label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {['Hail', 'Wind', 'Wear', 'None'].map(d => (
                  <button key={d} onClick={() => toggleDamage(d)} className={`p-3 rounded-xl text-xs font-bold border transition-all ${checklist.damageTypes.includes(d) ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white border-slate-100 text-slate-600'}`}>{d}</button>
                ))}
              </div>
            </div>

            <button
              onClick={handleSubmit}
              disabled={submitting || !checklist.material || !checklist.roofAge || checklist.damageTypes.length === 0}
              className="w-full mt-2 bg-emerald-600 text-white font-black py-4 rounded-2xl shadow-xl flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50"
            >
              <ClipboardCheck size={20} />
              {submitting ? 'Marking Complete...' : 'Mark Inspection Complete'}
            </button>
          </div>
          )}

          {/* ── Success Screen ── */}
          {submitted && (
            <div className="flex flex-col items-center justify-center gap-6 py-10 text-center">
              <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center">
                <CheckCircle2 size={40} className="text-emerald-600" />
              </div>
              <div>
                <h2 className="text-xl font-black text-emerald-700 uppercase tracking-tight">Inspection Complete</h2>
                <p className="text-sm text-slate-500 mt-1">Status updated · Saved to timeline</p>
              </div>
              <div className="w-full space-y-3">
                <div className="bg-slate-50 rounded-2xl p-4 text-left space-y-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Summary</p>
                  <p className="text-sm text-slate-700">
                    <span className="font-bold">{totalPhotos}</span> photos •{' '}
                    <span className="font-bold">{checklist.material || '—'}</span> •{' '}
                    <span className="font-bold">{checklist.damageTypes.join(', ') || 'No damage noted'}</span>
                  </p>
                  {Object.keys(photoCounts).length > 0 && (
                    <div className="mt-2 space-y-0.5">
                      {Object.entries(photoCounts).filter(([, v]) => (v as number) > 0).map(([loc, count]) => (
                        <p key={loc} className="text-[11px] text-slate-500">• {loc}: {count as number} photo{(count as number) !== 1 ? 's' : ''}</p>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => navigate(-1)}
                  className="w-full bg-primary text-white font-black py-4 rounded-2xl shadow-xl flex items-center justify-center gap-2 active:scale-95 transition-transform"
                >
                  <ArrowLeft size={20} />
                  Back to Contact
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </PageTransition>
  );
}
