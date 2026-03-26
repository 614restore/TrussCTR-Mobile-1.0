import React, { useEffect, useState } from 'react';
import { Camera, ChevronLeft, CheckCircle2, Circle, AlertCircle, Trash2, FolderDown, HardDriveDownload } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { buildDocumentDisplayUrl, parseDocumentStorageLocation } from '../lib/documentAccess';
import { INDOOR_PREFIX } from '../lib/photoPreferences';
import { useAuth } from '../context/AuthContext';
import { saveFileToDevice, saveAllPhotosToDevice, type SaveProgress } from '../lib/localFiles';

type PhotoDoc = {
  id: string;
  name: string;
  url: string;
  displayUrl: string;
};

type ChecklistGroup = {
  label: string;
  isIndoor: boolean;
  photos: PhotoDoc[];
  required: boolean;
};

const STANDARD_EXTERIOR = [
  'Front Elevation', 'Rear Elevation', 'Left Elevation', 'Right Elevation',
  'North', 'South', 'East', 'West',
  'Roof Surface', 'Flashing', 'Gutters', 'Damage',
  'Garage', 'Detached',
];

export default function PhotoChecklist() {
  const navigate    = useNavigate();
  const { id }      = useParams<{ id: string }>();
  const { profile } = useAuth();
  const [groups, setGroups]   = useState<ChecklistGroup[]>([]);
  const [contact, setContact] = useState<{ name?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const canDelete = profile?.role === 'owner' || profile?.role === 'admin';

  // Save-to-files state
  const [saveProgress, setSaveProgress] = useState<SaveProgress | null>(null);
  const [saveResult, setSaveResult]     = useState<{ saved: number; failed: number } | null>(null);
  const [savingPhotoId, setSavingPhotoId] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      setLoading(true);
      try {
        const { data: c } = await (supabase
          .from('contacts')
          .select('first_name, last_name')
          .eq('id', id)
          .maybeSingle() as any);
        if (c) setContact({ name: `${c.first_name || ''} ${c.last_name || ''}`.trim() });

        const { data: docs } = await supabase
          .from('documents')
          .select('id, name, url')
          .eq('contact_id', id)
          .eq('type', 'photo')
          .order('created_at', { ascending: true });

        if (!docs) { setLoading(false); return; }

        const withUrls: PhotoDoc[] = await Promise.all((docs as any[]).map(async (d) => ({
          id:         d.id,
          name:       d.name,
          url:        d.url,
          displayUrl: await buildDocumentDisplayUrl(d.url),
        })));

        const groupMap = new Map<string, PhotoDoc[]>();
        for (const doc of withUrls) {
          const label = doc.name
            .replace(/ Slope Photo$/i, '')
            .replace(/ Inspection Photo$/i, '')
            .replace(/ Photo$/i, '')
            .trim();
          if (!groupMap.has(label)) groupMap.set(label, []);
          groupMap.get(label)!.push(doc);
        }

        const result: ChecklistGroup[] = [];
        const coveredLabels = new Set<string>();
        for (const [label, photos] of groupMap) {
          const isIndoor = label.startsWith(INDOOR_PREFIX);
          result.push({ label, isIndoor, photos, required: false });
          coveredLabels.add(label.toLowerCase());
        }
        for (const std of STANDARD_EXTERIOR) {
          if (!coveredLabels.has(std.toLowerCase())) {
            result.push({ label: std, isIndoor: false, photos: [], required: true });
          }
        }
        result.sort((a, b) => {
          if (a.isIndoor !== b.isIndoor) return a.isIndoor ? 1 : -1;
          if ((a.photos.length > 0) !== (b.photos.length > 0)) return a.photos.length > 0 ? -1 : 1;
          return a.label.localeCompare(b.label);
        });
        setGroups(result);
      } catch (err) {
        console.error('PhotoChecklist load error:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  const deletePhoto = async (photoId: string, photoUrl: string) => {
    if (!window.confirm('Delete this photo? This cannot be undone.')) return;
    try {
      const loc = parseDocumentStorageLocation(String(photoUrl || ''));
      if (loc?.bucket && loc?.path) {
        await supabase.storage.from(loc.bucket).remove([loc.path]);
      }
      await supabase.from('documents').delete().eq('id', photoId);
      setGroups(prev => prev.map(g => ({
        ...g,
        photos: g.photos.filter(p => p.id !== photoId),
      })).filter(g => g.photos.length > 0 || g.required));
    } catch (err) {
      console.error('Error deleting photo:', err);
      alert('Failed to delete photo. Please try again.');
    }
  };

  /** Save every photo for this contact to the Files app, organized by customer name. */
  const saveAllToFiles = async () => {
    const allPhotos = groups.flatMap(g => g.photos);
    if (allPhotos.length === 0) return;
    setSaveProgress({ done: 0, total: allPhotos.length, failed: 0 });
    setSaveResult(null);
    const contactName = contact?.name || 'Customer';
    const result = await saveAllPhotosToDevice(
      allPhotos.map(p => ({ displayUrl: p.displayUrl || p.url, name: p.name })),
      contactName,
      (progress) => setSaveProgress(progress),
    );
    setSaveProgress(null);
    setSaveResult(result);
  };

  /** Save a single photo to the Files app. */
  const saveSingleToFiles = async (photo: PhotoDoc) => {
    setSavingPhotoId(photo.id);
    try {
      const contactName = contact?.name || 'Customer';
      const baseName = photo.name.replace(/\s+/g, '_');
      const ext = baseName.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? '' : '.jpg';
      await saveFileToDevice(photo.displayUrl || photo.url, contactName, `${baseName}${ext}`);
    } catch (err) {
      console.error('Error saving photo to files:', err);
      alert('Failed to save photo to Files. Please try again.');
    } finally {
      setSavingPhotoId(null);
    }
  };

  const covered = groups.filter((g) => g.photos.length > 0).length;
  const total   = groups.length;
  const pct     = total > 0 ? Math.round((covered / total) * 100) : 0;
  const totalPhotos = groups.reduce((sum, g) => sum + g.photos.length, 0);

  return (
    <div className="min-h-screen bg-slate-50 pb-32">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 p-6 sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-slate-400 active:scale-90 transition-transform">
            <ChevronLeft size={24} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-primary">Photo Checklist</h1>
            {contact?.name && <p className="text-xs text-slate-400 mt-0.5">{contact.name}</p>}
          </div>
        </div>
      </div>

      <div className="p-6 space-y-5">
        {/* Progress card */}
        <div className="card p-5 bg-primary text-white flex items-center justify-between">
          <div>
            <p className="text-xs text-white/60 font-bold uppercase tracking-widest">Photos Covered</p>
            <p className="text-2xl font-bold">{covered} / {total} categories</p>
          </div>
          <div className="h-14 w-14 rounded-full border-4 border-white/20 flex items-center justify-center">
            <span className="text-sm font-black">{pct}%</span>
          </div>
        </div>

        {/* Save to Files card */}
        {!loading && totalPhotos > 0 && (
          <div className="card p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
                <FolderDown size={18} className="text-indigo-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-primary">Save to Files App</p>
                <p className="text-[11px] text-slate-400 leading-snug">
                  Save all {totalPhotos} photo{totalPhotos !== 1 ? 's' : ''} to{' '}
                  <span className="font-semibold text-slate-600">Files → TrussCTR → {contact?.name || 'Customer'}</span>
                </p>
              </div>
            </div>

            {saveProgress ? (
              <div className="space-y-1.5">
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full transition-all duration-200"
                    style={{ width: `${Math.round((saveProgress.done / saveProgress.total) * 100)}%` }}
                  />
                </div>
                <p className="text-[10px] text-slate-400 text-center">
                  Saving {saveProgress.done} of {saveProgress.total}…
                </p>
              </div>
            ) : saveResult ? (
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-emerald-600">
                  {saveResult.saved} photo{saveResult.saved !== 1 ? 's' : ''} saved to Files
                  {saveResult.failed > 0 && ` · ${saveResult.failed} failed`}
                </p>
                <button onClick={() => setSaveResult(null)} className="text-[10px] text-slate-400">Dismiss</button>
              </div>
            ) : (
              <button
                onClick={saveAllToFiles}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-3 rounded-xl text-xs font-bold active:scale-95 transition-transform"
              >
                <HardDriveDownload size={15} />
                Save All to Files App
              </button>
            )}
          </div>
        )}

        {loading && (
          <div className="text-center py-12 text-slate-400 text-sm">Loading photos…</div>
        )}

        {!loading && groups.length === 0 && (
          <div className="card p-8 text-center space-y-2">
            <Camera size={32} className="mx-auto text-slate-300" />
            <p className="text-sm font-bold text-slate-500">No inspection photos yet</p>
            <p className="text-xs text-slate-400">Complete the Smart Inspection to populate this checklist.</p>
          </div>
        )}

        {/* Groups with photos */}
        {groups.filter((g) => g.photos.length > 0).length > 0 && (
          <div className="space-y-3">
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">Documented</h2>
            {groups.filter((g) => g.photos.length > 0).map((group) => (
              <div key={group.label} className="card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={18} className="text-emerald-500 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-primary">
                        {group.isIndoor ? group.label.replace(`${INDOOR_PREFIX} – `, '') : group.label}
                      </p>
                      {group.isIndoor && (
                        <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">Indoor</p>
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-slate-400">
                    {group.photos.length} photo{group.photos.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Photo thumbnails with per-photo actions */}
                <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
                  {group.photos.map((photo) => (
                    <div key={photo.id} className="relative flex-shrink-0 h-20 w-20 rounded-xl overflow-hidden border border-slate-100 bg-slate-100">
                      <img
                        src={photo.displayUrl || photo.url}
                        alt={group.label}
                        className="h-full w-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                      {/* Action buttons overlay */}
                      <div className="absolute bottom-0 inset-x-0 flex justify-between px-1 py-0.5 bg-gradient-to-t from-black/60 to-transparent">
                        {/* Save to Files */}
                        <button
                          onClick={() => saveSingleToFiles(photo)}
                          disabled={savingPhotoId === photo.id}
                          className="bg-black/40 rounded-full p-1 text-white disabled:opacity-50"
                          title="Save to Files"
                        >
                          {savingPhotoId === photo.id
                            ? <span className="text-[8px] font-bold">…</span>
                            : <FolderDown size={11} />
                          }
                        </button>
                        {/* Delete */}
                        {canDelete && (
                          <button
                            onClick={() => deletePhoto(photo.id, photo.url)}
                            className="bg-black/40 rounded-full p-1 text-white"
                            title="Delete photo"
                          >
                            <Trash2 size={11} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Standard categories with no photos */}
        {groups.filter((g) => g.photos.length === 0 && g.required).length > 0 && (
          <div className="space-y-2">
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">Missing / Not Photographed</h2>
            {groups.filter((g) => g.photos.length === 0 && g.required).map((group) => (
              <div key={group.label} className="card p-4 flex items-center justify-between opacity-60">
                <div className="flex items-center gap-3">
                  <Circle size={18} className="text-slate-300 flex-shrink-0" />
                  <p className="text-sm font-bold text-slate-500">{group.label}</p>
                </div>
                <AlertCircle size={14} className="text-slate-300" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-100 p-4 z-20">
        <button
          onClick={() => navigate(id ? `/contacts/${id}` : -1 as any)}
          className="w-full bg-primary text-white py-4 rounded-2xl text-xs font-bold uppercase tracking-widest active:scale-95 transition-transform"
        >
          Done — Back to Contact
        </button>
      </div>
    </div>
  );
}
