// RoofrPanel — order Roofr aerial measurement reports from the customer's
// Documents tab, display measurements inline, and save to the customer's files.
import React, { useState, useEffect, useCallback } from 'react';
import { Ruler, Loader2, RefreshCw, CheckCircle, AlertTriangle, Clock, Download, ExternalLink, Settings, DollarSign } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { buildStoredDocumentUrl } from '../lib/documentAccess';
import { RoofrClient, RoofrReport } from '../lib/integrations/roofr';

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

type OrderStatus = 'pending' | 'processing' | 'completed' | 'failed';

interface StoredOrder {
  reportId: string;
  address: string;
  reportType: 'standard' | 'premium';
  orderedAt: string;
  status: OrderStatus;
  statusMessage?: string;
  downloadUrl?: string;
  measurements?: RoofrReport['measurements'];
}

const STATUS_COLOR: Record<OrderStatus, string> = {
  pending:    'bg-amber-100 text-amber-800',
  processing: 'bg-blue-100 text-blue-800',
  completed:  'bg-emerald-100 text-emerald-800',
  failed:     'bg-red-100 text-red-700',
};

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending:    'Pending',
  processing: 'Processing',
  completed:  'Completed',
  failed:     'Failed',
};

function normalizeStatus(raw: string | undefined): OrderStatus {
  if (!raw) return 'pending';
  const s = raw.toLowerCase();
  if (s === 'completed' || s === 'complete' || s === 'done' || s === 'ready') return 'completed';
  if (s === 'failed' || s === 'error' || s === 'cancelled' || s === 'canceled') return 'failed';
  return 'processing';
}

const STORAGE_KEY = (contactId: string) => `roofr_order_${contactId}`;

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

// Simple inline toast
function useToast() {
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 4000);
    return () => clearTimeout(t);
  }, [msg]);
  return { msg, toast: setMsg };
}

