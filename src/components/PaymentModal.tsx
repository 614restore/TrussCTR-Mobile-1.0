/**
 * PaymentModal.tsx
 * Full-screen payment modal for TrussCTR Mobile.
 * Supports: manual payment recording + Stripe payment link generation.
 * Auto-notates customer timeline on every payment.
 */

import React, { useState } from 'react';
import { X, DollarSign, CreditCard, Check, Link, Send, Loader2, CheckCircle } from 'lucide-react';
import {
  recordPayment,
  sendPaymentReceipt,
  createStripePaymentLink,
  PAYMENT_METHOD_LABELS,
  type PaymentMethod,
} from '../lib/paymentService';

interface PaymentModalProps {
  onClose: () => void;
  onSuccess: (paymentId: string) => void;
  // Contact context
  contactId: string;
  contactName: string;
  contactEmail?: string | null;
  companyId: string;
  companyName?: string;
  // Job context (optional but tracked when available)
  workOrderId?: string | null;
  workOrderTitle?: string | null;
  workOrderNumber?: string | null;
  estimateId?: string | null;
  estimateTitle?: string | null;
  estimateNumber?: string | null;
  estimateTotal?: number | null;
  // Who is recording
  processedById: string;
  processedByName: string;
}

const MANUAL_METHODS: { value: PaymentMethod; label: string; icon: React.ReactNode }[] = [
  { value: 'cash', label: 'Cash', icon: <DollarSign size={18} /> },
  { value: 'check', label: 'Check', icon: <Check size={18} /> },
  { value: 'credit_card', label: 'Credit Card', icon: <CreditCard size={18} /> },
  { value: 'ach', label: 'ACH / Bank Transfer', icon: <DollarSign size={18} /> },
  { value: 'insurance_check', label: 'Insurance Check', icon: <Check size={18} /> },
  { value: 'other', label: 'Other', icon: <DollarSign size={18} /> },
];

type Mode = 'manual' | 'stripe_link';

