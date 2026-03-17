import React from 'react';
import { 
  ClipboardList, Package, Calculator, Users, 
  FileText, Camera, ChevronRight, HardHat, 
  Truck, Ruler, Image as ImageIcon
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import NoProfileState from '../components/NoProfileState';

import { useNavigate } from 'react-router-dom';

export default function FieldTools() {
  const navigate = useNavigate();
  const { profile, loading: loadingAuth } = useAuth();
  const tools = [
    { id: 'work_orders', label: 'Work Orders', icon: ClipboardList, color: 'bg-blue-500', count: '12', path: '/work-orders' },
    { id: 'material_orders', label: 'Material Orders', icon: Package, color: 'bg-amber-500', count: '5', path: '/material-orders' },
    { id: 'estimates', label: 'Estimates', icon: Calculator, color: 'bg-emerald-500', count: '28', path: '/estimates-list' },
    { id: 'crew_schedule', label: 'Crew Schedule', icon: HardHat, color: 'bg-indigo-500', count: '4', path: '/crew-schedule' },
    { id: 'documents', label: 'Documents', icon: FileText, color: 'bg-slate-800', count: '150+', path: '/documents' },
    { id: 'photo_checklist', label: 'Photo Checklist', icon: Camera, color: 'bg-rose-500', count: '8', path: '/photo-checklist' },
  ];

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
            onClick={() => tool.path !== '#' && navigate(tool.path)}
            className="card p-5 flex flex-col items-start gap-4 text-left active:scale-95 transition-transform"
          >
            <div className={`${tool.color} h-12 w-12 rounded-2xl flex items-center justify-center text-white shadow-lg`}>
              <tool.icon size={24} />
            </div>
            <div className="space-y-1">
              <p className="font-bold text-primary text-sm">{tool.label}</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{tool.count} Active</p>
            </div>
          </button>
        ))}
      </div>

      <div className="space-y-4">
        <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest ml-1">Recent Work Orders</h2>
        <div className="space-y-3">
          {[
            { id: 'WO-1024', title: 'Main Roof Install', crew: 'Team Alpha', status: 'In Progress' },
            { id: 'WO-1025', title: 'Gutter Repair', crew: 'Team Bravo', status: 'Scheduled' },
          ].map((wo) => (
            <div 
              key={wo.id} 
              onClick={() => navigate('/work-orders')}
              className="card p-4 flex items-center justify-between group active:bg-slate-50 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center text-primary">
                  <Truck size={20} />
                </div>
                <div>
                  <p className="font-bold text-primary text-sm">{wo.title}</p>
                  <p className="text-xs text-slate-500">{wo.crew} • {wo.id}</p>
                </div>
              </div>
              <ChevronRight size={18} className="text-slate-300" />
            </div>
          ))}
        </div>
      </div>

      <div className="card p-6 bg-primary text-white space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center">
            <Ruler size={20} />
          </div>
          <div>
            <h3 className="font-bold">Measurement Tool</h3>
            <p className="text-xs text-slate-300">Quick area calculator</p>
          </div>
        </div>
        <button 
          onClick={() => navigate('/contacts')}
          className="w-full bg-white text-primary py-3 rounded-xl text-xs font-bold active:scale-95 transition-transform"
        >
          Open Calculator
        </button>
      </div>
    </div>
  );
}
