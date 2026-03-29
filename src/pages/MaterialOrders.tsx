import React, { useState, useEffect, useMemo } from 'react';
import {
  Package, Plus, Search, ChevronLeft, ChevronRight, Truck,
  ShoppingCart, X, Check, DollarSign, Calendar, Building2,
  User, FileText, Clock, CheckCircle, XCircle,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { formatCurrency } from '../lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────
type OrderStatus = 'pending' | 'ordered' | 'delivered' | 'cancelled';

interface MaterialOrder {
  id: string;
  company_id: string;
  supplier_id: string | null;
  contact_id: string | null;
  job_id: string | null;
  order_number: string;
  order_date: string;
  expected_delivery_date: string | null;
  actual_delivery_date: string | null;
  status: OrderStatus;
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  // joined
  contact_name?: string;
  contact_address?: string;
  supplier_name?: string;
}

interface Supplier {
  id: string;
  name: string;
}

interface Contact {
  id: string;
  first_name: string;
  last_name: string;
  address?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<OrderStatus, { label: string; bg: string; text: string; icon: React.ElementType }> = {
  pending:   { label: 'Pending',   bg: 'bg-slate-100',  text: 'text-slate-600', icon: Clock },
  ordered:   { label: 'Ordered',   bg: 'bg-blue-100',   text: 'text-blue-700',  icon: FileText },
  delivered: { label: 'Delivered', bg: 'bg-green-100',  text: 'text-green-700', icon: CheckCircle },
  cancelled: { label: 'Cancelled', bg: 'bg-red-100',    text: 'text-red-600',   icon: XCircle },
};

function StatusBadge({ status }: { status: OrderStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${cfg.bg} ${cfg.text}`}>
      <Icon size={10} />
      {cfg.label}
    </span>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function MaterialOrders() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const contactId = searchParams.get('contactId');
  const { profile, user } = useAuth();
  const db = supabase as any;

  const [orders, setOrders]       = useState<MaterialOrder[]>([]);
  const [contacts, setContacts]   = useState<Contact[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading]     = useState(true);
  const [searchQuery, setSearchQuery]   = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saving, setSaving]       = useState(false);
  const [savedOk, setSavedOk]     = useState(false);

  // Form state
  const [formContact,  setFormContact]  = useState('');
  const [formSupplier, setFormSupplier] = useState('');
  const [formVendor,   setFormVendor]   = useState(''); // free-text when no supplier
  const [formStatus,   setFormStatus]   = useState<OrderStatus>('pending');
  const [formOrderDate, setFormOrderDate]   = useState(() => new Date().toISOString().split('T')[0]);
  const [formDeliveryDate, setFormDeliveryDate] = useState('');
  const [formSubtotal, setFormSubtotal] = useState('');
  const [formTax,      setFormTax]      = useState('0');
  const [formShipping, setFormShipping] = useState('0');
  const [formNotes,    setFormNotes]    = useState('');

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchAll = async () => {
    if (!profile?.company_id) return;
    setLoading(true);
    try {
      let ordersQuery = db
        .from('material_orders')
        .select('*, contacts(first_name, last_name, address), suppliers(name)')
        .eq('company_id', profile.company_id)
        .order('order_date', { ascending: false });
      if (contactId) ordersQuery = ordersQuery.eq('contact_id', contactId);

      const [ordersRes, contactsRes, suppliersRes] = await Promise.all([
        ordersQuery,
        supabase.from('contacts').select('id, first_name, last_name, address').eq('company_id', profile.company_id).order('last_name'),
        db.from('suppliers').select('id, name').eq('company_id', profile.company_id).eq('is_active', true).order('name'),
      ]);

      const rawOrders = (ordersRes.data || []) as any[];
      const mapped: MaterialOrder[] = rawOrders.map((o) => ({
        ...o,
        contact_name: o.contacts
          ? `${o.contacts.first_name || ''} ${o.contacts.last_name || ''}`.trim()
          : null,
        contact_address: o.contacts?.address || null,
        supplier_name: o.suppliers?.name || null,
      }));
      setOrders(mapped);
      setContacts((contactsRes.data || []) as Contact[]);
      setSuppliers((suppliersRes.data || []) as Supplier[]);
    } catch (err) {
      console.error('[MaterialOrders] fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, [profile?.company_id, contactId]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const matchesSearch =
        !searchQuery ||
        o.order_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.contact_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.supplier_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.notes?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || o.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [orders, searchQuery, statusFilter]);

  const totalSpend   = orders.reduce((s, o) => s + (o.total || 0), 0);
  const pendingCount = orders.filter((o) => o.status === 'pending' || o.status === 'ordered').length;
  const deliveredCount = orders.filter((o) => o.status === 'delivered').length;

  const formTotal = useMemo(() => {
    const sub = parseFloat(formSubtotal || '0') || 0;
    const tax = parseFloat(formTax || '0') || 0;
    const ship = parseFloat(formShipping || '0') || 0;
    return sub + tax + ship;
  }, [formSubtotal, formTax, formShipping]);

  // ── Create ────────────────────────────────────────────────────────────────
  const resetForm = () => {
    setFormContact('');
    setFormSupplier('');
    setFormVendor('');
    setFormStatus('pending');
    setFormOrderDate(new Date().toISOString().split('T')[0]);
    setFormDeliveryDate('');
    setFormSubtotal('');
    setFormTax('0');
    setFormShipping('0');
    setFormNotes('');
    setSavedOk(false);
  };

  const handleSave = async () => {
    if (saving || !profile?.company_id || !user) return;
    setSaving(true);
    try {
      let supplierId = formSupplier || null;

      // If vendor text entered but no supplier selected — find or create supplier
      if (!supplierId && formVendor.trim()) {
        const vendorName = formVendor.trim();
        const { data: existing } = await db
          .from('suppliers')
          .select('id')
          .eq('company_id', profile.company_id)
          .ilike('name', vendorName)
          .maybeSingle();

        if (existing?.id) {
          supplierId = existing.id;
        } else {
          const { data: created } = await db
            .from('suppliers')
            .insert({ company_id: profile.company_id, name: vendorName, is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .select('id')
            .single();
          supplierId = created?.id ?? null;
        }
      }

      const orderNumber = `MO-${Date.now().toString().slice(-6)}`;
      const sub  = parseFloat(formSubtotal || '0') || 0;
      const tax  = parseFloat(formTax      || '0') || 0;
      const ship = parseFloat(formShipping || '0') || 0;

      const payload = {
        company_id:             profile.company_id,
        supplier_id:            supplierId,
        contact_id:             formContact || null,
        order_number:           orderNumber,
        order_date:             formOrderDate,
        expected_delivery_date: formDeliveryDate || null,
        status:                 formStatus,
        subtotal:               sub,
        tax:                    tax,
        shipping:               ship,
        total:                  sub + tax + ship,
        notes:                  formNotes.trim() || null,
        created_by:             user.id,
        created_at:             new Date().toISOString(),
        updated_at:             new Date().toISOString(),
      };

      const { error } = await db.from('material_orders').insert(payload);
      if (error) throw error;

      setSavedOk(true);
      await fetchAll();
      setTimeout(() => {
        setSheetOpen(false);
        resetForm();
      }, 1200);
    } catch (err) {
      console.error('[MaterialOrders] save error:', err);
      alert('Failed to save order. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const STATUS_TABS: Array<{ key: OrderStatus | 'all'; label: string }> = [
    { key: 'all',       label: 'All' },
    { key: 'pending',   label: 'Pending' },
    { key: 'ordered',   label: 'Ordered' },
    { key: 'delivered', label: 'Delivered' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 p-6 sticky top-0 z-10 space-y-4">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-slate-400 active:scale-90 transition-transform">
            <ChevronLeft size={24} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-primary">Material Orders</h1>
            {contactId && <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Filtered to this contact</p>}
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Search orders, contacts, vendors…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-100 rounded-2xl py-3 pl-11 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
        </div>
        {/* Status filter tabs */}
        <div className="flex gap-2 overflow-x-auto pb-0.5 -mx-1 px-1">
          {STATUS_TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                statusFilter === key
                  ? 'bg-primary text-white'
                  : 'bg-slate-100 text-slate-500'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6 space-y-5">
        {/* Budget summary */}
        {!loading && (
          <div className="grid grid-cols-3 gap-3">
            <div className="card p-4 space-y-1 text-center">
              <DollarSign size={18} className="mx-auto text-accent" />
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Spend</p>
              <p className="text-sm font-black text-primary">{formatCurrency(totalSpend)}</p>
            </div>
            <div className="card p-4 space-y-1 text-center">
              <Clock size={18} className="mx-auto text-blue-500" />
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">In Progress</p>
              <p className="text-sm font-black text-primary">{pendingCount}</p>
            </div>
            <div className="card p-4 space-y-1 text-center">
              <CheckCircle size={18} className="mx-auto text-green-500" />
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Delivered</p>
              <p className="text-sm font-black text-primary">{deliveredCount}</p>
            </div>
          </div>
        )}

        {/* Orders list */}
        {loading ? (
          [1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-white rounded-2xl animate-pulse border border-slate-100" />
          ))
        ) : filteredOrders.length > 0 ? (
          filteredOrders.map((order) => (
            <div key={order.id} className="card p-4 space-y-3">
              {/* Top row */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center text-primary shrink-0">
                    <Package size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-primary">{order.order_number || `Order`}</p>
                    <p className="text-[10px] text-slate-400 font-medium">
                      {order.order_date ? new Date(order.order_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                    </p>
                  </div>
                </div>
                <StatusBadge status={order.status} />
              </div>

              {/* Details */}
              <div className="space-y-1.5">
                {order.contact_name && (
                  <div className="flex items-center gap-2 text-slate-500 text-xs">
                    <User size={12} className="shrink-0" />
                    <span>{order.contact_name}</span>
                    {order.contact_address && (
                      <span className="text-slate-300">· {order.contact_address}</span>
                    )}
                  </div>
                )}
                {(order.supplier_name) && (
                  <div className="flex items-center gap-2 text-slate-500 text-xs">
                    <Building2 size={12} className="shrink-0" />
                    <span>{order.supplier_name}</span>
                  </div>
                )}
                {order.expected_delivery_date && (
                  <div className="flex items-center gap-2 text-slate-500 text-xs">
                    <Truck size={12} className="shrink-0" />
                    <span>
                      Expected{' '}
                      {new Date(order.expected_delivery_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                )}
                {order.notes && (
                  <p className="text-xs text-slate-400 italic">{order.notes}</p>
                )}
              </div>

              {/* Footer */}
              <div className="pt-3 border-t border-slate-50 flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest">Total</p>
                  <p className="text-base font-black text-primary">{formatCurrency(order.total || 0)}</p>
                </div>
                <button
                  onClick={() => navigate(`/contacts/${order.contact_id}`)}
                  disabled={!order.contact_id}
                  className="flex items-center gap-1 text-xs font-bold text-accent active:scale-95 transition-transform disabled:opacity-30"
                >
                  View Contact <ChevronRight size={14} />
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-16 space-y-4">
            <div className="mx-auto h-16 w-16 bg-white rounded-2xl flex items-center justify-center text-slate-200 shadow-sm">
              <Package size={32} />
            </div>
            <p className="text-slate-400 text-sm font-medium">
              {searchQuery || statusFilter !== 'all' ? 'No orders match your filters' : 'No material orders yet'}
            </p>
          </div>
        )}
      </div>

      {/* FAB */}
      <button
        onClick={() => { resetForm(); setSheetOpen(true); }}
        className="fixed right-6 h-14 w-14 bg-accent text-white rounded-2xl shadow-xl shadow-accent/30 flex items-center justify-center active:scale-90 transition-transform z-10"
        style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom))' }}
      >
        <Plus size={28} />
      </button>

      {/* ── Create Order Sheet ────────────────────────────────────────────── */}
      {sheetOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSheetOpen(false)} />
          <div
            className="relative flex flex-col rounded-t-3xl bg-white"
            style={{ maxHeight: 'min(90vh, calc(100dvh - env(safe-area-inset-top) - 1rem))' }}
          >
            {/* Handle */}
            <div className="absolute top-3 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full bg-slate-200" />

            {/* Scrollable form */}
            <div className="flex-1 overflow-y-auto px-6 pb-6 pt-8 space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-black text-primary">New Material Order</h2>
                <button onClick={() => setSheetOpen(false)} className="p-2 rounded-xl bg-slate-100 active:scale-95">
                  <X size={18} className="text-slate-500" />
                </button>
              </div>

              {/* Contact */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                  <User size={12} /> Customer
                </label>
                <select
                  value={formContact}
                  onChange={(e) => setFormContact(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="">— Select customer —</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {`${c.first_name || ''} ${c.last_name || ''}`.trim() || c.id}
                    </option>
                  ))}
                </select>
              </div>

              {/* Supplier */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                  <Building2 size={12} /> Vendor / Supplier
                </label>
                {suppliers.length > 0 ? (
                  <select
                    value={formSupplier}
                    onChange={(e) => { setFormSupplier(e.target.value); setFormVendor(''); }}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    <option value="">— Select or type below —</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                ) : null}
                {!formSupplier && (
                  <input
                    type="text"
                    placeholder="Or type vendor name…"
                    value={formVendor}
                    onChange={(e) => setFormVendor(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-primary placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                )}
              </div>

              {/* Status */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Status</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['pending', 'ordered', 'delivered', 'cancelled'] as OrderStatus[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setFormStatus(s)}
                      className={`rounded-xl py-2.5 text-xs font-bold capitalize transition-all ${
                        formStatus === s
                          ? 'bg-primary text-white'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {STATUS_CONFIG[s].label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                    <Calendar size={11} /> Order Date
                  </label>
                  <input
                    type="date"
                    value={formOrderDate}
                    onChange={(e) => setFormOrderDate(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-medium text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                    <Truck size={11} /> Delivery Date
                  </label>
                  <input
                    type="date"
                    value={formDeliveryDate}
                    onChange={(e) => setFormDeliveryDate(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-medium text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
              </div>

              {/* Costs */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                  <DollarSign size={12} /> Costs
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-400 font-bold">Subtotal</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={formSubtotal}
                      onChange={(e) => setFormSubtotal(e.target.value)}
                      className="w-full mt-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 font-bold">Tax</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={formTax}
                      onChange={(e) => setFormTax(e.target.value)}
                      className="w-full mt-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 font-bold">Shipping</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={formShipping}
                      onChange={(e) => setFormShipping(e.target.value)}
                      className="w-full mt-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-primary/5 px-4 py-2.5 mt-1">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Order Total</span>
                  <span className="text-base font-black text-primary">{formatCurrency(formTotal)}</span>
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Notes (optional)</label>
                <textarea
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Materials list, delivery instructions, reference #…"
                  rows={3}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-primary placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-accent resize-none"
                />
              </div>
            </div>

            {/* Save button */}
            <div
              className="shrink-0 border-t border-slate-100 bg-white px-6 py-4"
              style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
            >
              <button
                onClick={handleSave}
                disabled={saving || savedOk}
                className={`w-full rounded-2xl py-4 text-sm font-black uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 ${
                  savedOk
                    ? 'bg-green-500 text-white'
                    : 'bg-accent text-white disabled:opacity-50'
                }`}
              >
                {savedOk ? (
                  <><Check size={16} /> Order Saved</>
                ) : saving ? (
                  <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  'Save Material Order'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
