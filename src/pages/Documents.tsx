import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText, Search, ChevronLeft, ChevronDown, ChevronRight,
  File, FileImage, Download, Users, FolderOpen, Folder,
  X,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { buildDocumentDisplayUrl } from '../lib/documentAccess';
import { getSignatureParentName } from '../lib/documentVisibility';

type DocType = 'all' | 'documents' | 'photos';

type CustomerFolder = {
  contactId: string;
  name: string;
  initials: string;
  docs: any[];
  photos: any[];
  lastUpdated: string;
};

function getInitials(firstName?: string, lastName?: string) {
  const f = (firstName || '').charAt(0).toUpperCase();
  const l = (lastName || '').charAt(0).toUpperCase();
  return f + l || '?';
}

function getFileIcon(type: string, size = 20) {
  switch (type) {
    case 'photo': return <FileImage className="text-rose-500" size={size} />;
    case 'contract': return <FileText className="text-blue-500" size={size} />;
    case 'estimate': return <FileText className="text-emerald-500" size={size} />;
    case 'insurance': return <FileText className="text-amber-500" size={size} />;
    default: return <File className="text-slate-400" size={size} />;
  }
}

function formatFileSize(bytes: number) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function Documents() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { profile } = useAuth();
  const [allDocs, setAllDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFolder, setExpandedFolder] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<DocType>('all');
  const contactId = searchParams.get('contactId');

  useEffect(() => {
    if (profile?.company_id) fetchDocuments();
  }, [profile?.company_id, contactId]);

  const fetchDocuments = async () => {
    try {
      let query = supabase
        .from('documents')
        .select(`*, contacts(id, first_name, last_name)`)
        .eq('company_id', profile!.company_id)
        .order('created_at', { ascending: false });

      if (contactId) query = query.eq('contact_id', contactId);

      const { data, error } = await query;
      if (error) throw error;

      const docs = data || [];
      const withUrls = await Promise.all(
        docs.map(async (doc: any) => ({
          ...doc,
          displayUrl: typeof doc.url === 'string' ? await buildDocumentDisplayUrl(doc.url) : doc.url,
        }))
      );
      setAllDocs(withUrls);
    } catch (err) {
      console.error('Error fetching documents:', err);
    } finally {
      setLoading(false);
    }
  };

  // Group into customer folders
  const folders = useMemo<CustomerFolder[]>(() => {
    // Exclude raw signature files from top-level (they're sub-items of the parent doc)
    const primaryDocs = allDocs.filter((doc) => !getSignatureParentName(String(doc.name || '')));

    const map = new Map<string, CustomerFolder>();

    for (const doc of primaryDocs) {
      const cid = doc.contact_id || 'no_contact';
      if (!map.has(cid)) {
        const contact = doc.contacts;
        const firstName = contact?.first_name || '';
        const lastName = contact?.last_name || '';
        map.set(cid, {
          contactId: cid,
          name: `${firstName} ${lastName}`.trim() || 'Unknown Customer',
          initials: getInitials(firstName, lastName),
          docs: [],
          photos: [],
          lastUpdated: doc.created_at || '',
        });
      }
      const folder = map.get(cid)!;
      if (doc.type === 'photo') {
        folder.photos.push(doc);
      } else {
        folder.docs.push(doc);
      }
      // Keep lastUpdated as most recent
      if (doc.created_at > folder.lastUpdated) folder.lastUpdated = doc.created_at;
    }

    return Array.from(map.values()).sort((a, b) =>
      new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()
    );
  }, [allDocs]);

  // Flat filtered list for search mode
  const filteredFlat = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return allDocs.filter((doc) => {
      if (getSignatureParentName(String(doc.name || ''))) return false;
      if (typeFilter === 'photos' && doc.type !== 'photo') return false;
      if (typeFilter === 'documents' && doc.type === 'photo') return false;
      if (!q) return true;
      return (
        doc.name?.toLowerCase().includes(q) ||
        doc.contacts?.first_name?.toLowerCase().includes(q) ||
        doc.contacts?.last_name?.toLowerCase().includes(q)
      );
    });
  }, [allDocs, searchQuery, typeFilter]);

  const isSearching = searchQuery.length > 0 || typeFilter !== 'all';
  const isContactFiltered = !!contactId;

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 sticky top-0 z-10">
        <div className="p-5 flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-slate-400 active:scale-90 transition-transform">
            <ChevronLeft size={24} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-primary">{isContactFiltered ? 'Customer Files' : 'All Documents'}</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              {isContactFiltered ? 'Filtered to this contact' : `${folders.length} customer${folders.length !== 1 ? 's' : ''}`}
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="px-5 pb-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
            <input
              type="text"
              placeholder="Search by name or customer..."
              className="w-full bg-slate-100 rounded-2xl py-3 pl-11 pr-10 text-sm font-medium outline-none focus:ring-2 focus:ring-accent/20"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                <X size={16} />
              </button>
            )}
          </div>

          {/* Type filters */}
          <div className="flex gap-2">
            {(['all', 'documents', 'photos'] as DocType[]).map((f) => (
              <button
                key={f}
                onClick={() => setTypeFilter(f)}
                className={`px-4 py-1.5 rounded-xl text-xs font-bold capitalize transition-all ${
                  typeFilter === f ? 'bg-accent text-white' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {f === 'all' ? 'All Files' : f === 'documents' ? '📄 Docs' : '📷 Photos'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="p-5 space-y-3">
        {loading ? (
          [1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-white rounded-2xl animate-pulse border border-slate-100" />
          ))
        ) : isSearching ? (
          /* SEARCH / FILTER MODE: flat list */
          filteredFlat.length > 0 ? (
            <>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                {filteredFlat.length} result{filteredFlat.length !== 1 ? 's' : ''}
              </p>
              {filteredFlat.map((doc) => (
                <motion.button
                  key={doc.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={() => navigate(`/documents/view/${doc.id}`)}
                  className="w-full flex items-center gap-4 p-4 bg-white border border-slate-100 rounded-2xl shadow-sm active:bg-slate-50 transition-colors text-left"
                >
                  <div className="h-10 w-10 rounded-xl bg-slate-50 flex items-center justify-center shrink-0">
                    {getFileIcon(doc.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-primary text-sm truncate">{doc.name}</p>
                    <p className="text-[10px] text-slate-400 font-medium">
                      {doc.contacts?.first_name} {doc.contacts?.last_name} · {formatDate(doc.created_at)}
                    </p>
                  </div>
                  <Download size={16} className="text-slate-300 shrink-0" />
                </motion.button>
              ))}
            </>
          ) : (
            <div className="text-center py-14 space-y-3">
              <p className="text-slate-400 text-sm">No files match your search</p>
            </div>
          )
        ) : folders.length > 0 ? (
          /* FOLDER MODE: grouped by customer */
          <>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 pb-1">
              Customer Folders
            </p>
            {folders.map((folder) => {
              const isOpen = expandedFolder === folder.contactId;
              const totalFiles = folder.docs.length + folder.photos.length;

              return (
                <div key={folder.contactId} className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
                  {/* Folder header */}
                  <button
                    onClick={() => setExpandedFolder(isOpen ? null : folder.contactId)}
                    className="w-full flex items-center gap-4 p-4 active:bg-slate-50 transition-colors"
                  >
                    <div className="h-11 w-11 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
                      {isOpen
                        ? <FolderOpen size={22} className="text-accent" />
                        : <Folder size={22} className="text-accent" />
                      }
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <p className="font-bold text-primary text-sm truncate">{folder.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {folder.docs.length > 0 && (
                          <span className="text-[10px] font-bold text-slate-500">
                            📄 {folder.docs.length} doc{folder.docs.length !== 1 ? 's' : ''}
                          </span>
                        )}
                        {folder.photos.length > 0 && (
                          <span className="text-[10px] font-bold text-slate-500">
                            📷 {folder.photos.length} photo{folder.photos.length !== 1 ? 's' : ''}
                          </span>
                        )}
                        <span className="text-[10px] text-slate-300">·</span>
                        <span className="text-[10px] text-slate-400">{formatDate(folder.lastUpdated)}</span>
                      </div>
                    </div>
                    {isOpen
                      ? <ChevronDown size={18} className="text-slate-300 shrink-0" />
                      : <ChevronRight size={18} className="text-slate-300 shrink-0" />
                    }
                  </button>

                  {/* Folder contents */}
                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden border-t border-slate-50"
                      >
                        <div className="px-4 pb-4 pt-3 space-y-4">
                          {/* Open in contact button */}
                          {folder.contactId !== 'no_contact' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/contacts/${folder.contactId}?tab=documents`);
                              }}
                              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs font-bold text-slate-500"
                            >
                              <Users size={13} />
                              View Full Contact Profile
                            </button>
                          )}

                          {/* Documents sub-section */}
                          {folder.docs.length > 0 && (
                            <div className="space-y-2">
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">📄 Documents & Contracts</p>
                              {folder.docs.map((doc) => (
                                <button
                                  key={doc.id}
                                  onClick={() => navigate(`/documents/view/${doc.id}`)}
                                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-slate-50 hover:bg-blue-50 transition-colors text-left"
                                >
                                  <div className="h-8 w-8 rounded-lg bg-white flex items-center justify-center shrink-0 border border-slate-100">
                                    {getFileIcon(doc.type, 16)}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-bold text-primary truncate">{doc.name}</p>
                                    <p className="text-[10px] text-slate-400">{formatFileSize(doc.size)} · {formatDate(doc.created_at)}</p>
                                  </div>
                                  <Download size={14} className="text-slate-300 shrink-0" />
                                </button>
                              ))}
                            </div>
                          )}

                          {/* Photos sub-section */}
                          {folder.photos.length > 0 && (
                            <div className="space-y-2">
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">📷 Photos</p>
                              <div className="grid grid-cols-3 gap-2">
                                {folder.photos.map((photo) => (
                                  <button
                                    key={photo.id}
                                    onClick={() => navigate(`/documents/view/${photo.id}`)}
                                    className="aspect-square rounded-xl bg-slate-100 overflow-hidden flex items-center justify-center border border-slate-100"
                                  >
                                    {photo.displayUrl ? (
                                      <img
                                        src={photo.displayUrl}
                                        alt={photo.name}
                                        className="w-full h-full object-cover"
                                        onError={(e) => {
                                          (e.target as HTMLImageElement).style.display = 'none';
                                        }}
                                      />
                                    ) : (
                                      <FileImage size={20} className="text-slate-300" />
                                    )}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {totalFiles === 0 && (
                            <p className="text-xs text-slate-400 text-center py-2">No files yet</p>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </>
        ) : (
          <div className="text-center py-16 space-y-4">
            <div className="mx-auto h-16 w-16 bg-white rounded-2xl flex items-center justify-center text-slate-200 shadow-sm">
              <FolderOpen size={32} />
            </div>
            <p className="text-slate-400 text-sm font-medium">No documents yet</p>
            <p className="text-slate-300 text-xs">Documents and photos uploaded from contact profiles will appear here.</p>
          </div>
        )}
      </div>
    </div>
  );
}
