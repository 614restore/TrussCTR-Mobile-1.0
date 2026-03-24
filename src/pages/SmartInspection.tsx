import React, { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Camera, ArrowLeft, CheckCircle2, Send, Plus, Building2, DoorOpen } from 'lucide-react';
import { PageTransition } from '../components/PageTransition';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { cn } from '../lib/utils';
import { buildStoredDocumentUrl } from '../lib/documentAccess';
import { handleAutoMove } from '../lib/store';
import {
  getElevationStyle,
  getMainElevations,
  FIXED_DIRS,
  INDOOR_PREFIX,
  DEFAULT_ROOMS,
  type ElevationStyle,
} from '../lib/photoPreferences';

// ─── helpers ───────────────────────────────────────────────────────────────

function buildingPhotoKey(buildingIdx: number, buildingName: string, elevation: string): string {
  return buildingIdx === 0 ? elevation : `${buildingName} – ${elevation}`;
}

const MAX_BUILDINGS = 5;

// ─── component ─────────────────────────────────────────────────────────────

export default function SmartInspection() {
  const navigate  = useNavigate();
  const { id }    = useParams();
  const { profile } = useAuth();

  const [elevStyle] = useState<ElevationStyle>(() => getElevationStyle());
  const mainDirs    = getMainElevations(elevStyle);

  // ── exterior buildings ──
  const [buildings, setBuildings]             = useState<string[]>(['Main']);
  const [activeBuildingIdx, setActiveBuildingIdx] = useState(0);
  const [activeElevation, setActiveElevation] = useState<string>(mainDirs[0]);

  // ── indoor mode ──
  const [showIndoor, setShowIndoor]   = useState(false);
  const [activeRoom, setActiveRoom]   = useState<string>(DEFAULT_ROOMS[0]);
  const [customRooms, setCustomRooms] = useState<string[]>([]);
  const [addingRoom, setAddingRoom]   = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const newRoomInputRef = useRef<HTMLInputElement>(null);

  const allRooms = [...DEFAULT_ROOMS, ...customRooms];

  // ── shared ──
  const [photoCounts, setPhotoCounts] = useState<Record<string, number>>({});
  const [submitting, setSubmitting]   = useState(false);
  const [step, setStep]               = useState<'photos' | 'questions'>('photos');
  const [checklist, setChecklist]     = useState({ roofAge: '', material: '', damageTypes: [] as string[] });

  // Current full photo key
  const currentKey = showIndoor
    ? `${INDOOR_PREFIX} – ${activeRoom}`
    : buildingPhotoKey(activeBuildingIdx, buildings[activeBuildingIdx], activeElevation);

  // ── building helpers ──
  const switchBuilding = (idx: number) => {
    setShowIndoor(false);
    setActiveBuildingIdx(idx);
    setActiveElevation(mainDirs[0]);
  };

  const addBuilding = () => {
    if (buildings.length >= MAX_BUILDINGS) return;
    const name = `Building ${buildings.length + 1}`;
    setBuildings((prev) => [...prev, name]);
    setActiveBuildingIdx(buildings.length);
    setShowIndoor(false);
    setActiveElevation(mainDirs[0]);
  };

  const switchToIndoor = () => {
    setShowIndoor(true);
    setActiveBuildingIdx(-1);
  };

  // ── room helpers ──
  const commitNewRoom = () => {
    const name = newRoomName.trim();
    if (!name) { setAddingRoom(false); return; }
    setCustomRooms((prev) => [...prev, name]);
    setActiveRoom(name);
    setNewRoomName('');
    setAddingRoom(false);
  };

  // ── photo capture ──
  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id || !profile) return;

    try {
      const rawExt = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const ext    = rawExt === 'heic' || rawExt === 'heif' ? 'jpg' : rawExt;
      const filePath = `${id}/${currentKey.replace(/[\s–]/g, '_')}_${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage.from('documents').upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(filePath);

      await supabase.from('documents').insert({
        contact_id:  id,
        company_id:  profile.company_id,
        name:        showIndoor ? `${currentKey} Photo` : `${currentKey} Slope Photo`,
        type:        'photo',
        url:         buildStoredDocumentUrl(publicUrl, 'documents', filePath),
        size:        file.size,
        uploaded_by: profile.id,
      } as any);

      setPhotoCounts((prev) => ({ ...prev, [currentKey]: (prev[currentKey] || 0) + 1 }));
    } catch (err) {
      console.error('Upload error:', err);
      alert('Photo upload failed. Check Supabase storage bucket.');
    }

    e.target.value = '';
  };

  // ── checklist ──
  const toggleDamage = (type: string) => {
    setChecklist((prev) => {
      if (type === 'None') return { ...prev, damageTypes: prev.damageTypes.includes('None') ? [] : ['None'] };
      const next = prev.damageTypes.filter((d) => d !== 'None');
      return { ...prev, damageTypes: next.includes(type) ? next.filter((d) => d !== type) : [...next, type] };
    });
  };

  // ── submit ──
  const handleSubmit = async () => {
    if (!id || !profile) return;
    setSubmitting(true);
    try {
      const total   = Object.values(photoCounts).reduce((a, b) => a + b, 0);
      const damage  = checklist.damageTypes.length ? checklist.damageTypes.join(', ') : 'None';

      const exteriorEntries = Object.entries(photoCounts).filter(([k]) => !k.startsWith(INDOOR_PREFIX));
      const indoorEntries   = Object.entries(photoCounts).filter(([k]) =>  k.startsWith(INDOOR_PREFIX));

      const extSummary = exteriorEntries.filter(([, v]) => v > 0).map(([k, v]) => `${k}(${v})`).join(', ');
      const indSummary = indoorEntries.filter(([, v]) => v > 0).map(([k, v]) => `${k.replace(`${INDOOR_PREFIX} – `, '')}(${v})`).join(', ');

      const lines = [`📸 Smart Inspection completed — ${total} total photos`];
      if (extSummary) lines.push(`Exterior: ${extSummary}`);
      if (indSummary) lines.push(`Indoor: ${indSummary}`);
      if (buildings.length > 1) lines.push(`Buildings: ${buildings.join(', ')}`);
      lines.push('');
      lines.push(`Checklist:\nAge: ${checklist.roofAge || '—'}\nMaterial: ${checklist.material || '—'}\nDamage: ${damage}`);

      await supabase.from('communications').insert({
        contact_id: id, company_id: profile.company_id, type: 'note',
        content: lines.join('\n'), user_id: profile.id, direction: 'outbound',
      } as any);

      try {
        await (supabase.from('inspections') as any).upsert({
          contact_id: id, company_id: profile.company_id, user_id: profile.id, status: 'completed',
          data: { photoCounts, buildings, customRooms, elevationStyle: elevStyle, checklist, completedAt: new Date().toISOString() },
        }, { onConflict: 'contact_id' });
      } catch { /* ignore if table unavailable */ }

      await handleAutoMove(id, 'submit_inspection');
      alert('Inspection saved to timeline!');
      navigate(-1);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  // ── derived ──
  const totalPhotos   = Object.values(photoCounts).reduce((a, b) => a + b, 0);
  const indoorPhotos  = Object.entries(photoCounts).filter(([k]) => k.startsWith(INDOOR_PREFIX)).reduce((a, [, v]) => a + v, 0);

  // ── render ──
  return (
    <PageTransition>
      <div className="min-h-screen bg-slate-900 text-white flex flex-col">

        {/* Nav */}
        <nav className="p-4 flex items-center gap-4 bg-slate-900/80 backdrop-blur-xl border-b border-white/10 sticky top-0 z-20">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-sm font-black uppercase tracking-widest flex-1">Smart Inspection</h1>
          {totalPhotos > 0 && (
            <span className="text-[10px] font-bold text-slate-400">{totalPhotos} photo{totalPhotos !== 1 ? 's' : ''}</span>
          )}
        </nav>

        {step === 'photos' && (
          <>
            {/* Tab row — buildings + Indoor Photos */}
            <div className="flex items-center gap-2 px-4 pt-4 pb-1 overflow-x-auto scrollbar-none">
              {buildings.map((name, idx) => (
                <button key={idx} onClick={() => switchBuilding(idx)}
                  className={cn(
                    'flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold border transition-all',
                    !showIndoor && activeBuildingIdx === idx
                      ? 'bg-accent border-accent text-white'
                      : 'bg-slate-800 border-white/20 text-slate-400'
                  )}>
                  {idx > 0 && <Building2 size={11} />}
                  {name}
                </button>
              ))}

              {buildings.length < MAX_BUILDINGS && (
                <button onClick={addBuilding}
                  className="flex-shrink-0 flex items-center gap-1 px-3 py-2 rounded-full text-xs font-bold border border-dashed border-white/30 text-slate-500 transition-all">
                  <Plus size={12} /> Add Building
                </button>
              )}

              {/* Divider */}
              <div className="flex-shrink-0 w-px h-5 bg-white/10" />

              {/* Indoor Photos tab */}
              <button onClick={switchToIndoor}
                className={cn(
                  'flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold border transition-all',
                  showIndoor
                    ? 'bg-indigo-500 border-indigo-400 text-white'
                    : 'bg-slate-800 border-white/20 text-slate-400'
                )}>
                <DoorOpen size={12} />
                Indoor
                {indoorPhotos > 0 && !showIndoor && (
                  <span className="ml-0.5 bg-indigo-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[9px] font-black">{indoorPhotos}</span>
                )}
              </button>
            </div>

            {/* ── EXTERIOR: compass ── */}
            {!showIndoor && (
              <div className="p-6 flex flex-col items-center">
                <div className="relative w-64 h-64 flex items-center justify-center">
                  <div className="absolute inset-0 border-2 border-white/10 rounded-full" />
                  {mainDirs.map((dir, i) => (
                    <button key={dir} onClick={() => setActiveElevation(dir)}
                      className={cn(
                        'absolute w-14 h-14 rounded-full flex flex-col items-center justify-center transition-all border-2',
                        activeElevation === dir
                          ? 'bg-accent border-white scale-110 shadow-[0_0_20px_rgba(245,158,11,0.5)]'
                          : 'bg-slate-800 border-white/20 text-slate-400',
                        i === 0 && 'top-0', i === 1 && 'bottom-0',
                        i === 2 && 'right-0', i === 3 && 'left-0'
                      )}>
                      <span className="text-[10px] font-black">{dir[0]}</span>
                      {(photoCounts[buildingPhotoKey(activeBuildingIdx, buildings[activeBuildingIdx], dir)] || 0) > 0 && (
                        <CheckCircle2 size={10} className="mt-0.5" />
                      )}
                    </button>
                  ))}
                  <div className="text-center z-10">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Target</p>
                    <p className="text-xl font-black">{activeElevation}</p>
                    <p className="text-[10px] text-slate-500">
                      {photoCounts[currentKey] || 0} photo{(photoCounts[currentKey] || 0) !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>

                {/* Garage + Detached pills */}
                <div className="flex gap-3 mt-4">
                  {FIXED_DIRS.map((dir) => {
                    const key = buildingPhotoKey(activeBuildingIdx, buildings[activeBuildingIdx], dir);
                    return (
                      <button key={dir} onClick={() => setActiveElevation(dir)}
                        className={cn(
                          'px-4 py-2 rounded-full text-xs font-bold border transition-all',
                          activeElevation === dir ? 'bg-accent border-accent text-white' : 'bg-slate-800 border-white/20 text-slate-400'
                        )}>
                        {dir} {(photoCounts[key] || 0) > 0 && `(${photoCounts[key]})`}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── INDOOR: room grid ── */}
            {showIndoor && (
              <div className="px-6 pt-4 pb-2 flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-2">
                  {allRooms.map((room) => {
                    const key   = `${INDOOR_PREFIX} – ${room}`;
                    const count = photoCounts[key] || 0;
                    return (
                      <button key={room} onClick={() => setActiveRoom(room)}
                        className={cn(
                          'py-3 px-4 rounded-2xl text-xs font-bold border-2 transition-all flex items-center justify-between',
                          activeRoom === room
                            ? 'bg-indigo-500 border-indigo-400 text-white'
                            : 'bg-slate-800 border-white/10 text-slate-300'
                        )}>
                        <span className="truncate">{room}</span>
                        {count > 0 && (
                          <span className="flex items-center gap-1 ml-2 flex-shrink-0 opacity-80">
                            {count} <CheckCircle2 size={10} />
                          </span>
                        )}
                      </button>
                    );
                  })}

                  {/* Add Room */}
                  {!addingRoom ? (
                    <button onClick={() => { setAddingRoom(true); setTimeout(() => newRoomInputRef.current?.focus(), 50); }}
                      className="py-3 px-4 rounded-2xl text-xs font-bold border-2 border-dashed border-white/20 text-slate-500 flex items-center justify-center gap-1 col-span-1">
                      <Plus size={12} /> Add Room
                    </button>
                  ) : (
                    <div className="col-span-2 flex gap-2 items-center">
                      <input
                        ref={newRoomInputRef}
                        type="text"
                        value={newRoomName}
                        onChange={(e) => setNewRoomName(e.target.value)}
                        placeholder="Room name..."
                        className="flex-1 min-w-0 bg-slate-800 border border-white/20 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-indigo-400"
                        onKeyDown={(e) => { if (e.key === 'Enter') commitNewRoom(); if (e.key === 'Escape') { setAddingRoom(false); setNewRoomName(''); } }}
                      />
                      <button onClick={commitNewRoom} className="px-3 py-2 bg-indigo-500 rounded-xl text-xs font-bold text-white flex-shrink-0">Save</button>
                      <button onClick={() => { setAddingRoom(false); setNewRoomName(''); }} className="px-3 py-2 bg-slate-700 rounded-xl text-xs font-bold text-slate-400 flex-shrink-0">Cancel</button>
                    </div>
                  )}
                </div>

                <div className="text-center py-2">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Active Room</p>
                  <p className="text-xl font-black">{activeRoom}</p>
                  <p className="text-[10px] text-slate-500">
                    {photoCounts[currentKey] || 0} photo{(photoCounts[currentKey] || 0) !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
            )}
          </>
        )}

        {/* Camera / Questions panel */}
        <div className="flex-1 bg-white rounded-t-[32px] p-6 text-slate-900">
          {step === 'photos' && (
            <>
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-lg font-black uppercase tracking-tight">
                    {showIndoor ? activeRoom : activeElevation}
                  </h2>
                  {showIndoor && (
                    <p className="text-[10px] font-bold text-indigo-500 mt-0.5 uppercase tracking-widest">Indoor</p>
                  )}
                  {!showIndoor && activeBuildingIdx > 0 && (
                    <p className="text-[10px] font-bold text-slate-400 mt-0.5">{buildings[activeBuildingIdx]}</p>
                  )}
                </div>
                <span className="text-xs font-bold text-slate-400">
                  {photoCounts[currentKey] || 0} captured
                </span>
              </div>

              <label className="block w-full cursor-pointer">
                <input
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                  capture={showIndoor ? undefined : 'environment'}
                  className="hidden"
                  onChange={handleCapture}
                />
                <div className={cn(
                  'aspect-square border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-3 active:opacity-80 transition-all',
                  showIndoor
                    ? 'bg-indigo-50 border-indigo-200 text-indigo-400'
                    : 'bg-slate-50 border-slate-200 text-slate-400'
                )}>
                  <div className={cn(
                    'w-16 h-16 rounded-full flex items-center justify-center shadow-lg text-white',
                    showIndoor ? 'bg-indigo-500' : 'bg-accent'
                  )}>
                    {showIndoor ? <DoorOpen size={28} /> : <Camera size={28} />}
                  </div>
                  <span className="text-sm font-bold text-slate-500">
                    Tap to photograph{' '}
                    {showIndoor
                      ? activeRoom
                      : `${activeBuildingIdx > 0 ? `${buildings[activeBuildingIdx]} – ` : ''}${activeElevation}`}
                  </span>
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
                <select className="w-full bg-slate-50 border-none rounded-xl p-3 text-sm mt-1" value={checklist.roofAge} onChange={(e) => setChecklist({ ...checklist, roofAge: e.target.value })}>
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
                  {['Shingle', 'Metal', 'Tile', 'Flat'].map((m) => (
                    <button key={m} onClick={() => setChecklist({ ...checklist, material: m })}
                      className={`p-3 rounded-xl text-xs font-bold border transition-all ${checklist.material === m ? 'bg-accent border-accent text-white' : 'bg-white border-slate-100 text-slate-600'}`}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Damage Observed (Select all)</label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {['Hail', 'Wind', 'Wear', 'None'].map((d) => (
                    <button key={d} onClick={() => toggleDamage(d)}
                      className={`p-3 rounded-xl text-xs font-bold border transition-all ${checklist.damageTypes.includes(d) ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white border-slate-100 text-slate-600'}`}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={handleSubmit}
                disabled={submitting || !checklist.material || !checklist.roofAge || checklist.damageTypes.length === 0}
                className="w-full mt-2 bg-primary text-white font-black py-4 rounded-2xl shadow-xl flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50"
              >
                <Send size={20} />
                {submitting ? 'Saving...' : 'Submit Inspection to Timeline'}
              </button>
            </div>
          )}
        </div>
      </div>
    </PageTransition>
  );
}
