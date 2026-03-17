import React, { useState, useEffect } from 'react';
import { Package, Plus, Search, ChevronLeft, Filter, Truck, ShoppingCart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { formatCurrency } from '../lib/utils';

export default function MaterialOrders() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
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
      fetchMaterialOrders();
    }
  }, [profile?.company_id]);

  const fetchMaterialOrders = async () => {
    try {
      // For now, we'll fetch work orders that have material costs or descriptions
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
        .not('materials', 'is', null)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setOrders(data || []);
    } catch (err) {
      console.error('Error fetching material orders:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredOrders = orders.filter(o => 
    o.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    o.contacts?.address?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 p-6 sticky top-0 z-10">
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-slate-400 active:scale-90 transition-transform">
            <ChevronLeft size={24} />
          </button>
          <h1 className="text-xl font-bold text-primary">Material Orders</h1>
        </div>

        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text"
              placeholder="Search orders..."
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
          filteredOrders.map((order, i) => (
            <motion.div
              key={order.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="card p-4 space-y-4"
            >
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center text-primary">
                    <Package size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-primary text-sm">{order.title}</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Order #{order.id.slice(0, 6)}</p>
                  </div>
                </div>
                <span className="text-[10px] font-bold px-2 py-1 rounded-full uppercase bg-blue-500 text-white">
                  Ordered
                </span>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-slate-500 text-xs">
                  <Truck size={14} />
                  <span>Delivery to: {order.contacts?.address}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-500 text-xs">
                  <ShoppingCart size={14} />
                  <span>Est. Cost: {formatCurrency(order.material_cost || 0)}</span>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-50 flex justify-between items-center">
                <p className="text-[10px] text-slate-400 font-medium">Vendor: <span className="text-slate-600">ABC Supply Co.</span></p>
                <button 
                  onClick={() => showToast('Tracking feature coming soon')}
                  className="text-accent text-xs font-bold"
                >
                  Track Order
                </button>
              </div>
            </motion.div>
          ))
        ) : (
          <div className="text-center py-12 space-y-4">
            <div className="mx-auto h-16 w-16 bg-white rounded-2xl flex items-center justify-center text-slate-200 shadow-sm">
              <Package size={32} />
            </div>
            <p className="text-slate-400 text-sm">No material orders found</p>
          </div>
        )}
      </div>

      {/* FAB */}
      <button 
        onClick={() => showToast('New Material Order feature coming soon')}
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
