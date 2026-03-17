import React from 'react';
import { ChevronLeft, Bell, MessageSquare, Calendar, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Notifications() {
  const navigate = useNavigate();

  const notifications = [
    { id: 1, title: 'New Lead Assigned', message: 'James Okafor has been assigned to you.', time: '2h ago', icon: Bell, color: 'bg-blue-500' },
    { id: 2, title: 'Job Scheduled', message: 'Main Roof Install scheduled for Mar 18.', time: '4h ago', icon: Calendar, color: 'bg-amber-500' },
    { id: 3, title: 'New Message', message: 'Team Alpha: "Materials have arrived at site."', time: '1d ago', icon: MessageSquare, color: 'bg-emerald-500' },
    { id: 4, title: 'System Update', message: 'TrussCTR v1.0.4 is now live.', time: '2d ago', icon: AlertCircle, color: 'bg-slate-800' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 p-6 sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-slate-400 active:scale-90 transition-transform">
            <ChevronLeft size={24} />
          </button>
          <h1 className="text-xl font-bold text-primary">Notifications</h1>
        </div>
      </div>

      <div className="p-6 space-y-4">
        {notifications.map((n) => (
          <div key={n.id} className="card p-4 flex items-start gap-4 active:bg-slate-50 transition-colors">
            <div className={`${n.color} h-10 w-10 rounded-xl flex items-center justify-center text-white shrink-0`}>
              <n.icon size={20} />
            </div>
            <div className="flex-1 space-y-1">
              <div className="flex justify-between items-start">
                <p className="text-sm font-bold text-primary">{n.title}</p>
                <span className="text-[10px] text-slate-400">{n.time}</span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">{n.message}</p>
            </div>
          </div>
        ))}

        <div className="text-center py-12">
          <button className="text-accent text-xs font-bold uppercase tracking-widest">Mark all as read</button>
        </div>
      </div>
    </div>
  );
}
