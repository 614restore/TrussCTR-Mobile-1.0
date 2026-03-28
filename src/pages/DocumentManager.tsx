import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileText, CheckCircle2, Clock, ChevronRight, LayoutTemplate } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';
import { buildLegalDocumentStats, LEGAL_DOCUMENT_TEMPLATES, type LegalDocumentStats } from '../lib/documentVisibility';

export default function DocumentManager() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [signedDocDetails, setSignedDocDetails] = useState<Record<string, LegalDocumentStats>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) fetchSignedDocs();
  }, [id]);

  const fetchSignedDocs = async () => {
    try {
      const { data, error } = await supabase
        .from('documents')
        .select('id,name,type,created_at')
        .eq('contact_id', id);

      if (error) throw error;
      const details = buildLegalDocumentStats((data || []) as any[]);
      setSignedDocDetails(details);
    } catch (err) {
      console.error('Error fetching signed docs:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-10">
      <nav className="p-4 bg-white border-b border-slate-100 flex items-center gap-4 sticky top-0 z-10 shadow-sm">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-slate-400 active:scale-90 transition-transform">
          <ArrowLeft size={24} />
        </button>
        <h1 className="font-bold text-primary">Legal Documents</h1>
      </nav>

      <div className="p-6 space-y-4">
        {loading ? (
          [1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-20 bg-white rounded-2xl animate-pulse border border-slate-100" />
          ))
        ) : (
          LEGAL_DOCUMENT_TEMPLATES.map((doc) => {
            const detail = signedDocDetails[doc.id];
            const isSigned = !!detail?.isSigned;
            return (
              <button
                key={doc.id}
                onClick={() => navigate(`/contacts/${id}/documents/${doc.id}`)}
                className="w-full p-4 bg-white border border-slate-100 rounded-2xl flex items-center justify-between shadow-sm active:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div
                    className={cn(
                      'p-3 rounded-xl',
                      isSigned ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-400'
                    )}
                  >
                    {isSigned ? <CheckCircle2 size={22} /> : <FileText size={22} />}
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-primary text-sm">{doc.title}</p>
                    <p className="text-[10px] text-slate-400 font-medium uppercase tracking-tight">{doc.description}</p>
                    {isSigned && detail && (
                      <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-tight mt-1">
                        {detail.pdfCount} PDF{detail.pdfCount === 1 ? '' : 's'} • {detail.signatureCount} signature{detail.signatureCount === 1 ? '' : 's'}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!isSigned && <Clock size={14} className="text-amber-500" />}
                  <ChevronRight size={18} className="text-slate-300" />
                </div>
              </button>
            );
          })
        )}

        <div className="bg-blue-600 p-6 rounded-2xl text-white shadow-xl mt-6">
          <h3 className="font-bold text-lg mb-2">Need a custom form?</h3>
          <p className="text-blue-100 text-xs leading-relaxed mb-4">
            Upload custom PDFs or request Change Orders from the office portal.
          </p>
          <button className="w-full py-3 bg-white/20 rounded-xl text-sm font-bold border border-white/30">
            Request New Template
          </button>
        </div>

        {/* Project Quick-Start Templates */}
        <div className="space-y-3 pt-2">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.18em] ml-1">Project Quick-Start</p>
          <p className="text-xs text-slate-500 ml-1">Jump straight to a pre-built estimate for common project types.</p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Roof Replacement', preset: 'roof_replacement', emoji: '🏠' },
              { label: 'Siding', preset: 'siding', emoji: '🏗️' },
              { label: 'Gutters', preset: 'gutters', emoji: '🌧️' },
              { label: 'Windows', preset: 'windows', emoji: '🪟' },
              { label: 'Interior Work', preset: 'interior', emoji: '🎨' },
              { label: 'Roof Repair', preset: 'repair', emoji: '🔧' },
            ].map((item) => (
              <button
                key={item.preset}
                onClick={() => navigate(`/contacts/${id}/estimate?preset=${item.preset}`)}
                className="flex items-center gap-3 p-4 bg-white border border-slate-100 rounded-2xl shadow-sm active:bg-slate-50 transition-colors text-left"
              >
                <span className="text-2xl">{item.emoji}</span>
                <div>
                  <p className="text-xs font-bold text-primary leading-tight">{item.label}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Estimate</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
