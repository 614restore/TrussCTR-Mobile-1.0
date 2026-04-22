import React, { useState, useEffect, useMemo } from 'react';
import { TrendingUp, Users, Briefcase, DollarSign, Plus, Calendar, ChevronRight, CloudLightning, ShieldCheck, AlertTriangle, Wind, CloudRain } from 'lucide-react';
import PullToRefresh from '../components/PullToRefresh';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import NewContactModal from '../components/NewContactModal';
import NoProfileState from '../components/NoProfileState';
import { buildContactPipelineEvents, getUpcomingPipelineEvents } from '../lib/scheduleEvents';
import { getPipelineStageLabel, normalizePipelineStatus, toPipelineBoardStage } from '../lib/pipelineStages';
import { fetchLiveNoaaFeed } from '../lib/noaaStormService';
import type { Database } from '../types/supabase';

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
  { id: 'lead',              label: 'Discovery',      color: 'bg-blue-500'    },
  { id: 'appt_set',          label: 'Inspection',     color: 'bg-indigo-500'  },
  { id: 'contingency',       label: 'Pending Scope',  color: 'bg-amber-500'   },
  { id: 'signed',            label: 'Approval/Sold',  color: 'bg-emerald-500' },
  { id: 'ordering_material', label: 'Pre-Production', color: 'bg-teal-500'    },
  { id: 'in_progress',       label: 'Active Build',   color: 'bg-primary'     },
  { id: 'invoicing',         label: 'Final Billing',  color: 'bg-orange-500'  },
  { id: 'completed',         label: 'Closed/Paid',    color: 'bg-slate-800'   },
];
type ContactRow = Database['public']['Tables']['contacts']['Row'];
type WorkOrderRow = Database['public']['Tables']['work_orders']['Row'];

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
  const [allPipelineEvents, setAllPipelineEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [stormStatus, setStormStatus] = useState<{
    loading: boolean;
    nearbyCount: number;
    hailCount: number;
    windCount: number;
    nearestMiles: number | null;
    nearestLabel: string;
    noLocation: boolean;
  }>({ loading: true, nearbyCount: 0, hailCount: 0, windCount: 0, nearestMiles: null, nearestLabel: '', noLocation: false });

  // ── Storm Intelligence fetch ────────────────────────────────────────────────
  useEffect(() => {
    if (!profile?.company_id) return;
    const co = profile.companies as any;
    fetchLiveNoaaFeed(profile.company_id, {
      city:  co?.city  ?? null,
      state: co?.state ?? null,
      zip:   co?.zip   ?? null,
    })
      .then(({ events }) => {
        const noLocation = events.length > 0 && events[0].distanceMiles === null;
        const savedRadius = parseInt(localStorage.getItem('stormRadiusMiles') ?? '50', 10);
        const radiusFilter = savedRadius === 0 ? Infinity : savedRadius;
        const nearby = events.filter(e => e.distanceMiles !== null && e.distanceMiles <= radiusFilter);
        const nearest = nearby[0] ?? null;
        const nearestLabel = nearest
          ? nearest.type === 'HAIL'
            ? `${nearest.magnitude}" hail`
            : `${Math.round(nearest.magnitude)} mph wind`
          : '';
        setStormStatus({
          loading: false,
          nearbyCount: nearby.length,
          hailCount: nearby.filter(e => e.type === 'HAIL').length,
          windCount: nearby.filter(e => e.type === 'WIND').length,
          nearestMiles: nearest?.distanceMiles ?? null,
          nearestLabel,
          noLocation,
        });
      })
      .catch(() => setStormStatus(s => ({ ...s, loading: false })));
  }, [profile?.company_id]);

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
          .eq('company_id', profile.company_id)
          .neq('status', 'archived'),
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
      const openLeads = (contacts as any[]).filter(c => normalizePipelineStatus(c.status) === 'lead').length;
      const jobsInProgress = (contacts as any[]).filter(c => normalizePipelineStatus(c.status) === 'in_progress').length;
      const revenueMTD = (contacts as any[])
        .filter(c => {
          const normalized = normalizePipelineStatus(c.status);
          return (normalized === 'paid' || toPipelineBoardStage(normalized) === 'completed')
            && new Date(c.updated_at) >= firstDayOfMonth;
        })
        .reduce((sum, c) => sum + (c.project_value || 0), 0);

      setStats({ pipelineValue, openLeads, jobsInProgress, revenueMTD });

      // Real stage counts for pipeline distribution
      const counts: Record<string, number> = {};
      PIPELINE_STAGES.forEach(s => {
        counts[s.id] = (contacts as any[]).filter(c => toPipelineBoardStage(c.status) === s.id).length;
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
          value: c.project_value != null ? formatCurrency(c.project_value) : '—'
        }));
      
      setRecentActivity(activity);

      const workOrderRows = (workOrders || []) as WorkOrderRow[];
      const contactRows = (contacts || []) as ContactRow[];
      const workOrdersByContact = new Map<string, WorkOrderRow[]>();
      for (const order of workOrderRows) {
        const current = workOrdersByContact.get(order.contact_id) || [];
        current.push(order);
        workOrdersByContact.set(order.contact_id, current);
      }

      const allEvents = contactRows
        .flatMap((contact) => buildContactPipelineEvents(contact, workOrdersByContact.get(contact.id) || []))
        .sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime());
      setAllPipelineEvents(allEvents);
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

  // Recomputed fresh on every render so stale state can never show yesterday's events
  const upcomingEvents = useMemo(
    () => getUpcomingPipelineEvents(allPipelineEvents).slice(0, 4),
    [allPipelineEvents]
  );

  const totalContacts = (Object.values(stageCounts) as number[]).reduce((a, b) => a + b, 0);

  // Show spinner while auth is loading OR while user is authenticated but profile
  // hasn't arrived yet (profile loads async after the 1.5s splash timeout).
  // Only show NoProfileState after we're confident the profile fetch is truly done.
  if (loadingAuth || (user && !profile)) return (
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
    <PullToRefresh onRefresh={fetchDashboardData}>
    <div className="p-6 space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-primary">Dashboard</h1>
          <p className="text-slate-500 text-sm">Welcome back, {profile?.first_name || profile?.name || 'Sales Rep'}</p>
        </div>
        <div className="h-10 w-10 rounded-full bg-accent/10 border-2 border-white shadow-sm overflow-hidden flex items-center justify-center">
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="Avatar" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
          ) : (
            <span className="text-accent text-xs font-bold select-none">
              {[profile?.first_name, profile?.last_name]
                .filter(Boolean)
                .map(n => n![0].toUpperCase())
                .join('') || profile?.name?.[0]?.toUpperCase() || 'U'}
            </span>
          )}
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

      {/* Storm Intelligence — always visible */}
      <div className="space-y-3">
        <div className="flex justify-between items-center px-1">
          <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Storm Intelligence</h2>
          <button onClick={() => navigate('/storm-history')} className="text-accent text-xs font-bold">View All</button>
        </div>

        {stormStatus.loading ? (
          <div className="card p-5 h-[72px] animate-pulse bg-slate-100 rounded-2xl" />
        ) : stormStatus.noLocation ? (
          <div className="card p-4 flex items-center gap-4 border-l-4 border-amber-400">
            <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
              <AlertTriangle size={20} className="text-amber-500" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-primary text-sm">Location not set</p>
              <p className="text-xs text-slate-500">Add city & state in Company Profile to see nearby storms</p>
            </div>
            <button
              onClick={() => navigate('/company')}
              className="text-[10px] font-bold text-accent shrink-0 active:opacity-70"
            >
              Set Now
            </button>
          </div>
        ) : stormStatus.nearbyCount === 0 ? (
          <button
            onClick={() => navigate('/storm-history')}
            className="card w-full p-4 flex items-center gap-4 text-left active:bg-slate-50 transition-colors"
          >
            <div className="h-10 w-10 rounded-xl bg-emerald-500 flex items-center justify-center shrink-0">
              <ShieldCheck size={20} className="text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-primary text-sm">All Clear</p>
              <p className="text-xs text-slate-400">No storm reports within {(() => { const r = parseInt(localStorage.getItem('stormRadiusMiles') ?? '50', 10); return r === 0 ? 'any distance' : `${r} miles`; })()} today</p>
            </div>
            <ChevronRight size={16} className="text-slate-300 shrink-0" />
          </button>
        ) : (
          <button
            onClick={() => navigate('/storm-history')}
            className="card w-full p-4 flex items-center gap-4 border-l-4 border-red-500 text-left active:bg-red-50 transition-colors"
          >
            <div className="h-10 w-10 rounded-xl bg-red-500 flex items-center justify-center shrink-0">
              <CloudLightning size={20} className="text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-primary text-sm">
                {stormStatus.nearbyCount} Report{stormStatus.nearbyCount !== 1 ? 's' : ''} Nearby
              </p>
              <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                {stormStatus.hailCount > 0 && (
                  <span className="text-[10px] font-bold text-red-500 flex items-center gap-1">
                    <CloudRain size={10} /> {stormStatus.hailCount} Hail
                  </span>
                )}
                {stormStatus.windCount > 0 && (
                  <span className="text-[10px] font-bold text-blue-500 flex items-center gap-1">
                    <Wind size={10} /> {stormStatus.windCount} Wind
                  </span>
                )}
                {stormStatus.nearestMiles !== null && (
                  <span className="text-[10px] text-slate-400">
                    · Nearest {stormStatus.nearestLabel}{' '}
                    {stormStatus.nearestMiles < 1 ? '<1 mi' : `${stormStatus.nearestMiles} mi`} away
                  </span>
                )}
              </div>
            </div>
            <ChevronRight size={16} className="text-red-300 shrink-0" />
          </button>
        )}
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
                    {new Date(event.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    {' at '}
                    {new Date(event.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
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
    </PullToRefresh>
  );
}
