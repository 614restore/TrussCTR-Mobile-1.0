import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Minus, Save, Eye, EyeOff, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { formatCurrency, cn } from '../lib/utils';
import {
  buildDefaultQuoteMeta,
  ESTIMATE_PRESETS,
  estimateItemsTotal,
  serializeEstimateNotes,
  type EstimatePresetId,
} from '../lib/estimateQuote';

interface LineItem {
  id: string;
  name: string;
  price: number;
  qty: number;
  unit: string;
  active: boolean;
}

const makeId = () => crypto.randomUUID();

function buildPresetItems(presetId: EstimatePresetId): LineItem[] {
  const preset = ESTIMATE_PRESETS.find((entry) => entry.id === presetId) || ESTIMATE_PRESETS[0];
  return preset.defaultItems.map((item) => ({
    id: makeId(),
    name: item.name,
    price: item.rate,
    qty: item.qty,
    unit: item.unit,
    active: true,
  }));
}

export default function RetailEstimator() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [contact, setContact] = useState<any>(null);
  const [presetId, setPresetId] = useState<EstimatePresetId>('roof_replacement');
  const [squares, setSquares] = useState(25);
  const [waste, setWaste] = useState(15);
  const [shinglePrice, setShinglePrice] = useState(150);
  const [estimateTitle, setEstimateTitle] = useState('Retail Estimate');
  const [scopeSummary, setScopeSummary] = useState(buildDefaultQuoteMeta(0).scopeSummary);
  const [customerMessage, setCustomerMessage] = useState(buildDefaultQuoteMeta(0).customerMessage);
  const [paymentTerms, setPaymentTerms] = useState(buildDefaultQuoteMeta(0).paymentTerms);
  const [warrantyPeriod, setWarrantyPeriod] = useState(buildDefaultQuoteMeta(0).warrantyPeriod);
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [items, setItems] = useState<LineItem[]>(buildPresetItems('roof_replacement'));
  const [showLineItems, setShowLineItems] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const loadContact = async () => {
      if (!id) return;
      const { data } = await supabase.from('contacts').select('*').eq('id', id).maybeSingle();
      const record: any = data;
      if (record) {
        setContact(record);
        setEstimateTitle(`${record.project_type || 'Retail'} Quote`);
      }
    };
    loadContact();
  }, [id]);

  const totalSquares = useMemo(() => squares * (1 + waste / 100), [squares, waste]);
  const shingleTotal = useMemo(() => totalSquares * shinglePrice, [shinglePrice, totalSquares]);
  const activeItems = useMemo(
    () => items.filter((item) => item.active).map((item) => ({
      description: item.name,
      quantity: item.qty,
      unit: item.unit,
      rate: item.price,
      amount: Number((item.price * item.qty).toFixed(2)),
    })),
    [items]
  );
  const componentsTotal = useMemo(() => estimateItemsTotal(activeItems), [activeItems]);
  const grandTotal = useMemo(() => Number((shingleTotal + componentsTotal).toFixed(2)), [componentsTotal, shingleTotal]);
  const quoteMeta = useMemo(() => {
    const base = buildDefaultQuoteMeta(grandTotal, presetId);
    return {
      ...base,
      scopeSummary,
      customerMessage,
      paymentTerms,
      warrantyPeriod,
    };
  }, [customerMessage, grandTotal, paymentTerms, presetId, scopeSummary, warrantyPeriod]);

  const applyPreset = (nextPresetId: EstimatePresetId) => {
    setPresetId(nextPresetId);
    const nextPreset = ESTIMATE_PRESETS.find((entry) => entry.id === nextPresetId) || ESTIMATE_PRESETS[0];
    setItems(buildPresetItems(nextPresetId));
    setScopeSummary(nextPreset.scopeSummary);
  };

  const updateLineItem = (itemId: string, patch: Partial<LineItem>) => {
    setItems((prev) => prev.map((item) => (item.id === itemId ? { ...item, ...patch } : item)));
  };

  const addLineItem = () => {
    setItems((prev) => [
      ...prev,
      {
        id: makeId(),
        name: 'Custom Line Item',
        price: 0,
        qty: 1,
        unit: 'EA',
        active: true,
      },
    ]);
  };

  const saveEstimate = async () => {
    setSaveError(null);

    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData?.session;

    if (!id) {
      setSaveError('No contact ID. Open this estimator from a contact.');
      return;
    }
    if (!session) {
      setSaveError('Not logged in. Restart the app and try again.');
      return;
    }
    if (!profile) {
      setSaveError('Profile not loaded yet. Wait a moment and try again.');
      return;
    }

    setSaving(true);
    try {
      const estimateNumber = `EST-${Date.now().toString().slice(-6)}`;

      // Only include columns that exist in your estimates table
      const estimatePayload: any = {
        contact_id: id,
        company_id: profile.company_id,
        title: estimateTitle,
        items: [
          {
            description: 'Primary Roofing System',
            quantity: Number(totalSquares.toFixed(1)),
            unit: 'SQ',
            rate: shinglePrice,
            amount: Number(shingleTotal.toFixed(2)),
          },
          ...activeItems,
        ],
        subtotal: grandTotal,
        total: grandTotal,
        notes: serializeEstimateNotes(
          {
            ...quoteMeta,
            validUntil: quoteMeta.validUntil,
            depositAmount: Number((contact?.deposit_amount || quoteMeta.depositAmount).toFixed(2)),
            finalPaymentAmount: Number((contact?.final_payment_amount || quoteMeta.finalPaymentAmount).toFixed(2)),
          },
          `${customerMessage}\n\nEstimate #: ${estimateNumber}\n${additionalNotes.trim()}`
        ),
        status: 'draft',
      };

      const { data, error } = await (supabase.from('estimates') as any)
        .insert(estimatePayload)
        .select('*')
        .single();
      if (error) throw error;

      await (supabase.from('contacts') as any)
        .update({
          project_value: grandTotal,
          deposit_amount: contact?.deposit_amount || quoteMeta.depositAmount,
          final_payment_amount: contact?.final_payment_amount || quoteMeta.finalPaymentAmount,
        })
        .eq('id', id);

      await (supabase.from('communications') as any).insert({
        contact_id: id,
        company_id: profile.company_id,
        type: 'note',
        content: `Retail quote created in mobile app: ${estimateTitle} (${estimateNumber}) for ${formatCurrency(grandTotal)}`,
        user_id: profile.id,
        direction: 'outbound',
      });

      if (!data?.id) throw new Error('Estimate created without a returned id.');
      navigate(`/estimates/${data.id}`);
    } catch (err: any) {
      console.error('Error saving estimate:', err);
      setSaveError(err?.message || 'Failed to save. Check connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const SaveButton = () => (
    <button
      onClick={saveEstimate}
      disabled={saving}
      className="flex w-full items-center justify-center gap-2 rounded-2xl bg-accent py-4 font-black text-white shadow-xl transition-transform active:scale-[0.98] disabled:opacity-60"
    >
      <Save size={20} />
      {saving ? 'Saving Quote...' : 'Create Quote'}
    </button>
  );

  return (
    <div
      className="flex flex-col bg-slate-50"
      style={{
        minHeight: '100dvh',
        width: '100%',
        maxWidth: '100vw',
        overflowX: 'hidden',
        position: 'relative',
      }}
    >
      {/* Nav */}
      <nav
        className="sticky top-0 z-10 flex items-center gap-4 border-b border-slate-100 bg-white px-4 pb-3 shadow-sm"
        style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
      >
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-slate-400 active:scale-90 transition-transform">
          <ArrowLeft size={24} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="font-bold text-primary">Retail Estimator</h1>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Quote Builder</p>
        </div>
        <button
          onClick={saveEstimate}
          disabled={saving}
          className="shrink-0 flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-xs font-black text-white shadow transition-transform active:scale-95 disabled:opacity-60"
        >
          <Save size={14} />
          {saving ? 'Saving…' : 'Save'}
        </button>
      </nav>

      {/* Scrollable content */}
      <div
        className="flex-1 w-full space-y-6 p-6"
        style={{
          overflowX: 'hidden',
          overflowY: 'auto',
          paddingBottom: 'calc(8rem + env(safe-area-inset-bottom))',
        }}
      >
        {saveError && (
          <div className="rounded-2xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 font-medium">
            ⚠️ {saveError}
          </div>
        )}

        <section className="rounded-3xl bg-slate-900 p-6 text-white shadow-xl">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">Project Basis</h2>
            <div className="rounded bg-accent px-2 py-1 text-[10px] font-black">QUOTE MODE</div>
          </div>
          <input
            type="text"
            value={estimateTitle}
            onChange={(event) => setEstimateTitle(event.target.value)}
            className="w-full bg-transparent text-3xl font-black outline-none"
          />
          <p className="mt-1 text-xs text-slate-400">{contact ? `${contact.first_name} ${contact.last_name}` : 'Customer quote'}</p>
          <div className="mt-6 grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Squares</p>
              <input
                type="number"
                value={squares}
                onChange={(event) => setSquares(Number(event.target.value) || 0)}
                className="mt-2 w-full border-b border-slate-700 bg-transparent pb-2 text-4xl font-black outline-none"
              />
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Waste Factor</p>
              <div className="mt-3 inline-flex items-center gap-2 rounded-2xl bg-white/10 px-3 py-2">
                <button onClick={() => setWaste((current) => Math.max(0, current - 1))} className="rounded-lg bg-white/10 p-1">
                  <Minus size={14} />
                </button>
                <span className="w-10 text-center font-bold">{waste}%</span>
                <button onClick={() => setWaste((current) => current + 1)} className="rounded-lg bg-white/10 p-1">
                  <Plus size={14} />
                </button>
              </div>
              <p className="mt-3 text-xs text-slate-400">Ordered: {totalSquares.toFixed(1)} SQ</p>
            </div>
          </div>
        </section>

        <section className="card p-5 space-y-4">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">Quote Template</h2>
            <p className="mt-1 text-sm text-slate-500">Preset scopes based on the web app and ScopeMGR retail project flow.</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {ESTIMATE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => applyPreset(preset.id)}
                className={cn(
                  'rounded-2xl border px-3 py-3 text-left text-xs font-bold transition-all',
                  presetId === preset.id ? 'border-accent bg-accent text-white' : 'border-slate-200 bg-white text-slate-700'
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="grid gap-3">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Scope Summary</label>
            <textarea
              value={scopeSummary}
              onChange={(event) => setScopeSummary(event.target.value)}
              rows={4}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none"
            />
          </div>
        </section>

        <section className="card p-5 space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">Primary Roofing Rate</h2>
          <div className="grid grid-cols-3 gap-2">
            {[120, 140, 150, 175, 200].map((rate) => (
              <button
                key={rate}
                onClick={() => setShinglePrice(rate)}
                className={cn(
                  'flex-1 rounded-xl border py-2 text-xs font-bold transition-all',
                  shinglePrice === rate ? 'border-accent bg-accent text-white' : 'border-slate-100 bg-white text-slate-600'
                )}
              >
                ${rate}
              </button>
            ))}
          </div>
        </section>

        <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
          <div className="flex items-center gap-2">
            {showLineItems ? <Eye size={16} className="text-blue-600" /> : <EyeOff size={16} className="text-slate-400" />}
            <span className="text-xs font-bold uppercase tracking-tighter">Line Items</span>
          </div>
          <button
            onClick={() => setShowLineItems(!showLineItems)}
            className={cn('relative h-6 w-12 rounded-full transition-colors', showLineItems ? 'bg-emerald-500' : 'bg-slate-300')}
          >
            <div className={cn('absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-all', showLineItems ? 'right-1' : 'left-1')} />
          </button>
        </div>

        {showLineItems && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">Components</h2>
              <button onClick={addLineItem} className="rounded-xl bg-slate-900 px-3 py-2 text-[11px] font-bold text-white">
                Add Item
              </button>
            </div>
            <div className="space-y-3">
              {items.map((item) => (
                <div key={item.id} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => updateLineItem(item.id, { active: !item.active })}
                        className={cn('flex h-5 w-5 items-center justify-center rounded border-2 transition-colors', item.active ? 'border-accent bg-accent' : 'border-slate-300')}
                      >
                        {item.active && <div className="h-2 w-2 rounded-full bg-white" />}
                      </button>
                      <input
                        value={item.name}
                        onChange={(event) => updateLineItem(item.id, { name: event.target.value })}
                        className={cn('min-w-0 bg-transparent text-sm font-bold outline-none', !item.active && 'text-slate-400 line-through')}
                      />
                    </div>
                    <button onClick={() => setItems((prev) => prev.filter((entry) => entry.id !== item.id))} className="text-slate-300">
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="number"
                      value={item.qty}
                      onChange={(event) => updateLineItem(item.id, { qty: Number(event.target.value) || 0 })}
                      className="rounded-xl bg-slate-50 px-3 py-2 text-sm outline-none"
                      placeholder="Qty"
                    />
                    <input
                      value={item.unit}
                      onChange={(event) => updateLineItem(item.id, { unit: event.target.value })}
                      className="rounded-xl bg-slate-50 px-3 py-2 text-sm outline-none"
                      placeholder="Unit"
                    />
                    <input
                      type="number"
                      value={item.price}
                      onChange={(event) => updateLineItem(item.id, { price: Number(event.target.value) || 0 })}
                      className="rounded-xl bg-slate-50 px-3 py-2 text-sm outline-none"
                      placeholder="Rate"
                    />
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">{item.qty} {item.unit} @ {formatCurrency(item.price)}</span>
                    <span className="font-bold text-primary">{item.active ? formatCurrency(item.price * item.qty) : 'Excluded'}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="card p-5 space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">Terms & Quote Notes</h2>
          <div className="grid gap-3">
            <input
              value={warrantyPeriod}
              onChange={(event) => setWarrantyPeriod(event.target.value)}
              className="rounded-2xl bg-slate-50 px-4 py-3 text-sm outline-none"
              placeholder="Warranty Period"
            />
            <textarea
              value={paymentTerms}
              onChange={(event) => setPaymentTerms(event.target.value)}
              rows={3}
              className="rounded-2xl bg-slate-50 px-4 py-3 text-sm outline-none"
              placeholder="Payment terms"
            />
            <textarea
              value={customerMessage}
              onChange={(event) => setCustomerMessage(event.target.value)}
              rows={3}
              className="rounded-2xl bg-slate-50 px-4 py-3 text-sm outline-none"
              placeholder="Customer-facing message"
            />
            <textarea
              value={additionalNotes}
              onChange={(event) => setAdditionalNotes(event.target.value)}
              rows={3}
              className="rounded-2xl bg-slate-50 px-4 py-3 text-sm outline-none"
              placeholder="Internal or project notes"
            />
          </div>
        </section>

        <div className="rounded-3xl bg-primary p-6 text-white shadow-xl">
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">Quote Total</p>
          <p className="text-4xl font-black">{formatCurrency(grandTotal)}</p>
          <div className="mt-4 grid gap-1 text-xs text-slate-300">
            <p>Primary system: {formatCurrency(shingleTotal)}</p>
            <p>Line items: {formatCurrency(componentsTotal)}</p>
            <p>Suggested deposit: {formatCurrency(contact?.deposit_amount || quoteMeta.depositAmount)}</p>
            <p>Balance due: {formatCurrency(contact?.final_payment_amount || quoteMeta.finalPaymentAmount)}</p>
          </div>
        </div>

        {/* Inline save button at bottom of scroll */}
        <SaveButton />
      </div>

      {/* Fixed save bar */}
      <div
        className="fixed bottom-0 left-0 right-0 z-20 mx-auto w-full max-w-md bg-white px-4 pt-3 shadow-lg border-t border-slate-100"
        style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
      >
        <SaveButton />
      </div>
    </div>
  );
}
