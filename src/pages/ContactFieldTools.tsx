import React, { useEffect, useState } from 'react';
import {
  ClipboardList, Package, Calculator, FileText, Camera,
  HardHat, ArrowLeft, ChevronRight,
} from 'lucide-react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

type Counts = {
  workOrders: number;
  materialOrders: number;
  estimates: number;
  documents: number;
};

export default function ContactFieldTools() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [contactName, setContactName] = useState('');
  const [counts, setCounts] = useState<Counts>({ workOrders: 0, materialOrders: 0, estimates: 0, documents: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    loadData();
  }, [id]);

  const loadData = async () => {
    if (!id) return;
    try {
      const db = supabase as any;

      const [contactRes, woRes, moRes, estRes, docRes] = await Promise.all([
        db.from('contacts').select('first_name, last_name').eq('id', id).single(),
        db.from('work_orders').select('id', { count: 'exact', head: true }).eq('contact_id', id),
        db.from('material_orders').select('id', { count: 'exact', head: true }).eq('contact_id', id),
        db.from('estimates').select('id', { count: 'exact', head: true }).eq('contact_id', id),
        db.from('documents').select('id', { count: 'exact', head: true }).eq('contact_id', id),
      ]);

      const c = contactRes.data;
      if (c) {
        setContactName(`${c.first_name || ''} ${c.last_name || ''}`.trim());
      }

      setCounts({
        workOrders: woRes.count || 0,
        materialOrders: moRes.count || 0,
        estimates: estRes.count || 0,
        documents: docRes.count || 0,
      });
    } catch (err) {
      console.error('[ContactFieldTools] load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const tools = [
    {
      id: 'work_orders',
      label: 'Work Orders',
      icon: ClipboardList,
      color: 'bg-blue-500',
      count: counts.workOrders,
      path: `/work-orders?contactId=${id}`,
    },
    {
      id: 'material_orders',
      label: 'Material Orders',
      icon: Package,
      color: 'bg-amber-500',
      count: counts.materialOrders,
      path: `/material-orders?contactId=${id}`,
    },
    {
      id: 'estimates',
      label: 'Estimates',
      icon: Calculator,
      color: 'bg-emerald-500',
      count: counts.estimates,
      path: `/estimates-list?contactId=${id}`,
    },
    {
      id: 'crew_schedule',
      label: 'Crew Schedule',
      icon: HardHat,
      color: 'bg-indigo-500',
      count: null,
      path: `/crew-schedule?contactId=${id}`,
    },
    {
      id: 'documents',
      label: 'Documents',
      icon: FileText,
      color: 'bg-slate-800',
      count: counts.documents,
      path: `/contacts/${id}/documents`,
    },
    {
      id: 'photo_checklist',
      label: 'Photo Checklist',
      icon: Camera,
      color: 'bg-rose-500',
      count: null,
      path: `/photo-checklist?contactId=${id}`,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 pb-10">
      {/* Header */}
      <nav className="p-4 bg-white border-b border-slate-100 flex items-center gap-4 sticky top-0 z-10 shadow-sm">
        <button
          onClick={() => navigate(-1)}
          className="p-2 -ml-2 text-slate-400 active:scale-90 transition-transform"
        >
          <ArrowLeft size={24} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-primary truncate">
            {loading ? 'Field Tools' : contactName ? `${contactName} — Field Tools` : 'Field Tools'}
          </h1>
          {contactName && (
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Showing data for this customer only
            </p>
          )}
        </div>
      </nav>

      <div className="p-6 space-y-6">
        {/* Tool Grid */}
        <div className="grid grid-cols-2 gap-4">
          {tools.map((tool) => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.id}
                onClick={() => navigate(tool.path)}
                className="bg-white border border-slate-100 rounded-2xl p-5 flex flex-col items-start gap-4 text-left shadow-sm active:scale-95 transition-transform"
              >
                <div className={`${tool.color} h-12 w-12 rounded-2xl flex items-center justify-center text-white shadow-lg`}>
                  <Icon size={24} />
                </div>
                <div className="space-y-0.5">
                  <p className="font-bold text-primary text-sm">{tool.label}</p>
                  {tool.count !== null ? (
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      {loading ? '—' : tool.count === 0 ? 'None yet' : `${tool.count} on file`}
                    </p>
                  ) : (
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      View all
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Quick actions */}
        <div className="space-y-3">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.18em] ml-1">Quick Actions</p>
          <button
            onClick={() => navigate(`/contacts/${id}/estimate`)}
            className="w-full flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl shadow-sm active:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                <Calculator size={20} className="text-emerald-600" />
              </div>
              <div className="text-left">
                <p className="font-bold text-primary text-sm">New Estimate</p>
                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-tight">Open the retail estimator</p>
              </div>
            </div>
            <ChevronRight size={18} className="text-slate-300" />
          </button>
          <button
            onClick={() => navigate(`/contacts/${id}/inspection`)}
            className="w-full flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl shadow-sm active:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <Camera size={20} className="text-blue-600" />
              </div>
              <div className="text-left">
                <p className="font-bold text-primary text-sm">Smart Inspection</p>
                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-tight">Log inspection & photos</p>
              </div>
            </div>
            <ChevronRight size={18} className="text-slate-300" />
          </button>
          <button
            onClick={() => navigate(`/contacts/${id}/report`)}
            className="w-full flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl shadow-sm active:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center">
                <FileText size={20} className="text-violet-600" />
              </div>
              <div className="text-left">
                <p className="font-bold text-primary text-sm">Report Builder</p>
                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-tight">Generate before & after report</p>
              </div>
            </div>
            <ChevronRight size={18} className="text-slate-300" />
          </button>
        </div>
      </div>
    </div>
  );
}
