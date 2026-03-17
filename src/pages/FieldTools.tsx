import React, { useState, useEffect } from 'react';
import { 
  ClipboardList, Package, Calculator, 
  FileText, Camera, ChevronRight, HardHat, 
  Truck, Ruler
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import NoProfileState from '../components/NoProfileState';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';

export default function FieldTools() {
  const navigate = useNavigate();
  const { profile, loading: loadingAuth } = useAuth();
  const [recentWorkOrders, setRecentWorkOrders] = useState<any[]>([]);

  const tools = [
    { id: 'work_orders', label: 'Work Orders', icon: ClipboardList, color: 'bg-blue-500', count: '—', path: '/work-orders' },
    { id: 'material_orders', label: 'Material Orders', icon: Package, color: 'bg-amber-500', count: '—', path: '/material-orders' },
    { id: 'estimates', label: 'Estimates', icon: Calculator, color: 'bg-emerald-500', count: '—', path: '/estimates-list' },
    { id: 'crew_schedule', label: 'Crew Schedule', icon: HardHat, color: 'bg-indigo-500', count: '—', path: '/crew-schedule' },
    { id: 'documents', label: 'Documents', icon: FileText, color: 'bg-slate-800', count: '—', path: '/documents' },
    { id: 'photo_checklist', label: 'Photo Checklist', icon: Camera, color: 'bg-rose-500', count: '—', path: '/photo-checklist' },
  ];

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
        {tools.map((tool) => (
          <button 
            key={tool.id}
            onClick={() => navigate(tool.path)}
            className="card p-5 flex flex-col items-start gap-4 text-left active:scale-95 transition-transform"
          >
            <div className={`${tool.color} h-12 w-12 rounded-2xl flex items-center justify-center text-white shadow-lg`}>
              <tool.icon size={24} />
            </div>
            <div className="space-y-1">
              <p className="font-bold text-primary text-sm">{tool.label}</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{tool.count}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Recent Work Orders — real data */}
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
                  <p className="text-xs text-slate-500">{wo.crew_name || 'Unassigned'} • {wo.status?.replace('_', ' ') || 'Pending'}</p>
                </div>
              </div>
              <ChevronRight size={18} className="text-slate-300" />
            </div>
          ))}
        </div>
      </div>

      {/* Estimate Calculator shortcut */}
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
          onClick={() => navigate('/estimates-list')}
          className="w-full bg-white text-primary py-3 rounded-xl text-xs font-bold active:scale-95 transition-transform"
        >
          Open Calculator
        </button>
      </div>
    </div>
  );
}
