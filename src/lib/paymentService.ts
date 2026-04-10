/**
 * paymentService.ts
 * Handles payment recording, Stripe payment link generation,
 * timeline auto-notation, and receipt sending for TrussCTR Mobile.
 */

import { supabase } from './supabase';

export type PaymentMethod = 'cash' | 'check' | 'credit_card' | 'ach' | 'insurance_check' | 'stripe_link' | 'other';

export interface RecordPaymentParams {
  companyId: string;
  contactId: string;
  contactName: string;
  contactEmail?: string | null;
  workOrderId?: string | null;
  workOrderTitle?: string | null;
  workOrderNumber?: string | null;
  estimateId?: string | null;
  estimateTitle?: string | null;
  estimateNumber?: string | null;
  amount: number;
  paymentMethod: PaymentMethod;
  paymentDate: string;        // ISO string
  referenceNumber?: string;
  notes?: string;
  processedById: string;
  processedByName: string;
  stripePaymentLinkUrl?: string;
  stripePaymentLinkId?: string;
}

export interface PaymentRecord {
  id: string;
  amount: number;
  payment_method: PaymentMethod;
  payment_date: string;
  reference_number?: string;
  notes?: string;
  processed_by_name?: string;
  work_order_title?: string;
  work_order_number?: string;
  estimate_title?: string;
  estimate_number?: string;
  receipt_sent: boolean;
  receipt_sent_at?: string;
  stripe_payment_link_url?: string;
  created_at: string;
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  check: 'Check',
  credit_card: 'Credit Card',
  ach: 'ACH / Bank Transfer',
  insurance_check: 'Insurance Check',
  stripe_link: 'Payment Link (Stripe)',
  other: 'Other',
};

// ─── Record a payment ─────────────────────────────────────────────────────────
export async function recordPayment(params: RecordPaymentParams): Promise<{ id: string }> {
  const {
    companyId, contactId, contactName, workOrderId, workOrderTitle, workOrderNumber,
    estimateId, estimateTitle, estimateNumber,
    amount, paymentMethod, paymentDate, referenceNumber, notes,
    processedById, processedByName,
    stripePaymentLinkUrl, stripePaymentLinkId,
  } = params;

  // 1. Insert into payments table
  const { data, error } = await (supabase.from('payments') as any)
    .insert({
      company_id: companyId,
      contact_id: contactId,
      work_order_id: workOrderId || null,
      estimate_id: estimateId || null,
      amount,
      payment_method: paymentMethod,
      payment_date: paymentDate,
      reference_number: referenceNumber || null,
      notes: notes || null,
      processed_by: processedById,
      processed_by_name: processedByName,
      stripe_payment_link_url: stripePaymentLinkUrl || null,
      stripe_payment_link_id: stripePaymentLinkId || null,
      stripe_status: stripePaymentLinkId ? 'pending' : null,
    })
    .select('id')
    .single();

  if (error) throw error;

  // 2. Auto-notate customer timeline
  const jobRef = workOrderTitle
    ? `Work Order: ${workOrderTitle}${workOrderNumber ? ` (#${workOrderNumber})` : ''}`
    : estimateTitle
    ? `Estimate: ${estimateTitle}${estimateNumber ? ` (#${estimateNumber})` : ''}`
    : null;

  const methodLabel = PAYMENT_METHOD_LABELS[paymentMethod] || paymentMethod;

  let timelineContent = `💰 Payment of ${formatCurrency(amount)} received via ${methodLabel}.`;
  timelineContent += ` Processed by ${processedByName}.`;
  if (jobRef) timelineContent += ` ${jobRef}.`;
  if (referenceNumber) timelineContent += ` Ref: ${referenceNumber}.`;
  if (notes) timelineContent += ` Notes: ${notes}.`;
  if (stripePaymentLinkUrl) timelineContent += ` Payment link sent — awaiting completion.`;

  await (supabase.from('communications') as any).insert({
    company_id: companyId,
    contact_id: contactId,
    type: 'note',
    direction: 'internal',
    subject: `Payment Recorded — ${formatCurrency(amount)}`,
    content: timelineContent,
    user_id: processedById,
  });

  return { id: data.id };
}

// ─── Load payments for a contact ─────────────────────────────────────────────
export async function loadContactPayments(contactId: string): Promise<PaymentRecord[]> {
  const { data, error } = await (supabase.from('payments') as any)
    .select(`
      id, amount, payment_method, payment_date, reference_number, notes,
      processed_by_name, receipt_sent, receipt_sent_at, stripe_payment_link_url, created_at,
      work_orders(title, work_order_number),
      estimates(title, estimate_number)
    `)
    .eq('contact_id', contactId)
    .order('payment_date', { ascending: false });

  if (error) throw error;

  return (data || []).map((row: any) => ({
    id: row.id,
    amount: row.amount,
    payment_method: row.payment_method,
    payment_date: row.payment_date,
    reference_number: row.reference_number,
    notes: row.notes,
    processed_by_name: row.processed_by_name,
    work_order_title: row.work_orders?.title,
    work_order_number: row.work_orders?.work_order_number,
    estimate_title: row.estimates?.title,
    estimate_number: row.estimates?.estimate_number,
    receipt_sent: row.receipt_sent,
    receipt_sent_at: row.receipt_sent_at,
    stripe_payment_link_url: row.stripe_payment_link_url,
    created_at: row.created_at,
  }));
}

// ─── Send receipt email ───────────────────────────────────────────────────────
export async function sendPaymentReceipt(params: {
  paymentId: string;
  contactName: string;
  contactEmail: string;
  amount: number;
  paymentMethod: PaymentMethod;
  paymentDate: string;
  referenceNumber?: string;
  companyName?: string;
  jobRef?: string;
  processedByName?: string;
}): Promise<void> {
  const {
    paymentId, contactName, contactEmail, amount, paymentMethod,
    paymentDate, referenceNumber, companyName, jobRef, processedByName,
  } = params;

  const methodLabel = PAYMENT_METHOD_LABELS[paymentMethod] || paymentMethod;
  const formattedDate = new Date(paymentDate).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    </head>
    <body style="font-family: Arial, sans-serif; background: #f9fafb; margin: 0; padding: 24px;">
      <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.1);">

        <!-- Header -->
        <div style="background: #1e293b; padding: 28px 32px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 22px; font-weight: 700;">
            ${companyName || 'TrussCTR'}
          </h1>
          <p style="color: #94a3b8; margin: 6px 0 0; font-size: 14px;">Payment Receipt</p>
        </div>

        <!-- Amount -->
        <div style="background: #f0fdf4; border-bottom: 1px solid #dcfce7; padding: 28px 32px; text-align: center;">
          <p style="color: #16a34a; margin: 0; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Amount Paid</p>
          <p style="color: #15803d; margin: 8px 0 0; font-size: 40px; font-weight: 800;">${formatCurrency(amount)}</p>
        </div>

        <!-- Details -->
        <div style="padding: 28px 32px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Customer</td>
              <td style="padding: 8px 0; color: #1e293b; font-size: 14px; font-weight: 600; text-align: right;">${contactName}</td>
            </tr>
            <tr style="border-top: 1px solid #f1f5f9;">
              <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Payment Method</td>
              <td style="padding: 8px 0; color: #1e293b; font-size: 14px; font-weight: 600; text-align: right;">${methodLabel}</td>
            </tr>
            <tr style="border-top: 1px solid #f1f5f9;">
              <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Date</td>
              <td style="padding: 8px 0; color: #1e293b; font-size: 14px; font-weight: 600; text-align: right;">${formattedDate}</td>
            </tr>
            ${referenceNumber ? `
            <tr style="border-top: 1px solid #f1f5f9;">
              <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Reference #</td>
              <td style="padding: 8px 0; color: #1e293b; font-size: 14px; font-weight: 600; text-align: right;">${referenceNumber}</td>
            </tr>` : ''}
            ${jobRef ? `
            <tr style="border-top: 1px solid #f1f5f9;">
              <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Job</td>
              <td style="padding: 8px 0; color: #1e293b; font-size: 14px; font-weight: 600; text-align: right;">${jobRef}</td>
            </tr>` : ''}
            ${processedByName ? `
            <tr style="border-top: 1px solid #f1f5f9;">
              <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Processed By</td>
              <td style="padding: 8px 0; color: #1e293b; font-size: 14px; font-weight: 600; text-align: right;">${processedByName}</td>
            </tr>` : ''}
          </table>
        </div>

        <!-- Footer -->
        <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 32px; text-align: center;">
          <p style="color: #94a3b8; font-size: 12px; margin: 0;">
            Thank you for your payment. Please keep this receipt for your records.
          </p>
        </div>

      </div>
    </body>
    </html>
  `;

  // Send via email API
  const emailApiUrl = (import.meta as any).env?.VITE_EMAIL_API_BASE_URL;
  if (!emailApiUrl) {
    console.warn('[paymentService] No email API configured — skipping receipt email');
    return;
  }

  const response = await fetch(`${emailApiUrl}/api/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: contactEmail,
      subject: `Payment Receipt — ${formatCurrency(amount)} — ${companyName || 'TrussCTR'}`,
      html,
    }),
  });

  if (!response.ok) throw new Error('Failed to send receipt email');

  // Mark receipt as sent
  await (supabase.from('payments') as any)
    .update({ receipt_sent: true, receipt_sent_at: new Date().toISOString(), receipt_sent_to: contactEmail })
    .eq('id', paymentId);
}

