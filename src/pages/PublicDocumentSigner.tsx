import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import { CheckCircle, Eraser, FileText, ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getDocSections } from '../lib/documentTemplates';
import type { DocumentContext } from '../lib/documentTemplates';

// ── Types ──────────────────────────────────────────────────────────────────────

type SigningRequest = {
  id: string;
  token: string;
  doc_type: string;
  homeowner_name: string;
  homeowner_email: string;
  status: 'pending' | 'signed' | 'expired' | 'saved';
  document_context: DocumentContext & {
    title?: string;
    subtitle?: string;
    companyName?: string;
  };
  contractor_signature_data_url: string | null;
  pdf_upload_url: string | null;
  pdf_storage_path: string | null;
  expires_at: string;
};

// ── PDF builder (mirrors DocumentSigner.buildSignedPdfBlob) ────────────────────

async function buildRemoteSignedPdf({
  title,
  subtitle,
  propertyAddress,
  companyAddress,
  companyName,
  today,
  sections,
  customerSignatureDataUrl,
  contractorSignatureDataUrl,
  homeownerName,
}: {
  title: string;
  subtitle: string;
  propertyAddress: string;
  companyAddress: string;
  companyName: string;
  today: string;
  sections: string[];
  customerSignatureDataUrl: string;
  contractorSignatureDataUrl: string | null;
  homeownerName: string;
}): Promise<Blob> {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageWidth  = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const left     = 16;
  const right    = pageWidth - 16;
  const maxWidth = right - left;
  let y = 18;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - 18) { pdf.addPage(); y = 18; }
  };

  // Header block
  pdf.setFillColor(15, 23, 42);
  pdf.roundedRect(left, y, maxWidth, 26, 4, 4, 'F');
  pdf.setTextColor(148, 163, 184); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8);
  pdf.text('LEGAL DOCUMENT', left + 6, y + 7);
  pdf.setTextColor(255, 255, 255); pdf.setFontSize(18);
  pdf.text(title, left + 6, y + 18);
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(148, 163, 184);
  pdf.text(subtitle, right - 6, y + 18, { align: 'right' });
  y += 34;

  // Meta row
  pdf.setFontSize(8); pdf.setTextColor(100, 116, 139);
  const metaLines = [
    `Date: ${today}`,
    `Property: ${propertyAddress}`,
    `Company: ${companyName}  |  ${companyAddress}`,
    `Signed remotely via e-Signature link`,
  ];
  for (const line of metaLines) {
    ensureSpace(5);
    pdf.text(line, left, y); y += 5;
  }
  y += 4;

  // Document sections
  for (const section of sections) {
    const paragraphs = section.split('\n\n');
    for (const para of paragraphs) {
      const lines = pdf.splitTextToSize(para.trim(), maxWidth - 2);
      const blockH = lines.length * 5 + 6;
      ensureSpace(blockH);
      pdf.setFontSize(9.5); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(30, 41, 59);
      pdf.text(lines, left + 1, y); y += lines.length * 5 + 6;
    }
  }

  // Signature section
  ensureSpace(60);
  y += 4;
  pdf.setFillColor(241, 245, 249);
  pdf.roundedRect(left, y, maxWidth, contractorSignatureDataUrl ? 54 : 30, 3, 3, 'F');
  pdf.setFontSize(8); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(71, 85, 105);
  pdf.text('SIGNATURES', left + 4, y + 6);

  const sigBoxW = contractorSignatureDataUrl ? (maxWidth / 2) - 4 : maxWidth - 8;

  // Homeowner signature
  pdf.setFontSize(7); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(100, 116, 139);
  pdf.text('Homeowner / Customer', left + 4, y + 13);
  pdf.setDrawColor(203, 213, 225); pdf.roundedRect(left + 4, y + 15, sigBoxW, 28, 2, 2);
  const sigImg = new Image();
  sigImg.src = customerSignatureDataUrl;
  await new Promise<void>((res) => { sigImg.onload = () => res(); sigImg.onerror = () => res(); });
  pdf.addImage(sigImg, 'PNG', left + 4, y + 15, sigBoxW, 28);
  pdf.setFontSize(7.5); pdf.setTextColor(30, 41, 59);
  pdf.text(homeownerName, left + 4, y + 47);

  // Contractor signature (if pre-captured)
  if (contractorSignatureDataUrl) {
    const cx = left + (maxWidth / 2) + 4;
    pdf.setFontSize(7); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(100, 116, 139);
    pdf.text('Contractor Representative', cx, y + 13);
    pdf.setDrawColor(203, 213, 225); pdf.roundedRect(cx, y + 15, sigBoxW, 28, 2, 2);
    const ctxImg = new Image();
    ctxImg.src = contractorSignatureDataUrl;
    await new Promise<void>((res) => { ctxImg.onload = () => res(); ctxImg.onerror = () => res(); });
    pdf.addImage(ctxImg, 'PNG', cx, y + 15, sigBoxW, 28);
    pdf.setFontSize(7.5); pdf.setTextColor(30, 41, 59);
    pdf.text(companyName, cx, y + 47);
  }

  y += contractorSignatureDataUrl ? 58 : 34;

  // Footer
  pdf.setFontSize(7); pdf.setTextColor(148, 163, 184);
  ensureSpace(12);
  pdf.text(
    `Document signed electronically on ${today} by ${homeownerName} via TrussCTR e-Signature.`,
    pageWidth / 2, y + 8, { align: 'center' }
  );

  return pdf.output('blob');
}

