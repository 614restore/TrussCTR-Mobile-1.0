import React, { useState, useEffect } from 'react';
import { ClipboardList, Plus, Search, ChevronLeft, Filter, Truck, Calendar } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';

export default function WorkOrders() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = (message: string) => setToast(message);

  useEffect(() => {
    if (profile?.company_id) {
      fetchWorkOrders();
    }
  }, [profile?.company_id]);

  const fetchWorkOrders = async () => {
    try {
      const { data, error } = await supabase
        .from('work_orders')
        .select(`
          *,
          contacts (
            first_name,
            last_name,
            address
          )
        `)
        .eq('company_id', profile.company_id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setWorkOrders(data || []);
    } catch (err) {
      console.error('Error fetching work orders:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredOrders = workOrders.filter(wo => 
    wo.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    wo.contacts?.address?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed': return 'bg-emerald-500';
      case 'in_progress': return 'bg-blue-500';
      case 'scheduled': return 'bg-amber-500';
      default: return 'bg-slate-400';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 p-6 sticky top-0 z-10">
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-slate-400 active:scale-90 transition-transform">
            <ChevronLeft size={24} />
          </button>
          <h1 className="text-xl font-bold text-primary">Work Orders</h1>
        </div>

        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text"
              placeholder="Search work orders..."
              className="w-full bg-slate-100 border-none rounded-2xl py-3 pl-11 pr-4 text-sm focus:ring-2 focus:ring-accent/20"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button className="bg-slate-100 p-3 rounded-2xl text-slate-600">
            <Filter size={20} />
          </button>
        </div>
      </div>

      <div className="p-6 space-y-4">
        {loading ? (
          [1, 2, 3].map(i => (
            <div key={i} className="h-32 bg-white rounded-2xl animate-pulse border border-slate-100" />
          ))
        ) : filteredOrders.length > 0 ? (
          filteredOrders.map((wo, i) => (
            <motion.div
              key={wo.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="card p-4 space-y-4"
            >
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center text-primary">
                    <Truck size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-primary text-sm">{wo.title}</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{wo.id.slice(0, 8)}</p>
                  </div>
                </div>
                <span className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase text-white ${getStatusColor(wo.status)}`}>
                  {wo.status.replace('_', ' ')}
                </span>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-slate-500 text-xs">
                  <ClipboardList size={14} />
                  <span className="truncate">{wo.contacts?.first_name} {wo.contacts?.last_name}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-500 text-xs">
                  <Calendar size={14} />
                  <span>{wo.scheduled_date ? new Date(wo.scheduled_date).toLocaleDateString() : 'Not scheduled'}</span>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-50 flex justify-between items-center">
                <p className="text-[10px] text-slate-400 font-medium">Assigned to: <span className="text-slate-600">{wo.assigned_to || 'Unassigned'}</span></p>
                <button 
                  onClick={() => navigate(`/work-orders/${wo.id}`)}
                  className="text-accent text-xs font-bold"
                >
                  View Details
                </button>
              </div>
            </motion.div>
          ))
        ) : (
          <div className="text-center py-12 space-y-4">
            <div className="mx-auto h-16 w-16 bg-white rounded-2xl flex items-center justify-center text-slate-200 shadow-sm">
              <ClipboardList size={32} />
            </div>
            <p className="text-slate-400 text-sm">No work orders found</p>
          </div>
        )}
      </div>

      {/* FAB */}
      <button 
        onClick={() => showToast('New Work Order feature coming soon')}
        className="fixed bottom-24 right-6 h-14 w-14 bg-accent text-white rounded-2xl shadow-xl shadow-accent/30 flex items-center justify-center active:scale-90 transition-transform z-10"
      >
        <Plus size={28} />
      </button>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-24 left-6 right-6 bg-slate-900 text-white p-4 rounded-2xl shadow-2xl z-50 flex items-center gap-3"
          >
            <div className="h-2 w-2 rounded-full bg-accent animate-pulse" />
            <p className="text-xs font-bold">{toast}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
