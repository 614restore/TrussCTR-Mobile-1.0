import React, { useEffect, useRef, useState } from 'react';
import { Search, Filter, List, LayoutGrid, Plus, MapPin, DollarSign, User, ChevronLeft, ChevronRight, Shield, FileText, Briefcase, Calendar, ClipboardList, Phone, Zap, StickyNote, CalendarPlus, Clock, Archive, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { CustomerStatus } from '../types/supabase';
import { formatCurrency, getStatusColor } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import NewContactModal from '../components/NewContactModal';
import NoProfileState from '../components/NoProfileState';
import { getPipelineStageLabel, toPipelineBoardStage, normalizePipelineStatus } from '../lib/pipelineStages';
import { buildDocumentDisplayUrl } from '../lib/documentAccess';

type StageConfig = { statuses: CustomerStatus[]; label: string; color: string };

const STAGES: StageConfig[] = [
  { statuses: ['new_lead', 'lead'], label: 'Leads', color: 'bg-blue-500' },
  { statuses: ['contacted'], label: 'Contacted', color: 'bg-sky-500' },
  { statuses: ['appointment_set', 'inspection_scheduled'], label: 'Appointment Set', color: 'bg-indigo-500' },
  { statuses: ['inspected', 'inspection_complete'], label: 'Inspection', color: 'bg-amber-500' },
  { statuses: ['estimate_sent'], label: 'Follow Up / Negotiating', color: 'bg-orange-500' },
  { statuses: ['approved', 'signed_won'], label: 'Sold', color: 'bg-emerald-500' },
  { statuses: ['scheduled'], label: 'Scheduled', color: 'bg-teal-500' },
  { statuses: ['in_progress'], label: 'In Progress', color: 'bg-primary' },
  { statuses: ['completed'], label: 'Completed', color: 'bg-slate-800' },
  { statuses: ['paid'], label: 'Paid', color: 'bg-green-600' },
  { statuses: ['retail'], label: 'Retail', color: 'bg-purple-500' },
  { statuses: ['lost'], label: 'Lost', color: 'bg-red-400' },
];

export default function Pipeline() {
  const navigate = useNavigate();
  const { profile, loading: loadingAuth } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'kanban' | 'list' | 'map'>('kanban');
  const [searchQuery, setSearchQuery] = useState('');
  const [contacts, setContacts] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [contactPhotoMap, setContactPhotoMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [quickMenuContactId, setQuickMenuContactId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [reactivatingId, setReactivatingId] = useState<string | null>(null);
  const sectionScrollerRef = useRef<HTMLDivElement | null>(null);
  const [canScrollSectionsLeft, setCanScrollSectionsLeft] = useState(false);
  const [canScrollSectionsRight, setCanScrollSectionsRight] = useState(false);

  const pipelineSections = [
    { id: 'pipeline', label: 'Pipeline', icon: LayoutGrid, action: () => { setViewMode('kanban'); setShowArchived(false); } },
    { id: 'archived', label: 'Archived', icon: Archive, action: () => setShowArchived(true) },
    { id: 'inspection', label: 'Inspection', icon: Shield, action: () => navigate('/tools') },
    { id: 'documents', label: 'Documents', icon: FileText, action: () => navigate('/documents') },
    { id: 'financial', label: 'Financial', icon: DollarSign, action: () => navigate('/estimates-list') },
    { id: 'work-orders', label: 'Work Orders', icon: ClipboardList, action: () => navigate('/work-orders') },
    { id: 'calendar', label: 'Calendar', icon: Calendar, action: () => navigate('/calendar') },
    { id: 'reports', label: 'Reports', icon: Briefcase, action: () => navigate('/reports') },
  ];

  useEffect(() => {
    if (!profile?.company_id) {
      if (!loadingAuth) setLoading(false);
      return;
    }
    
    fetchContacts();

    // Set up real-time subscription
    const channel = supabase
      .channel('public:contacts')
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'contacts',
          filter: `company_id=eq.${profile.company_id}`
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setContacts(prev => [payload.new, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setContacts(prev => prev.map(c => c.id === payload.new.id ? payload.new : c));
          } else if (payload.eventType === 'DELETE') {
            setContacts(prev => prev.filter(c => c.id === payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.company_id, loadingAuth]);

  useEffect(() => {
    const updateSectionOverflow = () => {
      const node = sectionScrollerRef.current;
      if (!node) return;
      setCanScrollSectionsLeft(node.scrollLeft > 8);
      setCanScrollSectionsRight(node.scrollLeft + node.clientWidth < node.scrollWidth - 8);
    };

    updateSectionOverflow();
    window.addEventListener('resize', updateSectionOverflow);
    return () => window.removeEventListener('resize', updateSectionOverflow);
  }, []);

  const fetchContacts = async () => {
    try {
      const [{ data, error }, { data: apptData }, { data: photoDocs }] = await Promise.all([
        // Fetch ALL contacts (active + archived) so both views work without a refetch on tab switch
        supabase.from('contacts').select('*').eq('company_id', profile.company_id).order('updated_at', { ascending: false }),
        supabase.from('appointments').select('id,contact_id,date,time,title,status').eq('company_id', profile.company_id).eq('status', 'scheduled'),
        supabase.from('documents').select('*').eq('company_id', profile.company_id).eq('type', 'photo'),
      ]);
      if (error) throw error;
      setContacts(data || []);
      setAppointments(apptData || []);
      const photoMap: Record<string, string> = {};
      const sortedPhotos: any[] = [...((photoDocs as any[]) || [])].sort((a: any, b: any) => {
        const starDelta = Number(Boolean(b.starred)) - Number(Boolean(a.starred));
        if (starDelta !== 0) return starDelta;
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      });
      for (const doc of sortedPhotos) {
        if (photoMap[doc.contact_id]) continue;
        photoMap[doc.contact_id] = await buildDocumentDisplayUrl(doc.url);
      }
      setContactPhotoMap(photoMap);
    } catch (err) {
      console.error('Error fetching contacts:', err);
    } finally {
      setLoading(false);
    }
  };

  const reactivateContact = async (contactId: string) => {
    setReactivatingId(contactId);
    try {
      await supabase.from('contacts').update({ is_archived: false, archived_at: null, archived_by: null, status: 'new_lead' } as any).eq('id', contactId);
      await fetchContacts();
    } catch (err) {
      console.error('Error reactivating contact:', err);
    } finally {
      setReactivatingId(null);
    }
  };

  // Active contacts: not archived (handle missing column gracefully — treat null as false)
  const activeContacts = contacts.filter((c) => !c.is_archived);
  // Archived contacts
  const archivedContacts = contacts.filter((c) => !!c.is_archived);

  const renderContactAvatar = (contact: any, className: string, textClass: string) => {
    const photoUrl = contactPhotoMap[contact.id];
    if (photoUrl) {
      return (
        <div className={`${className} overflow-hidden bg-slate-100`}>
          <img src={photoUrl} alt={`${contact.first_name} ${contact.last_name}`} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
        </div>
      );
    }
    return (
      <div className={`${className} bg-slate-100 flex items-center justify-center text-primary font-bold ${textClass}`}>
        {contact.first_name[0]}{contact.last_name[0]}
      </div>
    );
  };

  // Returns the next upcoming scheduled appointment for a contact
  const getNextAppt = (contactId: string) => {
    const today = new Date(); today.setHours(0,0,0,0);
    const upcoming = appointments.filter((apt) => {
      if (apt.contact_id !== contactId) return false;
      const raw = apt.date?.trim();
      if (!raw) return false;
      const d = new Date(`${raw}T${apt.time?.trim() || '00:00'}`);
      return !isNaN(d.getTime()) && d >= today;
    });
    if (!upcoming.length) return null;
    return upcoming.sort((a: any, b: any) =>
      new Date(`${a.date}T${a.time || '00:00'}`).getTime() - new Date(`${b.date}T${b.time || '00:00'}`).getTime()
    )[0];
  };

  const formatApptLabel = (apt: any): string => {
    if (!apt?.date) return '';
    const d = new Date(`${apt.date}T${apt.time?.trim() || '00:00'}`);
    if (isNaN(d.getTime())) return '';
    const today = new Date(); today.setHours(0,0,0,0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    const dayLabel = d.getTime() === today.getTime() ? 'Today' :
      d.getTime() === tomorrow.getTime() ? 'Tomorrow' :
      d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const timeLabel = apt.time
      ? new Date(`1970-01-01T${apt.time}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      : '';
    return timeLabel ? `${dayLabel} · ${timeLabel}` : dayLabel;
  };

  const openNavigation = (e: React.MouseEvent, address: string, city?: string, state?: string, zip?: string) => {
    e.stopPropagation();
    const parts = [address, city, state, zip].filter(Boolean);
    if (!parts.length) return;
    const query = encodeURIComponent(parts.join(', '));
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    window.open(isIOS ? `maps://maps.apple.com/?q=${query}` : `https://maps.google.com/?q=${query}`, '_blank', 'noopener');
  };

  if (loadingAuth) return (
    <div className="h-full flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-4 border-accent border-t-transparent"></div>
    </div>
  );

  if (!profile?.company_id) {
    return <NoProfileState />;
  }

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const applySearch = (list: any[]) => {
    if (!normalizedQuery) return list;
    return list.filter((contact) => {
      const haystack = [
        contact.first_name,
        contact.last_name,
        `${contact.first_name || ''} ${contact.last_name || ''}`.trim(),
        contact.address,
        contact.city,
        contact.state,
        contact.zip,
        contact.email,
        contact.phone1,
        contact.phone2,
        contact.project_type,
        contact.lead_source,
        contact.status,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  };

  // Active pipeline only shows non-archived contacts
  const filteredContacts = applySearch(activeContacts);
  // Archived view
  const filteredArchived = applySearch(archivedContacts);

  const scrollSections = (direction: 'left' | 'right') => {
    const node = sectionScrollerRef.current;
    if (!node) return;
    node.scrollBy({ left: direction === 'left' ? -180 : 180, behavior: 'smooth' });
    window.setTimeout(() => {
      setCanScrollSectionsLeft(node.scrollLeft > 8);
      setCanScrollSectionsRight(node.scrollLeft + node.clientWidth < node.scrollWidth - 8);
    }, 220);
  };

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* Search & Filter Header */}
      <div className="p-6 space-y-4 bg-white border-b border-slate-100">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-primary">Pipeline</h1>
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button 
              onClick={() => setViewMode('kanban')}
              className={`p-2 rounded-lg transition-all ${viewMode === 'kanban' ? 'bg-white shadow-sm text-accent' : 'text-slate-400'}`}
            >
              <LayoutGrid size={20} />
            </button>
            <button 
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-accent' : 'text-slate-400'}`}
            >
              <List size={20} />
            </button>
            <button 
              onClick={() => setViewMode('map')}
              className={`p-2 rounded-lg transition-all ${viewMode === 'map' ? 'bg-white shadow-sm text-accent' : 'text-slate-400'}`}
            >
              <MapPin size={20} />
            </button>
          </div>
        </div>

        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text"
              placeholder="Search contacts..."
              className="w-full bg-slate-100 border-none rounded-2xl py-3 pl-11 pr-4 text-base focus:ring-2 focus:ring-accent/20"
              value={searchQuery}
              onChange={(e) => {
                const nextQuery = e.target.value;
                setSearchQuery(nextQuery);
                if (nextQuery.trim()) {
                  setViewMode('list');
                }
              }}
            />
          </div>
          <button className="bg-slate-100 p-3 rounded-2xl text-slate-600 active:scale-95 transition-transform">
            <Filter size={20} />
          </button>
        </div>
      </div>

      <div className="relative border-b border-slate-100 bg-white">
        <div className="px-6 pt-3 flex items-center justify-between">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Sections</p>
          {(canScrollSectionsLeft || canScrollSectionsRight) && (
            <p className="text-[10px] font-bold uppercase tracking-wider text-accent">Swipe for more</p>
          )}
        </div>
        {canScrollSectionsLeft && (
          <button
            type="button"
            onClick={() => scrollSections('left')}
            className="absolute left-2 top-[calc(50%+8px)] z-10 -translate-y-1/2 rounded-full bg-accent p-2 text-white shadow-lg shadow-accent/30"
          >
            <ChevronLeft size={16} />
          </button>
        )}
        {canScrollSectionsRight && (
          <button
            type="button"
            onClick={() => scrollSections('right')}
            className="absolute right-2 top-[calc(50%+8px)] z-10 -translate-y-1/2 rounded-full bg-accent p-2 text-white shadow-lg shadow-accent/30"
          >
            <ChevronRight size={16} />
          </button>
        )}
        {canScrollSectionsLeft && <div className="pointer-events-none absolute inset-y-0 left-0 w-14 bg-gradient-to-r from-white via-white/90 to-transparent" />}
        {canScrollSectionsRight && <div className="pointer-events-none absolute inset-y-0 right-0 w-14 bg-gradient-to-l from-white via-white/90 to-transparent" />}
        <div
          ref={sectionScrollerRef}
          onScroll={() => {
            const node = sectionScrollerRef.current;
            if (!node) return;
            setCanScrollSectionsLeft(node.scrollLeft > 8);
            setCanScrollSectionsRight(node.scrollLeft + node.clientWidth < node.scrollWidth - 8);
          }}
          className="px-12 pb-1 overflow-x-auto no-scrollbar"
          style={{ touchAction: 'pan-y', overscrollBehaviorX: 'contain' }}
        >
          <div className="flex gap-4 min-w-max">
            {pipelineSections.map((section) => {
              const Icon = section.icon;
              const isActive =
                (section.id === 'pipeline' && !showArchived) ||
                (section.id === 'archived' && showArchived);
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={section.action}
                  className={`py-4 flex items-center gap-2 border-b-2 transition-all ${isActive ? 'border-accent text-accent' : 'border-transparent text-slate-400'}`}
                >
                  <Icon size={18} />
                  <span className="text-sm font-bold whitespace-nowrap">{section.label}</span>
                  {section.id === 'archived' && archivedContacts.length > 0 && (
                    <span className="bg-amber-100 text-amber-700 text-[10px] font-black px-1.5 py-0.5 rounded-full">
                      {archivedContacts.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden relative">
        {loading ? (
          <div className="p-6 space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-32 w-full bg-slate-200 animate-pulse rounded-2xl" />
            ))}
          </div>
        ) : showArchived ? (
          <div className="h-full overflow-y-auto p-6 space-y-4 pb-32">
            <div className="flex items-center gap-2 mb-2">
              <Archive size={16} className="text-amber-500" />
              <h2 className="text-sm font-black uppercase tracking-wider text-slate-500">Archived Contacts</h2>
              <span className="bg-amber-100 text-amber-700 text-[10px] font-black px-2 py-0.5 rounded-full">{filteredArchived.length}</span>
            </div>
            {filteredArchived.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
                  <Archive size={28} className="text-slate-300" />
                </div>
                <p className="font-bold text-slate-400">No archived contacts</p>
                <p className="mt-1 text-sm text-slate-300">
                  {searchQuery ? 'No archived contacts match your search.' : 'Archive a completed contact to keep your pipeline clean.'}
                </p>
              </div>
            ) : (
              filteredArchived.map((contact) => (
                <div
                  key={contact.id}
                  className="card p-4 flex items-center gap-4 cursor-pointer active:scale-[0.98] transition-transform"
                  onClick={() => navigate(`/contacts/${contact.id}`)}
                >
                  {renderContactAvatar(contact, 'h-12 w-12 rounded-2xl flex-shrink-0', 'text-base')}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-primary truncate">{contact.first_name} {contact.last_name}</p>
                    <p className="text-xs text-slate-400 truncate">{contact.address}{contact.city ? `, ${contact.city}` : ''}</p>
                    {contact.archived_at && (
                      <p className="text-[10px] text-slate-300 mt-0.5">
                        Archived {new Date(contact.archived_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); reactivateContact(contact.id); }}
                    disabled={reactivatingId === contact.id}
                    className="flex-shrink-0 flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-3 py-2 rounded-xl text-xs font-bold disabled:opacity-60"
                  >
                    {reactivatingId === contact.id
                      ? <span className="animate-spin rounded-full h-3 w-3 border-2 border-emerald-600 border-t-transparent" />
                      : <RotateCcw size={13} />}
                    Reactivate
                  </button>
                </div>
              ))
            )}
          </div>
        ) : viewMode === 'kanban' ? (
          <div className="h-full overflow-x-auto flex gap-4 p-6 no-scrollbar snap-x" style={{ touchAction: 'pan-x', overscrollBehaviorX: 'contain' }}>
            {STAGES.map((stage) => {
              const stageContacts = filteredContacts.filter(c => stage.statuses.includes(normalizePipelineStatus(c.status)));
              return (
                <div key={stage.statuses[0]} className="min-w-[280px] flex flex-col gap-4 snap-center">
                  <div className="flex items-center justify-between px-2">
                    <div className="flex items-center gap-2">
                      <div className={`h-2 w-2 rounded-full ${stage.color}`} />
                      <h3 className="font-bold text-sm text-primary uppercase tracking-wider">{stage.label}</h3>
                    </div>
                    <span className="bg-slate-200 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-full">
                      {stageContacts.length}
                    </span>
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-3 no-scrollbar pb-10">
                    {stageContacts.map((contact) => (
                      <motion.div
                        key={contact.id}
                        layoutId={contact.id}
                        onClick={() => navigate(`/contacts/${contact.id}`)}
                        className="card p-4 space-y-3 active:scale-[0.98] transition-transform cursor-pointer"
                      >
                        <div className="flex justify-between items-start">
                          <h4 className="font-bold text-primary leading-tight flex-1 min-w-0 truncate pr-2">
                            {contact.first_name} {contact.last_name}
                          </h4>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <span className="text-[10px] font-bold text-accent bg-accent/10 px-2 py-0.5 rounded-md">
                              {contact.project_type || 'Roofing'}
                            </span>
                            <div className="relative" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={(e) => { e.stopPropagation(); setQuickMenuContactId(quickMenuContactId === contact.id ? null : contact.id); }}
                                className="p-1 rounded-md active:bg-slate-100 transition-colors"
                                title="Quick Actions"
                              >
                                <Zap size={13} className="text-amber-400" />
                              </button>
                              {quickMenuContactId === contact.id && (
                                <>
                                  <div className="fixed inset-0 z-40" onClick={() => setQuickMenuContactId(null)} />
                                  <div className="absolute right-0 top-7 z-50 bg-white rounded-xl shadow-lg border border-slate-200 py-1 w-48">
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setQuickMenuContactId(null); navigate(`/contacts/${contact.id}?tab=notes`); }}
                                      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-slate-700 active:bg-slate-50 transition-colors"
                                    >
                                      <StickyNote size={14} className="text-blue-500" />Add Note
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setQuickMenuContactId(null); navigate(`/calendar?contact=${contact.id}`); }}
                                      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-slate-700 active:bg-slate-50 transition-colors"
                                    >
                                      <CalendarPlus size={14} className="text-green-500" />Create Calendar Event
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        <div className="space-y-1.5">
                          <div
                            className="flex items-center gap-2 text-slate-500 active:text-blue-600 transition-colors"
                            onClick={(e) => openNavigation(e, contact.address, contact.city, contact.state, contact.zip)}
                          >
                            <MapPin size={12} className="flex-shrink-0" />
                            <span className="text-[11px] truncate">{contact.address || 'No address'}</span>
                          </div>
                          {contact.phone1 && (
                            <div className="flex items-center gap-2 text-slate-500">
                              <Phone size={12} className="flex-shrink-0" />
                              <span className="text-[11px]">{contact.phone1}</span>
                            </div>
                          )}
                          {(() => {
                            const nextAppt = getNextAppt(contact.id);
                            if (!nextAppt) return null;
                            return (
                              <div className="flex items-center gap-2 text-indigo-500 font-medium">
                                <Clock size={12} className="flex-shrink-0" />
                                <span className="text-[11px]">{formatApptLabel(nextAppt)}</span>
                              </div>
                            );
                          })()}
                          <div className="flex items-center gap-2 text-slate-500">
                            <DollarSign size={12} />
                            <span className="text-[11px] font-bold text-slate-700">
                              {formatCurrency(contact.project_value)}
                            </span>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-50 flex justify-between items-center">
                          <div className="flex items-center gap-1.5">
                            <div className="h-5 w-5 overflow-hidden rounded-full bg-slate-100">
                              {contactPhotoMap[contact.id] ? (
                                <img src={contactPhotoMap[contact.id]} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center">
                                  <User size={10} className="text-slate-400" />
                                </div>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-400 font-medium">Assigned to Rep</span>
                          </div>
                          <span className="text-[10px] text-slate-300 font-medium">2d ago</span>
                        </div>
                      </motion.div>
                    ))}
                    {stageContacts.length === 0 && (
                      <div className="h-32 border-2 border-dashed border-slate-200 rounded-2xl flex items-center justify-center text-slate-300 text-xs italic">
                        No contacts in this stage
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : viewMode === 'list' ? (
          <div className="p-6 space-y-3 overflow-y-auto h-full pb-20">
            {filteredContacts.map((contact) => (
              <div 
                key={contact.id}
                onClick={() => navigate(`/contacts/${contact.id}`)}
                className="card p-4 flex items-center gap-4 active:bg-slate-50 transition-colors"
              >
                {renderContactAvatar(contact, 'h-12 w-12 rounded-2xl', '')}
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-primary truncate">{contact.first_name} {contact.last_name}</h4>
                  <p className="text-xs text-slate-500 truncate">{contact.address}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase ${STAGES.find(s => s.statuses.includes(normalizePipelineStatus(contact.status)))?.color || 'bg-slate-400'} text-white`}>
                    {getPipelineStageLabel(contact.status)}
                  </span>
                  <button
                    onClick={(e) => openNavigation(e, contact.address, contact.city, contact.state, contact.zip)}
                    className="p-1.5 bg-slate-100 rounded-lg text-slate-400 active:text-accent transition-colors"
                  >
                    <MapPin size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 space-y-4 h-full overflow-y-auto pb-20">
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 mb-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-blue-500 flex items-center justify-center text-white">
                <MapPin size={20} />
              </div>
              <p className="text-xs text-blue-800 font-medium">
                Map view shows leads near your current location. Tap a lead to navigate.
              </p>
            </div>
            {filteredContacts.map((contact) => (
              <div 
                key={contact.id}
                className="card p-4 space-y-4"
              >
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    {renderContactAvatar(contact, 'h-10 w-10 rounded-full', 'text-sm')}
                    <div>
                      <h4 className="font-bold text-primary">{contact.first_name} {contact.last_name}</h4>
                      <p className="text-xs text-slate-500">{contact.address}</p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase ${STAGES.find(s => s.statuses.includes(normalizePipelineStatus(contact.status)))?.color || 'bg-slate-400'} text-white`}>
                    {getPipelineStageLabel(contact.status)}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => navigate(`/contacts/${contact.id}`)}
                    className="flex-1 bg-slate-100 text-primary py-3 rounded-xl text-xs font-bold active:scale-95 transition-transform"
                  >
                    View Details
                  </button>
                  <button
                    onClick={(e) => openNavigation(e, contact.address, contact.city, contact.state, contact.zip)}
                    className="flex-1 bg-accent text-white py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
                  >
                    <MapPin size={14} />
                    Navigate
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* FAB */}
        <button 
          onClick={() => setIsModalOpen(true)}
          className="absolute bottom-6 right-6 h-14 w-14 bg-accent text-white rounded-2xl shadow-xl shadow-accent/30 flex items-center justify-center active:scale-90 transition-transform z-10"
        >
          <Plus size={28} />
        </button>

        <NewContactModal 
          isOpen={isModalOpen} 
          onClose={() => setIsModalOpen(false)} 
          onSuccess={fetchContacts} 
        />
      </div>
    </div>
  );
}