export default function RoofrPanel({
  contactId, companyId, address, city, state, zip, contactName, userId, onDocumentSaved,
}: Props) {
  const [configStatus, setConfigStatus] = useState<'unknown' | 'ok' | 'missing'>('unknown');
  const [client, setClient] = useState<RoofrClient | null>(null);
  const [order, setOrder] = useState<StoredOrder | null>(null);
  const [reportType, setReportType] = useState<'standard' | 'premium'>('standard');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tierRates, setTierRates] = useState<{ good: string; better: string; best: string }>({ good: '', better: '', best: '' });
  const [activeTier, setActiveTier] = useState<'good' | 'better' | 'best'>('good');
  const [dupWarning, setDupWarning] = useState<string | null>(null);
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
          .eq('integration_type', 'roofr')
          .eq('is_active', true)
          .single();
        if (error && error.code !== 'PGRST116') { setConfigStatus('missing'); return; }
        const credentials = data != null ? (data as any).credentials : null;
        const apiKey = credentials?.apiKey;
        if (!apiKey) { setConfigStatus('missing'); return; }
        setClient(new RoofrClient(apiKey));
        setConfigStatus('ok');
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
      const report = await client.orderReport({ address, city, state, zip, contactId, reportType });
      persist({
        reportId: report.id,
        address: fullAddress,
        reportType,
        orderedAt: report.orderedAt,
        status: normalizeStatus(report.status),
        downloadUrl: report.downloadUrl,
        measurements: report.measurements,
      });
      toast({ text: 'Roofr report ordered! Check back soon for results.', type: 'success' });
    } catch (err: any) {
      console.warn('[RoofrPanel] API error, demo mode:', err.message);
      persist({
        reportId: `DEMO-${Date.now()}`,
        address: fullAddress,
        reportType,
        orderedAt: new Date().toISOString(),
        status: 'processing',
        statusMessage: 'Demo mode — no live Roofr connection active.',
      });
      toast({ text: 'Roofr demo mode — sample order created.', type: 'info' });
    } finally { setLoading(false); }
  };

  // ── Check status ────────────────────────────────────────────────────────────
  const handleCheck = async () => {
    if (!order) return;
    setChecking(true);
    try {
      if (client && !order.reportId.startsWith('DEMO-')) {
        const report = await client.getReport(order.reportId);
        const newStatus = normalizeStatus(report.status);
        persist({
          ...order,
          status: newStatus,
          downloadUrl: report.downloadUrl ?? order.downloadUrl,
          measurements: report.measurements ?? order.measurements,
        });
        if (newStatus === 'completed' && order.status !== 'completed') {
          toast({ text: 'Roofr report is ready!', type: 'success' });
        } else if (newStatus === 'failed') {
          toast({ text: 'Report failed. Please try again.', type: 'error' });
        } else {
          toast({ text: `Status: ${STATUS_LABEL[newStatus]} — no change yet.`, type: 'info' });
        }
      } else {
        // Demo: auto-complete after 1 min
        const ageMin = (Date.now() - new Date(order.orderedAt).getTime()) / 60000;
        if (ageMin > 1) {
          persist({
            ...order,
            status: 'completed',
            statusMessage: 'Demo report ready.',
            measurements: {
              totalSquares: 32.4, totalSqFt: 3240,
              ridgeLength: 48, hipLength: 36, valleyLength: 24,
              eaveLength: 140, rakeLength: 52, flashingLength: 18,
              predominantPitch: '6/12', facetCount: 8,
            },
          });
          toast({ text: 'Roofr demo report ready!', type: 'success' });
        } else {
          toast({ text: 'Still processing — check back in a moment.', type: 'info' });
        }
      }
    } catch { toast({ text: 'Could not fetch status. Check your connection.', type: 'error' }); }
    finally { setChecking(false); }
  };

  // ── Save to documents ───────────────────────────────────────────────────────
  const handleSave = async (force = false) => {
    if (!order) return;

    // Build the display name we intend to use
    const intendedName = `Roofr ${order.reportType.charAt(0).toUpperCase() + order.reportType.slice(1)} Report — ${repName}`;

    // Duplicate check: query existing docs for this contact and look for same name
    if (!force) {
      const { data: existing } = await supabase
        .from('documents')
        .select('name, created_at')
        .eq('contact_id', contactId)
        .eq('name', intendedName)
        .limit(1);
      if (existing && existing.length > 0) {
        setDupWarning(intendedName);
        toast({ text: `A document named "${intendedName}" already exists. Click Save Again to overwrite.`, type: 'info' });
        return;
      }
    }

    setDupWarning(null);
    setSaving(true);
    try {
      let fileBlob: Blob;
      let ext = 'html';

      // Build pricing summary rows for the saved document
      const sq = order.measurements?.totalSquares ?? 0;
      const pricingHtml = (() => {
        const rates = {
          good:   parseFloat(tierRates.good)   || 0,
          better: parseFloat(tierRates.better) || 0,
          best:   parseFloat(tierRates.best)   || 0,
        };
        const hasAny = rates.good > 0 || rates.better > 0 || rates.best > 0;
        if (!hasAny || sq === 0) return '';
        const fmt = (n: number) => n > 0 ? `$${(n * sq).toLocaleString(undefined, { maximumFractionDigits: 0 })} ($${n}/sq)` : '—';
        return `<h2 style="color:#7c3aed;margin-top:24px">Per Square Pricing</h2>
          <table><thead><tr><th>Tier</th><th>$/Square</th><th>Total (${sq} sq)</th></tr></thead><tbody>
          <tr><td>Good</td><td>${rates.good > 0 ? '$'+rates.good : '—'}</td><td>${rates.good > 0 ? fmt(rates.good).split(' ')[0] : '—'}</td></tr>
          <tr><td>Better</td><td>${rates.better > 0 ? '$'+rates.better : '—'}</td><td>${rates.better > 0 ? fmt(rates.better).split(' ')[0] : '—'}</td></tr>
          <tr><td>Best</td><td>${rates.best > 0 ? '$'+rates.best : '—'}</td><td>${rates.best > 0 ? fmt(rates.best).split(' ')[0] : '—'}</td></tr>
          </tbody></table>`;
      })();

      if (order.downloadUrl && !order.reportId.startsWith('DEMO-')) {
        const res = await fetch(order.downloadUrl);
        if (!res.ok) throw new Error('Could not download report PDF');
        fileBlob = await res.blob();
        ext = 'pdf';
      } else {
        const m = order.measurements;
        const rows = m ? `
          <tr><td>Total Squares</td><td>${m.totalSquares} sq</td></tr>
          <tr><td>Total Area</td><td>${m.totalSqFt.toLocaleString()} sq ft</td></tr>
          <tr><td>Pitch</td><td>${m.predominantPitch}</td></tr>
          <tr><td>Facets</td><td>${m.facetCount}</td></tr>
          <tr><td>Ridge</td><td>${m.ridgeLength} LF</td></tr>
          <tr><td>Hip</td><td>${m.hipLength} LF</td></tr>
          <tr><td>Valley</td><td>${m.valleyLength} LF</td></tr>
          <tr><td>Eave / Perimeter</td><td>${m.eaveLength} LF</td></tr>
          <tr><td>Rake</td><td>${m.rakeLength} LF</td></tr>
          <tr><td>Flashing</td><td>${m.flashingLength} LF</td></tr>
        ` : '<tr><td colspan="2">Measurements pending</td></tr>';
        fileBlob = new Blob([`<!DOCTYPE html><html><head><title>Roofr Report</title>
          <style>body{font-family:Arial,sans-serif;padding:32px;max-width:640px;margin:auto}
          h1{color:#16a34a}table{width:100%;border-collapse:collapse;margin-top:16px}
          th,td{padding:9px 12px;border:1px solid #e5e7eb;text-align:left}
          th{background:#f0fdf4;font-weight:600}</style></head><body>
          <h1>Roofr Measurement Report${order.reportId.startsWith('DEMO-') ? ' (Demo)' : ''}</h1>
          <p><strong>Property:</strong> ${order.address}</p>
          <p><strong>Type:</strong> ${order.reportType} &nbsp;·&nbsp; <strong>Order:</strong> ${order.reportId}</p>
          <p><strong>Ordered:</strong> ${new Date(order.orderedAt).toLocaleString()}</p>
          <table><thead><tr><th>Measurement</th><th>Value</th></tr></thead>
          <tbody>${rows}</tbody></table>
          ${pricingHtml}
          </body></html>`], { type: 'text/html' });
      }

      const safeName = repName.replace(/\s+/g, '_');
      const date = new Date().toISOString().slice(0, 10);
      const fileName = `Roofr_${order.reportType}_${safeName}_${date}.${ext}`;
      const filePath = `${contactId}/${Math.random().toString(36).slice(2)}.${ext}`;

      const { error: uploadError } = await supabase.storage.from('documents').upload(filePath, fileBlob);
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(filePath);

      // Map Roofr report type → document category
      const roofrCategory = ((): string => {
        const t = (order.reportType ?? '').toLowerCase();
        if (t.includes('wall')) return 'walls';
        if (t.includes('premium') || t.includes('enhanced')) return 'premium';
        return 'roof'; // standard / default
      })();

      const { data: inserted, error: dbError } = await (supabase.from('documents') as any).insert({
        contact_id: contactId,
        company_id: companyId,
        name: `Roofr ${order.reportType.charAt(0).toUpperCase() + order.reportType.slice(1)} Report — ${repName}`,
        type: 'measurement',
        url: buildStoredDocumentUrl(publicUrl, 'documents', filePath),
        size: fileBlob.size,
        uploaded_by: userId ?? 'Roofr',
      }).select('id').single();
      if (dbError) throw dbError;
      // Set category after insert so saving works even if migration hasn't run yet
      if (inserted?.id) {
        (supabase.from('documents') as any)
          .update({ category: roofrCategory })
          .eq('id', inserted.id)
          .then(() => {});
      }

      toast({ text: 'Report saved to customer documents!', type: 'success' });
      persist(null);
      onDocumentSaved?.();
    } catch (err: any) {
      toast({ text: err?.message || 'Save failed.', type: 'error' });
    } finally { setSaving(false); }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Ruler size={18} className="text-emerald-600" />
          <h4 className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Roofr Measurements</h4>
        </div>
        {order && (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_COLOR[order.status]}`}>
            {STATUS_LABEL[order.status]}
          </span>
        )}
        {!order && configStatus === 'ok' && (
          <span className="text-[10px] font-bold text-slate-400 uppercase">Not Requested</span>
        )}
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
        <div className="flex items-start gap-2 bg-white rounded-xl p-3 border border-emerald-100 text-sm text-slate-500">
          <Settings size={15} className="mt-0.5 shrink-0 text-slate-400" />
          <span>Roofr not connected. Add your API key in <strong>Settings → Integrations</strong>.</span>
        </div>
      )}

      {configStatus === 'unknown' && (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </div>
      )}

      {configStatus === 'ok' && (
        <>
          {/* Property address */}
          <div className="text-xs text-emerald-700 bg-white border border-emerald-100 rounded-xl px-3 py-2">
            <span className="font-semibold">Property: </span>
            {fullAddress || <span className="text-slate-400 italic">No address — add in Overview tab</span>}
          </div>

          {order ? (
            <div className="space-y-3">
              <div className="bg-white border border-slate-100 rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-slate-800 capitalize">{order.reportType} Report</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">#{order.reportId.slice(-8)} · {new Date(order.orderedAt).toLocaleDateString()}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_COLOR[order.status]}`}>
                    {STATUS_LABEL[order.status]}
                  </span>
                </div>

                {order.statusMessage && (
                  <p className="text-[11px] text-slate-400 italic">{order.statusMessage}</p>
                )}

                {/* Measurements grid */}
                {order.measurements && (
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Measurements</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        ['Squares', `${order.measurements.totalSquares} sq`],
                        ['Area', `${order.measurements.totalSqFt.toLocaleString()} sqft`],
                        ['Pitch', order.measurements.predominantPitch],
                        ['Facets', String(order.measurements.facetCount)],
                        ['Ridge', `${order.measurements.ridgeLength} LF`],
                        ['Hip', `${order.measurements.hipLength} LF`],
                        ['Valley', `${order.measurements.valleyLength} LF`],
                        ['Eave', `${order.measurements.eaveLength} LF`],
                        ['Rake', `${order.measurements.rakeLength} LF`],
                        ['Flashing', `${order.measurements.flashingLength} LF`],
                      ].map(([label, value]) => (
                        <div key={label} className="bg-slate-50 rounded-lg px-2.5 py-2">
                          <p className="text-[10px] text-slate-400">{label}</p>
                          <p className="text-xs font-bold text-slate-800">{value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Per Square Pricing */}
                {order.status === 'completed' && order.measurements && (() => {
                  const sq = order.measurements.totalSquares;
                  const rates = {
                    good:   parseFloat(tierRates.good)   || 0,
                    better: parseFloat(tierRates.better) || 0,
                    best:   parseFloat(tierRates.best)   || 0,
                  };
                  const totals = {
                    good:   rates.good   * sq,
                    better: rates.better * sq,
                    best:   rates.best   * sq,
                  };
                  const tiers = ['good', 'better', 'best'] as const;
                  const tierColors: Record<string, string> = {
                    good:   'border-slate-400 bg-slate-100 text-slate-800',
                    better: 'border-blue-400 bg-blue-100 text-blue-800',
                    best:   'border-violet-400 bg-violet-100 text-violet-800',
                  };
                  const activeColors: Record<string, string> = {
                    good:   'border-slate-500 bg-slate-200 text-slate-900',
                    better: 'border-blue-500 bg-blue-200 text-blue-900',
                    best:   'border-violet-500 bg-violet-200 text-violet-900',
                  };
                  return (
                    <div className="mt-3 border border-violet-100 rounded-xl bg-violet-50 p-3 space-y-3">
                      <div className="flex items-center gap-1.5">
                        <DollarSign size={13} className="text-violet-600" />
                        <p className="text-[10px] font-bold text-violet-700 uppercase tracking-wider">Per Square Pricing</p>
                        <span className="text-[10px] text-violet-400 ml-1">{sq} sq</span>
                      </div>

                      {/* Tier tabs */}
                      <div className="grid grid-cols-3 gap-1.5">
                        {tiers.map((tier) => (
                          <button
                            key={tier}
                            onClick={() => setActiveTier(tier)}
                            className={`rounded-lg border-2 px-2 py-1.5 text-[10px] font-bold capitalize transition-colors ${
                              activeTier === tier ? activeColors[tier] : 'border-slate-200 bg-white text-slate-500'
                            }`}
                          >
                            {tier}
                          </button>
                        ))}
                      </div>

                      {/* $/sq input for active tier */}
                      <div className="flex items-center gap-2 bg-white rounded-xl border border-slate-200 px-3 py-2">
                        <span className="text-xs font-bold text-slate-400">$</span>
                        <input
                          type="number"
                          min="0"
                          step="5"
                          placeholder="0"
                          value={tierRates[activeTier]}
                          onChange={(e) => setTierRates(prev => ({ ...prev, [activeTier]: e.target.value }))}
                          className="flex-1 text-sm font-bold text-slate-800 bg-transparent outline-none min-w-0"
                        />
                        <span className="text-[10px] text-slate-400 whitespace-nowrap">/ sq — <span className="capitalize">{activeTier}</span></span>
                      </div>

                      {/* Tier totals comparison */}
                      <div className="grid grid-cols-3 gap-1.5">
                        {tiers.map((tier) => (
                          <div
                            key={tier}
                            className={`rounded-lg px-2 py-2 border-2 ${activeTier === tier ? activeColors[tier] : tierColors[tier]}`}
                          >
                            <p className="text-[9px] font-bold uppercase tracking-wider opacity-70 capitalize">{tier}</p>
                            <p className="text-xs font-bold mt-0.5">
                              {rates[tier] > 0
                                ? `$${totals[tier].toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                                : <span className="opacity-40">—</span>
                              }
                            </p>
                            {rates[tier] > 0 && (
                              <p className="text-[9px] opacity-60">${rates[tier]}/sq</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Actions */}
                <div className="flex flex-wrap gap-2 pt-1">
                  {order.status !== 'completed' && order.status !== 'failed' && (
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
                    <>
                      {order.downloadUrl && (
                        <a
                          href={order.downloadUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 bg-slate-100 text-slate-700 px-3 py-2 rounded-xl text-xs font-bold"
                        >
                          <ExternalLink size={12} />
                          View on Roofr
                        </a>
                      )}
                      <button
                        onClick={() => dupWarning ? handleSave(true) : handleSave()}
                        disabled={saving}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold active:scale-95 disabled:opacity-50 ${
                          dupWarning
                            ? 'bg-amber-500 text-white'
                            : 'bg-emerald-600 text-white'
                        }`}
                      >
                        {saving ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                        {saving ? 'Saving…' : dupWarning ? '⚠️ Save Anyway?' : 'Save to Documents'}
                      </button>
                    </>
                  )}

                  {order.status === 'failed' && (
                    <button
                      onClick={() => persist(null)}
                      className="bg-slate-100 text-slate-700 px-3 py-2 rounded-xl text-xs font-bold"
                    >
                      Try Again
                    </button>
                  )}
                </div>
              </div>

              {order.status === 'completed' && (
                <div className="flex items-start gap-2 bg-emerald-100 rounded-xl px-3 py-2">
                  <CheckCircle size={14} className="text-emerald-700 mt-0.5 shrink-0" />
                  <p className="text-xs text-emerald-800 font-semibold">Ready! Hit <em>Save to Documents</em> to attach this report permanently.</p>
                </div>
              )}

              {order.status === 'processing' && (
                <div className="flex items-start gap-2 bg-blue-50 rounded-xl px-3 py-2">
                  <Clock size={14} className="text-blue-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-blue-700">Roofr is processing — most reports complete in 15–30 minutes.</p>
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

              {/* Report type selector */}
              <div className="grid grid-cols-2 gap-2">
                {(['standard', 'premium'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setReportType(type)}
                    className={`p-3 rounded-xl border-2 text-xs font-bold transition-colors ${
                      reportType === type
                        ? 'border-emerald-500 bg-emerald-100 text-emerald-800'
                        : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    <div className="capitalize">{type}</div>
                    <div className="font-normal opacity-70 mt-0.5">
                      {type === 'standard' ? 'Key measurements' : 'Full detail + 3D'}
                    </div>
                  </button>
                ))}
              </div>

              <button
                onClick={handleOrder}
                disabled={loading || !address}
                className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white py-3 rounded-xl text-xs font-bold active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-transform"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Ruler size={14} />}
                {loading ? 'Ordering…' : `Order ${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Report`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
