import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, CheckCircle2, Share2,
  MessageSquare, User, ShieldCheck, Check
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { cn } from '../lib/utils';

export default function ReportBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [photos, setPhotos] = useState<any[]>([]);
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>([]);
  const [reportNote, setReportNote] = useState('');
  const [isShared, setIsShared] = useState(false);
  const [contact, setContact] = useState<any>(null);

  useEffect(() => {
    if (id) {
      fetchPhotos();
      fetchContact();
    }
  }, [id]);

  const fetchContact = async () => {
    const { data } = await supabase
      .from('contacts')
      .select('first_name, last_name, address, city, state')
      .eq('id', id)
      .single();
    if (data) setContact(data);
  };

  const fetchPhotos = async () => {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('contact_id', id)
      .eq('type', 'photo');
    if (!error) setPhotos(data || []);
  };

  const togglePhoto = (photoId: string) => {
    setSelectedPhotos((prev) =>
      prev.includes(photoId) ? prev.filter((p) => p !== photoId) : [...prev, photoId]
    );
  };

  const handleShare = async () => {
    if (!contact || !profile) return;

    // Log the report share to communications timeline
    await supabase.from('communications').insert({
      contact_id: id,
      company_id: profile.company_id,
      type: 'note',
      content: `📋 Insurance Report Generated — ${selectedPhotos.length} photos selected. Notes: ${reportNote || 'None'}`,
      user_id: profile.id,
      direction: 'outbound',
    } as any);

    const shareData = {
      title: `Inspection Report — ${contact.first_name} ${contact.last_name}`,
      text: `View roof inspection report for ${contact.address}: ${reportNote}`,
      url: window.location.href,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        console.error(err);
      }
    } else {
      setIsShared(true);
      setTimeout(() => setIsShared(false), 3000);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      <nav className="p-4 bg-white border-b border-slate-100 flex items-center gap-4 sticky top-0 z-10 shadow-sm">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-slate-400 active:scale-90 transition-transform">
          <ArrowLeft size={24} />
        </button>
        <h1 className="font-bold text-primary">Build Insurance Report</h1>
      </nav>

      <div className="p-6 space-y-8">
        {/* Photo Selection */}
        <section>
          <div className="flex justify-between items-end mb-3">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Select Key Evidence</h2>
            <span className="text-xs font-bold text-accent">{selectedPhotos.length} Selected</span>
          </div>

          {photos.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border-2 border-dashed border-slate-200">
              <p className="text-slate-400 text-sm">No photos uploaded for this contact yet.</p>
              <p className="text-slate-300 text-xs mt-1">Upload photos from the Docs tab first.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {photos.map((photo) => {
                const active = selectedPhotos.includes(photo.id);
                return (
                  <button
                    key={photo.id}
                    onClick={() => togglePhoto(photo.id)}
                    className={cn(
                      'relative aspect-square rounded-2xl overflow-hidden border-4 transition-all',
                      active ? 'border-accent scale-95' : 'border-transparent'
                    )}
                  >
                    <img src={photo.url} className="w-full h-full object-cover" />
                    <div
                      className={cn(
                        'absolute inset-0 flex items-center justify-center transition-colors',
                        active ? 'bg-accent/20' : 'bg-transparent'
                      )}
                    >
                      {active && <CheckCircle2 className="text-white fill-accent" size={32} />}
                    </div>
                    <div className="absolute bottom-0 inset-x-0 bg-black/50 p-2">
                      <p className="text-[10px] text-white font-bold truncate">{photo.name}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Field Notes */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-slate-400">
            <MessageSquare size={16} />
            <h2 className="text-xs font-bold uppercase tracking-widest">Adjuster Observations</h2>
          </div>
          <textarea
            className="w-full p-4 bg-white border border-slate-100 rounded-2xl h-32 text-sm outline-none focus:ring-2 focus:ring-accent/20 shadow-sm"
            placeholder="Summarize storm evidence for the claim handler..."
            value={reportNote}
            onChange={(e) => setReportNote(e.target.value)}
          />
        </section>

        {/* Share Actions */}
        <section className="space-y-3">
          <h2 className="text-center text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">
            Send Report To
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={handleShare}
              className="flex flex-col items-center gap-3 p-6 bg-white border border-slate-100 rounded-2xl shadow-sm active:bg-slate-100"
            >
              <div className="p-3 bg-blue-50 rounded-full text-blue-600">
                <ShieldCheck size={24} />
              </div>
              <span className="text-sm font-bold">Adjuster</span>
            </button>
            <button
              onClick={handleShare}
              className="flex flex-col items-center gap-3 p-6 bg-white border border-slate-100 rounded-2xl shadow-sm active:bg-slate-100"
            >
              <div className="p-3 bg-amber-50 rounded-full text-amber-600">
                <User size={24} />
              </div>
              <span className="text-sm font-bold">Homeowner</span>
            </button>
          </div>
        </section>
      </div>

      {/* Copied Toast */}
      {isShared && (
        <div className="fixed bottom-28 inset-x-6 bg-slate-900 text-white p-4 rounded-xl flex items-center justify-between shadow-2xl">
          <span className="text-sm font-bold">Report Link Copied!</span>
          <Check size={18} className="text-emerald-400" />
        </div>
      )}

      {/* Bottom CTA */}
      <div className="fixed bottom-0 w-full max-w-[480px] p-4 bg-white border-t border-slate-100">
        <button
          onClick={handleShare}
          className="w-full bg-accent text-white font-black py-4 rounded-xl flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] transition-transform"
        >
          <Share2 size={20} />
          SHARE FINAL REPORT
        </button>
      </div>
    </div>
  );
}
