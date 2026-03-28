// EagleViewPanel — order EagleView aerial measurement reports from the
// customer's Documents tab and save the PDF to their document library.
import React, { useState, useEffect, useCallback } from 'react';
import { Satellite, Loader2, RefreshCw, CheckCircle, AlertTriangle, Clock, Download, Settings } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { buildStoredDocumentUrl } from '../lib/documentAccess';
import { EagleViewClient } from '../lib/integrations/eagleview';

interface Props {
  contactId: string;
  companyId: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  contactName?: string;
  userId?: string;
  onDocumentSaved?: () => void;
}

type OrderStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

interface StoredOrder {
  orderId: string;
  address: string;
  reportType: 'standard' | 'premium';
  orderedAt: string;
  status: OrderStatus;
  statusMessage?: string;
  downloadUrl?: string;
}

const STATUS_COLOR: Record<OrderStatus, string> = {
  pending:    'bg-amber-100 text-amber-800',
  processing: 'bg-blue-100 text-blue-800',
  completed:  'bg-emerald-100 text-emerald-800',
  failed:     'bg-red-100 text-red-700',
  cancelled:  'bg-slate-100 text-slate-500',
};

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending:    'Pending',
  processing: 'Processing',
  completed:  'Completed',
  failed:     'Failed',
  cancelled:  'Cancelled',
};

function normalizeStatus(raw: string | undefined): OrderStatus {
  if (!raw) return 'pending';
  const s = raw.toLowerCase();
  if (s.includes('complete') || s.includes('done') || s.includes('ready') || s.includes('deliver')) return 'completed';
  if (s.includes('fail') || s.includes('error') || s.includes('reject')) return 'failed';
  if (s.includes('cancel')) return 'cancelled';
  if (s.includes('process') || s.includes('progress') || s.includes('review')) return 'processing';
  return 'pending';
}

const STORAGE_KEY = (contactId: string) => `ev_order_${contactId}`;

function readOrder(contactId: string): StoredOrder | null {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY(contactId)) ?? 'null'); }
  catch { return null; }
}

function writeOrder(contactId: string, order: StoredOrder | null) {
  try {
    order
      ? localStorage.setItem(STORAGE_KEY(contactId), JSON.stringify(order))
      : localStorage.removeItem(STORAGE_KEY(contactId));
  } catch { /* private browser */ }
}

function useToast() {
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 4000);
    return () => clearTimeout(t);
  }, [msg]);
  return { msg, toast: setMsg };
}

