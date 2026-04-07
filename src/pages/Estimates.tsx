import React, { useState, useEffect } from 'react';
import { Calculator, Plus, Search, ChevronLeft, Filter, FileText, DollarSign } from 'lucide-react';
import PullToRefresh from '../components/PullToRefresh';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { motion } from 'framer-motion';
import { formatCurrency } from '../lib/utils';

export default function Estimates() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { profile } = useAuth();
  const [estimates, setEstimates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const contactId = searchParams.get('contactId');

  useEffect(() => {
    if (profile?.company_id) {
      fetchEstimates();
    }
  }, [profile?.company_id, contactId]);

  const fetchEstimates = async () => {
    try {
      let query = supabase
        .from('estimates')
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

      if (contactId) {
        query = query.eq('contact_id', contactId);
      }

      const { data, error } = await query;
      
      if (error) throw error;
      setEstimates(data || []);
    } catch (err) {
      console.error('Error fetching estimates:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredEstimates = estimates.filter(est => 
    est.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    est.contacts?.first_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    est.contacts?.last_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'approved': return 'bg-emerald-500';
      case 'sent': return 'bg-blue-500';
      case 'draft': return 'bg-slate-400';
      case 'rejected': return 'bg-red-500';
      default: return 'bg-slate-400';
    }
  };

  return (
    <PullToRefresh onRefresh={fetchEstimates}>
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 p-6 sticky top-0 z-10">
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-slate-400 active:scale-90 transition-transform">
            <ChevronLeft size={24} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-primary">{contactId ? 'Customer Estimates' : 'Estimates'}</h1>
            {contactId && <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Filtered to this contact</p>}
          </div>
        </div>

        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text"
              placeholder="Search estimates..."
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
        ) : filteredEstimates.length > 0 ? (
          filteredEstimates.map((est, i) => (
            <motion.div
              key={est.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="card p-4 space-y-4"
            >
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center text-primary">
                    <Calculator size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-primary text-sm">{est.title}</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{est.contacts?.first_name} {est.contacts?.last_name}</p>
                  </div>
                </div>
                <span className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase text-white ${getStatusColor(est.status)}`}>
                  {est.status}
                </span>
              </div>

              <div className="flex justify-between items-end">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-slate-500 text-xs">
                    <FileText size={14} />
                    <span>Created {new Date(est.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Amount</p>
                  <p className="text-lg font-bold text-primary">{formatCurrency(est.total)}</p>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-50 flex justify-end">
                <button 
                  onClick={() => navigate(`/estimates/${est.id}`)}
                  className="text-accent text-xs font-bold"
                >
                  View Estimate
                </button>
              </div>
            </motion.div>
          ))
        ) : (
          <div className="text-center py-12 space-y-4">
            <div className="mx-auto h-16 w-16 bg-white rounded-2xl flex items-center justify-center text-slate-200 shadow-sm">
              <Calculator size={32} />
            </div>
            <p className="text-slate-400 text-sm">No estimates found</p>
          </div>
        )}
      </div>

      {/* FAB */}
      <button
        onClick={() => contactId ? navigate(`/contacts/${contactId}/estimate`) : null}
        className="fixed bottom-24 right-6 h-14 w-14 bg-accent text-white rounded-2xl shadow-xl shadow-accent/30 flex items-center justify-center active:scale-90 transition-transform z-10"
      >
        <Plus size={28} />
      </button>
    </div>
    </PullToRefresh>
  );
}