// ── Signature Pad ──────────────────────────────────────────────────────────────

function SignaturePad({
  onSignature,
  onClear,
}: {
  onSignature: (dataUrl: string) => void;
  onClear: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing   = useRef(false);
  const snapshots = useRef<ImageData[]>([]);
  const scaleRef  = useRef({ x: 1, y: 1 });

  const getPos = (e: TouchEvent | MouseEvent) => {
    const canvas = canvasRef.current!;
    const rect   = canvas.getBoundingClientRect();
    const sx = canvas.width  / rect.width;
    const sy = canvas.height / rect.height;
    scaleRef.current = { x: sx, y: sy };
    if ('touches' in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * sx,
        y: (e.touches[0].clientY - rect.top)  * sy,
      };
    }
    return {
      x: (e.clientX - rect.left) * sx,
      y: (e.clientY - rect.top)  * sy,
    };
  };

  const start = (e: TouchEvent | MouseEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current!;
    const ctx    = canvas.getContext('2d')!;
    snapshots.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    drawing.current = true;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const move = (e: TouchEvent | MouseEvent) => {
    if (!drawing.current) return;
    e.preventDefault();
    const canvas = canvasRef.current!;
    const ctx    = canvas.getContext('2d')!;
    const { x, y } = getPos(e);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth   = Math.max(2.5, 2.5 * scaleRef.current.x);
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const end = (e: TouchEvent | MouseEvent) => {
    if (!drawing.current) return;
    e.preventDefault();
    drawing.current = false;
    const canvas = canvasRef.current!;
    onSignature(canvas.toDataURL('image/png'));
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove',  move,  { passive: false });
    canvas.addEventListener('touchend',   end,   { passive: false });
    canvas.addEventListener('mousedown',  start as EventListener);
    canvas.addEventListener('mousemove',  move  as EventListener);
    canvas.addEventListener('mouseup',    end   as EventListener);
    return () => {
      canvas.removeEventListener('touchstart', start);
      canvas.removeEventListener('touchmove',  move);
      canvas.removeEventListener('touchend',   end);
      canvas.removeEventListener('mousedown',  start as EventListener);
      canvas.removeEventListener('mousemove',  move  as EventListener);
      canvas.removeEventListener('mouseup',    end   as EventListener);
    };
  }, []);

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    snapshots.current = [];
    onClear();
  };

  return (
    <div className="space-y-2">
      <div className="relative border-2 border-dashed border-slate-300 rounded-xl bg-white overflow-hidden touch-none">
        <canvas
          ref={canvasRef}
          width={900}
          height={260}
          className="w-full h-[130px] cursor-crosshair"
        />
        <p className="absolute inset-0 flex items-center justify-center text-slate-300 text-sm pointer-events-none select-none font-medium">
          Sign here
        </p>
      </div>
      <button
        type="button"
        onClick={handleClear}
        className="flex items-center gap-1.5 text-xs text-slate-400 font-medium active:text-slate-600"
      >
        <Eraser size={13} /> Clear signature
      </button>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function PublicDocumentSigner() {
  const { token } = useParams<{ token: string }>();

  const [request,  setRequest]  = useState<SigningRequest | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'expired' | 'already-signed' | 'error'>('loading');
  const [loadError, setLoadError] = useState('');

  const [hasReadToBottom, setHasReadToBottom] = useState(false);
  const [agreed, setAgreed]     = useState(false);
  const [sigDataUrl, setSigDataUrl] = useState<string | null>(null);

  const [submitState, setSubmitState] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle');
  const [submitError, setSubmitError] = useState('');

  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Load signing request ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) { setLoadState('error'); setLoadError('Missing signing token.'); return; }

    (async () => {
      try {
        const { data, error } = await (supabase.from('signing_requests') as any)
          .select('*')
          .eq('token', token)
          .single();

        if (error || !data) {
          setLoadState('error');
          setLoadError('This signing link is invalid or has been removed.');
          return;
        }

        if (data.status === 'signed' || data.status === 'saved') {
          setRequest(data as SigningRequest);
          setLoadState('already-signed');
          return;
        }

        if (new Date(data.expires_at) < new Date() || data.status === 'expired') {
          setRequest(data as SigningRequest);
          setLoadState('expired');
          return;
        }

        setRequest(data as SigningRequest);
        setLoadState('ready');
      } catch {
        setLoadState('error');
        setLoadError('An error occurred loading this document. Please try again.');
      }
    })();
  }, [token]);

  // Auto-detect if doc fits without scrolling
  useEffect(() => {
    if (loadState !== 'ready') return;
    const node = scrollRef.current;
    if (!node) return;
    const check = () => setHasReadToBottom(node.scrollHeight <= node.clientHeight + 10);
    const frame = requestAnimationFrame(check);
    window.addEventListener('resize', check);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', check); };
  }, [loadState]);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    if (scrollTop + clientHeight >= scrollHeight - 60) setHasReadToBottom(true);
  };

  // ── Submit ───────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!request || !sigDataUrl) return;
    setSubmitState('submitting');
    setSubmitError('');

    try {
      const ctx   = request.document_context;
      const sections = getDocSections(
        undefined, // no company_id overrides for public page — use defaults
        request.doc_type,
        ctx
      );

      const today = ctx.today || new Date().toLocaleDateString();

      // Generate signed PDF client-side
      const pdfBlob = await buildRemoteSignedPdf({
        title:                       ctx.title      || request.doc_type,
        subtitle:                    ctx.subtitle   || '',
        propertyAddress:             ctx.propertyAddress || '',
        companyAddress:              ctx.companyAddress  || '',
        companyName:                 ctx.companyName     || 'Contractor',
        today,
        sections,
        customerSignatureDataUrl:    sigDataUrl,
        contractorSignatureDataUrl:  request.contractor_signature_data_url,
        homeownerName:               request.homeowner_name,
      });

      // Upload PDF using the pre-signed URL the contractor created
      let pdfPublicUrl = '';
      if (request.pdf_upload_url) {
        const uploadRes = await fetch(request.pdf_upload_url, {
          method:  'PUT',
          body:    pdfBlob,
          headers: { 'Content-Type': 'application/pdf' },
        });
        if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.status}`);

        // Build the public URL from the storage path
        const storageUrl = import.meta.env.VITE_SUPABASE_URL;
        pdfPublicUrl = request.pdf_storage_path
          ? `${storageUrl}/storage/v1/object/public/documents/${request.pdf_storage_path}`
          : '';
      }

      // Update signing_request — status → signed
      const { error: updateError } = await (supabase.from('signing_requests') as any)
        .update({
          status:                       'signed',
          homeowner_signature_data_url: sigDataUrl,
          pdf_public_url:               pdfPublicUrl || null,
          signed_at:                    new Date().toISOString(),
        })
        .eq('token', token!);

      if (updateError) throw updateError;

      setSubmitState('done');
    } catch (err) {
      console.error('Signing error:', err);
      setSubmitError('Something went wrong submitting your signature. Please try again.');
      setSubmitState('error');
    }
  };

  // ── Render helpers ───────────────────────────────────────────────────────────

  if (loadState === 'loading') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-slate-500 text-sm">Loading document…</p>
        </div>
      </div>
    );
  }

  if (loadState === 'expired') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-sm w-full bg-white rounded-2xl shadow-lg p-8 text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mx-auto">
            <FileText size={24} className="text-amber-600" />
          </div>
          <h1 className="text-lg font-bold text-primary">Link Expired</h1>
          <p className="text-slate-500 text-sm leading-relaxed">
            This signing link has expired. Please contact your contractor to request a new one.
          </p>
          {request && (
            <p className="text-xs text-slate-400">
              Document: <span className="font-medium">{request.document_context.title || request.doc_type}</span>
            </p>
          )}
        </div>
      </div>
    );
  }

  if (loadState === 'already-signed') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-sm w-full bg-white rounded-2xl shadow-lg p-8 text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
            <CheckCircle size={24} className="text-emerald-600" />
          </div>
          <h1 className="text-lg font-bold text-primary">Already Signed</h1>
          <p className="text-slate-500 text-sm leading-relaxed">
            This document has already been signed. Your contractor has a copy on file.
          </p>
          {request && (
            <p className="text-xs text-slate-400">
              Document: <span className="font-medium">{request.document_context.title || request.doc_type}</span>
            </p>
          )}
        </div>
      </div>
    );
  }

  if (loadState === 'error') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-sm w-full bg-white rounded-2xl shadow-lg p-8 text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto">
            <FileText size={24} className="text-red-500" />
          </div>
          <h1 className="text-lg font-bold text-primary">Invalid Link</h1>
          <p className="text-slate-500 text-sm leading-relaxed">{loadError}</p>
        </div>
      </div>
    );
  }

  if (submitState === 'done') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-sm w-full bg-white rounded-2xl shadow-xl p-8 text-center space-y-5">
          <div className="w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center mx-auto shadow-lg shadow-emerald-200">
            <CheckCircle size={32} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-primary">Document Signed</h1>
            <p className="text-slate-500 text-sm mt-1">
              {request!.document_context.title || 'Your document'} has been signed and submitted.
            </p>
          </div>
          <div className="bg-slate-50 rounded-xl p-4 text-left space-y-2 text-xs text-slate-500">
            <p><span className="font-medium text-primary">Homeowner:</span> {request!.homeowner_name}</p>
            <p><span className="font-medium text-primary">Signed:</span> {new Date().toLocaleString()}</p>
            <p><span className="font-medium text-primary">Document:</span> {request!.document_context.title || request!.doc_type}</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400 justify-center">
            <ShieldCheck size={13} className="text-emerald-500 shrink-0" />
            <span>Your signature is securely stored. Your contractor will be notified.</span>
          </div>
        </div>
      </div>
    );
  }

  if (!request) return null;

  const ctx      = request.document_context;
  const docTitle = ctx.title || request.doc_type;
  const sections = getDocSections(undefined, request.doc_type, ctx);
  const canSign  = hasReadToBottom && agreed && !!sigDataUrl;

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      {/* Header */}
      <div className="bg-slate-900 text-white px-5 py-4 flex items-center gap-3 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
          <FileText size={16} className="text-white" />
        </div>
        <div className="min-w-0">
          <p className="font-bold text-sm leading-tight truncate">{docTitle}</p>
          <p className="text-slate-400 text-xs truncate">{ctx.companyName || 'TrussCTR'} · e-Signature Request</p>
        </div>
      </div>

      {/* Addressee banner */}
      <div className="bg-blue-600 text-white px-5 py-2.5 text-sm shrink-0">
        <p className="font-medium">Hello, {request.homeowner_name}</p>
        <p className="text-blue-100 text-xs">Please review the full document below, then sign at the bottom.</p>
      </div>

      {/* Scrollable document */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-5 space-y-4"
      >
        {/* Doc sections */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 space-y-4">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="font-bold text-primary text-base">{docTitle}</h2>
            {ctx.subtitle && <p className="text-xs text-slate-400 mt-0.5">{ctx.subtitle}</p>}
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[11px] text-slate-400">
              {ctx.today          && <span>Date: <span className="text-slate-600 font-medium">{ctx.today}</span></span>}
              {ctx.propertyAddress && <span>Property: <span className="text-slate-600 font-medium">{ctx.propertyAddress}</span></span>}
              {ctx.companyName    && <span>Company: <span className="text-slate-600 font-medium">{ctx.companyName}</span></span>}
            </div>
          </div>

          {sections.map((section, i) => (
            <div key={i} className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
              {section}
            </div>
          ))}
        </div>

        {/* Scroll prompt */}
        {!hasReadToBottom && (
          <p className="text-center text-[11px] text-slate-400 animate-pulse">
            ↓ Scroll to the bottom to enable signing
          </p>
        )}

        {/* Agreement + Signature */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 space-y-5">
          <h3 className="font-bold text-primary text-sm">Your Signature</h3>

          {/* Agreement checkbox */}
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              disabled={!hasReadToBottom}
              className="mt-0.5 w-4 h-4 accent-blue-600 cursor-pointer disabled:opacity-40"
            />
            <span className={`text-xs leading-relaxed ${!hasReadToBottom ? 'text-slate-300' : 'text-slate-600'}`}>
              I have read and agree to the terms of this document. I acknowledge that my electronic
              signature is legally binding and equivalent to a handwritten signature.
            </span>
          </label>

          {/* Signature pad */}
          <div>
            <p className="text-xs text-slate-500 mb-2 font-medium">Sign with your finger or mouse:</p>
            <SignaturePad
              onSignature={(url) => setSigDataUrl(url)}
              onClear={() => setSigDataUrl(null)}
            />
          </div>

          {/* Submit error */}
          {submitState === 'error' && (
            <p className="text-red-500 text-xs bg-red-50 rounded-lg p-3">{submitError}</p>
          )}

          {/* Submit button */}
          <button
            onClick={handleSubmit}
            disabled={!canSign || submitState === 'submitting'}
            className="w-full py-4 rounded-xl font-bold text-sm transition-all
              disabled:bg-slate-100 disabled:text-slate-400
              bg-emerald-600 text-white active:scale-[0.98] shadow-lg shadow-emerald-100"
          >
            {submitState === 'submitting' ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Submitting Signature…
              </span>
            ) : !hasReadToBottom ? (
              'Scroll to read document first'
            ) : !agreed ? (
              'Check the agreement box above'
            ) : !sigDataUrl ? (
              'Add your signature above'
            ) : (
              'Submit Signed Document'
            )}
          </button>

          <div className="flex items-center gap-2 text-[10px] text-slate-400 justify-center">
            <ShieldCheck size={11} className="shrink-0 text-slate-300" />
            <span>Secured by TrussCTR · Electronic signatures are legally binding</span>
          </div>
        </div>

        <div className="h-6" />
      </div>
    </div>
  );
}