export default function PaymentModal({
  onClose, onSuccess,
  contactId, contactName, contactEmail, companyId, companyName,
  workOrderId, workOrderTitle, workOrderNumber,
  estimateId, estimateTitle, estimateNumber, estimateTotal,
  processedById, processedByName,
}: PaymentModalProps) {
  const [mode, setMode] = useState<Mode>('manual');
  const [amount, setAmount] = useState(estimateTotal ? String(estimateTotal) : '');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [sendReceipt, setSendReceipt] = useState(!!contactEmail);
  const [saving, setSaving] = useState(false);
  const [stripeLink, setStripeLink] = useState<string | null>(null);
  const [stripeLinkId, setStripeLinkId] = useState<string | null>(null);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const parsedAmount = parseFloat(amount);
  const isValidAmount = !isNaN(parsedAmount) && parsedAmount > 0;

  const jobRef = workOrderTitle
    ? `${workOrderTitle}${workOrderNumber ? ` (#${workOrderNumber})` : ''}`
    : estimateTitle
    ? `${estimateTitle}${estimateNumber ? ` (#${estimateNumber})` : ''}`
    : null;

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v);

  // ── Generate Stripe link ─────────────────────────────────────────────────
  const handleGenerateLink = async () => {
    if (!isValidAmount) { setErrorMsg('Please enter a valid amount.'); return; }
    setErrorMsg(null);
    setGeneratingLink(true);
    try {
      const desc = jobRef
        ? `Payment for ${contactName} — ${jobRef}`
        : `Payment for ${contactName}`;
      const { url, id } = await createStripePaymentLink({
        companyId,
        amount: parsedAmount,
        description: desc,
        contactName,
        contactEmail: contactEmail ?? undefined,
      });
      setStripeLink(url);
      setStripeLinkId(id);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to generate payment link.');
    } finally {
      setGeneratingLink(false);
    }
  };

  // Share the link natively
  const handleShareLink = async () => {
    if (!stripeLink) return;
    if (navigator.share) {
      await navigator.share({
        title: `Payment Request — ${formatCurrency(parsedAmount)}`,
        text: `Hi ${contactName}, please use this link to complete your payment of ${formatCurrency(parsedAmount)} to ${companyName || 'us'}.`,
        url: stripeLink,
      });
    } else {
      await navigator.clipboard.writeText(stripeLink);
      alert('Payment link copied to clipboard');
    }
  };

  // Record the Stripe link as a pending payment
  const handleRecordStripeLink = async () => {
    if (!stripeLink || !isValidAmount) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      const { id } = await recordPayment({
        companyId, contactId, contactName,
        contactEmail: contactEmail ?? null,
        workOrderId: workOrderId ?? null,
        workOrderTitle: workOrderTitle ?? null,
        workOrderNumber: workOrderNumber ?? null,
        estimateId: estimateId ?? null,
        estimateTitle: estimateTitle ?? null,
        estimateNumber: estimateNumber ?? null,
        amount: parsedAmount,
        paymentMethod: 'stripe_link',
        paymentDate: new Date().toISOString(),
        notes: notes || undefined,
        processedById,
        processedByName,
        stripePaymentLinkUrl: stripeLink,
        stripePaymentLinkId: stripeLinkId ?? undefined,
      });
      setSuccess(true);
      setTimeout(() => onSuccess(id), 1200);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to record payment link.');
    } finally {
      setSaving(false);
    }
  };

  // ── Record manual payment ────────────────────────────────────────────────
  const handleRecordManual = async () => {
    if (!isValidAmount) { setErrorMsg('Please enter a valid amount.'); return; }
    setSaving(true);
    setErrorMsg(null);
    try {
      const { id } = await recordPayment({
        companyId, contactId, contactName,
        contactEmail: contactEmail ?? null,
        workOrderId: workOrderId ?? null,
        workOrderTitle: workOrderTitle ?? null,
        workOrderNumber: workOrderNumber ?? null,
        estimateId: estimateId ?? null,
        estimateTitle: estimateTitle ?? null,
        estimateNumber: estimateNumber ?? null,
        amount: parsedAmount,
        paymentMethod: method,
        paymentDate: new Date(paymentDate).toISOString(),
        referenceNumber: referenceNumber.trim() || undefined,
        notes: notes.trim() || undefined,
        processedById,
        processedByName,
      });

      // Send receipt if requested and email available
      if (sendReceipt && contactEmail) {
        try {
          await sendPaymentReceipt({
            paymentId: id,
            contactName,
            contactEmail,
            amount: parsedAmount,
            paymentMethod: method,
            paymentDate: new Date(paymentDate).toISOString(),
            referenceNumber: referenceNumber.trim() || undefined,
            companyName,
            jobRef: jobRef ?? undefined,
            processedByName,
          });
        } catch (receiptErr) {
          console.warn('[PaymentModal] Receipt send failed (non-fatal):', receiptErr);
        }
      }

      setSuccess(true);
      setTimeout(() => onSuccess(id), 1200);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to record payment.');
    } finally {
      setSaving(false);
    }
  };

  // ── Success screen ────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-white rounded-3xl p-8 mx-4 flex flex-col items-center gap-4 shadow-xl">
          <CheckCircle size={56} className="text-emerald-500" />
          <p className="text-lg font-bold text-slate-800">Payment Recorded</p>
          <p className="text-sm text-slate-500 text-center">
            {formatCurrency(parsedAmount)} has been recorded and noted in {contactName}'s timeline.
            {sendReceipt && contactEmail ? ' Receipt sent.' : ''}
          </p>
        </div>
      </div>
    );
  }

  // ── Main modal ────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-12 pb-4 border-b border-slate-100">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Record Payment</h2>
          <p className="text-sm text-slate-500">{contactName}{jobRef ? ` — ${jobRef}` : ''}</p>
        </div>
        <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 transition-colors">
          <X size={22} className="text-slate-500" />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">

        {/* Mode toggle */}
        <div className="flex bg-slate-100 p-1 rounded-2xl">
          <button
            onClick={() => setMode('manual')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              mode === 'manual' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'
            }`}
          >
            <DollarSign size={16} />
            Record Received
          </button>
          <button
            onClick={() => setMode('stripe_link')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              mode === 'stripe_link' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'
            }`}
          >
            <Link size={16} />
            Request via Link
          </button>
        </div>

        {/* Amount (shared) */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
            Amount *
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-lg font-semibold">$</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 pl-8 pr-4 text-2xl font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
            />
          </div>
        </div>

        {/* ── MANUAL MODE ── */}
        {mode === 'manual' && (
          <>
            {/* Payment method */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">
                Payment Method *
              </label>
              <div className="grid grid-cols-2 gap-2">
                {MANUAL_METHODS.map((m) => (
                  <button
                    key={m.value}
                    onClick={() => setMethod(m.value)}
                    className={`flex items-center gap-2 px-4 py-3 rounded-2xl border text-sm font-semibold transition-all ${
                      method === m.value
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-slate-700 border-slate-200'
                    }`}
                  >
                    {m.icon}
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Date */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
                Payment Date *
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
              />
            </div>

            {/* Reference number */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
                Reference # <span className="text-slate-300 normal-case font-normal">(Check #, last 4 digits, etc.)</span>
              </label>
              <input
                type="text"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                placeholder="Optional"
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
                Notes <span className="text-slate-300 normal-case font-normal">(auto-added to customer timeline)</span>
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes..."
                rows={3}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
              />
            </div>

            {/* Send receipt toggle */}
            {contactEmail && (
              <button
                onClick={() => setSendReceipt((v) => !v)}
                className={`w-full flex items-center justify-between px-4 py-4 rounded-2xl border transition-all ${
                  sendReceipt ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Send size={18} className={sendReceipt ? 'text-emerald-600' : 'text-slate-400'} />
                  <div className="text-left">
                    <p className={`text-sm font-semibold ${sendReceipt ? 'text-emerald-800' : 'text-slate-700'}`}>
                      Send Receipt Email
                    </p>
                    <p className="text-xs text-slate-400">{contactEmail}</p>
                  </div>
                </div>
                <div className={`w-10 h-6 rounded-full transition-colors ${sendReceipt ? 'bg-emerald-500' : 'bg-slate-200'}`}>
                  <div className={`w-5 h-5 bg-white rounded-full shadow-sm mt-0.5 transition-transform ${sendReceipt ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </div>
              </button>
            )}
          </>
        )}

        {/* ── STRIPE LINK MODE ── */}
        {mode === 'stripe_link' && (
          <>
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional message to include in timeline..."
                rows={3}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
              />
            </div>

            {!stripeLink ? (
              <button
                onClick={handleGenerateLink}
                disabled={!isValidAmount || generatingLink}
                className="w-full flex items-center justify-center gap-2 py-4 bg-violet-600 text-white rounded-2xl font-semibold text-sm disabled:opacity-50 transition-opacity"
              >
                {generatingLink ? <Loader2 size={18} className="animate-spin" /> : <Link size={18} />}
                {generatingLink ? 'Generating...' : 'Generate Payment Link'}
              </button>
            ) : (
              <div className="space-y-3">
                <div className="bg-violet-50 border border-violet-200 rounded-2xl p-4">
                  <p className="text-xs font-bold text-violet-600 mb-1 uppercase tracking-wider">Payment Link Ready</p>
                  <p className="text-xs text-slate-500 break-all font-mono">{stripeLink}</p>
                </div>
                <button
                  onClick={handleShareLink}
                  className="w-full flex items-center justify-center gap-2 py-4 bg-violet-600 text-white rounded-2xl font-semibold text-sm"
                >
                  <Send size={18} />
                  Share Link with {contactName}
                </button>
                <button
                  onClick={handleRecordStripeLink}
                  disabled={saving}
                  className="w-full flex items-center justify-center gap-2 py-4 bg-slate-800 text-white rounded-2xl font-semibold text-sm disabled:opacity-50"
                >
                  {saving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                  {saving ? 'Recording...' : 'Record & Track in Timeline'}
                </button>
              </div>
            )}
          </>
        )}

        {errorMsg && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
            <p className="text-sm text-red-700">{errorMsg}</p>
          </div>
        )}

        {/* Processed by note */}
        <p className="text-xs text-slate-400 text-center">
          Recording as <strong>{processedByName}</strong> — will be noted in customer timeline
        </p>
      </div>

      {/* Bottom CTA — manual mode only */}
      {mode === 'manual' && (
        <div className="px-6 pb-10 pt-4 border-t border-slate-100">
          <button
            onClick={handleRecordManual}
            disabled={!isValidAmount || saving}
            className="w-full flex items-center justify-center gap-3 py-4 bg-emerald-600 text-white rounded-2xl font-bold text-base disabled:opacity-50 transition-opacity active:scale-95"
          >
            {saving ? (
              <><Loader2 size={20} className="animate-spin" /> Recording...</>
            ) : (
              <><DollarSign size={20} /> Record {isValidAmount ? formatCurrency(parsedAmount) : ''} Payment</>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

function formatCurrency(v: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v);
}
