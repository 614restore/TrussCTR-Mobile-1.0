import React, { useState, useEffect } from 'react';
import { FileText, Search, ChevronLeft, Filter, Download, File, FileImage, FileCode } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { motion } from 'framer-motion';

export default function Documents() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (profile?.company_id) {
      fetchDocuments();
    }
  }, [profile?.company_id]);

  const fetchDocuments = async () => {
    try {
      const { data, error } = await supabase
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
      
      if (error) throw error;
      setDocuments(data || []);
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

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'photo': return <FileImage className="text-rose-500" size={20} />;
      case 'contract': return <FileText className="text-blue-500" size={20} />;
      case 'estimate': return <FileCode className="text-emerald-500" size={20} />;
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
          <h1 className="text-xl font-bold text-primary">Documents</h1>
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
        ) : filteredDocs.length > 0 ? (
          filteredDocs.map((doc, i) => (
            <motion.div
              key={doc.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="card p-4 flex items-center justify-between active:bg-slate-50 transition-colors"
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
              <button className="p-2 text-slate-300 hover:text-accent transition-colors">
                <Download size={18} />
              </button>
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
