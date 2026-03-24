import React, { useEffect, useState } from 'react';
import { Camera, ChevronLeft, CheckCircle2, Circle, AlertCircle } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { buildDocumentDisplayUrl } from '../lib/documentAccess';
import { INDOOR_PREFIX } from '../lib/photoPreferences';

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
  required: boolean; // standard categories that should always have photos
};

// Standard exterior categories always shown even with zero photos
const STANDARD_EXTERIOR = [
  'Front Elevation', 'Rear Elevation', 'Left Elevation', 'Right Elevation',
  'North', 'South', 'East', 'West',
  'Roof Surface', 'Flashing', 'Gutters', 'Damage',
  'Garage', 'Detached',
];

export default function PhotoChecklist() {
  const navigate   = useNavigate();
  const { id }     = useParams<{ id: string }>();
  const [groups, setGroups]   = useState<ChecklistGroup[]>([]);
  const [contact, setContact] = useState<{ name?: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      setLoading(true);
      try {
        // Load contact name
        const { data: c } = await supabase
          .from('contacts')
          .select('first_name, last_name')
          .eq('id', id)
          .maybeSingle();
        if (c) setContact({ name: `${c.first_name || ''} ${c.last_name || ''}`.trim() });

        // Load all photos for this contact
        const { data: docs } = await supabase
          .from('documents')
          .select('id, name, url')
          .eq('contact_id', id)
          .eq('type', 'photo')
          .order('created_at', { ascending: true });

        if (!docs) { setLoading(false); return; }

        // Build display URLs
        const withUrls: PhotoDoc[] = docs.map((d) => ({
          id:         d.id,
          name:       d.name,
          url:        d.url,
          displayUrl: buildDocumentDisplayUrl(d.url),
        }));

        // Group by category (extracted from document name)
        // Names follow the patterns:
        //   "North Slope Photo", "Building 2 – South Slope Photo"
        //   "Indoor – Living Room Photo"
        const groupMap = new Map<string, PhotoDoc[]>();
        for (const doc of withUrls) {
          // Extract the label before " Slope Photo", " Inspection Photo", or " Photo"
          const label = doc.name
            .replace(/ Slope Photo$/i, '')
            .replace(/ Inspection Photo$/i, '')
            .replace(/ Photo$/i, '')
            .trim();
          if (!groupMap.has(label)) groupMap.set(label, []);
          groupMap.get(label)!.push(doc);
        }

        // Build groups: real photo groups first, then empty standard categories
        const result: ChecklistGroup[] = [];
        const coveredLabels = new Set<string>();

        for (const [label, photos] of groupMap) {
          const isIndoor = label.startsWith(INDOOR_PREFIX);
          result.push({ label, isIndoor, photos, required: false });
          coveredLabels.add(label.toLowerCase());
        }

        // Add standard exterior categories with no photos so inspector sees gaps
        for (const std of STANDARD_EXTERIOR) {
          if (!coveredLabels.has(std.toLowerCase())) {
            result.push({ label: std, isIndoor: false, photos: [], required: true });
          }
        }

        // Sort: photos first (by label), then empty required, indoor last
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

  const covered = groups.filter((g) => g.photos.length > 0).length;
  const total   = groups.length;
  const pct     = total > 0 ? Math.round((covered / total) * 100) : 0;

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
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
                {/* Photo thumbnails */}
                <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
                  {group.photos.map((photo) => (
                    <div key={photo.id} className="flex-shrink-0 h-20 w-20 rounded-xl overflow-hidden border border-slate-100 bg-slate-100">
                      <img src={photo.displayUrl || photo.url} alt={group.label}
                        className="h-full w-full object-cover" referrerPolicy="no-referrer" />
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

      {/* Done button */}
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
