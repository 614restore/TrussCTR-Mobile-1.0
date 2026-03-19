import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Download, Eraser, FileText } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { buildStoredDocumentUrl } from '../lib/documentAccess';
import { generateAndDownloadPdf, uploadToAvailableBucket } from '../lib/pdfService';
import { buildDefaultQuoteMeta, parseEstimateNotes } from '../lib/estimateQuote';
import { formatCurrency } from '../lib/utils';

function SignaturePad({
  title,
  helperText,
  onChange,
}: {
  title: string;
  helperText: string;
  onChange: (dataUrl: string | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hasSigned, setHasSigned] = useState(false);
  const drawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const width = canvas.offsetWidth || 320;
    const height = 180;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  const getPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const begin = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const point = getPoint(event);
    if (!canvas || !ctx || !point) return;
    drawing.current = true;
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
  };

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const point = getPoint(event);
    if (!canvas || !ctx || !point) return;
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    const dataUrl = canvas.toDataURL('image/png');
    setHasSigned(true);
    onChange(dataUrl);
  };

  const end = () => {
    drawing.current = false;
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasSigned(false);
    onChange(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-primary">{title}</p>
          <p className="text-[11px] text-slate-500">{helperText}</p>
        </div>
        <button type="button" onClick={clear} className="flex items-center gap-1 text-[11px] font-bold text-slate-400">
          <Eraser size={14} />
          Clear
        </button>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-3">
        <canvas
          ref={canvasRef}
          className="w-full rounded-xl border border-dashed border-slate-200 bg-white touch-none"
          onPointerDown={begin}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
        />
      </div>
      {!hasSigned && <p className="text-[11px] font-medium text-slate-400">Draw the signature above before saving the quote.</p>}
    </div>
  );
}

async function buildSignedEstimateBlob({
  companyName,
  companyAddress,
  companyPhone,
  companyEmail,
  estimateTitle,
  estimateNumber,
  customerName,
  propertyAddress,
  scopeSummary,
  items,
  subtotal,
  taxAmount,
  total,
  depositAmount,
  finalPaymentAmount,
  paymentTerms,
  warrantyPeriod,
  customerNotes,
  customerSignatureDataUrl,
  repSignatureDataUrl,
  repLabel,
}: any) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const left = 14;
  const right = pageWidth - 14;
  const maxWidth = right - left;
  let y = 16;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - 18) {
      pdf.addPage();
      y = 16;
    }
  };

  pdf.setFillColor(37, 99, 235);
  pdf.roundedRect(left, y, maxWidth, 24, 4, 4, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(18);
  pdf.text(companyName, left + 6, y + 10);
  pdf.setFontSize(8);
  pdf.text('CUSTOMER QUOTE / SERVICE AGREEMENT', left + 6, y + 17);
  y += 30;

  pdf.setTextColor(17, 24, 39);
  pdf.setFontSize(20);
  pdf.text(estimateTitle, left, y);
  pdf.setFontSize(9);
  pdf.setTextColor(100, 116, 139);
  pdf.text(`Estimate # ${estimateNumber}`, left, y + 6);
  y += 14;

  pdf.setDrawColor(229, 231, 235);
  pdf.line(left, y, right, y);
  y += 8;

  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(55, 65, 81);
  pdf.setFontSize(9);
  pdf.text('CUSTOMER', left, y);
  pdf.text('CONTRACTOR', left + 98, y);
  y += 5;
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(15, 23, 42);
  pdf.setFontSize(10);
  pdf.text(pdf.splitTextToSize(`${customerName}\n${propertyAddress}`, 86), left, y);
  pdf.text(pdf.splitTextToSize(`${companyName}\n${companyAddress}\n${companyPhone}${companyEmail ? ` • ${companyEmail}` : ''}`, 86), left + 98, y);
  y += 24;

  ensureSpace(16);
  pdf.setFillColor(239, 246, 255);
  pdf.roundedRect(left, y, maxWidth, 16, 3, 3, 'F');
  pdf.setTextColor(30, 64, 175);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.text('SCOPE SUMMARY', left + 4, y + 5);
  pdf.setTextColor(51, 65, 85);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text(pdf.splitTextToSize(scopeSummary, maxWidth - 8), left + 4, y + 10);
  y += 22;

  ensureSpace(18);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.setTextColor(71, 85, 105);
  pdf.text('DESCRIPTION', left, y);
  pdf.text('QTY', left + 108, y);
  pdf.text('RATE', left + 132, y);
  pdf.text('TOTAL', left + 162, y);
  y += 4;
  pdf.setDrawColor(203, 213, 225);
  pdf.line(left, y, right, y);
  y += 6;

  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(15, 23, 42);
  pdf.setFontSize(9);

  for (const item of items) {
    const descriptionLines = pdf.splitTextToSize(String(item.description || ''), 100);
    const rowHeight = Math.max(6, descriptionLines.length * 4 + 2);
    ensureSpace(rowHeight + 2);
    pdf.text(descriptionLines, left, y);
    pdf.text(String(item.quantity ?? ''), left + 108, y);
    pdf.text(formatCurrency(item.rate ?? item.unit_price ?? 0), left + 132, y);
    pdf.text(formatCurrency(item.amount ?? item.total ?? 0), left + 162, y);
    y += rowHeight;
    pdf.setDrawColor(241, 245, 249);
    pdf.line(left, y, right, y);
    y += 4;
  }

  ensureSpace(30);
  const totalsX = right - 64;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text('Subtotal', totalsX, y);
  pdf.text(formatCurrency(subtotal), right, y, { align: 'right' });
  y += 5;
  pdf.text('Tax', totalsX, y);
  pdf.text(formatCurrency(taxAmount), right, y, { align: 'right' });
  y += 5;
  pdf.text('Deposit', totalsX, y);
  pdf.text(formatCurrency(depositAmount), right, y, { align: 'right' });
  y += 5;
  pdf.text('Balance Due', totalsX, y);
  pdf.text(formatCurrency(finalPaymentAmount), right, y, { align: 'right' });
  y += 7;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.text('TOTAL', totalsX, y);
  pdf.text(formatCurrency(total), right, y, { align: 'right' });
  y += 10;

  ensureSpace(44);
  pdf.setFillColor(254, 243, 199);
  pdf.roundedRect(left, y, maxWidth, 28, 3, 3, 'F');
  pdf.setTextColor(120, 53, 15);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.text('TERMS & WARRANTY', left + 4, y + 5);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.5);
  pdf.text(pdf.splitTextToSize(`${paymentTerms}\nWarranty: ${warrantyPeriod}\n${customerNotes}`, maxWidth - 8), left + 4, y + 10);
  y += 34;

  ensureSpace(42);
  pdf.setDrawColor(203, 213, 225);
  pdf.line(left, y, right, y);
  y += 8;
  pdf.setTextColor(100, 116, 139);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.text('CUSTOMER SIGNATURE', left, y);
  pdf.text('SALES REP SIGNATURE', left + 98, y);
  y += 4;
  pdf.addImage(customerSignatureDataUrl, 'PNG', left, y, 55, 22, undefined, 'FAST');
  pdf.addImage(repSignatureDataUrl, 'PNG', left + 98, y, 55, 22, undefined, 'FAST');
  y += 28;
  pdf.setDrawColor(15, 23, 42);
  pdf.line(left, y, left + 60, y);
  pdf.line(left + 98, y, left + 158, y);
  y += 5;
  pdf.setTextColor(71, 85, 105);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text(customerName || 'Customer', left, y);
  pdf.text(repLabel, left + 98, y);

  return pdf.output('blob');
}

