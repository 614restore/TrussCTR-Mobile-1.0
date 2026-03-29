import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  CheckCircle,
  Download,
  Eraser,
  FileText,
  Share2,
  Shield,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { handleAutoMove } from '../lib/store';
import { generateAndDownloadPdf, uploadToAvailableBucket } from '../lib/pdfService';
import { jsPDF } from 'jspdf';
import { buildStoredDocumentUrl } from '../lib/documentAccess';
import { DEFAULT_DOC_CONTENT, getDocSections, requiresDeductibleAck, type DocumentContext } from '../lib/documentTemplates';

function addBusinessDays(date: Date, days: number) {
  const next = new Date(date);
  let remaining = days;
  while (remaining > 0) {
    next.setDate(next.getDate() + 1);
    const day = next.getDay();
    if (day !== 0 && day !== 6) {
      remaining -= 1;
    }
  }
  return next;
}

function extractState(address: string) {
  const match = address.match(/,\s*([A-Z]{2})\s+\d{5}(?:-\d{4})?$/i);
  return match?.[1]?.toUpperCase() || 'the applicable state';
}

async function buildSignedPdfBlob({
  title,
  subtitle,
  propertyAddress,
  companyAddress,
  today,
  sections,
  customerSignatureDataUrl,
  contractorSignatureDataUrl,
  contractorRoleLabel,
}: {
  title: string;
  subtitle: string;
  propertyAddress: string;
  companyAddress: string;
  today: string;
  sections: string[];
  customerSignatureDataUrl: string;
  contractorSignatureDataUrl: string;
  contractorRoleLabel: string;
}) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const left = 16;
  const right = pageWidth - 16;
  const maxWidth = right - left;
  let y = 18;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - 18) {
      pdf.addPage();
      y = 18;
    }
  };

  pdf.setFillColor(15, 23, 42);
  pdf.roundedRect(left, y, maxWidth, 26, 4, 4, 'F');
  pdf.setTextColor(148, 163, 184);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.text('LEGAL DOCUMENT', left + 6, y + 7);
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(18);
  pdf.text(title, left + 6, y + 15);
  pdf.setFontSize(10);
  pdf.setTextColor(203, 213, 225);
  pdf.text(subtitle, left + 6, y + 21);
  y += 34;

  pdf.setTextColor(100, 116, 139);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.text('PROPERTY', left, y);
  pdf.text('COMPANY LOCATION', left + 95, y);
  y += 5;

  pdf.setTextColor(15, 23, 42);
  pdf.setFontSize(11);
  pdf.text(pdf.splitTextToSize(propertyAddress || 'Address pending', 80), left, y);
  pdf.text(pdf.splitTextToSize(companyAddress, 80), left + 95, y);
  y += 16;

  pdf.setTextColor(100, 116, 139);
  pdf.setFontSize(8);
  pdf.text('EXECUTION DATE', left, y);
  y += 5;
  pdf.setTextColor(15, 23, 42);
  pdf.setFontSize(11);
  pdf.text(today, left, y);
  y += 10;

  pdf.setDrawColor(226, 232, 240);
  pdf.line(left, y, right, y);
  y += 8;

  pdf.setFont('times', 'normal');
  pdf.setFontSize(11);
  pdf.setTextColor(51, 65, 85);

  for (const section of sections) {
    const lines = pdf.splitTextToSize(section, maxWidth);
    ensureSpace(lines.length * 5 + 6);
    pdf.text(lines, left, y);
    y += lines.length * 5 + 6;
  }

  ensureSpace(60);
  pdf.setDrawColor(203, 213, 225);
  pdf.line(left, y, right, y);
  y += 8;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.setTextColor(100, 116, 139);
  pdf.text('CUSTOMER SIGNATURE', left, y);
  pdf.text('CONTRACTOR SIGNATURE', left + 95, y);
  y += 4;

  pdf.addImage(customerSignatureDataUrl, 'PNG', left, y, 55, 22, undefined, 'FAST');
  pdf.addImage(contractorSignatureDataUrl, 'PNG', left + 95, y, 55, 22, undefined, 'FAST');
  y += 28;

  pdf.setDrawColor(15, 23, 42);
  pdf.line(left, y, left + 60, y);
  pdf.line(left + 95, y, left + 155, y);
  y += 5;
  pdf.setTextColor(71, 85, 105);
  pdf.setFontSize(9);
  pdf.text('Customer / Homeowner', left, y);
  pdf.text(contractorRoleLabel, left + 95, y);
  pdf.text(today, left + 48, y + 5);
  pdf.text(today, left + 143, y + 5);

  return pdf.output('blob');
}

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
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };

  const startDrawing = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const point = getPoint(event);
    if (!ctx || !point) return;
    drawing.current = true;
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
  };

  const draw = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const point = getPoint(event);
    if (!ctx || !point) return;
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    if (!hasSigned) {
      setHasSigned(true);
    }
    onChange(canvas?.toDataURL('image/png') || null);
  };

  const stopDrawing = () => {
    drawing.current = false;
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(ratio, ratio);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width / ratio, canvas.height / ratio);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
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
        <button
          type="button"
          onClick={clear}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600"
        >
          <Eraser size={14} />
          Clear
        </button>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-3">
        <canvas
          ref={canvasRef}
          className="w-full rounded-xl border border-dashed border-slate-200 touch-none"
          onPointerDown={startDrawing}
          onPointerMove={draw}
          onPointerUp={stopDrawing}
          onPointerLeave={stopDrawing}
        />
      </div>
      {!hasSigned && (
        <p className="text-[11px] font-medium text-amber-700">
          Draw the signature above before generating the PDF.
        </p>
      )}
    </div>
  );
}

