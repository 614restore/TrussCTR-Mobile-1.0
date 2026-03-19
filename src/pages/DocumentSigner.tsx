import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  Download,
  Eraser,
  FileText,
  Shield,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { handleAutoMove } from '../lib/store';
import { generateAndDownloadPdf, uploadToAvailableBucket } from '../lib/pdfService';
import { jsPDF } from 'jspdf';
import { buildStoredDocumentUrl } from '../lib/documentAccess';

type DocumentContext = {
  companyAddress: string;
  companyState: string;
  propertyAddress: string;
  projectValue: string;
  deductible: string;
  today: string;
  cancelDeadline: string;
};

type DocDefinition = {
  title: string;
  subtitle: string;
  sections: (context: DocumentContext) => string[];
};

const DOC_CONTENT: Record<string, DocDefinition> = {
  contingency: {
    title: 'Contingency Agreement',
    subtitle: 'Insurance Restoration Authorization',
    sections: ({ companyAddress, propertyAddress, deductible, today }) => [
      `This Contingency Agreement is entered into on ${today} between the Contractor, located at ${companyAddress}, and the Customer for the property located at ${propertyAddress}.`,
      `The Customer authorizes the Contractor to inspect the property, meet with the insurance carrier or adjuster, and prepare pricing and scope documents for storm-related restoration work. The Contractor may pursue supplements that are reasonably necessary to restore the property to pre-loss condition.`,
      `This agreement is contingent upon approval of the insurance claim in sufficient scope and value to perform the work. If the claim is denied in full and no retail agreement is executed, this contingency agreement is void. The customer remains responsible for the deductible of ${deductible} and any elective upgrades outside the approved scope.`,
      `The Contractor agrees to complete the approved work in a professional manner, furnish labor and material necessary for the authorized scope, and coordinate with the insurance process in good faith. No waiver of rights or assignment beyond the agreed project scope is implied unless separately executed in writing.`,
    ],
  },
  csa: {
    title: 'Customer Service Agreement',
    subtitle: 'Retail Sales & Installation Contract',
    sections: ({ companyAddress, propertyAddress, projectValue, today }) => [
      `This Customer Service Agreement is made on ${today} between the Contractor, with business address ${companyAddress}, and the Customer for work to be performed at ${propertyAddress}.`,
      `The contractor agrees to furnish labor, supervision, equipment, and materials necessary to complete the agreed scope of work in a professional and workmanlike manner. The parties acknowledge a current project value of ${projectValue}, subject to approved revisions, supplements, or written change orders.`,
      `Unless otherwise stated in writing, scheduling will occur after material confirmation and any required deposit. Any modification to the work, materials, or price must be approved in writing before the revised scope proceeds.`,
      `Customer acknowledges that the agreement, together with any estimate, supplements, and signed change orders, forms the complete understanding between the parties for this project.`,
    ],
  },
  rescind: {
    title: 'Notice of Cancellation',
    subtitle: 'Three-Day Right To Cancel',
    sections: ({ companyAddress, companyState, today, cancelDeadline }) => [
      `You may cancel this transaction, without any penalty or obligation, within three business days from ${today}. If you cancel, any property traded in, any payments made by you under the contract or sale, and any negotiable instrument executed by you will be returned within the time required by law.`,
      `To cancel this transaction, mail or deliver a signed and dated copy of any written notice of cancellation to the Contractor at ${companyAddress}, in the state of ${companyState}, not later than midnight of ${cancelDeadline}.`,
      `I hereby cancel this transaction.\n\nBuyer / Homeowner: ____________________\nDate of transaction: ${today}\nCancellation deadline: ${cancelDeadline}`,
    ],
  },
  completion: {
    title: 'Completion Certificate',
    subtitle: 'Project Completion & Satisfaction Acknowledgment',
    sections: ({ propertyAddress, projectValue, today }) => [
      `The Customer acknowledges that the work performed by the Contractor at ${propertyAddress} has been substantially completed as of ${today}.`,
      `The customer confirms that the project area has been reviewed and that the contractor may proceed with project closeout and final billing, subject to any separately documented warranty or punch-list obligations.`,
      `The parties acknowledge a final contract value of ${projectValue}, unless further revised by signed change order or final insurance supplementation.`,
    ],
  },
  'change-order': {
    title: 'Change Order',
    subtitle: 'Scope And Price Adjustment',
    sections: ({ propertyAddress, projectValue, today }) => [
      `This Change Order is issued on ${today} between the Contractor and the Customer for the property located at ${propertyAddress}.`,
      `The parties agree that the original project scope requires revision due to field conditions, customer-requested changes, code-related updates, or additional work discovered after execution of the base agreement.`,
      `Upon signature, this Change Order becomes part of the contract documents and authorizes the Contractor to proceed with the revised scope. The project total is currently reflected at ${projectValue}, subject to the approved change described in the supporting estimate or work-order documentation.`,
      `No additional work described in this Change Order will proceed without written approval from the customer or authorized representative.`,
    ],
  },
};

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
  const scrollRef = useRef<HTMLDivElement>(null);
  const printableRef = useRef<HTMLDivElement>(null);
  const doc = DOC_CONTENT[docType || ''];

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
  const todayDate = new Date();
  const today = todayDate.toLocaleDateString();
  const cancelDeadline = addBusinessDays(todayDate, 3).toLocaleDateString();
  const projectValue = contact?.project_value ? `$${Number(contact.project_value).toLocaleString()}` : 'TBD';
  const deductible = contact?.deductible ? `$${Number(contact.deductible).toLocaleString()}` : 'the applicable deductible';
  const renderedSections = doc
    ? doc.sections({
        companyAddress,
        companyState,
        propertyAddress: propertyAddress || 'Property address pending',
        projectValue,
        deductible,
        today,
        cancelDeadline,
      })
    : ['Document content not found.'];

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
        sections: renderedSections,
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
          )}
        </div>
      </div>

      <div className="bg-white p-6 border-t border-slate-100 shadow-[0_-4px_10px_rgba(0,0,0,0.04)]">
        <button
          type="button"
          disabled={!hasReadToBottom || !customerSignatureDataUrl || !contractorSignatureDataUrl || saving || signed}
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