export default function EstimateSigner() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [estimate, setEstimate] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [signed, setSigned] = useState(false);
  const [savedDocumentId, setSavedDocumentId] = useState<string | null>(null);
  const [customerSignatureDataUrl, setCustomerSignatureDataUrl] = useState<string | null>(null);
  const [repSignatureDataUrl, setRepSignatureDataUrl] = useState<string | null>(null);

  useEffect(() => {
    const fetchEstimate = async () => {
      if (!id) return;
      try {
        const { data, error } = await supabase
          .from('estimates')
          .select(`
            *,
            contacts (
              first_name,
              last_name,
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
        console.error('Error loading estimate for signing:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchEstimate();
  }, [id]);

  const repLabel = useMemo(() => profile?.role || 'Sales Representative', [profile]);

  const handleSign = async () => {
    if (!estimate || !profile || !customerSignatureDataUrl || !repSignatureDataUrl) return;
    setSaving(true);
    try {
      const parsedNotes = parseEstimateNotes(estimate.notes);
      const quoteMeta = parsedNotes.meta || buildDefaultQuoteMeta(Number(estimate.total || 0));
      const customerName = `${estimate.contacts?.first_name || ''} ${estimate.contacts?.last_name || ''}`.trim();
      const propertyAddress = [estimate.contacts?.address, estimate.contacts?.city, estimate.contacts?.state, estimate.contacts?.zip].filter(Boolean).join(', ');
      const companyName = estimate.companies?.name || profile?.companies?.name || 'TrussCTR';
      const companyAddress = estimate.companies?.address || profile?.companies?.address || 'Company address pending';
      const companyPhone = estimate.companies?.phone || profile?.companies?.phone || '';
      const companyEmail = estimate.companies?.email || profile?.companies?.email || '';
      const estimateNumber = estimate.estimate_number || `EST-${String(estimate.id).slice(0, 8).toUpperCase()}`;

      const customerSigBlob = await (await fetch(customerSignatureDataUrl)).blob();
      const repSigBlob = await (await fetch(repSignatureDataUrl)).blob();
      const uploadedCustomerSignature = await uploadToAvailableBucket(`${estimate.contact_id}/estimate-customer-signature-${Date.now()}.png`, customerSigBlob, 'image/png');
      const uploadedRepSignature = await uploadToAvailableBucket(`${estimate.contact_id}/estimate-rep-signature-${Date.now()}.png`, repSigBlob, 'image/png');

      const pdfBlob = await buildSignedEstimateBlob({
        companyName,
        companyAddress,
        companyPhone,
        companyEmail,
        estimateTitle: estimate.title,
        estimateNumber,
        customerName,
        propertyAddress,
        scopeSummary: quoteMeta.scopeSummary,
        items: estimate.items || [],
        subtotal: Number(estimate.subtotal || 0),
        taxAmount: Number(estimate.tax_amount || 0),
        total: Number(estimate.total || 0),
        depositAmount: Number(quoteMeta.depositAmount || 0),
        finalPaymentAmount: Number(quoteMeta.finalPaymentAmount || 0),
        paymentTerms: quoteMeta.paymentTerms,
        warrantyPeriod: quoteMeta.warrantyPeriod,
        customerNotes: parsedNotes.plainNotes || quoteMeta.customerMessage,
        customerSignatureDataUrl,
        repSignatureDataUrl,
        repLabel,
      });
      const uploadedPdf = await uploadToAvailableBucket(`${estimate.contact_id}/signed-estimate-${estimate.id}-${Date.now()}.pdf`, pdfBlob, 'application/pdf');

      const signedQuoteBaseName = `Signed Quote ${estimateNumber}`;
      const signedQuoteName = `${signedQuoteBaseName} - ${customerName || 'Customer'}`;
      const { data: savedDoc, error: signedDocError } = await (supabase.from('documents') as any)
        .insert({
          contact_id: estimate.contact_id,
          company_id: estimate.company_id,
          name: signedQuoteName,
          type: 'estimate',
          url: buildStoredDocumentUrl(uploadedPdf.publicUrl, uploadedPdf.bucket, uploadedPdf.path),
          size: pdfBlob.size,
          uploaded_by: profile.id,
        })
        .select('id')
        .single();
      if (signedDocError) throw signedDocError;

      const { error: customerSigRecordError } = await (supabase.from('documents') as any).insert({
        contact_id: estimate.contact_id,
        company_id: estimate.company_id,
        name: `${signedQuoteBaseName} Customer Signature - ${customerName || 'Customer'}`,
        type: 'other',
        url: buildStoredDocumentUrl(uploadedCustomerSignature.publicUrl, uploadedCustomerSignature.bucket, uploadedCustomerSignature.path),
        size: customerSigBlob.size,
        uploaded_by: profile.id,
      });
      if (customerSigRecordError) throw customerSigRecordError;

      const { error: repSigRecordError } = await (supabase.from('documents') as any).insert({
        contact_id: estimate.contact_id,
        company_id: estimate.company_id,
        name: `${signedQuoteBaseName} Contractor Signature - ${customerName || 'Customer'}`,
        type: 'other',
        url: buildStoredDocumentUrl(uploadedRepSignature.publicUrl, uploadedRepSignature.bucket, uploadedRepSignature.path),
        size: repSigBlob.size,
        uploaded_by: profile.id,
      });
      if (repSigRecordError) throw repSigRecordError;

      const notes = `${estimate.notes || ''}\n\nSigned Quote PDF: ${signedQuoteName}`;
      await (supabase.from('estimates') as any).update({ status: 'approved', notes }).eq('id', estimate.id);
      await (supabase.from('contacts') as any).update({ status: 'approved', project_value: estimate.total }).eq('id', estimate.contact_id);
      await (supabase.from('communications') as any).insert({
        contact_id: estimate.contact_id,
        company_id: estimate.company_id,
        type: 'note',
        content: `Estimate signed in mobile app: ${estimate.title}. Signed PDF and signature files saved.`,
        user_id: profile.id,
        direction: 'outbound',
      });

      setSavedDocumentId(savedDoc?.id || null);
      setSigned(true);
    } catch (err) {
      console.error('Error signing estimate:', err);
      alert(`Unable to save signed quote. ${(err as Error)?.message || ''}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadPdf = async () => {
    const printable = document.getElementById('quote-sign-printable');
    if (!printable || !estimate) return;
    try {
      await generateAndDownloadPdf(printable as HTMLElement, `${String(estimate.title || 'signed-quote').replace(/\s+/g, '-').toLowerCase()}.pdf`);
    } catch (err) {
      console.error('Error downloading signed estimate PDF:', err);
      alert('Unable to create the PDF download on this device.');
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-4 border-accent border-t-transparent" /></div>;
  }

  if (!estimate) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <p className="text-lg font-bold text-primary">Quote not found</p>
        <button onClick={() => navigate(-1)} className="mt-4 rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-white">Go Back</button>
      </div>
    );
  }

  const customerName = `${estimate.contacts?.first_name || ''} ${estimate.contacts?.last_name || ''}`.trim();
  const propertyAddress = [estimate.contacts?.address, estimate.contacts?.city, estimate.contacts?.state, estimate.contacts?.zip].filter(Boolean).join(', ');
  const parsedNotes = parseEstimateNotes(estimate.notes);
  const quoteMeta = parsedNotes.meta || buildDefaultQuoteMeta(Number(estimate.total || 0));

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-slate-100">
        <nav className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-100 bg-white p-4 shadow-sm">
          <div className="flex min-w-0 items-center gap-4">
            <button onClick={() => navigate(-1)} className="p-1 rounded-full hover:bg-slate-100 transition-colors">
              <ArrowLeft size={24} />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-bold text-primary">{estimate.title}</h1>
              <p className="text-[10px] font-bold uppercase text-emerald-600">Sign And Save Quote</p>
            </div>
          </div>
          <button onClick={handleDownloadPdf} className="p-2 text-slate-400">
            <Download size={20} />
          </button>
        </nav>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="rounded-2xl bg-slate-900 p-5 text-white">
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">Customer Quote</p>
              <h2 className="mt-2 text-2xl font-black">{estimate.title}</h2>
              <p className="mt-2 text-sm text-slate-300">{quoteMeta.scopeSummary}</p>
            </div>
            <div className="mt-4 grid gap-4">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Customer</p>
                <p className="mt-2 text-sm font-bold text-primary">{customerName || 'Customer'}</p>
                <p className="text-xs text-slate-500">{propertyAddress}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Total</p>
                <p className="mt-2 text-2xl font-black text-primary">{formatCurrency(estimate.total)}</p>
                <p className="text-xs text-slate-500">Deposit {formatCurrency(quoteMeta.depositAmount)} • Balance {formatCurrency(quoteMeta.finalPaymentAmount)}</p>
              </div>
            </div>
            {signed && (
              <div className="mt-4 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-white">
                  <Check size={20} />
                </div>
                <div>
                  <p className="text-sm font-bold text-emerald-700">Signed quote saved</p>
                  <p className="text-[11px] text-emerald-600">The signed PDF and signatures are now in Documents.</p>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 space-y-4 shadow-sm">
            <SignaturePad title="Customer Signature" helperText="Customer / homeowner signature" onChange={setCustomerSignatureDataUrl} />
            <SignaturePad title="Sales Rep Signature" helperText={`${repLabel} signature`} onChange={setRepSignatureDataUrl} />
            {signed && savedDocumentId && (
              <button
                type="button"
                onClick={() => navigate(`/documents/view/${savedDocumentId}`)}
                className="w-full rounded-2xl bg-slate-100 py-3 text-sm font-bold text-primary"
              >
                View Signed Quote
              </button>
            )}
          </div>
        </div>

        <div className="border-t border-slate-100 bg-white p-6 shadow-[0_-4px_10px_rgba(0,0,0,0.04)]">
          <button
            type="button"
            disabled={!customerSignatureDataUrl || !repSignatureDataUrl || saving || signed}
            onClick={handleSign}
            className="w-full rounded-2xl bg-primary py-4 text-sm font-bold text-white disabled:opacity-50"
          >
            {saving ? 'Saving Signed Quote...' : signed ? 'Quote Signed' : 'Sign And Save Quote'}
          </button>
        </div>
      </div>

      <div className="fixed left-[-9999px] top-0 w-[794px]">
        <div id="quote-sign-printable" style={{ background: '#fff', color: '#0f172a', width: '794px', padding: '40px', fontFamily: 'Arial, sans-serif' }}>
          <div style={{ borderBottom: '3px solid #2563eb', paddingBottom: '18px', marginBottom: '24px' }}>
            <div style={{ fontSize: '26px', fontWeight: 700, color: '#2563eb' }}>{estimate.companies?.name || profile?.companies?.name || 'TrussCTR'}</div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: '#111827', marginTop: '12px' }}>{estimate.title}</div>
            <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '8px' }}>{customerName} • {propertyAddress}</div>
          </div>
          <div style={{ fontSize: '13px', marginBottom: '14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '12px 14px' }}>{quoteMeta.scopeSummary}</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '18px' }}>
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
        </div>
      </div>
    </div>
  );
}