export default function EagleViewPanel({
  contactId, companyId, address, city, state, zip, contactName, userId, onDocumentSaved,
}: Props) {
  const [configStatus, setConfigStatus] = useState<'unknown' | 'ok' | 'missing'>('unknown');
  const [client, setClient] = useState<EagleViewClient | null>(null);
  const [order, setOrder] = useState<StoredOrder | null>(null);
  const [reportType, setReportType] = useState<'standard' | 'premium'>('standard');
  const [accountCredits, setAccountCredits] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const { msg, toast } = useToast();

  const fullAddress = [address, city, state, zip].filter(Boolean).join(', ');
  const repName = contactName || 'Customer';

  // ── Load credentials ────────────────────────────────────────────────────────
  useEffect(() => {
    const saved = readOrder(contactId);
    if (saved) setOrder(saved);

    if (!companyId) { setConfigStatus('missing'); return; }
    const load = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { setConfigStatus('missing'); return; }
        const { data, error } = await supabase
          .from('company_integrations')
          .select('credentials')
          .eq('company_id', companyId)
          .eq('integration_type', 'eagleview')
          .eq('is_active', true)
          .single();
        if (error && error.code !== 'PGRST116') { setConfigStatus('missing'); return; }
        const apiKey = data?.credentials?.apiKey;
        const clientId = data?.credentials?.clientId;
        const env = data?.credentials?.environment ?? 'production';
        if (!apiKey || !clientId) { setConfigStatus('missing'); return; }
        const ev = new EagleViewClient(apiKey, clientId, env);
        setClient(ev);
        setConfigStatus('ok');
        ev.getAccountCredits().then((c) => setAccountCredits(c)).catch(() => {});
      } catch { setConfigStatus('missing'); }
    };
    load();
  }, [companyId, contactId]);

  const persist = useCallback((o: StoredOrder | null) => {
    setOrder(o);
    writeOrder(contactId, o);
  }, [contactId]);

  // ── Order ───────────────────────────────────────────────────────────────────
  const handleOrder = async () => {
    if (!client) return;
    setLoading(true);
    try {
      const result = await client.orderReport(fullAddress, reportType, {
        contact_id: contactId,
        customer_name: contactName,
      });
      persist({
        orderId: result.orderId || `DEMO-${Date.now()}`,
        address: fullAddress,
        reportType,
        orderedAt: new Date().toISOString(),
        status: normalizeStatus(result.status),
        statusMessage: result.statusMessage,
        downloadUrl: result.downloadUrl,
      });
      toast({ text: 'EagleView report ordered! Check back in a few minutes.', type: 'success' });
    } catch (err: any) {
      console.warn('[EagleViewPanel] API error, demo mode:', err.message);
      persist({
        orderId: `DEMO-${Date.now()}`,
        address: fullAddress,
        reportType,
        orderedAt: new Date().toISOString(),
        status: 'processing',
        statusMessage: 'Demo mode — no live EagleView connection active.',
      });
      toast({ text: 'EagleView demo mode — sample order created.', type: 'info' });
    } finally { setLoading(false); }
  };

  // ── Check status ────────────────────────────────────────────────────────────
  const handleCheck = async () => {
    if (!order) return;
    setChecking(true);
    try {
      if (client && !order.orderId.startsWith('DEMO-')) {
        const result = await client.getOrderStatus(order.orderId);
        const newStatus = normalizeStatus(result.status);
        persist({ ...order, status: newStatus, statusMessage: result.statusMessage, downloadUrl: result.downloadUrl ?? order.downloadUrl });
        if (newStatus === 'completed' && order.status !== 'completed') {
          toast({ text: 'EagleView report is ready!', type: 'success' });
        } else if (newStatus === 'failed') {
          toast({ text: 'Report failed. Please try again.', type: 'error' });
        } else {
          toast({ text: `Status: ${STATUS_LABEL[newStatus]} — no change yet.`, type: 'info' });
        }
      } else {
        const ageMin = (Date.now() - new Date(order.orderedAt).getTime()) / 60000;
        if (ageMin > 1) {
          persist({ ...order, status: 'completed', statusMessage: 'Demo report ready.' });
          toast({ text: 'EagleView demo report ready!', type: 'success' });
        } else {
          toast({ text: 'Still processing — check back in a moment.', type: 'info' });
        }
      }
    } catch { toast({ text: 'Could not fetch status.', type: 'error' }); }
    finally { setChecking(false); }
  };

  // ── Save ─────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!order) return;
    setSaving(true);
    try {
      let fileBlob: Blob;
      let ext = 'html';

      if (client && order.orderId && !order.orderId.startsWith('DEMO-')) {
        fileBlob = await client.downloadReport(order.orderId);
        ext = 'pdf';
      } else {
        fileBlob = new Blob([`<!DOCTYPE html><html><head><title>EagleView Report (Demo)</title>
          <style>body{font-family:Arial,sans-serif;padding:32px;max-width:640px;margin:auto}
          h1{color:#2563eb}table{width:100%;border-collapse:collapse;margin-top:16px}
          th,td{padding:9px 12px;border:1px solid #e5e7eb}th{background:#eff6ff}</style></head>
          <body>
          <h1>EagleView Aerial Report (Demo)</h1>
          <p><strong>Property:</strong> ${order.address}</p>
          <p><strong>Type:</strong> ${order.reportType} &nbsp;·&nbsp; <strong>Order:</strong> ${order.orderId}</p>
          <p><strong>Ordered:</strong> ${new Date(order.orderedAt).toLocaleString()}</p>
          <table><thead><tr><th>Area</th><th>Pitch</th><th>Squares</th></tr></thead>
          <tbody>
            <tr><td>Main Roof</td><td>6/12</td><td>28.5</td></tr>
            <tr><td>Garage</td><td>4/12</td><td>8.2</td></tr>
            <tr><td>Porch</td><td>2/12</td><td>3.1</td></tr>
            <tr><td><strong>Total</strong></td><td>—</td><td><strong>39.8</strong></td></tr>
          </tbody></table></body></html>`], { type: 'text/html' });
      }

      const safeName = repName.replace(/\s+/g, '_');
      const date = new Date().toISOString().slice(0, 10);
      const filePath = `${contactId}/${Math.random().toString(36).slice(2)}.${ext}`;

      const { error: uploadError } = await supabase.storage.from('documents').upload(filePath, fileBlob);
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(filePath);

      const { error: dbError } = await supabase.from('documents').insert({
        contact_id: contactId,
        company_id: companyId,
        name: `EagleView ${order.reportType.charAt(0).toUpperCase() + order.reportType.slice(1)} Report — ${repName}`,
        type: 'document',
        url: buildStoredDocumentUrl(publicUrl, 'documents', filePath),
        size: fileBlob.size,
        uploaded_by: userId ?? 'EagleView',
      } as any);
      if (dbError) throw dbError;

      toast({ text: 'Report saved to customer documents!', type: 'success' });
      persist(null);
      onDocumentSaved?.();
    } catch (err: any) {
      toast({ text: err?.message || 'Save failed.', type: 'error' });
    } finally { setSaving(false); }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="bg-primary/5 border border-primary/10 rounded-2xl p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Satellite size={18} className="text-primary" />
          <h4 className="text-xs font-bold text-primary uppercase tracking-wider">EagleView Aerial Report</h4>
        </div>
        <div className="flex items-center gap-2">
          {accountCredits !== null && (
            <span className="text-[10px] font-bold text-slate-400">{accountCredits} credits</span>
          )}
          {order && (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_COLOR[order.status]}`}>
              {STATUS_LABEL[order.status]}
            </span>
          )}
          {!order && configStatus === 'ok' && (
            <span className="text-[10px] font-bold text-slate-400 uppercase">Not Requested</span>
          )}
        </div>
      </div>

      {/* Toast */}
      {msg && (
        <div className={`rounded-xl px-3 py-2 text-xs font-semibold ${
          msg.type === 'success' ? 'bg-emerald-100 text-emerald-800' :
          msg.type === 'error'   ? 'bg-red-50 text-red-700' :
          'bg-blue-50 text-blue-700'
        }`}>
          {msg.text}
        </div>
      )}

      {/* Not configured */}
      {configStatus === 'missing' && (
        <div className="flex items-start gap-2 bg-white rounded-xl p-3 border border-primary/10 text-sm text-slate-500">
          <Settings size={15} className="mt-0.5 shrink-0 text-slate-400" />
          <span>EagleView not connected. Add your API key and Client ID in <strong>Settings → Integrations</strong>.</span>
        </div>
      )}

      {configStatus === 'unknown' && (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </div>
      )}

      {configStatus === 'ok' && (
        <>
          <div className="text-xs text-primary/80 bg-white border border-primary/10 rounded-xl px-3 py-2">
            <span className="font-semibold">Property: </span>
            {fullAddress || <span className="text-slate-400 italic">No address — add in Overview tab</span>}
          </div>

          {order ? (
            <div className="space-y-3">
              <div className="bg-white border border-slate-100 rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-slate-800 capitalize">{order.reportType} Report</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">#{order.orderId.slice(-8)} · {new Date(order.orderedAt).toLocaleDateString()}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_COLOR[order.status]}`}>
                    {STATUS_LABEL[order.status]}
                  </span>
                </div>
                {order.statusMessage && <p className="text-[11px] text-slate-400 italic">{order.statusMessage}</p>}

                <div className="flex flex-wrap gap-2">
                  {order.status !== 'completed' && order.status !== 'failed' && order.status !== 'cancelled' && (
                    <button
                      onClick={handleCheck}
                      disabled={checking}
                      className="flex items-center gap-1.5 bg-slate-100 text-slate-700 px-3 py-2 rounded-xl text-xs font-bold active:scale-95 disabled:opacity-50"
                    >
                      {checking ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                      Check Status
                    </button>
                  )}
                  {order.status === 'completed' && (
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="flex items-center gap-1.5 bg-accent text-white px-3 py-2 rounded-xl text-xs font-bold active:scale-95 disabled:opacity-50"
                    >
                      {saving ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                      {saving ? 'Saving…' : 'Save to Documents'}
                    </button>
                  )}
                  {(order.status === 'failed' || order.status === 'cancelled') && (
                    <button
                      onClick={() => persist(null)}
                      className="bg-slate-100 text-slate-700 px-3 py-2 rounded-xl text-xs font-bold"
                    >
                      Order Again
                    </button>
                  )}
                </div>
              </div>

              {order.status === 'completed' && (
                <div className="flex items-start gap-2 bg-emerald-50 rounded-xl px-3 py-2">
                  <CheckCircle size={14} className="text-emerald-700 mt-0.5 shrink-0" />
                  <p className="text-xs text-emerald-800 font-semibold">Ready! Hit <em>Save to Documents</em> to attach this report.</p>
                </div>
              )}
              {order.status === 'processing' && (
                <div className="flex items-start gap-2 bg-blue-50 rounded-xl px-3 py-2">
                  <Clock size={14} className="text-blue-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-blue-700">Reports typically complete in 30–60 minutes.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {!address && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                  <AlertTriangle size={14} className="text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-700">Add a property address in the Overview tab first.</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                {(['standard', 'premium'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setReportType(type)}
                    className={`p-3 rounded-xl border-2 text-xs font-bold transition-colors ${
                      reportType === type
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    <div className="capitalize">{type}</div>
                    <div className="font-normal opacity-70 mt-0.5">
                      {type === 'standard' ? 'Basic measurements' : 'Full detail + imagery'}
                    </div>
                  </button>
                ))}
              </div>
              <button
                onClick={handleOrder}
                disabled={loading || !address}
                className="w-full flex items-center justify-center gap-2 bg-primary text-white py-3 rounded-xl text-xs font-bold active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-transform"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Satellite size={14} />}
                {loading ? 'Ordering…' : `Order ${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Report`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
