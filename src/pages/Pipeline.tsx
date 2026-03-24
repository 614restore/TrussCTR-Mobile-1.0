import React, { useEffect, useRef, useState } from 'react';
import { Search, Filter, List, LayoutGrid, Plus, MapPin, DollarSign, User, ChevronLeft, ChevronRight, Shield, FileText, Briefcase, Calendar, ClipboardList } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { CustomerStatus } from '../types/supabase';
import { formatCurrency, getStatusColor } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import NewContactModal from '../components/NewContactModal';
import NoProfileState from '../components/NoProfileState';

type StageConfig = { statuses: CustomerStatus[]; label: string; color: string };

const STAGES: StageConfig[] = [
  { statuses: ['prospect'], label: 'New Lead', color: 'bg-slate-400' },
  { statuses: ['lead'], label: 'Contacted / Qualifying', color: 'bg-blue-500' },
  { statuses: ['appt_set'], label: 'Appointment Set', color: 'bg-indigo-500' },
  { statuses: ['claim_filed'], label: 'Claim Filed', color: 'bg-sky-500' },
  { statuses: ['adjuster_scheduled'], label: 'Adjuster Scheduled', color: 'bg-cyan-500' },
  { statuses: ['inspection_completed'], label: 'Inspected', color: 'bg-amber-500' },
  { statuses: ['supplement_filed'], label: 'Supplement Filed', color: 'bg-yellow-500' },
  { statuses: ['estimating'], label: 'Estimating', color: 'bg-orange-400' },
  { statuses: ['estimate_sent'], label: 'Estimate Sent', color: 'bg-orange-500' },
  { statuses: ['contingency'], label: 'Contingency', color: 'bg-purple-400' },
  { statuses: ['approved'], label: 'Approved', color: 'bg-emerald-500' },
  { statuses: ['signed'], label: 'Signed / Won', color: 'bg-green-600' },
  { statuses: ['ordering_material'], label: 'Ordering Material', color: 'bg-teal-500' },
  { statuses: ['in_progress', 'build_phase'], label: 'In Progress', color: 'bg-primary' },
  { statuses: ['cleanup'], label: 'Cleanup', color: 'bg-slate-500' },
  { statuses: ['invoicing', 'pending_payment'], label: 'Invoicing', color: 'bg-violet-500' },
  { statuses: ['completed'], label: 'Completed', color: 'bg-slate-800' },
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
  const [loading, setLoading] = useState(true);
  const sectionScrollerRef = useRef<HTMLDivElement | null>(null);
  const [canScrollSectionsLeft, setCanScrollSectionsLeft] = useState(false);
  const [canScrollSectionsRight, setCanScrollSectionsRight] = useState(false);

  const pipelineSections = [
    { id: 'pipeline', label: 'Pipeline', icon: LayoutGrid, action: () => setViewMode('kanban') },
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
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('company_id', profile.company_id)
        .order('updated_at', { ascending: false });
      
      if (error) throw error;
      setContacts(data || []);
    } catch (err) {
      console.error('Error fetching contacts:', err);
    } finally {
      setLoading(false);
    }
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

  const filteredContacts = contacts.filter((contact) => {
    if (!normalizedQuery) return true;

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
          style={{ touchAction: 'pan-y' }}
        >
          <div className="flex gap-4 min-w-max">
            {pipelineSections.map((section) => {
              const Icon = section.icon;
              const isActive = section.id === 'pipeline' && viewMode === 'kanban';
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={section.action}
                  className={`py-4 flex items-center gap-2 border-b-2 transition-all ${isActive ? 'border-accent text-accent' : 'border-transparent text-slate-400'}`}
                >
                  <Icon size={18} />
                  <span className="text-sm font-bold whitespace-nowrap">{section.label}</span>
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
        ) : viewMode === 'kanban' ? (
          <div className="h-full overflow-x-auto flex gap-4 p-6 no-scrollbar snap-x">
            {STAGES.map((stage) => {
              const stageContacts = filteredContacts.filter(c => stage.statuses.includes(c.status));
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
                          <h4 className="font-bold text-primary leading-tight">
                            {contact.first_name} {contact.last_name}
                          </h4>
                          <span className="text-[10px] font-bold text-accent bg-accent/10 px-2 py-0.5 rounded-md">
                            {contact.project_type || 'Roofing'}
                          </span>
                        </div>
                        
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2 text-slate-500">
                            <MapPin size={12} />
                            <span className="text-[11px] truncate">{contact.address || 'No address'}</span>
                          </div>
                          <div className="flex items-center gap-2 text-slate-500">
                            <DollarSign size={12} />
                            <span className="text-[11px] font-bold text-slate-700">
                              {formatCurrency(contact.project_value)}
                            </span>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-50 flex justify-between items-center">
                          <div className="flex items-center gap-1.5">
                            <div className="h-5 w-5 rounded-full bg-slate-100 flex items-center justify-center overflow-hidden">
                              <User size={10} className="text-slate-400" />
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
                <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center text-primary font-bold">
                  {contact.first_name[0]}{contact.last_name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-primary truncate">{contact.first_name} {contact.last_name}</h4>
                  <p className="text-xs text-slate-500 truncate">{contact.address}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase ${STAGES.find(s => s.statuses.includes(contact.status))?.color || 'bg-slate-400'} text-white`}>
                    {contact.status.replace('_', ' ')}
                  </span>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(contact.address)}`, '_blank');
                    }}
                    className="p-1.5 bg-slate-100 rounded-lg text-slate-400 hover:text-accent"
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
                    <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center text-primary font-bold">
                      {contact.first_name[0]}{contact.last_name[0]}
                    </div>
                    <div>
                      <h4 className="font-bold text-primary">{contact.first_name} {contact.last_name}</h4>
                      <p className="text-xs text-slate-500">{contact.address}</p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase ${STAGES.find(s => s.statuses.includes(contact.status))?.color || 'bg-slate-400'} text-white`}>
                    {contact.status.replace('_', ' ')}
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
                    onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(contact.address)}`, '_blank')}
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
