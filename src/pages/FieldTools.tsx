import React, { useState, useEffect } from 'react';
import {
  ClipboardList, Package, Calculator,
  FileText, Camera, ChevronRight, HardHat,
  Truck, Ruler, Search, X, User,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import NoProfileState from '../components/NoProfileState';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';

type PickerMode = 'estimates' | 'calculator' | 'checklist' | 'workorders' | 'materialorders' | null;

export default function FieldTools() {
  const navigate = useNavigate();
  const { profile, loading: loadingAuth } = useAuth();
  const [recentWorkOrders, setRecentWorkOrders] = useState<any[]>([]);

  // Contact picker state
  const [pickerMode, setPickerMode] = useState<PickerMode>(null);
  const [contacts, setContacts] = useState<any[]>([]);
  const [contactSearch, setContactSearch] = useState('');
  const [loadingContacts, setLoadingContacts] = useState(false);

  useEffect(() => {
    if (!profile?.company_id) return;
    fetchRecentWorkOrders();
  }, [profile?.company_id]);

  const fetchRecentWorkOrders = async () => {
    try {
      const { data, error } = await supabase
        .from('work_orders')
        .select('id, title, status, crew_name')
        .eq('company_id', profile!.company_id)
        .order('created_at', { ascending: false })
        .limit(2);
      if (error) throw error;
      setRecentWorkOrders(data || []);
    } catch (err) {
      console.error('Error fetching work orders:', err);
    }
  };

  const openPicker = async (mode: PickerMode) => {
    if (!profile?.company_id) return;
    setPickerMode(mode);
    setContactSearch('');
    setLoadingContacts(true);
    try {
      const { data } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, address, city, state')
        .eq('company_id', profile.company_id)
        .neq('status', 'archived')
        .order('last_name', { ascending: true })
        .limit(100);
      setContacts(data || []);
    } finally {
      setLoadingContacts(false);
    }
  };

  const handleContactSelect = (contactId: string) => {
    setPickerMode(null);
    setContactSearch('');
    if (pickerMode === 'estimates') navigate(`/estimates-list?contactId=${contactId}`);
    else if (pickerMode === 'calculator') navigate(`/contacts/${contactId}/estimate`);
    else if (pickerMode === 'checklist') navigate(`/photo-checklist?contactId=${contactId}`);
    else if (pickerMode === 'workorders') navigate(`/work-orders?contactId=${contactId}`);
    else if (pickerMode === 'materialorders') navigate(`/material-orders?contactId=${contactId}`);
  };

  const filteredContacts = contacts.filter((c) => {
    const q = contactSearch.toLowerCase();
    return (
      c.first_name?.toLowerCase().includes(q) ||
      c.last_name?.toLowerCase().includes(q) ||
      c.address?.toLowerCase().includes(q)
    );
  });

  const pickerTitle =
    pickerMode === 'estimates' ? 'Select Contact — Estimates'
    : pickerMode === 'calculator' ? 'Select Contact — Estimate Calculator'
    : pickerMode === 'checklist' ? 'Select Contact — Photo Checklist'
    : pickerMode === 'workorders' ? 'Select Contact — Work Orders'
    : pickerMode === 'materialorders' ? 'Select Contact — Material Orders'
    : '';

  if (loadingAuth) return (
    <div className="h-full flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-4 border-accent border-t-transparent"></div>
    </div>
  );

  if (!profile?.company_id) {
    return <NoProfileState />;
  }

  return (
    <div className="p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-primary">Field Tools</h1>
        <p className="text-slate-500 text-sm">Manage projects and operations</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Work Orders */}
        <button
          onClick={() => openPicker('workorders')}
          className="card p-5 flex flex-col items-start gap-4 text-left active:scale-95 transition-transform"
        >
          <div className="bg-blue-500 h-12 w-12 rounded-2xl flex items-center justify-center text-white shadow-lg">
            <ClipboardList size={24} />
          </div>
          <div className="space-y-1">
            <p className="font-bold text-primary text-sm">Work Orders</p>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">By Contact</p>
          </div>
        </button>

        {/* Material Orders */}
        <button
          onClick={() => openPicker('materialorders')}
          className="card p-5 flex flex-col items-start gap-4 text-left active:scale-95 transition-transform"
        >
          <div className="bg-amber-500 h-12 w-12 rounded-2xl flex items-center justify-center text-white shadow-lg">
            <Package size={24} />
          </div>
          <div className="space-y-1">
            <p className="font-bold text-primary text-sm">Material Orders</p>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">By Contact</p>
          </div>
        </button>

        {/* Estimates — requires contact selection */}
        <button
          onClick={() => openPicker('estimates')}
          className="card p-5 flex flex-col items-start gap-4 text-left active:scale-95 transition-transform"
        >
          <div className="bg-emerald-500 h-12 w-12 rounded-2xl flex items-center justify-center text-white shadow-lg">
            <Calculator size={24} />
          </div>
          <div className="space-y-1">
            <p className="font-bold text-primary text-sm">Estimates</p>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">By Contact</p>
          </div>
        </button>

        {/* Crew Schedule */}
        <button
          onClick={() => navigate('/crew-schedule')}
          className="card p-5 flex flex-col items-start gap-4 text-left active:scale-95 transition-transform"
        >
          <div className="bg-indigo-500 h-12 w-12 rounded-2xl flex items-center justify-center text-white shadow-lg">
            <HardHat size={24} />
          </div>
          <div className="space-y-1">
            <p className="font-bold text-primary text-sm">Crew Schedule</p>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">—</p>
          </div>
        </button>

        {/* Documents */}
        <button
          onClick={() => navigate('/documents')}
          className="card p-5 flex flex-col items-start gap-4 text-left active:scale-95 transition-transform"
        >
          <div className="bg-slate-800 h-12 w-12 rounded-2xl flex items-center justify-center text-white shadow-lg">
            <FileText size={24} />
          </div>
          <div className="space-y-1">
            <p className="font-bold text-primary text-sm">Documents</p>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">—</p>
          </div>
        </button>

        {/* Photo Checklist — requires contact selection */}
        <button
          onClick={() => openPicker('checklist')}
          className="card p-5 flex flex-col items-start gap-4 text-left active:scale-95 transition-transform"
        >
          <div className="bg-rose-500 h-12 w-12 rounded-2xl flex items-center justify-center text-white shadow-lg">
            <Camera size={24} />
          </div>
          <div className="space-y-1">
            <p className="font-bold text-primary text-sm">Photo Checklist</p>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">By Contact</p>
          </div>
        </button>
      </div>

      {/* Recent Work Orders */}
      <div className="space-y-4">
        <div className="flex justify-between items-center px-1">
          <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Recent Work Orders</h2>
          <button onClick={() => navigate('/work-orders')} className="text-accent text-xs font-bold">View All</button>
        </div>
        <div className="space-y-3">
          {recentWorkOrders.length === 0 ? (
            <div className="card p-6 text-center text-slate-400 text-sm">No work orders yet</div>
          ) : recentWorkOrders.map((wo) => (
            <div
              key={wo.id}
              onClick={() => navigate(`/work-orders/${wo.id}`)}
              className="card p-4 flex items-center justify-between group active:bg-slate-50 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center text-primary">
                  <Truck size={20} />
                </div>
                <div>
                  <p className="font-bold text-primary text-sm">{wo.title || 'Work Order'}</p>
                  <p className="text-xs text-slate-500">{wo.crew_name || 'Unassigned'} · {wo.status?.replace('_', ' ') || 'Pending'}</p>
                </div>
              </div>
              <ChevronRight size={18} className="text-slate-300" />
            </div>
          ))}
        </div>
      </div>

      {/* Estimate Calculator shortcut — requires contact */}
      <div className="card p-6 bg-primary text-white space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center">
            <Ruler size={20} />
          </div>
          <div>
            <h3 className="font-bold">Estimate Calculator</h3>
            <p className="text-xs text-slate-300">Quick retail estimate builder</p>
          </div>
        </div>
        <button
          onClick={() => openPicker('calculator')}
          className="w-full bg-white text-primary py-3 rounded-xl text-xs font-bold active:scale-95 transition-transform"
        >
          Open Calculator
        </button>
      </div>

      {/* ── Contact Picker Bottom Sheet ── */}
      {pickerMode && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => { setPickerMode(null); setContactSearch(''); }}
          />

          {/* Sheet */}
          <div className="relative w-full max-w-lg bg-white rounded-t-[28px] shadow-2xl flex flex-col max-h-[80dvh]">
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 bg-slate-200 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pb-3 border-b border-slate-100 shrink-0">
              <div>
                <p className="text-sm font-black text-primary">Select a Contact</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{pickerTitle}</p>
              </div>
              <button
                onClick={() => { setPickerMode(null); setContactSearch(''); }}
                className="p-2 rounded-full text-slate-400 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            {/* Search */}
            <div className="px-4 py-3 shrink-0">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search contacts…"
                  value={contactSearch}
                  onChange={(e) => setContactSearch(e.target.value)}
                  className="w-full bg-slate-100 border-none rounded-2xl py-3 pl-9 pr-4 text-sm focus:ring-2 focus:ring-accent/20"
                  autoFocus
                />
              </div>
            </div>

            {/* Contact list */}
            <div className="overflow-y-auto flex-1 px-4 pb-6 space-y-2">
              {loadingContacts ? (
                [1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-16 bg-slate-100 rounded-2xl animate-pulse" />
                ))
              ) : filteredContacts.length === 0 ? (
                <div className="py-12 text-center">
                  <User size={32} className="mx-auto text-slate-200 mb-2" />
                  <p className="text-sm text-slate-400">No contacts found</p>
                </div>
              ) : (
                filteredContacts.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => handleContactSelect(c.id)}
                    className="w-full flex items-center gap-3 p-3 bg-slate-50 rounded-2xl text-left active:bg-slate-100 transition-colors"
                  >
                    <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center shrink-0">
                      <span className="text-white text-xs font-black">
                        {(c.first_name?.[0] || '?').toUpperCase()}{(c.last_name?.[0] || '').toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-primary truncate">
                        {c.first_name} {c.last_name}
                      </p>
                      {c.address && (
                        <p className="text-[11px] text-slate-400 truncate">
                          {c.address}{c.city ? `, ${c.city}` : ''}{c.state ? ` ${c.state}` : ''}
                        </p>
                      )}
                    </div>
                    <ChevronRight size={16} className="text-slate-300 shrink-0" />
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
