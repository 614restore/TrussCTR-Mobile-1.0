import React, { useEffect, useState, useMemo } from 'react';
import {
  BarChart3, TrendingUp, DollarSign, Users,
  ChevronLeft, Calendar, ClipboardList, CheckCircle,
  PhoneCall, Eye, XCircle, Hammer,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { formatCurrency } from '../lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

type DateRange = 'today' | 'week' | 'month' | 'year' | 'all';

interface Contact {
  id: string;
  status: string;
  assigned_to: string | null;
  lead_source: string | null;
  project_value: number | null;
  created_at: string;
}

interface Estimate {
  id: string;
  status: string;
  total: number;
  assigned_to: string | null;
  created_at: string;
}

interface ProfileRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getRangeStart(range: DateRange): string | null {
  const now = new Date();
  switch (range) {
    case 'today': {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return d.toISOString();
    }
    case 'week': {
      const d = new Date(now);
      d.setDate(d.getDate() - 6);
      d.setHours(0, 0, 0, 0);
      return d.toISOString();
    }
    case 'month': {
      const d = new Date(now);
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      return d.toISOString();
    }
    case 'year': {
      const d = new Date(now.getFullYear(), 0, 1);
      return d.toISOString();
    }
    case 'all':
    default:
      return null;
  }
}

function isInsurance(leadSource: string | null): boolean {
  if (!leadSource) return false;
  const s = leadSource.toLowerCase();
  return s.includes('insurance') || s.includes('ins ') || s.includes('adjuster') || s.includes('claim') || s.includes('storm');
}

const RANGE_LABELS: Record<DateRange, string> = {
  today: 'Today',
  week: 'This Week',
  month: 'This Month',
  year: 'This Year',
  all: 'All Time',
};

const RANGES: DateRange[] = ['today', 'week', 'month', 'year', 'all'];

// ─── Component ────────────────────────────────────────────────────────────────

export default function Reports() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [range, setRange] = useState<DateRange>('month');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Data fetch ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!profile?.company_id) return;

    const fetchAll = async () => {
      setLoading(true);
      const since = getRangeStart(range);

      let cQuery = (supabase as any)
        .from('contacts')
        .select('id, status, assigned_to, lead_source, project_value, created_at')
        .eq('company_id', profile.company_id);
      if (since) cQuery = cQuery.gte('created_at', since);

      let eQuery = (supabase as any)
        .from('estimates')
        .select('id, status, total, assigned_to, created_at')
        .eq('company_id', profile.company_id);
      if (since) eQuery = eQuery.gte('created_at', since);

      const [{ data: cData }, { data: eData }, { data: pData }] = await Promise.all([
        cQuery,
        eQuery,
        (supabase as any)
          .from('profiles')
          .select('id, first_name, last_name')
          .eq('company_id', profile.company_id),
      ]);

      setContacts((cData as Contact[]) || []);
      setEstimates((eData as Estimate[]) || []);
      setProfiles((pData as ProfileRow[]) || []);
      setLoading(false);
    };

    fetchAll();
  }, [profile?.company_id, range]);

  // ── Derived metrics ─────────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const isLead = (s: string) => ['new_lead', 'lead', 'contacted'].includes(s);
    const isAppt = (s: string) => s === 'appointment_set';
    const isInspected = (s: string) => ['inspection_scheduled', 'inspection_complete', 'inspected'].includes(s);
    const isActive = (s: string) => ['in_progress', 'scheduled', 'approved', 'signed_won', 'estimate_sent', 'retail'].includes(s);
    const isClosed = (s: string) => ['completed', 'paid'].includes(s);
    const isLost = (s: string) => s === 'lost';

    const leads = contacts.filter(c => isLead(c.status));
    const appts = contacts.filter(c => isAppt(c.status));
    const inspections = contacts.filter(c => isInspected(c.status));
    const activeBuilds = contacts.filter(c => isActive(c.status));
    const closed = contacts.filter(c => isClosed(c.status));
    const lost = contacts.filter(c => isLost(c.status));

    const closedRevenue = closed.reduce((sum, c) => sum + (c.project_value || 0), 0);
    const pipelineValue = activeBuilds.reduce((sum, c) => sum + (c.project_value || 0), 0);
    const avgJobSize = closed.length > 0 ? closedRevenue / closed.length : 0;

    const selfGenContacts = contacts.filter(c => !isInsurance(c.lead_source) && isClosed(c.status));
    const insContacts = contacts.filter(c => isInsurance(c.lead_source) && isClosed(c.status));
    const selfGenRevenue = selfGenContacts.reduce((sum, c) => sum + (c.project_value || 0), 0);
    const insRevenue = insContacts.reduce((sum, c) => sum + (c.project_value || 0), 0);

    const estCreated = estimates.length;
    const estSent = estimates.filter(e => e.status === 'sent').length;
    const estSigned = estimates.filter(e => e.status === 'approved').length;
    const estRejected = estimates.filter(e => e.status === 'rejected').length;
    const denominator = estSent + estSigned + estRejected;
    const closeRate = denominator > 0 ? Math.round((estSigned / denominator) * 100) : 0;

    return {
      leads: leads.length,
      appts: appts.length,
      inspections: inspections.length,
      activeBuilds: activeBuilds.length,
      closed: closed.length,
      lost: lost.length,
      closedRevenue,
      pipelineValue,
      avgJobSize,
      selfGenRevenue,
      insRevenue,
      estCreated,
      estSent,
      estSigned,
      closeRate,
    };
  }, [contacts, estimates]);

  // ── Top performers ──────────────────────────────────────────────────────────
  const topPerformers = useMemo(() => {
    return profiles
      .map(p => {
        const myContacts = contacts.filter(c => c.assigned_to === p.id);
        const myClosed = myContacts.filter(c => ['completed', 'paid'].includes(c.status));
        const myEstimates = estimates.filter(e => e.assigned_to === p.id);
        const mySigned = myEstimates.filter(e => e.status === 'approved');
        const myDenom = myEstimates.filter(e => ['sent', 'approved', 'rejected'].includes(e.status)).length;
        const myCloseRate = myDenom > 0 ? Math.round((mySigned.length / myDenom) * 100) : 0;
        const myRevenue = myClosed.reduce((sum, c) => sum + (c.project_value || 0), 0);
        return {
          id: p.id,
          name: [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown',
          leads: myContacts.length,
          appts: myContacts.filter(c => c.status === 'appointment_set').length,
          inspections: myContacts.filter(c => ['inspection_scheduled', 'inspection_complete', 'inspected'].includes(c.status)).length,
          estimates: myEstimates.length,
          signed: mySigned.length,
          closeRate: myCloseRate,
          revenue: myRevenue,
        };
      })
      .filter(p => p.leads > 0 || p.estimates > 0)
      .sort((a, b) => b.revenue - a.revenue);
  }, [profiles, contacts, estimates]);

  // ── Pipeline stage bar chart data ───────────────────────────────────────────
  const pipelineStages = useMemo(() => {
    const stages = [
      { label: 'Leads', count: contacts.filter(c => ['new_lead', 'lead', 'contacted'].includes(c.status)).length, color: 'bg-blue-500' },
      { label: 'Appt', count: contacts.filter(c => c.status === 'appointment_set').length, color: 'bg-indigo-500' },
      { label: 'Inspected', count: contacts.filter(c => ['inspection_scheduled', 'inspection_complete', 'inspected'].includes(c.status)).length, color: 'bg-purple-500' },
      { label: 'Est Sent', count: contacts.filter(c => c.status === 'estimate_sent').length, color: 'bg-amber-500' },
      { label: 'Signed', count: contacts.filter(c => c.status === 'signed_won').length, color: 'bg-orange-500' },
      { label: 'Building', count: contacts.filter(c => ['in_progress', 'scheduled', 'approved'].includes(c.status)).length, color: 'bg-emerald-500' },
      { label: 'Closed', count: contacts.filter(c => ['completed', 'paid'].includes(c.status)).length, color: 'bg-green-600' },
      { label: 'Lost', count: contacts.filter(c => c.status === 'lost').length, color: 'bg-red-400' },
    ];
    const max = Math.max(...stages.map(s => s.count), 1);
    return stages.map(s => ({ ...s, pct: Math.round((s.count / max) * 100) }));
  }, [contacts]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 p-6 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-slate-400 active:scale-90 transition-transform">
              <ChevronLeft size={24} />
            </button>
            <h1 className="text-xl font-bold text-primary">Reports & Analytics</h1>
          </div>
          <BarChart3 size={20} className="text-accent" />
        </div>
        {/* Date range pills */}
        <div className="flex gap-2 mt-4 overflow-x-auto pb-1">
          {RANGES.map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${
                range === r ? 'bg-accent text-white' : 'bg-slate-100 text-slate-500'
              }`}
            >
              {RANGE_LABELS[r]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin h-8 w-8 border-2 border-accent border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="p-6 space-y-6">

          {/* ── Pipeline Activity ── */}
          <section>
            <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-3">Pipeline Activity</h2>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'New Leads', value: metrics.leads, icon: <Users size={14} />, color: 'text-blue-500' },
                { label: 'Appointments', value: metrics.appts, icon: <Calendar size={14} />, color: 'text-indigo-500' },
                { label: 'Inspections', value: metrics.inspections, icon: <Eye size={14} />, color: 'text-purple-500' },
                { label: 'Active Builds', value: metrics.activeBuilds, icon: <Hammer size={14} />, color: 'text-emerald-500' },
                { label: 'Closed', value: metrics.closed, icon: <CheckCircle size={14} />, color: 'text-green-600' },
                { label: 'Lost', value: metrics.lost, icon: <XCircle size={14} />, color: 'text-red-400' },
              ].map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="card p-3 space-y-1"
                >
                  <div className={`${stat.color}`}>{stat.icon}</div>
                  <p className="text-xl font-bold text-primary">{stat.value}</p>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider leading-tight">{stat.label}</p>
                </motion.div>
              ))}
            </div>
          </section>

          {/* ── Revenue ── */}
          <section>
            <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-3">Revenue</h2>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Closed Revenue', value: formatCurrency(metrics.closedRevenue), icon: <DollarSign size={14} />, color: 'text-emerald-500' },
                { label: 'Pipeline Value', value: formatCurrency(metrics.pipelineValue), icon: <TrendingUp size={14} />, color: 'text-blue-500' },
                { label: 'Avg Job Size', value: formatCurrency(metrics.avgJobSize), icon: <BarChart3 size={14} />, color: 'text-indigo-500' },
                { label: 'Self-Gen Revenue', value: formatCurrency(metrics.selfGenRevenue), icon: <PhoneCall size={14} />, color: 'text-amber-500' },
              ].map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="card p-4 space-y-1"
                >
                  <div className={`${stat.color}`}>{stat.icon}</div>
                  <p className="text-lg font-bold text-primary">{stat.value}</p>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{stat.label}</p>
                </motion.div>
              ))}
            </div>
            {/* Self-gen vs Insurance bar */}
            {(metrics.selfGenRevenue + metrics.insRevenue) > 0 && (
              <div className="card p-4 mt-3 space-y-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Self-Gen vs Insurance Split</p>
                <div className="h-3 rounded-full overflow-hidden bg-slate-100 flex">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.round((metrics.selfGenRevenue / (metrics.selfGenRevenue + metrics.insRevenue)) * 100)}%` }}
                    transition={{ duration: 0.6 }}
                    className="bg-amber-400 rounded-full"
                  />
                </div>
                <div className="flex justify-between text-[9px] font-bold">
                  <span className="text-amber-500">Self-Gen {formatCurrency(metrics.selfGenRevenue)}</span>
                  <span className="text-blue-500">Insurance {formatCurrency(metrics.insRevenue)}</span>
                </div>
              </div>
            )}
          </section>

          {/* ── Estimates ── */}
          <section>
            <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-3">Estimates</h2>
            <div className="card divide-y divide-slate-50">
              {[
                { label: 'Created', value: metrics.estCreated },
                { label: 'Sent', value: metrics.estSent },
                { label: 'Signed / Approved', value: metrics.estSigned },
                { label: 'Close Rate', value: `${metrics.closeRate}%` },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2">
                    <ClipboardList size={14} className="text-slate-400" />
                    <p className="text-sm font-medium text-primary">{row.label}</p>
                  </div>
                  <p className="text-sm font-bold text-accent">{row.value}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ── Pipeline Breakdown ── */}
          <section>
            <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-3">Pipeline Breakdown</h2>
            <div className="card p-4 space-y-3">
              {pipelineStages.map((stage, i) => (
                <div key={stage.label} className="space-y-1">
                  <div className="flex justify-between text-[10px] font-bold">
                    <span className="text-slate-500">{stage.label}</span>
                    <span className="text-primary">{stage.count}</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${stage.pct}%` }}
                      transition={{ delay: i * 0.05, duration: 0.5 }}
                      className={`h-full rounded-full ${stage.color}`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ── Top Performers ── */}
          {topPerformers.length > 0 && (
            <section>
              <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-3">Top Performers</h2>
              <div className="space-y-3">
                {topPerformers.map((rep, i) => (
                  <motion.div
                    key={rep.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.07 }}
                    className="card p-4 space-y-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-accent/10 flex items-center justify-center text-[11px] font-bold text-accent">
                        {rep.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-primary truncate">{rep.name}</p>
                        <p className="text-[10px] text-slate-500">{rep.leads} contacts · {rep.closeRate}% close rate</p>
                      </div>
                      <p className="text-sm font-bold text-emerald-600">{formatCurrency(rep.revenue)}</p>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { label: 'Appts', value: rep.appts },
                        { label: 'Insp', value: rep.inspections },
                        { label: 'Estimates', value: rep.estimates },
                        { label: 'Signed', value: rep.signed },
                      ].map(stat => (
                        <div key={stat.label} className="bg-slate-50 rounded-lg p-2 text-center">
                          <p className="text-sm font-bold text-primary">{stat.value}</p>
                          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wide">{stat.label}</p>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                ))}
              </div>
            </section>
          )}

          {contacts.length === 0 && estimates.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <BarChart3 size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm font-bold">No data for this period</p>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
