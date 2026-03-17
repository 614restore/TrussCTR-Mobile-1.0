import React from 'react';
import { 
  BarChart3, TrendingUp, DollarSign, Users, 
  ChevronLeft, ArrowUpRight, ArrowDownRight,
  Calendar
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { formatCurrency } from '../lib/utils';

export default function Reports() {
  const navigate = useNavigate();

  const stats = [
    { label: 'Total Revenue', value: '$124,500', change: '+12.5%', trend: 'up', color: 'text-emerald-500' },
    { label: 'New Leads', value: '48', change: '+5.2%', trend: 'up', color: 'text-blue-500' },
    { label: 'Close Rate', value: '24%', change: '-2.1%', trend: 'down', color: 'text-amber-500' },
    { label: 'Avg. Job Size', value: '$8,400', change: '+8.7%', trend: 'up', color: 'text-indigo-500' },
  ];

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
          <button className="p-2 bg-slate-100 rounded-xl text-slate-600">
            <Calendar size={20} />
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="card p-4 space-y-2"
            >
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{stat.label}</p>
              <div className="flex items-baseline justify-between">
                <p className="text-xl font-bold text-primary">{stat.value}</p>
                <div className={`flex items-center text-[10px] font-bold ${stat.trend === 'up' ? 'text-emerald-500' : 'text-red-500'}`}>
                  {stat.trend === 'up' ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                  {stat.change}
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Chart Placeholder */}
        <div className="card p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-primary">Revenue Overview</h2>
            <select className="text-xs bg-slate-50 border-none rounded-lg font-bold text-slate-500">
              <option>Last 7 Days</option>
              <option>Last 30 Days</option>
              <option>This Year</option>
            </select>
          </div>
          
          <div className="h-48 flex items-end gap-2">
            {[40, 70, 45, 90, 65, 80, 55].map((h, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-2">
                <motion.div 
                  initial={{ height: 0 }}
                  animate={{ height: `${h}%` }}
                  className="w-full bg-accent/20 rounded-t-lg relative group"
                >
                  <div className="absolute inset-x-0 bottom-0 bg-accent rounded-t-lg h-1/3 group-hover:h-full transition-all" />
                </motion.div>
                <span className="text-[9px] font-bold text-slate-400">M T W T F S S"[i]</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Performers */}
        <div className="space-y-4">
          <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">Top Performers</h2>
          <div className="card divide-y divide-slate-50">
            {[
              { name: 'John Smith', sales: '$42,000', leads: 12 },
              { name: 'Sarah Wilson', sales: '$38,500', leads: 15 },
              { name: 'Mike Johnson', sales: '$31,200', leads: 9 },
            ].map((person, i) => (
              <div key={i} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-primary">
                    {person.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-primary">{person.name}</p>
                    <p className="text-[10px] text-slate-500">{person.leads} leads this week</p>
                  </div>
                </div>
                <p className="text-sm font-bold text-accent">{person.sales}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
