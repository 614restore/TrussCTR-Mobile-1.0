import React, { useEffect, useState } from 'react';
import {
  BarChart3, TrendingUp, DollarSign, Users,
  ChevronLeft, ArrowUpRight, ArrowDownRight,
  Calendar, X, ChevronDown
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { formatCurrency } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

type DateRange = {
  label: string;
  days: number;
};

const DATE_RANGES: DateRange[] = [
  { label: 'Last 7 Days', days: 7 },
  { label: 'Last 30 Days', days: 30 },
  { label: 'Last 90 Days', days: 90 },
  { label: 'This Year', days: 365 },
];

function getStartDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export default function Reports() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedRange, setSelectedRange] = useState<DateRange>(DATE_RANGES[1]);
  const [loading, setLoading] = useState(true);

  // Real metrics
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [newLeads, setNewLeads] = useState(0);
  const [closeRate, setCloseRate] = useState(0);
  const [avgJobSize, setAvgJobSize] = useState(0);
  const [topPerformers, setTopPerformers] = useState<Array<{ name: string; revenue: number; leads: number }>>([]);
  const [revenueByDay, setRevenueByDay] = useState<number[]>([0, 0, 0, 0, 0, 0, 0]);

  useEffect(() => {
    if (!profile?.company_id) return;
    loadMetrics();
  }, [profile?.company_id, selectedRange]);

  const loadMetrics = async () => {
    if (!profile?.company_id) return;
    setLoading(true);
    const since = getStartDate(selectedRange.days);

    try {
      // Total revenue from signed estimates
      const { data: estimates } = await supabase
        .from('estimates')
        .select('total, created_at, status')
        .eq('company_id', profile.company_id)
        .gte('created_at', since);

      const allEstimates = estimates || [];
      const revenue = allEstimates.reduce((sum, e) => sum + (Number(e.total) || 0), 0);
      setTotalRevenue(revenue);
      setAvgJobSize(allEstimates.length > 0 ? revenue / allEstimates.length : 0);

      // Revenue by day (last 7 days regardless of range for the chart)
      const sevenDaysAgo = getStartDate(7);
      const { data: recentEstimates } = await supabase
        .from('estimates')
        .select('total, created_at')
        .eq('company_id', profile.company_id)
        .gte('created_at', sevenDaysAgo);

      const byDay = [0, 0, 0, 0, 0, 0, 0];
      (recentEstimates || []).forEach((e) => {
        const dayIndex = new Date(e.created_at).getDay();
        byDay[dayIndex] = (byDay[dayIndex] || 0) + (Number(e.total) || 0);
      });
      const maxVal = Math.max(...byDay, 1);
      setRevenueByDay(byDay.map((v) => Math.round((v / maxVal) * 100)));

      // New leads
      const { count: leadsCount } = await supabase
        .from('contacts')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', profile.company_id)
        .gte('created_at', since);
      setNewLeads(leadsCount || 0);

      // Close rate: contacts that have at least one estimate
      const { count: totalContacts } = await supabase
        .from('contacts')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', profile.company_id)
        .gte('created_at', since);

      const { data: uniqueEstimateContacts } = await supabase
        .from('estimates')
        .select('contact_id')
        .eq('company_id', profile.company_id)
        .gte('created_at', since);

      const uniqueContactIds = new Set((uniqueEstimateContacts || []).map((e) => e.contact_id));
      const rate = totalContacts && totalContacts > 0
        ? Math.round((uniqueContactIds.size / totalContacts) * 100)
        : 0;
      setCloseRate(rate);

      // Top performers by # of contacts created
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .eq('company_id', profile.company_id);

      if (profiles && profiles.length > 0) {
        const performerData = await Promise.all(
          profiles.slice(0, 5).map(async (p) => {
            const { count: leads } = await supabase
              .from('contacts')
              .select('id', { count: 'exact', head: true })
              .eq('company_id', profile.company_id)
              .eq('assigned_to', p.id)
              .gte('created_at', since);

            const { data: estData } = await supabase
              .from('estimates')
              .select('total')
              .eq('company_id', profile.company_id)
              .gte('created_at', since);

            const rev = (estData || []).reduce((s, e) => s + (Number(e.total) || 0), 0);
            return {
              name: `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Team Member',
              leads: leads || 0,
              revenue: rev,
            };
          })
        );
        setTopPerformers(performerData.filter((p) => p.leads > 0 || p.revenue > 0).slice(0, 3));
      }
    } catch (err) {
      console.error('Error loading metrics:', err);
    } finally {
      setLoading(false);
    }
  };

  const stats = [
    {
      label: 'Total Revenue',
      value: formatCurrency(totalRevenue),
      icon: DollarSign,
      color: 'text-emerald-500',
      bg: 'bg-emerald-50',
    },
    {
      label: 'New Leads',
      value: String(newLeads),
      icon: Users,
      color: 'text-blue-500',
      bg: 'bg-blue-50',
    },
    {
      label: 'Close Rate',
      value: `${closeRate}%`,
      icon: TrendingUp,
      color: 'text-amber-500',
      bg: 'bg-amber-50',
    },
    {
      label: 'Avg. Job Size',
      value: formatCurrency(avgJobSize),
      icon: BarChart3,
      color: 'text-indigo-500',
      bg: 'bg-indigo-50',
    },
  ];

  const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 p-6 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-slate-400 active:scale-90 transition-transform">
              <ChevronLeft size={24} />
            </button>
            <div>
              <h1 className="text-xl font-bold text-primary">Reports & Analytics</h1>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{selectedRange.label}</p>
            </div>
          </div>
          <button
            onClick={() => setShowDatePicker((v) => !v)}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-colors text-sm font-bold ${
              showDatePicker ? 'bg-accent text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            <Calendar size={16} />
            <ChevronDown size={14} className={`transition-transform ${showDatePicker ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Date Range Picker */}
        <AnimatePresence>
          {showDatePicker && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-4 grid grid-cols-2 gap-2">
                {DATE_RANGES.map((range) => (
                  <button
                    key={range.days}
                    onClick={() => {
                      setSelectedRange(range);
                      setShowDatePicker(false);
                    }}
                    className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all ${
                      selectedRange.days === range.days
                        ? 'bg-accent text-white shadow'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {range.label}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="p-6 space-y-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4">
          {stats.map((stat, i) => {
            const Icon = stat.icon;
            return (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                className="card p-4 space-y-3"
              >
                <div className={`w-8 h-8 rounded-lg ${stat.bg} flex items-center justify-center`}>
                  <Icon size={16} className={stat.color} />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{stat.label}</p>
                  {loading ? (
                    <div className="h-6 w-20 bg-slate-100 rounded animate-pulse mt-1" />
                  ) : (
                    <p className="text-xl font-bold text-primary">{stat.value}</p>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Revenue Chart */}
        <div className="card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-primary">Revenue by Day (7 Days)</h2>
          </div>

          <div className="h-48 flex items-end gap-2">
            {revenueByDay.map((h, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-2">
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${Math.max(h, 4)}%` }}
                  transition={{ delay: i * 0.05 }}
                  className="w-full bg-accent/20 rounded-t-lg relative group"
                >
                  <div className="absolute inset-x-0 bottom-0 bg-accent rounded-t-lg h-1/3" />
                </motion.div>
                <span className="text-[9px] font-bold text-slate-400">{dayLabels[i]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Performers */}
        <div className="space-y-4">
          <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">Top Performers</h2>
          <div className="card divide-y divide-slate-50">
            {loading ? (
              [1, 2, 3].map((i) => (
                <div key={i} className="p-4 flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-slate-100 animate-pulse" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-28 bg-slate-100 rounded animate-pulse" />
                    <div className="h-2 w-20 bg-slate-100 rounded animate-pulse" />
                  </div>
                </div>
              ))
            ) : topPerformers.length > 0 ? (
              topPerformers.map((person, i) => (
                <div key={i} className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-primary">
                      {person.name.split(' ').map((n: string) => n[0]).join('').toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-primary">{person.name}</p>
                      <p className="text-[10px] text-slate-500">{person.leads} lead{person.leads !== 1 ? 's' : ''} this period</p>
                    </div>
                  </div>
                  <p className="text-sm font-bold text-accent">{formatCurrency(person.revenue)}</p>
                </div>
              ))
            ) : (
              <div className="p-8 text-center">
                <p className="text-slate-400 text-sm">No data for this period</p>
                <p className="text-slate-300 text-xs mt-1">Add contacts and estimates to see performance</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
