import React, { useState, useEffect } from 'react';
import { TrendingUp, Users, Briefcase, DollarSign, Plus, Calendar, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import NewContactModal from '../components/NewContactModal';
import NoProfileState from '../components/NoProfileState';
import { buildContactPipelineEvents, getUpcomingPipelineEvents } from '../lib/scheduleEvents';
import { getPipelineStageLabel } from '../lib/pipelineStages';

const STAGE_COLORS: Record<string, string> = {
  lead: 'bg-blue-500',
  contacted: 'bg-sky-500',
  appointment_set: 'bg-indigo-500',
  inspected: 'bg-amber-500',
  estimate_sent: 'bg-orange-500',
  approved: 'bg-emerald-500',
  scheduled: 'bg-teal-500',
  in_progress: 'bg-primary',
  completed: 'bg-slate-800',
};

const PIPELINE_STAGES = [
  { id: 'lead', label: 'Leads', color: 'bg-blue-500' },
  { id: 'inspected', label: 'Inspected', color: 'bg-amber-500' },
  { id: 'approved', label: 'Approved', color: 'bg-emerald-500' },
  { id: 'scheduled', label: 'Scheduled', color: 'bg-teal-500' },
  { id: 'in_progress', label: 'In Progress', color: 'bg-primary' },
  { id: 'completed', label: 'Completed', color: 'bg-slate-800' },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const { profile, loading: loadingAuth } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [stats, setStats] = useState({
    pipelineValue: 0,
    openLeads: 0,
    jobsInProgress: 0,
    revenueMTD: 0
  });
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [stageCounts, setStageCounts] = useState<Record<string, number>>({});
  const [upcomingEvents, setUpcomingEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.company_id) {
      if (!loadingAuth) setLoading(false);
      return;
    }

    fetchDashboardData();

    const channel = supabase
      .channel('dashboard-realtime')
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'contacts',
          filter: `company_id=eq.${profile.company_id}`
        },
        () => {
          fetchDashboardData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.company_id, loadingAuth]);

  const fetchDashboardData = async () => {
    try {
      const [{ data: contacts, error }, { data: workOrders, error: workOrderError }] = await Promise.all([
        supabase
          .from('contacts')
          .select('*')
          .eq('company_id', profile.company_id),
        supabase
          .from('work_orders')
          .select('*')
          .eq('company_id', profile.company_id)
          .order('scheduled_date', { ascending: true }),
      ]);

      if (error) throw error;
      if (workOrderError) throw workOrderError;
      if (!contacts) return;

      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const pipelineValue = (contacts as any[]).reduce((sum, c) => sum + (c.project_value || 0), 0);
      const openLeads = (contacts as any[]).filter(c => c.status === 'lead').length;
      const jobsInProgress = (contacts as any[]).filter(c => c.status === 'in_progress').length;
      const revenueMTD = (contacts as any[])
        .filter(c => (c.status === 'paid' || c.status === 'completed') && new Date(c.updated_at) >= firstDayOfMonth)
        .reduce((sum, c) => sum + (c.project_value || 0), 0);

      setStats({ pipelineValue, openLeads, jobsInProgress, revenueMTD });

      // Real stage counts for pipeline distribution
      const counts: Record<string, number> = {};
      PIPELINE_STAGES.forEach(s => {
        counts[s.id] = (contacts as any[]).filter(c => c.status === s.id).length;
      });
      setStageCounts(counts);

      const activity = (contacts as any[])
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        .slice(0, 4)
        .map(c => ({
          id: c.id,
          name: `${c.first_name} ${c.last_name}`,
          action: `Status: ${c.status.replace('_', ' ')}`,
          time: new Date(c.updated_at).toLocaleDateString(),
          value: formatCurrency(c.project_value)
        }));
      
      setRecentActivity(activity);

      const workOrdersByContact = new Map<string, any[]>();
      for (const order of workOrders || []) {
        const current = workOrdersByContact.get(order.contact_id) || [];
        current.push(order);
        workOrdersByContact.set(order.contact_id, current);
      }

      const nextEvents = (contacts as any[])
        .flatMap((contact) => buildContactPipelineEvents(contact, workOrdersByContact.get(contact.id) || []))
        .filter((event) => new Date(event.date).getTime() >= Date.now())
        .sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime())
        .slice(0, 4);
      setUpcomingEvents(nextEvents);
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  const kpis = [
    { label: 'Pipeline Value', value: formatCurrency(stats.pipelineValue), icon: DollarSign, color: 'bg-emerald-500' },
    { label: 'Open Leads', value: stats.openLeads.toString(), icon: Users, color: 'bg-blue-500' },
    { label: 'Jobs In Progress', value: stats.jobsInProgress.toString(), icon: Briefcase, color: 'bg-amber-500' },
    { label: 'Revenue (MTD)', value: formatCurrency(stats.revenueMTD), icon: TrendingUp, color: 'bg-indigo-500' },
  ];

  const totalContacts = (Object.values(stageCounts) as number[]).reduce((a, b) => a + b, 0);

  if (loadingAuth) return (
    <div className="h-full flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-4 border-accent border-t-transparent"></div>
    </div>
  );

  if (!profile?.company_id) {
    return <NoProfileState />;
  }

  if (loading) return (
    <div className="h-full flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-4 border-accent border-t-transparent"></div>
    </div>
  );

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-primary">Dashboard</h1>
          <p className="text-slate-500 text-sm">Welcome back, {profile?.first_name || profile?.name || 'Sales Rep'}</p>
        </div>
        <div className="h-10 w-10 rounded-full bg-slate-200 border-2 border-white shadow-sm overflow-hidden">
          <img src={profile?.avatar_url || `https://picsum.photos/seed/${profile?.id}/100/100`} alt="Avatar" referrerPolicy="no-referrer" />
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 gap-4">
        {kpis.map((kpi, i) => (
          <motion.div
            key={kpi.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="card p-4 space-y-3"
          >
            <div className={`${kpi.color} h-8 w-8 rounded-lg flex items-center justify-center text-white`}>
              <kpi.icon size={18} />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{kpi.label}</p>
              <p className="text-xl font-bold text-primary">{kpi.value}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="space-y-4">
        <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest ml-1">Quick Actions</h2>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'New Lead', icon: Plus, color: 'bg-accent', onClick: () => setIsModalOpen(true) },
            { label: 'Schedule', icon: Calendar, color: 'bg-primary', onClick: () => navigate('/calendar') },
            { label: 'Pipeline', icon: TrendingUp, color: 'bg-slate-800', onClick: () => navigate('/contacts') },
          ].map((action) => (
            <button 
              key={action.label} 
              onClick={action.onClick}
              className="flex flex-col items-center gap-2 active:scale-95 transition-transform"
            >
              <div className={`${action.color} h-14 w-14 rounded-2xl flex items-center justify-center text-white shadow-lg`}>
                <action.icon size={24} />
              </div>
              <span className="text-[11px] font-bold text-slate-600">{action.label}</span>
            </button>
          ))}
        </div>
      </div>

      <NewContactModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSuccess={fetchDashboardData} 
      />

      {/* Recent Activity */}
      <div className="space-y-4">
        <div className="flex justify-between items-center px-1">
          <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Recent Activity</h2>
          <button 
            onClick={() => navigate('/contacts')}
            className="text-accent text-xs font-bold"
          >
            View All
          </button>
        </div>
        <div className="space-y-3">
          {recentActivity.length === 0 ? (
            <div className="card p-6 text-center text-slate-400 text-sm">No recent activity yet</div>
          ) : recentActivity.map((activity) => (
            <div 
              key={activity.id} 
              onClick={() => navigate(`/contacts/${activity.id}`)}
              className="card p-4 flex items-center justify-between group active:bg-slate-50 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center text-primary font-bold text-sm">
                  {activity.name.split(' ').map((n: string) => n[0]).join('')}
                </div>
                <div>
                  <p className="font-bold text-primary text-sm">{activity.name}</p>
                  <p className="text-xs text-slate-500">{activity.action}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-bold text-accent text-sm">{activity.value}</p>
                <p className="text-[10px] text-slate-400">{activity.time}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex justify-between items-center px-1">
          <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Upcoming</h2>
          <button
            onClick={() => navigate('/calendar')}
            className="text-accent text-xs font-bold"
          >
            Open Calendar
          </button>
        </div>
        <div className="space-y-3">
          {upcomingEvents.length === 0 ? (
            <div className="card p-6 text-center text-slate-400 text-sm">No upcoming scheduled events</div>
          ) : upcomingEvents.map((event) => (
            <button
              key={event.id}
              onClick={() => navigate(`/contacts/${event.contactId}`)}
              className="card w-full p-4 text-left active:bg-slate-50 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-primary">{event.title}</p>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    {new Date(event.date).toLocaleString()}
                  </p>
                </div>
                <ChevronRight size={16} className="text-slate-300" />
              </div>
              <p className="mt-2 text-sm font-bold text-slate-700">{event.contactName}</p>
              <p className="mt-1 text-xs text-slate-500">
                {event.location || 'Location pending'}{event.crew ? ` • Crew: ${event.crew}` : ''}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Pipeline Distribution - real data */}
      <div className="card p-6 space-y-6">
        <h2 className="text-sm font-bold text-primary">Pipeline Distribution</h2>
        {totalContacts > 0 ? (
          <>
            <div className="flex h-3 rounded-full overflow-hidden bg-slate-100">
              {PIPELINE_STAGES.map(stage => {
                const pct = totalContacts > 0 ? Math.round((stageCounts[stage.id] || 0) / totalContacts * 100) : 0;
                return pct > 0 ? <div key={stage.id} className={stage.color} style={{ width: `${pct}%` }} /> : null;
              })}
            </div>
            <div className="grid grid-cols-2 gap-y-3 gap-x-6">
              {PIPELINE_STAGES.map(stage => (
                <div key={stage.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${stage.color}`} />
                    <span className="text-xs text-slate-600 font-medium">{stage.label}</span>
                  </div>
                  <span className="text-xs font-bold text-primary">{stageCounts[stage.id] || 0}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-400 text-center">No pipeline data yet</p>
        )}
      </div>
    </div>
  );
}
