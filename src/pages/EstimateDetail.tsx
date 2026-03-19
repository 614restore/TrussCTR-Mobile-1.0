import React, { useState, useEffect } from 'react';
import {
  ChevronLeft,
  Calculator,
  Download,
  Send,
  CheckCircle2,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { formatCurrency } from '../lib/utils';
import { generateAndDownloadPdf } from '../lib/pdfService';
import { buildDefaultQuoteMeta, parseEstimateNotes } from '../lib/estimateQuote';

function getEstimateNumber(estimate: any) {
  return estimate?.estimate_number || `EST-${String(estimate?.id || '').slice(0, 8).toUpperCase()}`;
}

export default function EstimateDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [estimate, setEstimate] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const pdfRef = React.useRef<HTMLDivElement | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (id) fetchEstimateDetail();
  }, [id]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
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
            address,
            city,
            state,
            zip
          ),
          companies (
            name,
            phone,
            email,
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
      const { error } = await (supabase.from('estimates') as any).update({ status: 'sent' }).eq('id', id);
      if (error) throw error;

      await (supabase.from('contacts') as any).update({ status: 'estimate_sent' }).eq('id', estimate.contact_id);
      if (profile?.id) {
        await (supabase.from('communications') as any).insert({
          contact_id: estimate.contact_id,
          company_id: estimate.company_id,
          type: 'note',
          content: `Estimate sent from mobile app: ${estimate.title}`,
          user_id: profile.id,
          direction: 'outbound',
        });
      }
      setEstimate({ ...estimate, status: 'sent' });
      showToast('Estimate marked as sent');
    } catch (err) {
      console.error('Error sending estimate:', err);
      showToast('Unable to mark estimate as sent');
    }
  };

  const downloadEstimate = async () => {
    if (!pdfRef.current || !estimate) return;
    try {
      await generateAndDownloadPdf(pdfRef.current, `${estimate.title.replace(/\s+/g, '-').toLowerCase()}.pdf`);
    } catch (err) {
      console.error('Error generating estimate PDF:', err);
      showToast('Unable to generate PDF on this device');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-4 border-accent border-t-transparent" />
      </div>
    );
  }

  if (!estimate) {
    return (
      <div className="min-h-screen bg-slate-50 p-6 flex flex-col items-center justify-center text-center space-y-4">
        <div className="h-16 w-16 bg-white rounded-2xl flex items-center justify-center text-slate-200 shadow-sm">
          <Calculator size={32} />
        </div>
        <p className="text-slate-500 font-bold">Estimate not found</p>
        <button onClick={() => navigate(-1)} className="text-accent font-bold">Go Back</button>
      </div>
    );
  }

  const parsedNotes = parseEstimateNotes(estimate.notes);
  const quoteMeta = parsedNotes.meta || buildDefaultQuoteMeta(Number(estimate.total || 0));
  const customerName = `${estimate.contacts?.first_name || ''} ${estimate.contacts?.last_name || ''}`.trim();
  const propertyAddress = [estimate.contacts?.address, estimate.contacts?.city, estimate.contacts?.state, estimate.contacts?.zip]
    .filter(Boolean)
    .join(', ');
  const companyName = estimate.companies?.name || profile?.companies?.name || 'TrussCTR';
  const companyAddress = estimate.companies?.address || profile?.companies?.address || 'Company address pending';
  const companyPhone = estimate.companies?.phone || profile?.companies?.phone || '';
  const companyEmail = estimate.companies?.email || profile?.companies?.email || '';
  const estimateNumber = getEstimateNumber(estimate);
  const validUntil = quoteMeta.validUntil ? new Date(quoteMeta.validUntil) : null;

  const getStatusColor = (status: string) => {
    switch (String(status).toLowerCase()) {
      case 'approved':
        return 'bg-emerald-500';
      case 'sent':
        return 'bg-blue-500';
      case 'draft':
        return 'bg-slate-400';
      case 'rejected':
        return 'bg-red-500';
      default:
        return 'bg-slate-400';
    }
  };

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-slate-50">
      <div className="mx-auto min-h-screen w-full max-w-md overflow-x-hidden bg-slate-50 pb-28">
      <div className="bg-white border-b border-slate-100 p-6 sticky top-0 z-10">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-slate-400 active:scale-90 transition-transform">
              <ChevronLeft size={24} />
            </button>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-primary truncate">{estimate.title}</h1>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Estimate #{estimateNumber}</p>
            </div>
          </div>
          <span className={`shrink-0 text-[10px] font-bold px-3 py-1 rounded-full uppercase text-white ${getStatusColor(estimate.status)}`}>
            {estimate.status}
          </span>
        </div>
      </div>

      <div className="w-full max-w-full overflow-x-hidden p-6 space-y-6">
        <div className="rounded-3xl bg-slate-900 p-6 text-white shadow-xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-300">{companyName}</p>
              <h2 className="mt-2 text-3xl font-black">{formatCurrency(estimate.total)}</h2>
              <p className="mt-2 text-sm text-slate-300">{quoteMeta.scopeSummary}</p>
            </div>
            <div className="rounded-2xl bg-white/10 px-3 py-2 text-right">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-300">Valid Until</p>
              <p className="mt-1 text-sm font-bold">{validUntil ? validUntil.toLocaleDateString() : 'Open'}</p>
            </div>
          </div>
        </div>

        <div className="card p-5 space-y-4">
          <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Quote Summary</h2>
          <div className="grid grid-cols-1 gap-4">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Customer</p>
              <p className="mt-2 text-sm font-bold text-primary">{customerName || 'Customer'}</p>
              <p className="text-xs text-slate-500">{propertyAddress}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Contractor</p>
              <p className="mt-2 text-sm font-bold text-primary">{companyName}</p>
              <p className="text-xs text-slate-500">{companyAddress}</p>
              <p className="text-xs text-slate-500">{companyPhone} {companyEmail ? `• ${companyEmail}` : ''}</p>
            </div>
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Line Items</h2>
          </div>
          <div className="divide-y divide-slate-50">
            {(estimate.items || []).map((item: any, i: number) => (
              <div key={i} className="flex items-start justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-primary">{item.description}</p>
                  <p className="text-[11px] text-slate-500">
                    {item.quantity} {item.unit} @ {formatCurrency(item.rate ?? item.unit_price ?? 0)}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-bold text-primary">{formatCurrency(item.amount ?? item.total ?? 0)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Subtotal</span>
            <span className="font-bold text-primary">{formatCurrency(estimate.subtotal)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Tax ({estimate.tax_rate}%)</span>
            <span className="font-bold text-primary">{formatCurrency(estimate.tax_amount)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Deposit</span>
            <span className="font-bold text-primary">{formatCurrency(quoteMeta.depositAmount)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Balance Due</span>
            <span className="font-bold text-primary">{formatCurrency(quoteMeta.finalPaymentAmount)}</span>
          </div>
          <div className="pt-3 border-t border-slate-100 flex justify-between items-baseline">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Total</span>
            <span className="text-xl font-bold text-accent">{formatCurrency(estimate.total)}</span>
          </div>
        </div>

        <div className="card p-5 space-y-4">
          <div>
            <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Terms & Conditions</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{quoteMeta.paymentTerms}</p>
          </div>
          <div>
            <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Warranty</h2>
            <p className="mt-2 text-sm text-slate-600">{quoteMeta.warrantyPeriod}</p>
          </div>
          <div>
            <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Customer Notes</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">
              {parsedNotes.plainNotes || quoteMeta.customerMessage}
            </p>
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 mx-auto w-full max-w-md bg-white border-t border-slate-100 p-4 flex gap-3 z-20">
        <button onClick={downloadEstimate} className="p-4 bg-slate-100 text-primary rounded-2xl active:scale-95 transition-transform">
          <Download size={20} />
        </button>
        <button
          onClick={() => navigate(`/estimates/${estimate.id}/sign`)}
          className="bg-slate-100 text-primary py-4 px-4 rounded-2xl text-xs font-bold uppercase tracking-widest active:scale-95 transition-transform flex items-center justify-center gap-2"
        >
          <CheckCircle2 size={18} />
          Sign Quote
        </button>
        <button
          onClick={sendToCustomer}
          className="flex-1 bg-primary text-white py-4 rounded-2xl text-xs font-bold uppercase tracking-widest active:scale-95 transition-transform flex items-center justify-center gap-2"
        >
          <Send size={18} />
          Send to Customer
        </button>
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-24 left-6 right-6 bg-slate-900 text-white p-4 rounded-2xl shadow-2xl z-50 flex items-center gap-3"
          >
            <CheckCircle2 size={16} className="text-accent" />
            <p className="text-xs font-bold">{toast}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="fixed left-[-9999px] top-0 w-[794px]">
        <div
          ref={pdfRef}
          style={{ background: '#fff', color: '#0f172a', width: '794px', padding: '40px', fontFamily: 'Arial, sans-serif' }}
        >
          <div style={{ borderBottom: '3px solid #2563eb', paddingBottom: '18px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', gap: '24px' }}>
            <div>
              <div style={{ fontSize: '26px', fontWeight: 700, color: '#2563eb' }}>{companyName}</div>
              <div style={{ fontSize: '22px', fontWeight: 700, color: '#111827', marginTop: '12px' }}>{estimate.title}</div>
              <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '8px' }}>Estimate #{estimateNumber}</div>
            </div>
            <div style={{ minWidth: '220px', background: '#f8fafc', padding: '14px 16px', borderRadius: '8px', borderLeft: '4px solid #2563eb' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: '#374151' }}>Customer Information</div>
              <div style={{ fontSize: '13px', marginTop: '10px', lineHeight: 1.6 }}>
                <div><strong>{customerName || 'Customer'}</strong></div>
                <div>{propertyAddress}</div>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gap: '16px', marginBottom: '20px' }}>
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '12px 14px', fontSize: '13px' }}>
              {quoteMeta.scopeSummary}
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '24px' }}>
            <thead>
              <tr style={{ background: '#f3f4f6' }}>
                <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: '12px' }}>Description</th>
                <th style={{ textAlign: 'right', padding: '10px 12px', fontSize: '12px' }}>Qty</th>
                <th style={{ textAlign: 'right', padding: '10px 12px', fontSize: '12px' }}>Unit Price</th>
                <th style={{ textAlign: 'right', padding: '10px 12px', fontSize: '12px' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {(estimate.items || []).map((item: any, index: number) => (
                <tr key={index}>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid #f3f4f6' }}>{item.description}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', borderBottom: '1px solid #f3f4f6' }}>{item.quantity} {item.unit}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', borderBottom: '1px solid #f3f4f6' }}>{formatCurrency(item.rate ?? item.unit_price ?? 0)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', borderBottom: '1px solid #f3f4f6' }}>{formatCurrency(item.amount ?? item.total ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginLeft: 'auto', width: '300px', marginBottom: '18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
              <span>Subtotal</span>
              <strong>{formatCurrency(estimate.subtotal)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
              <span>Tax</span>
              <strong>{formatCurrency(estimate.tax_amount)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
              <span>Deposit Required</span>
              <strong>{formatCurrency(quoteMeta.depositAmount)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '10px' }}>
              <span>Balance Due</span>
              <strong>{formatCurrency(quoteMeta.finalPaymentAmount)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid #111827', paddingTop: '10px', fontSize: '16px' }}>
              <span>Total Estimate</span>
              <strong>{formatCurrency(estimate.total)}</strong>
            </div>
          </div>

          <div style={{ background: '#fef3c7', padding: '12px 14px', borderRadius: '8px', borderLeft: '4px solid #f59e0b', margin: '18px 0', fontSize: '12px', lineHeight: 1.7 }}>
            <strong>Terms & Conditions:</strong><br />
            {quoteMeta.paymentTerms}<br />
            Workmanship Warranty: {quoteMeta.warrantyPeriod}<br />
            Valid Until: {validUntil ? validUntil.toLocaleDateString() : 'Open'}
          </div>

          <div style={{ marginTop: '16px', fontSize: '13px', lineHeight: 1.7 }}>
            <strong>Notes:</strong><br />
            {parsedNotes.plainNotes || quoteMeta.customerMessage}
          </div>

          <div style={{ display: 'flex', gap: '40px', marginTop: '36px' }}>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ borderBottom: '2px solid #374151', height: '34px', marginBottom: '6px' }} />
              <div style={{ fontSize: '11px', color: '#6b7280' }}>Customer Signature / Date</div>
            </div>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ borderBottom: '2px solid #374151', height: '34px', marginBottom: '6px' }} />
              <div style={{ fontSize: '11px', color: '#6b7280' }}>Authorized Contractor / Date</div>
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
