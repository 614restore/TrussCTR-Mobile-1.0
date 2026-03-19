import React, { useState, useEffect } from 'react';
import { FileText, Search, ChevronLeft, Filter, Download, File, FileImage, FileCode } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { motion } from 'framer-motion';
import { buildDocumentDisplayUrl } from '../lib/documentAccess';

function getSignatureParentName(name: string) {
  if (name.includes(' Customer Signature - ')) return name.replace(' Customer Signature - ', ' - ');
  if (name.includes(' Contractor Signature - ')) return name.replace(' Contractor Signature - ', ' - ');
  if (name.includes(' Signature - ')) return name.replace(' Signature - ', ' - ');
  return null;
}

export default function Documents() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { profile } = useAuth();
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const contactId = searchParams.get('contactId');

  useEffect(() => {
    if (profile?.company_id) {
      fetchDocuments();
    }
  }, [profile?.company_id, contactId]);

  const fetchDocuments = async () => {
    try {
      let query = supabase
        .from('documents')
        .select(`
          *,
          contacts (
            first_name,
            last_name
          )
        `)
        .eq('company_id', profile.company_id)
        .order('created_at', { ascending: false });

      if (contactId) {
        query = query.eq('contact_id', contactId);
      }

      const { data, error } = await query;
      
      if (error) throw error;
      const docs = data || [];
      const withUrls = await Promise.all(docs.map(async (doc: any) => {
        if (typeof doc.url === 'string') {
          return { ...doc, displayUrl: await buildDocumentDisplayUrl(doc.url) };
        }
        return { ...doc, displayUrl: doc.url };
      }));
      setDocuments(withUrls);
    } catch (err) {
      console.error('Error fetching documents:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredDocs = documents.filter(doc => 
    doc.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    doc.contacts?.first_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    doc.contacts?.last_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const signatureDocsByParent = new Map<string, any[]>();
  for (const doc of filteredDocs) {
    const parentName = getSignatureParentName(String(doc.name || ''));
    if (!parentName) continue;
    const current = signatureDocsByParent.get(parentName) || [];
    current.push(doc);
    signatureDocsByParent.set(parentName, current);
  }

  const visibleDocs = filteredDocs.filter((doc) => !getSignatureParentName(String(doc.name || '')));

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'photo': return <FileImage className="text-rose-500" size={20} />;
      case 'contract': return <FileText className="text-blue-500" size={20} />;
      case 'estimate': return <FileCode className="text-emerald-500" size={20} />;
      case 'insurance': return <FileText className="text-amber-500" size={20} />;
      default: return <File className="text-slate-400" size={20} />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 p-6 sticky top-0 z-10">
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-slate-400 active:scale-90 transition-transform">
            <ChevronLeft size={24} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-primary">{contactId ? 'Customer Documents' : 'Documents'}</h1>
            {contactId && <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Filtered to this contact</p>}
          </div>
        </div>

        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text"
              placeholder="Search documents..."
              className="w-full bg-slate-100 border-none rounded-2xl py-3 pl-11 pr-4 text-sm focus:ring-2 focus:ring-accent/20"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button className="bg-slate-100 p-3 rounded-2xl text-slate-600">
            <Filter size={20} />
          </button>
        </div>
      </div>

      <div className="p-6 space-y-4">
        {loading ? (
          [1, 2, 3, 4].map(i => (
            <div key={i} className="h-20 bg-white rounded-2xl animate-pulse border border-slate-100" />
          ))
        ) : visibleDocs.length > 0 ? (
          visibleDocs.map((doc, i) => (
            <motion.div
              key={doc.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="card p-4 space-y-3 active:bg-slate-50 transition-colors"
            >
              <button
                onClick={() => navigate(`/documents/view/${doc.id}`)}
                className="w-full flex items-center justify-between text-left"
              >
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center">
                    {getFileIcon(doc.type)}
                  </div>
                  <div>
                    <h3 className="font-bold text-primary text-sm truncate max-w-[180px]">{doc.name}</h3>
                    <p className="text-[10px] text-slate-500">
                      {doc.contacts?.first_name} {doc.contacts?.last_name} • {(doc.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    navigate(`/documents/view/${doc.id}`);
                  }}
                  className="p-2 text-slate-300 hover:text-accent transition-colors"
                >
                  <Download size={18} />
                </button>
              </button>

              {(signatureDocsByParent.get(String(doc.name || '')) || []).map((signatureDoc) => (
                <div key={signatureDoc.id} className="ml-14 rounded-xl bg-slate-50 px-3 py-2 flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-bold text-slate-700">Attached signature</p>
                    <p className="text-[10px] text-slate-500">{(signatureDoc.size / 1024).toFixed(1)} KB PNG</p>
                  </div>
                  <button
                    onClick={() => navigate(`/documents/view/${signatureDoc.id}`)}
                    className="text-[11px] font-bold text-accent"
                  >
                    View
                  </button>
                </div>
              ))}
            </motion.div>
          ))
        ) : (
          <div className="text-center py-12 space-y-4">
            <div className="mx-auto h-16 w-16 bg-white rounded-2xl flex items-center justify-center text-slate-200 shadow-sm">
              <FileText size={32} />
            </div>
            <p className="text-slate-400 text-sm">No documents found</p>
          </div>
        )}
      </div>
    </div>
  );
}
