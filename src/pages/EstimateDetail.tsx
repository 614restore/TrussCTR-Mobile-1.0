import React, { useState, useEffect } from 'react';
import { 
  ChevronLeft, Calendar, User, 
  Calculator, FileText, DollarSign,
  Phone, Mail, MessageSquare, Download,
  Send, CheckCircle2
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { formatCurrency } from '../lib/utils';

export default function EstimateDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [estimate, setEstimate] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      fetchEstimateDetail();
    }
  }, [id]);

  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = (message: string) => setToast(message);

  const fetchEstimateDetail = async () => {
    try {
      const { data, error } = await supabase
        .from('estimates')
        .select(`
          *,
          contacts (
            first_name,
            last_name,
            email,
            phone1,
            address
          )
        `)
        .eq('id', id)
        .single();
      
      if (error) throw error;
      setEstimate(data);
    } catch (err) {
      console.error('Error fetching estimate detail:', err);
    } finally {
      setLoading(false);
    }
  };

  const sendToCustomer = async () => {
    try {
      const { error } = await (supabase
        .from('estimates') as any)
        .update({ status: 'sent' })
        .eq('id', id);
      
      if (error) throw error;
      setEstimate({ ...estimate, status: 'sent' });
    } catch (err) {
      console.error('Error sending estimate:', err);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-4 border-accent border-t-transparent"></div>
    </div>
  );

  if (!estimate) return (
    <div className="min-h-screen bg-slate-50 p-6 flex flex-col items-center justify-center text-center space-y-4">
      <div className="h-16 w-16 bg-white rounded-2xl flex items-center justify-center text-slate-200 shadow-sm">
        <Calculator size={32} />
      </div>
      <p className="text-slate-500 font-bold">Estimate not found</p>
      <button onClick={() => navigate(-1)} className="text-accent font-bold">Go Back</button>
    </div>
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
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 p-6 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-slate-400 active:scale-90 transition-transform">
              <ChevronLeft size={24} />
            </button>
            <div>
              <h1 className="text-lg font-bold text-primary truncate max-w-[200px]">{estimate.title}</h1>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">EST #{estimate.id.slice(0, 8)}</p>
            </div>
          </div>
          <span className={`text-[10px] font-bold px-3 py-1 rounded-full uppercase text-white ${getStatusColor(estimate.status)}`}>
            {estimate.status}
          </span>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Customer Card */}
        <div className="card p-5 space-y-4">
          <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Customer</h2>
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center text-primary font-bold">
              {estimate.contacts?.first_name?.[0]}{estimate.contacts?.last_name?.[0]}
            </div>
            <div>
              <p className="font-bold text-primary">{estimate.contacts?.first_name} {estimate.contacts?.last_name}</p>
              <p className="text-xs text-slate-500">{estimate.contacts?.address}</p>
            </div>
          </div>
        </div>

        {/* Line Items */}
        <div className="card p-5 space-y-4">
          <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Line Items</h2>
          {estimate.items && Array.isArray(estimate.items) ? (
            <div className="space-y-4">
              {estimate.items.map((item: any, i: number) => (
                <div key={i} className="flex justify-between items-start py-2 border-b border-slate-50 last:border-0">
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-primary">{item.description}</p>
                    <p className="text-[10px] text-slate-500">{item.quantity} {item.unit} @ {formatCurrency(item.rate)}</p>
                  </div>
                  <p className="text-sm font-bold text-primary">{formatCurrency(item.amount)}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 italic">No items listed</p>
          )}
        </div>

        {/* Totals */}
        <div className="card p-5 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Subtotal</span>
            <span className="font-bold text-primary">{formatCurrency(estimate.subtotal)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Tax ({estimate.tax_rate}%)</span>
            <span className="font-bold text-primary">{formatCurrency(estimate.tax_amount)}</span>
          </div>
          <div className="pt-3 border-t border-slate-100 flex justify-between items-baseline">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Total</span>
            <span className="text-xl font-bold text-accent">{formatCurrency(estimate.total)}</span>
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-100 p-4 flex gap-3 z-20">
        <button 
          onClick={() => showToast('Download feature coming soon')}
          className="p-4 bg-slate-100 text-primary rounded-2xl active:scale-95 transition-transform"
        >
          <Download size={20} />
        </button>
        <button 
          onClick={sendToCustomer}
          className="flex-1 bg-primary text-white py-4 rounded-2xl text-xs font-bold uppercase tracking-widest active:scale-95 transition-transform flex items-center justify-center gap-2"
        >
          <Send size={18} />
          Send to Customer
        </button>
      </div>

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
