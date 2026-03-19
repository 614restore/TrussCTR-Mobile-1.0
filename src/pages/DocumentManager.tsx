import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileText, CheckCircle2, Clock, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';

const DOCUMENT_TYPES = [
  { id: 'contingency', title: 'Contingency Agreement', description: 'Insurance claim representation' },
  { id: 'csa', title: 'Customer Service Agreement', description: 'Retail sales & work order' },
  { id: 'rescind', title: '3-Day Right to Rescind', description: 'Legal cancellation period' },
  { id: 'completion', title: 'Completion Certificate', description: 'Work satisfaction sign-off' },
  { id: 'change-order', title: 'Change Order', description: 'Scope or price adjustments' },
];

export default function DocumentManager() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [signedDocs, setSignedDocs] = useState<string[]>([]);
  const [signedDocDetails, setSignedDocDetails] = useState<Record<string, { pdfCount: number; signatureCount: number }>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) fetchSignedDocs();
  }, [id]);

  const fetchSignedDocs = async () => {
    try {
      const { data, error } = await supabase
        .from('documents')
        .select('name,type')
        .eq('contact_id', id);

      if (error) throw error;
      const signed = (data || []).flatMap((d) => {
        const name = String(d.name || '').toLowerCase();
        const matches: string[] = [];
        if (name.includes('contingency')) matches.push('contingency');
        if (name.includes('customer service agreement')) matches.push('csa');
        if (name.includes('notice of cancellation') || name.includes('3-day')) matches.push('rescind');
        if (name.includes('completion')) matches.push('completion');
        if (name.includes('change order')) matches.push('change-order');
        return matches;
      });
      const details: Record<string, { pdfCount: number; signatureCount: number }> = {};
      for (const doc of DOCUMENT_TYPES) {
        const related = (data || []).filter((entry) => {
          const name = String(entry.name || '').toLowerCase();
          if (doc.id === 'contingency') return name.includes('contingency');
          if (doc.id === 'csa') return name.includes('customer service agreement');
          if (doc.id === 'rescind') return name.includes('notice of cancellation') || name.includes('3-day');
          if (doc.id === 'completion') return name.includes('completion');
          if (doc.id === 'change-order') return name.includes('change order');
          return false;
        });
        details[doc.id] = {
          pdfCount: related.filter((entry) => entry.type === 'contract').length,
          signatureCount: related.filter((entry) => String(entry.name || '').toLowerCase().includes('signature')).length,
        };
      }
      setSignedDocs(signed);
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
          DOCUMENT_TYPES.map((doc) => {
            const isSigned = signedDocs.includes(doc.id);
            const detail = signedDocDetails[doc.id];
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
      </div>
    </div>
  );
}
