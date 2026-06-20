import React, { useState, useEffect } from 'react';
import {
  ChevronLeft, Calendar, MapPin, User,
  ClipboardList, Package, Clock, CheckCircle2,
  Phone, Mail, MessageSquare, Truck, X, Save, Plus, Trash2
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { formatCurrency } from '../lib/utils';

export default function WorkOrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  // Edit sheet state
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  // Add material sheet state
  const [showAddMaterial, setShowAddMaterial] = useState(false);
  const [materialName, setMaterialName] = useState('');
  const [materialQty, setMaterialQty] = useState('1');
  const [addingMaterial, setAddingMaterial] = useState(false);

  useEffect(() => {
    if (id) fetchOrderDetail();
  }, [id]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = (message: string) => setToast(message);

  const fetchOrderDetail = async () => {
    try {
      const { data, error } = await supabase
        .from('work_orders')
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
          )
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      setOrder(data);
    } catch (err) {
      console.error('Error fetching work order detail:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (newStatus: string) => {
    try {
      const { error } = await (supabase.from('work_orders') as any)
        .update({
          status: newStatus,
          completed_date: newStatus === 'completed' ? new Date().toISOString() : null,
        })
        .eq('id', id);

      if (error) throw error;
      const contactStatusMap: Record<string, string> = {
        scheduled: 'scheduled',
        in_progress: 'in_progress',
        completed: 'completed',
      };
      if (order?.contact_id && contactStatusMap[newStatus]) {
        await (supabase.from('contacts') as any)
          .update({ status: contactStatusMap[newStatus] })
          .eq('id', order.contact_id);
      }
      if (profile?.id && order?.contact_id) {
        await (supabase.from('communications') as any).insert({
          contact_id: order.contact_id,
          company_id: order.company_id,
          type: 'note',
          content: `Work order updated in mobile app: ${order.title} -> ${newStatus.replace('_', ' ')}`,
          user_id: profile.id,
          direction: 'outbound',
        });
      }
      setOrder({ ...order, status: newStatus });
      showToast(`Work order marked ${newStatus.replace('_', ' ')}`);
    } catch (err) {
      console.error('Error updating status:', err);
      showToast('Unable to update work order');
    }
  };

  const openEdit = () => {
    setEditForm({
      title: order.title || '',
      scheduled_date: order.scheduled_date ? order.scheduled_date.slice(0, 10) : '',
      assigned_to: order.assigned_to || '',
      description: order.description || '',
      labor_cost: order.labor_cost ?? '',
      material_cost: order.material_cost ?? '',
    });
    setShowEdit(true);
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      const updates: any = {
        title: editForm.title,
        assigned_to: editForm.assigned_to || null,
        description: editForm.description || null,
        labor_cost: editForm.labor_cost !== '' ? parseFloat(editForm.labor_cost) : null,
        material_cost: editForm.material_cost !== '' ? parseFloat(editForm.material_cost) : null,
      };
      if (editForm.scheduled_date) {
        updates.scheduled_date = new Date(editForm.scheduled_date).toISOString();
      }

      const { error } = await (supabase.from('work_orders') as any)
        .update(updates)
        .eq('id', id);

      if (error) throw error;
      setOrder({ ...order, ...updates });
      setShowEdit(false);
      showToast('Work order updated');
    } catch (err) {
      console.error('Error saving work order:', err);
      showToast('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const addMaterial = async () => {
    if (!materialName.trim()) return;
    setAddingMaterial(true);
    try {
      const qty = parseInt(materialQty) || 1;
      const currentMaterials = (order.materials && typeof order.materials === 'object')
        ? order.materials
        : {};
      const updated = { ...currentMaterials, [materialName.trim()]: qty };

      const { error } = await (supabase.from('work_orders') as any)
        .update({ materials: updated })
        .eq('id', id);

      if (error) throw error;
      setOrder({ ...order, materials: updated });
      setMaterialName('');
      setMaterialQty('1');
      setShowAddMaterial(false);
      showToast('Material added');
    } catch (err) {
      console.error('Error adding material:', err);
      showToast('Failed to add material');
    } finally {
      setAddingMaterial(false);
    }
  };

  const removeMaterial = async (item: string) => {
    try {
      const updated = { ...order.materials };
      delete updated[item];
      const { error } = await (supabase.from('work_orders') as any)
        .update({ materials: updated })
        .eq('id', id);
      if (error) throw error;
      setOrder({ ...order, materials: updated });
      showToast('Material removed');
    } catch {
      showToast('Failed to remove material');
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-4 border-accent border-t-transparent"></div>
    </div>
  );

  if (!order) return (
    <div className="min-h-screen bg-slate-50 p-6 flex flex-col items-center justify-center text-center space-y-4">
      <div className="h-16 w-16 bg-white rounded-2xl flex items-center justify-center text-slate-200 shadow-sm">
        <ClipboardList size={32} />
      </div>
      <p className="text-slate-500 font-bold">Work order not found</p>
      <button onClick={() => navigate(-1)} className="text-accent font-bold">Go Back</button>
    </div>
  );

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed': return 'bg-emerald-500';
      case 'in_progress': return 'bg-blue-500';
      case 'scheduled': return 'bg-amber-500';
      default: return 'bg-slate-400';
    }
  };

  const inputCls = 'w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-accent bg-slate-50';

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
              <h1 className="text-lg font-bold text-primary truncate max-w-[200px]">{order.title}</h1>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">WO #{order.id.slice(0, 8)}</p>
            </div>
          </div>
          <span className={`text-[10px] font-bold px-3 py-1 rounded-full uppercase text-white ${getStatusColor(order.status)}`}>
            {order.status.replace('_', ' ')}
          </span>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Customer Card */}
        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Customer Information</h2>
            <button onClick={openEdit} className="text-accent text-xs font-bold">Edit</button>
          </div>
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center text-primary font-bold">
              {order.contacts?.first_name?.[0]}{order.contacts?.last_name?.[0]}
            </div>
            <div>
              <p className="font-bold text-primary">{order.contacts?.first_name} {order.contacts?.last_name}</p>
              <p className="text-xs text-slate-500">{order.contacts?.address}</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 pt-2">
            <a
              href={`tel:${order.contacts?.phone1}`}
              className="flex flex-col items-center gap-2 p-3 bg-slate-50 rounded-2xl active:scale-95 transition-transform"
            >
              <Phone size={18} className="text-blue-500" />
              <span className="text-[9px] font-bold text-slate-500 uppercase">Call</span>
            </a>
            <a
              href={`sms:${order.contacts?.phone1}`}
              className="flex flex-col items-center gap-2 p-3 bg-slate-50 rounded-2xl active:scale-95 transition-transform"
            >
              <MessageSquare size={18} className="text-emerald-500" />
              <span className="text-[9px] font-bold text-slate-500 uppercase">SMS</span>
            </a>
            <a
              href={`mailto:${order.contacts?.email}`}
              className="flex flex-col items-center gap-2 p-3 bg-slate-50 rounded-2xl active:scale-95 transition-transform"
            >
              <Mail size={18} className="text-amber-500" />
              <span className="text-[9px] font-bold text-slate-500 uppercase">Email</span>
            </a>
          </div>
        </div>

        {/* Job Details */}
        <div className="card p-5 space-y-4">
          <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Job Details</h2>
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-500 shrink-0">
                <Calendar size={20} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Scheduled Date</p>
                <p className="text-sm font-bold text-primary">
                  {order.scheduled_date ? new Date(order.scheduled_date).toLocaleDateString('en-US', { dateStyle: 'long' }) : 'Not scheduled'}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-500 shrink-0">
                <User size={20} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Assigned Crew</p>
                <p className="text-sm font-bold text-primary">{order.assigned_to || 'Unassigned'}</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-500 shrink-0">
                <ClipboardList size={20} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Description</p>
                <p className="text-sm text-slate-600 leading-relaxed">{order.description || 'No description provided'}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Materials Section */}
        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Materials</h2>
            <button onClick={() => setShowAddMaterial(true)} className="text-accent text-xs font-bold">Add Item</button>
          </div>
          {order.materials && typeof order.materials === 'object' && Object.keys(order.materials).length > 0 ? (
            <div className="space-y-3">
              {Object.entries(order.materials).map(([item, qty]: [string, any], i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400">
                      <Package size={16} />
                    </div>
                    <span className="text-sm font-medium text-primary">{item}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-slate-600">x{qty}</span>
                    <button
                      onClick={() => removeMaterial(item)}
                      className="p-1 text-slate-300 active:text-red-400 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 italic">No materials listed</p>
          )}
        </div>

        {/* Costs Summary */}
        <div className="card p-5 space-y-4 bg-slate-900 text-white">
          <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Financial Summary</h2>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Labor Cost</span>
              <span className="font-bold">{formatCurrency(order.labor_cost || 0)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Material Cost</span>
              <span className="font-bold">{formatCurrency(order.material_cost || 0)}</span>
            </div>
            <div className="pt-3 border-t border-white/10 flex justify-between items-baseline">
              <span className="text-xs font-bold uppercase tracking-widest">Total Cost</span>
              <span className="text-xl font-bold text-accent">{formatCurrency((order.labor_cost || 0) + (order.material_cost || 0))}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-100 p-4 flex gap-3 z-20">
        <button
          onClick={() => updateStatus('in_progress')}
          className="flex-1 bg-slate-100 text-primary py-4 rounded-2xl text-xs font-bold uppercase tracking-widest active:scale-95 transition-transform"
        >
          Start Job
        </button>
        <button
          onClick={() => updateStatus('completed')}
          className="flex-1 bg-accent text-white py-4 rounded-2xl text-xs font-bold uppercase tracking-widest active:scale-95 transition-transform flex items-center justify-center gap-2"
        >
          <CheckCircle2 size={18} />
          Complete Job
        </button>
      </div>

      {/* Edit Bottom Sheet */}
      <AnimatePresence>
        {showEdit && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-30"
              onClick={() => setShowEdit(false)}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed bottom-0 inset-x-0 bg-white rounded-t-3xl z-40 max-h-[85vh] overflow-y-auto"
            >
              <div className="p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-primary">Edit Work Order</h2>
                  <button onClick={() => setShowEdit(false)} className="p-2 text-slate-400">
                    <X size={20} />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Title</label>
                    <input
                      className={inputCls}
                      value={editForm.title}
                      onChange={e => setEditForm({ ...editForm, title: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Scheduled Date</label>
                    <input
                      type="date"
                      className={inputCls}
                      value={editForm.scheduled_date}
                      onChange={e => setEditForm({ ...editForm, scheduled_date: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Assigned Crew</label>
                    <input
                      className={inputCls}
                      value={editForm.assigned_to}
                      onChange={e => setEditForm({ ...editForm, assigned_to: e.target.value })}
                      placeholder="Crew name or ID"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Description</label>
                    <textarea
                      className={`${inputCls} resize-none`}
                      rows={3}
                      value={editForm.description}
                      onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Labor Cost ($)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className={inputCls}
                        value={editForm.labor_cost}
                        onChange={e => setEditForm({ ...editForm, labor_cost: e.target.value })}
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Material Cost ($)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className={inputCls}
                        value={editForm.material_cost}
                        onChange={e => setEditForm({ ...editForm, material_cost: e.target.value })}
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                </div>

                <button
                  onClick={saveEdit}
                  disabled={saving || !editForm.title?.trim()}
                  className="w-full bg-accent text-white py-4 rounded-2xl text-sm font-bold uppercase tracking-widest active:scale-95 transition-transform flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {saving ? (
                    <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  ) : (
                    <Save size={16} />
                  )}
                  Save Changes
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Add Material Bottom Sheet */}
      <AnimatePresence>
        {showAddMaterial && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-30"
              onClick={() => setShowAddMaterial(false)}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed bottom-0 inset-x-0 bg-white rounded-t-3xl z-40"
            >
              <div className="p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-primary">Add Material</h2>
                  <button onClick={() => setShowAddMaterial(false)} className="p-2 text-slate-400">
                    <X size={20} />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Item Name</label>
                    <input
                      className={inputCls}
                      value={materialName}
                      onChange={e => setMaterialName(e.target.value)}
                      placeholder="e.g. Architectural Shingles"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Quantity</label>
                    <input
                      type="number"
                      min="1"
                      className={inputCls}
                      value={materialQty}
                      onChange={e => setMaterialQty(e.target.value)}
                    />
                  </div>
                </div>

                <button
                  onClick={addMaterial}
                  disabled={addingMaterial || !materialName.trim()}
                  className="w-full bg-accent text-white py-4 rounded-2xl text-sm font-bold uppercase tracking-widest active:scale-95 transition-transform flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {addingMaterial ? (
                    <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  ) : (
                    <Plus size={16} />
                  )}
                  Add Material
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

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
