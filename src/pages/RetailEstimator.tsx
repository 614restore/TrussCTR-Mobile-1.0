import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Minus, Save, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { formatCurrency } from '../lib/utils';
import { cn } from '../lib/utils';

interface LineItem {
  id: string;
  name: string;
  price: number;
  qty: number;
  unit: string;
  active: boolean;
}

const DEFAULT_ITEMS: LineItem[] = [
  { id: '1', name: 'Drip Edge', price: 12, qty: 120, unit: 'LF', active: true },
  { id: '2', name: 'Ice & Water Shield', price: 85, qty: 2, unit: 'Roll', active: true },
  { id: '3', name: 'Ridge Vent', price: 18, qty: 40, unit: 'LF', active: true },
  { id: '4', name: 'Pipe Boots', price: 45, qty: 3, unit: 'EA', active: true },
  { id: '5', name: 'Underlayment', price: 65, qty: 2, unit: 'Roll', active: true },
];

export default function RetailEstimator() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [squares, setSquares] = useState(25);
  const [waste, setWaste] = useState(15);
  const [shinglePrice, setShinglePrice] = useState(150);
  const [items, setItems] = useState<LineItem[]>(DEFAULT_ITEMS);
  const [showLineItems, setShowLineItems] = useState(true);
  const [saving, setSaving] = useState(false);

  const totalSquares = squares * (1 + waste / 100);
  const shingleTotal = totalSquares * shinglePrice;
  const componentsTotal = items
    .filter((i) => i.active)
    .reduce((acc, curr) => acc + curr.price * curr.qty, 0);
  const grandTotal = shingleTotal + componentsTotal;

  const saveEstimate = async () => {
    if (!id || !profile) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('documents').insert({
        contact_id: id,
        company_id: profile.company_id,
        name: `retail_estimate_${squares}sq_${Date.now()}`,
        type: 'estimate',
        url: '',
        size: 0,
        uploaded_by: profile.full_name || profile.email,
      } as any);

      if (error) throw error;

      // Log to communications
      await supabase.from('communications').insert({
        contact_id: id,
        company_id: profile.company_id,
        type: 'note',
        content: `💰 Retail Estimate Created — ${squares} SQ (${waste}% waste) = ${formatCurrency(grandTotal)}`,
        user_id: profile.id,
        direction: 'outbound',
      } as any);

      alert(`Estimate of ${formatCurrency(grandTotal)} saved to contact timeline!`);
      navigate(-1);
    } catch (err) {
      console.error('Error saving estimate:', err);
      alert('Failed to save estimate.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      <nav className="p-4 bg-white border-b border-slate-100 flex items-center gap-4 sticky top-0 z-10 shadow-sm">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-slate-400 active:scale-90 transition-transform">
          <ArrowLeft size={24} />
        </button>
        <h1 className="font-bold text-primary">Retail Estimator</h1>
      </nav>

      <div className="p-6 space-y-6">
        {/* Roof Size Input */}
        <section className="bg-primary p-6 rounded-2xl text-white shadow-xl">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Base Roof Area</h2>
            <div className="bg-accent text-[10px] font-black px-2 py-1 rounded">ESTIMATE MODE</div>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <input
                type="number"
                value={squares}
                onChange={(e) => setSquares(Number(e.target.value))}
                className="bg-transparent text-5xl font-black outline-none w-32 border-b border-slate-700"
              />
              <span className="text-xl font-bold text-slate-500 ml-2">SQ</span>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold text-slate-400 uppercase">Waste Factor</p>
              <div className="flex items-center gap-2 mt-1">
                <button onClick={() => setWaste((w) => Math.max(0, w - 1))} className="p-1 bg-white/10 rounded-lg"><Minus size={14} /></button>
                <span className="font-bold w-8 text-center">{waste}%</span>
                <button onClick={() => setWaste((w) => w + 1)} className="p-1 bg-white/10 rounded-lg"><Plus size={14} /></button>
              </div>
            </div>
          </div>
          <div className="mt-4 text-xs text-slate-500">
            Ordered: {totalSquares.toFixed(1)} SQ @ ${shinglePrice}/sq
          </div>
        </section>

        {/* Shingle Price */}
        <section className="card p-5 space-y-3">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Shingle Price / Square</h2>
          <div className="flex gap-2">
            {[120, 140, 150, 175, 200].map((p) => (
              <button
                key={p}
                onClick={() => setShinglePrice(p)}
                className={cn(
                  'flex-1 py-2 rounded-xl text-xs font-bold border transition-all',
                  shinglePrice === p
                    ? 'bg-accent border-accent text-white'
                    : 'bg-white border-slate-100 text-slate-600'
                )}
              >
                ${p}
              </button>
            ))}
          </div>
        </section>

        {/* Line Item Toggle */}
        <div className="flex justify-between items-center bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-2">
            {showLineItems ? (
              <Eye size={16} className="text-blue-600" />
            ) : (
              <EyeOff size={16} className="text-slate-400" />
            )}
            <span className="text-xs font-bold uppercase tracking-tighter">Line-Item Visibility</span>
          </div>
          <button
            onClick={() => setShowLineItems(!showLineItems)}
            className={cn(
              'w-12 h-6 rounded-full transition-colors relative',
              showLineItems ? 'bg-emerald-500' : 'bg-slate-300'
            )}
          >
            <div
              className={cn(
                'absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow',
                showLineItems ? 'right-1' : 'left-1'
              )}
            />
          </button>
        </div>

        {/* Itemized Breakdown */}
        {showLineItems && (
          <section className="space-y-3">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Components</h2>
            <div className="space-y-2">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="bg-white p-4 border border-slate-100 rounded-xl flex items-center justify-between shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() =>
                        setItems((prev) =>
                          prev.map((i) => (i.id === item.id ? { ...i, active: !i.active } : i))
                        )
                      }
                      className={cn(
                        'w-5 h-5 rounded border-2 flex items-center justify-center transition-colors',
                        item.active ? 'bg-accent border-accent' : 'border-slate-300'
                      )}
                    >
                      {item.active && <div className="w-2 h-2 bg-white rounded-full" />}
                    </button>
                    <div>
                      <p className={cn('text-sm font-medium', !item.active && 'line-through text-slate-400')}>
                        {item.name}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {item.qty} {item.unit} × ${item.price}
                      </p>
                    </div>
                  </div>
                  <span className="font-bold text-sm">
                    {item.active ? formatCurrency(item.price * item.qty) : '—'}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Grand Total */}
        <div className="bg-primary p-6 rounded-2xl text-white shadow-xl">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Grand Total</p>
          <p className="text-4xl font-black">{formatCurrency(grandTotal)}</p>
          <p className="text-xs text-slate-400 mt-2">
            Shingles: {formatCurrency(shingleTotal)} + Components: {formatCurrency(componentsTotal)}
          </p>
        </div>
      </div>

      {/* Save Bar */}
      <div className="fixed bottom-0 w-full max-w-[480px] p-4 bg-white border-t border-slate-100">
        <button
          onClick={saveEstimate}
          disabled={saving}
          className="w-full bg-accent text-white font-black py-4 rounded-xl flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] transition-transform disabled:opacity-60"
        >
          <Save size={20} />
          {saving ? 'Saving...' : `Save Estimate — ${formatCurrency(grandTotal)}`}
        </button>
      </div>
    </div>
  );
}