export default function DocumentSigner() {
  const { id, docType } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [contact, setContact] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [signed, setSigned] = useState(false);
  const [hasReadToBottom, setHasReadToBottom] = useState(false);
  const [saving, setSaving] = useState(false);
  const [customerSignatureDataUrl, setCustomerSignatureDataUrl] = useState<string | null>(null);
  const [contractorSignatureDataUrl, setContractorSignatureDataUrl] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [savedDocumentId, setSavedDocumentId] = useState<string | null>(null);
  const [additionalTerms, setAdditionalTerms] = useState('');
  const [deductibleAcknowledged, setDeductibleAcknowledged] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const printableRef = useRef<HTMLDivElement>(null);
  const doc = DEFAULT_DOC_CONTENT[docType || ''];
  const canEditTerms = profile?.role === 'owner' || profile?.role === 'admin';
  const needsDeductibleAck = requiresDeductibleAck(docType || '');

  useEffect(() => {
    const fetchContact = async () => {
      if (!id) return;
      try {
        const { data, error } = await supabase.from('contacts').select('*').eq('id', id).single();
        if (error) throw error;
        setContact(data);
      } catch (err) {
        console.error('Error loading contact for document signing:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchContact();
  }, [id]);

  const contractorRoleLabel = useMemo(() => {
    return profile?.role || 'Sales Representative';
  }, [profile]);

  const customerName = `${contact?.first_name || ''} ${contact?.last_name || ''}`.trim() || 'Customer';
  const propertyAddress = [contact?.address, contact?.city, contact?.state, contact?.zip]
    .filter(Boolean)
    .join(', ');
  const companyAddress = profile?.companies?.address || 'Company address pending';
  const companyState = extractState(companyAddress);
  // Use the contact's state for state-specific compliance (e.g. Ohio HSSA)
  const propertyState = (contact?.state || extractState(propertyAddress)).toUpperCase();
  const contractorName = (profile as any)?.companies?.name || '614 Restore LLC';
  const contractorPhone = (profile as any)?.companies?.phone || '(614) 808-8899';
  const todayDate = new Date();
  const today = todayDate.toLocaleDateString();
  const cancelDeadline = addBusinessDays(todayDate, 3).toLocaleDateString();
  const projectValue = contact?.project_value ? `$${Number(contact.project_value).toLocaleString()}` : 'TBD';
  const deductible = contact?.deductible ? `$${Number(contact.deductible).toLocaleString()}` : 'the applicable deductible';
  const renderedSections = getDocSections(profile?.company_id, docType || '', {
    companyAddress,
    companyState,
    propertyAddress: propertyAddress || 'Property address pending',
    propertyState,
    projectValue,
    deductible,
    today,
    cancelDeadline,
    contractorName,
    contractorPhone,
  });

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    if (scrollTop + clientHeight >= scrollHeight - 60) {
      setHasReadToBottom(true);
    }
  };

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const checkScrollRequirement = () => {
      setHasReadToBottom(node.scrollHeight <= node.clientHeight + 8);
    };
    const frame = window.requestAnimationFrame(checkScrollRequirement);
    window.addEventListener('resize', checkScrollRequirement);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', checkScrollRequirement);
    };
  }, [docType, propertyAddress, companyAddress]);

  const handleFinalSign = async () => {
    if (!id || !docType || !profile || !contact || !customerSignatureDataUrl || !contractorSignatureDataUrl) return;
    setSaving(true);

    try {
      const customerSignatureResponse = await fetch(customerSignatureDataUrl);
      const customerSignatureBlob = await customerSignatureResponse.blob();
      const customerSignatureFileName = `${docType}-customer-signature-${Date.now()}.png`;
      const customerSignatureStoragePath = `${id}/${customerSignatureFileName}`;
      const uploadedCustomerSignature = await uploadToAvailableBucket(
        customerSignatureStoragePath,
        customerSignatureBlob,
        'image/png'
      );

      const contractorSignatureResponse = await fetch(contractorSignatureDataUrl);
      const contractorSignatureBlob = await contractorSignatureResponse.blob();
      const contractorSignatureFileName = `${docType}-contractor-signature-${Date.now()}.png`;
      const contractorSignatureStoragePath = `${id}/${contractorSignatureFileName}`;
      const uploadedContractorSignature = await uploadToAvailableBucket(
        contractorSignatureStoragePath,
        contractorSignatureBlob,
        'image/png'
      );

      const filename = `${(doc?.title || 'document').replace(/\s+/g, '-').toLowerCase()}-${customerName.replace(/\s+/g, '-')}.pdf`;
      const pdfBlob = await buildSignedPdfBlob({
        title: doc?.title || 'Document',
        subtitle: doc?.subtitle || '',
        propertyAddress: propertyAddress || 'Address pending',
        companyAddress,
        today,
        sections: additionalTerms.trim()
          ? [...renderedSections, `ADDITIONAL TERMS & CONDITIONS\n\n${additionalTerms.trim()}`]
          : renderedSections,
        customerSignatureDataUrl,
        contractorSignatureDataUrl,
        contractorRoleLabel,
      });
      const generated = await uploadToAvailableBucket(
        `${id}/${docType}-${crypto.randomUUID()}-${Date.now()}.pdf`,
        pdfBlob,
        'application/pdf'
      );

      const storedPdfUrl = buildStoredDocumentUrl(generated.publicUrl, generated.bucket, generated.path);
      const storedCustomerSignatureUrl = buildStoredDocumentUrl(
        uploadedCustomerSignature.publicUrl,
        uploadedCustomerSignature.bucket,
        uploadedCustomerSignature.path
      );
      const storedContractorSignatureUrl = buildStoredDocumentUrl(
        uploadedContractorSignature.publicUrl,
        uploadedContractorSignature.bucket,
        uploadedContractorSignature.path
      );

      const { data: savedDocument, error: dbError } = await (supabase.from('documents') as any)
        .insert({
          contact_id: id,
          company_id: profile.company_id,
          name: `${doc?.title || 'Document'} - ${customerName}`,
          type: 'contract',
          url: storedPdfUrl,
          size: pdfBlob.size,
          uploaded_by: profile.id,
        })
        .select('id')
        .single();

      if (dbError) throw dbError;

      const { error: signatureRecordError } = await (supabase.from('documents') as any).insert({
        contact_id: id,
        company_id: profile.company_id,
        name: `${doc?.title || 'Document'} Customer Signature - ${customerName}`,
        type: 'other',
        url: storedCustomerSignatureUrl,
        size: customerSignatureBlob.size,
        uploaded_by: profile.id,
      });

      if (signatureRecordError) throw signatureRecordError;

      const { error: contractorSignatureRecordError } = await (supabase.from('documents') as any).insert({
        contact_id: id,
        company_id: profile.company_id,
        name: `${doc?.title || 'Document'} Contractor Signature - ${customerName}`,
        type: 'other',
        url: storedContractorSignatureUrl,
        size: contractorSignatureBlob.size,
        uploaded_by: profile.id,
      });

      if (contractorSignatureRecordError) throw contractorSignatureRecordError;

      await (supabase.from('communications') as any).insert({
        contact_id: id,
        company_id: profile.company_id,
        type: 'note',
        content: `Signed ${doc?.title || 'document'} generated in mobile app. PDF, customer signature, and contractor signature saved.`,
        user_id: profile.id,
        direction: 'outbound',
      });

      if (docType === 'contingency') await handleAutoMove(id, 'sign_contingency');
      if (docType === 'csa') await handleAutoMove(id, 'sign_csa');
      if (docType === 'completion') await handleAutoMove(id, 'sign_completion');

      setPdfUrl(generated.signedUrl || generated.publicUrl);
      setSavedDocumentId(savedDocument?.id || null);
      setSigned(true);
    } catch (err) {
      console.error('Error saving signed document:', err);
      alert(`Failed to generate the signed PDF. ${(err as Error)?.message || 'Check the documents bucket and try again.'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!printableRef.current || !doc) return;
    try {
      await generateAndDownloadPdf(
        printableRef.current,
        `${doc.title.replace(/\s+/g, '-').toLowerCase()}.pdf`
      );
    } catch (err) {
      console.error('Error downloading PDF:', err);
      alert('Unable to create the PDF download on this device.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-4 border-accent border-t-transparent" />
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <p className="text-lg font-bold text-primary">Document not found</p>
        <p className="mt-2 text-sm text-slate-500">This document type is not configured in the mobile app yet.</p>
        <button onClick={() => navigate(-1)} className="mt-6 rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-white">
          Go Back
        </button>
      </div>
    );
  }

  // ── Success screen — replaces the form after signing ────────────────────────
  if (signed) {
    const handleShare = async () => {
      if (!pdfUrl) return;
      try {
        if (navigator.share) {
          await navigator.share({ title: doc?.title, url: pdfUrl });
        } else {
          window.open(pdfUrl, '_blank', 'noopener,noreferrer');
        }
      } catch { /* user cancelled */ }
    };

    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          {/* Success icon */}
          <div className="flex flex-col items-center gap-3">
            <div className="w-20 h-20 rounded-full bg-emerald-500 flex items-center justify-center shadow-xl shadow-emerald-200">
              <CheckCircle size={40} className="text-white" />
            </div>
            <div className="text-center">
              <h1 className="text-xl font-bold text-primary">Document Signed &amp; Saved</h1>
              <p className="text-slate-500 text-sm mt-1">{doc?.title} has been generated and saved to this contact.</p>
            </div>
          </div>

          {/* Details card */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Document</span>
              <span className="font-semibold text-primary">{doc?.title}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Customer</span>
              <span className="font-semibold text-primary">{customerName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Date</span>
              <span className="font-semibold text-primary">{today}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            {/* After contingency or CSA, prompt for 3-Day Notice */}
            {(docType === 'contingency' || docType === 'csa') && (
              <button
                onClick={() => navigate(`/contacts/${id}/documents/rescind`)}
                className="w-full py-4 rounded-2xl bg-emerald-600 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-100 active:scale-[0.98] transition-transform"
              >
                <Shield size={16} /> Next: Sign 3-Day Notice →
              </button>
            )}

            {pdfUrl && (
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => savedDocumentId ? navigate(`/documents/view/${savedDocumentId}`) : window.open(pdfUrl, '_blank', 'noopener,noreferrer')}
                  className="py-3.5 rounded-2xl bg-slate-100 text-primary font-bold text-sm active:bg-slate-200"
                >
                  View PDF
                </button>
                <button
                  onClick={handleShare}
                  className="py-3.5 rounded-2xl bg-slate-100 text-primary font-bold text-sm flex items-center justify-center gap-2 active:bg-slate-200"
                >
                  <Share2 size={15} /> Share
                </button>
              </div>
            )}

            <button
              onClick={() => navigate(`/contacts/${id}`)}
              className="w-full py-4 rounded-2xl bg-primary text-white font-bold text-sm active:scale-[0.98] transition-transform shadow-lg"
            >
              Back to Contact
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col max-w-[480px] mx-auto">
      <nav className="p-4 bg-white border-b border-slate-100 flex items-center justify-between sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-1 hover:bg-slate-100 rounded-full transition-colors"
          >
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="font-bold text-sm text-primary leading-tight">{doc.title}</h1>
            <p className="text-[10px] text-emerald-600 font-bold flex items-center gap-1 uppercase">
              <Shield size={10} /> Sign And Generate PDF
            </p>
          </div>
        </div>
        <button onClick={handleDownloadPdf} className="p-2 text-slate-400">
          <Download size={20} />
        </button>
      </nav>

      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-4 bg-slate-100 space-y-4">
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '24px', overflow: 'hidden', boxShadow: '0 1px 2px rgba(15, 23, 42, 0.08)' }}>
          <div style={{ background: '#0f172a', padding: '20px 24px', color: '#ffffff' }}>
            <p style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3em', color: '#94a3b8' }}>Legal Document</p>
            <h2 style={{ marginTop: '8px', fontSize: '24px', fontWeight: 900 }}>{doc.title}</h2>
            <p style={{ marginTop: '4px', fontSize: '14px', color: '#cbd5e1' }}>{doc.subtitle}</p>
          </div>
          <div style={{ padding: '24px', display: 'grid', gap: '24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px', fontSize: '14px' }}>
              <div>
                <p style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#94a3b8' }}>Customer</p>
                <p style={{ fontWeight: 700, color: '#0f172a' }}>Customer</p>
              </div>
              <div>
                <p style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#94a3b8' }}>Property</p>
                <p style={{ fontWeight: 700, color: '#0f172a' }}>{propertyAddress || 'Address pending'}</p>
              </div>
              <div>
                <p style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#94a3b8' }}>Company Location</p>
                <p style={{ fontWeight: 700, color: '#0f172a' }}>{companyAddress}</p>
              </div>
              <div>
                <p style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#94a3b8' }}>Execution Date</p>
                <p style={{ fontWeight: 700, color: '#0f172a' }}>{today}</p>
              </div>
            </div>

            <div style={{ borderRadius: '16px', background: '#f8fafc', padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <div style={{ borderRadius: '12px', background: '#dbeafe', padding: '12px', color: '#1d4ed8' }}>
                  <FileText size={20} />
                </div>
                <div>
                  <p style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>{doc.title}</p>
                  <p style={{ fontSize: '12px', color: '#64748b' }}>{new Date().toLocaleDateString()}</p>
                </div>
              </div>
              <div style={{ display: 'grid', gap: '16px' }}>
                {renderedSections.map((section, index) => (
                  <p key={index} style={{ fontSize: '14px', color: '#334155', lineHeight: 1.75, whiteSpace: 'pre-line' }}>
                    {section}
                  </p>
                ))}
                {additionalTerms.trim() && (
                  <div style={{ marginTop: '8px', borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
                    <p style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#94a3b8', marginBottom: '8px' }}>Additional Terms &amp; Conditions</p>
                    <p style={{ fontSize: '14px', color: '#334155', lineHeight: 1.75, whiteSpace: 'pre-line' }}>{additionalTerms}</p>
                  </div>
                )}
              </div>
            </div>

            {signed && (
              <div style={{ borderRadius: '16px', border: '1px solid #a7f3d0', background: '#ecfdf5', padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '9999px', background: '#10b981', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Check size={22} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontWeight: 700, color: '#065f46' }}>Signed PDF saved</p>
                  <p style={{ fontSize: '12px', color: '#047857', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pdfUrl || 'Document available in the contact documents tab.'}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Additional Terms & Conditions */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <div>
              <p className="text-sm font-bold text-primary">Additional Terms &amp; Conditions</p>
              {canEditTerms ? (
                <p className="text-[10px] text-amber-600 font-medium mt-0.5">Editable — applies to this document only</p>
              ) : (
                <p className="text-[10px] text-slate-400 mt-0.5">Set by your company admin</p>
              )}
            </div>
            {!canEditTerms && (
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">View only</span>
            )}
          </div>
          <div className="px-5 pb-5">
            {canEditTerms ? (
              <textarea
                rows={5}
                placeholder="Enter any additional terms, conditions, or company-specific language that applies to this document…"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-primary outline-none focus:border-accent focus:bg-white resize-none placeholder:text-slate-300"
                value={additionalTerms}
                onChange={(e) => setAdditionalTerms(e.target.value)}
              />
            ) : additionalTerms ? (
              <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-600 whitespace-pre-line">{additionalTerms}</p>
            ) : (
              <p className="text-sm text-slate-300 italic">No additional terms have been added.</p>
            )}
          </div>
        </div>

        {/* Deductible acknowledgment — required for contingency & rescind */}
        {needsDeductibleAck && (
          <button
            type="button"
            onClick={() => setDeductibleAcknowledged((v) => !v)}
            className={`w-full flex items-start gap-4 p-5 rounded-3xl border-2 text-left transition-colors ${
              deductibleAcknowledged
                ? 'border-emerald-500 bg-emerald-50'
                : 'border-amber-400 bg-amber-50'
            }`}
          >
            <div
              className={`mt-0.5 flex-shrink-0 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-colors ${
                deductibleAcknowledged
                  ? 'border-emerald-500 bg-emerald-500'
                  : 'border-amber-400 bg-white'
              }`}
            >
              {deductibleAcknowledged && (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2 7l3.5 3.5L12 3" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
            <div>
              <p className={`text-sm font-bold ${deductibleAcknowledged ? 'text-emerald-800' : 'text-amber-900'}`}>
                Deductible Acknowledgment — Required
              </p>
              <p className={`text-xs mt-1 leading-relaxed ${deductibleAcknowledged ? 'text-emerald-700' : 'text-amber-800'}`}>
                I understand that I am responsible for the full payment of my insurance deductible ({deductible}) and that it cannot be waived, discounted, or absorbed by the contractor under applicable state law.
              </p>
            </div>
          </button>
        )}

        <div className="bg-white rounded-3xl border border-slate-200 p-5 space-y-4">
          <SignaturePad
            title="Customer Signature"
            helperText="Homeowner / customer signature"
            onChange={setCustomerSignatureDataUrl}
          />
          <SignaturePad
            title="Contractor Signature"
            helperText={`${contractorRoleLabel} signature`}
            onChange={setContractorSignatureDataUrl}
          />
          {!hasReadToBottom && (
            <p className="text-xs font-bold text-amber-700">
              Scroll through the agreement before signing.
            </p>
          )}
          {signed && pdfUrl && (
            <div className="space-y-3">
              {/* After contingency or CSA, prompt to sign the 3-Day Notice next */}
              {(docType === 'contingency' || docType === 'csa') && (
                <button
                  type="button"
                  onClick={() => navigate(`/contacts/${id}/documents/rescind`)}
                  className="w-full rounded-2xl bg-emerald-600 py-4 text-sm font-bold text-white flex items-center justify-center gap-2 shadow active:scale-95 transition-transform"
                >
                  <Shield size={16} />
                  Next: Sign 3-Day Notice of Cancellation →
                </button>
              )}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (savedDocumentId) {
                      navigate(`/documents/view/${savedDocumentId}`);
                      return;
                    }
                    window.open(pdfUrl, '_blank', 'noopener,noreferrer');
                  }}
                  className="w-full rounded-2xl bg-slate-100 py-3 text-sm font-bold text-primary"
                >
                  View Signed PDF
                </button>
                <button
                  type="button"
                  onClick={() => navigate(`/contacts/${id}`)}
                  className="w-full rounded-2xl bg-primary/10 py-3 text-sm font-bold text-primary"
                >
                  Back To Customer
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white p-6 border-t border-slate-100 shadow-[0_-4px_10px_rgba(0,0,0,0.04)]">
        <button
          type="button"
          disabled={!hasReadToBottom || !customerSignatureDataUrl || !contractorSignatureDataUrl || saving || signed || (needsDeductibleAck && !deductibleAcknowledged)}
          onClick={handleFinalSign}
          className="w-full bg-primary text-white py-4 rounded-2xl text-sm font-bold shadow-lg active:scale-95 transition-transform disabled:opacity-50"
        >
          {saving ? 'Generating Signed PDF...' : signed ? 'Document Signed' : 'Sign And Save PDF'}
        </button>
      </div>

      <div className="fixed left-[-9999px] top-0 w-[794px]">
        <div
          ref={printableRef}
          style={{
            background: '#ffffff',
            color: '#0f172a',
            fontFamily: 'Georgia, serif',
            padding: '48px',
            width: '794px',
          }}
        >
          <div style={{ borderBottom: '4px solid #0f172a', paddingBottom: '20px', marginBottom: '28px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '24px' }}>
              <div>
                <div style={{ fontSize: '14px', letterSpacing: '0.32em', textTransform: 'uppercase', color: '#64748b', fontFamily: 'Arial, sans-serif', fontWeight: 700 }}>
                  Legal Document
                </div>
                <div style={{ fontSize: '30px', fontWeight: 700, marginTop: '10px', fontFamily: 'Arial, sans-serif' }}>
                  {doc.title}
                </div>
                <div style={{ fontSize: '14px', color: '#475569', marginTop: '8px', fontFamily: 'Arial, sans-serif' }}>
                  {doc.subtitle}
                </div>
              </div>
              <div style={{ minWidth: '180px', textAlign: 'right', fontFamily: 'Arial, sans-serif' }}>
                <div style={{ fontSize: '12px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>Property</div>
                <div style={{ fontSize: '18px', fontWeight: 700, marginTop: '8px' }}>Customer Property</div>
                <div style={{ fontSize: '13px', color: '#475569', lineHeight: 1.5, marginTop: '8px' }}>{propertyAddress || 'Address pending'}</div>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '28px', fontFamily: 'Arial, sans-serif' }}>
            <div style={{ background: '#f8fafc', borderRadius: '16px', padding: '18px' }}>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.18em', color: '#64748b', fontWeight: 700 }}>Contractor</div>
              <div style={{ fontSize: '18px', fontWeight: 700, marginTop: '8px' }}>Contractor Information</div>
              <div style={{ fontSize: '13px', color: '#475569', marginTop: '8px', lineHeight: 1.5 }}>{companyAddress}</div>
            </div>
            <div style={{ background: '#f8fafc', borderRadius: '16px', padding: '18px' }}>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.18em', color: '#64748b', fontWeight: 700 }}>Execution</div>
              <div style={{ fontSize: '13px', color: '#0f172a', marginTop: '8px' }}>Signed on {new Date().toLocaleString()}</div>
              <div style={{ fontSize: '13px', color: '#0f172a', marginTop: '6px' }}>Prepared in mobile field workflow</div>
            </div>
          </div>

          <div>
            {renderedSections.map((section, index) => (
              <p key={index} style={{ fontSize: '14px', lineHeight: 1.9, whiteSpace: 'pre-line', marginBottom: '16px' }}>
                {section}
              </p>
            ))}
            {additionalTerms.trim() && (
              <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid #e2e8f0', background: '#fffbeb', borderRadius: '8px', padding: '16px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.18em', color: '#92400e', marginBottom: '10px' }}>Additional Terms &amp; Conditions</div>
                <p style={{ fontSize: '13px', lineHeight: 1.8, whiteSpace: 'pre-line', color: '#78350f' }}>{additionalTerms}</p>
              </div>
            )}
          </div>

          <div style={{ marginTop: '36px', paddingTop: '24px', borderTop: '1px solid #cbd5e1' }}>
            <div style={{ fontFamily: 'Arial, sans-serif', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.18em', color: '#64748b', fontWeight: 700 }}>
              Customer Signature
            </div>
            {customerSignatureDataUrl ? (
              <img
                src={customerSignatureDataUrl}
                alt="Customer Signature"
                style={{ height: '72px', marginTop: '12px', objectFit: 'contain' }}
              />
            ) : (
              <div style={{ height: '72px', marginTop: '12px', borderBottom: '1px solid #0f172a' }} />
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', fontFamily: 'Arial, sans-serif' }}>
              <div>
                <div style={{ fontWeight: 700 }}>Customer Signature</div>
                <div style={{ fontSize: '12px', color: '#475569' }}>Homeowner / Authorized Signer</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700 }}>{new Date().toLocaleDateString()}</div>
                <div style={{ fontSize: '12px', color: '#475569' }}>Signature Date</div>
              </div>
            </div>
          </div>

          <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid #cbd5e1' }}>
            <div style={{ fontFamily: 'Arial, sans-serif', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.18em', color: '#64748b', fontWeight: 700 }}>
              Contractor Signature
            </div>
            {contractorSignatureDataUrl ? (
              <img
                src={contractorSignatureDataUrl}
                alt="Contractor Signature"
                style={{ height: '72px', marginTop: '12px', objectFit: 'contain' }}
              />
            ) : (
              <div style={{ height: '72px', marginTop: '12px', borderBottom: '1px solid #0f172a' }} />
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', fontFamily: 'Arial, sans-serif' }}>
              <div>
                <div style={{ fontWeight: 700 }}>Contractor Signature</div>
                <div style={{ fontSize: '12px', color: '#475569' }}>{contractorRoleLabel}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700 }}>{new Date().toLocaleDateString()}</div>
                <div style={{ fontSize: '12px', color: '#475569' }}>Signature Date</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