// ─── Generate Stripe Payment Link ────────────────────────────────────────────
export async function createStripePaymentLink(params: {
  companyId: string;
  amount: number;
  description: string;
  contactName: string;
  contactEmail?: string;
}): Promise<{ url: string; id: string }> {
  // Load Stripe credentials from company_integrations
  const { data: integration, error } = await (supabase.from('company_integrations') as any)
    .select('credentials, is_active')
    .eq('company_id', params.companyId)
    .eq('integration_type', 'stripe')
    .maybeSingle();

  if (error || !integration?.is_active) {
    throw new Error('Stripe is not connected. Set up Stripe in Integrations first.');
  }

  const secretKey = integration.credentials?.secretKey;
  if (!secretKey) throw new Error('Stripe secret key not found.');

  const amountInCents = Math.round(params.amount * 100);

  // Create a Stripe Price (inline product)
  const priceRes = await fetch('https://api.stripe.com/v1/prices', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      'unit_amount': String(amountInCents),
      'currency': 'usd',
      'product_data[name]': params.description,
    }),
  });

  if (!priceRes.ok) {
    const err = await priceRes.json();
    throw new Error(err.error?.message || 'Failed to create Stripe price');
  }

  const price = await priceRes.json();

  // Create the Payment Link
  const linkRes = await fetch('https://api.stripe.com/v1/payment_links', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      'line_items[0][price]': price.id,
      'line_items[0][quantity]': '1',
      'metadata[contact_name]': params.contactName,
      'metadata[company_id]': params.companyId,
      ...(params.contactEmail ? { customer_email: params.contactEmail } : {}),
    }),
  });

  if (!linkRes.ok) {
    const err = await linkRes.json();
    throw new Error(err.error?.message || 'Failed to create Stripe payment link');
  }

  const link = await linkRes.json();
  return { url: link.url, id: link.id };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}
