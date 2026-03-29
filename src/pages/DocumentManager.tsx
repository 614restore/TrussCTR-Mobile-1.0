import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Clock,
  Copy,
  Eraser,
  ExternalLink,
  FileText,
  Mail,
  Send,
  Share2,
  X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { cn } from '../lib/utils';
import {
  buildLegalDocumentStats,
  LEGAL_DOCUMENT_TEMPLATES,
  type LegalDocumentStats,
} from '../lib/documentVisibility';
import { getDocSections, getDocMeta } from '../lib/documentTemplates';

// ── Types ──────────────────────────────────────────────────────────────────────

type SigningRequest = {
  id: string;
  token: string;
  doc_type: string;
  homeowner_name: string;
  homeowner_email: string;
  status: 'pending' | 'signed' | 'expired' | 'saved';
  pdf_public_url: string | null;
  signed_at: string | null;
  created_at: string;
  expires_at: string;
};

// ── Signature Pad (for optional contractor pre-signature) ──────────────────────

function MiniSignaturePad({
  onSignature,
  onClear,
}: {
  onSignature: (url: string) => void;
  onClear: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing   = useRef(false);
  const scaleRef  = useRef({ x: 1, y: 1 });

  const getPos = (e: TouchEvent | MouseEvent) => {
    const canvas = canvasRef.current!;
    const rect   = canvas.getBoundingClientRect();
    const sx = canvas.width  / rect.width;
    const sy = canvas.height / rect.height;
    scaleRef.current = { x: sx, y: sy };
    if ('touches' in e) {
      return { x: (e.touches[0].clientX - rect.left) * sx, y: (e.touches[0].clientY - rect.top) * sy };
    }
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
  };

  const start = (e: TouchEvent | MouseEvent) => {
    e.preventDefault();
    drawing.current = true;
    const { x, y } = getPos(e);
    canvasRef.current!.getContext('2d')!.beginPath();
    canvasRef.current!.getContext('2d')!.moveTo(x, y);
  };
  const move = (e: TouchEvent | MouseEvent) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current!.getContext('2d')!;
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
    onSignature(canvasRef.current!.toDataURL('image/png'));
  };

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.addEventListener('touchstart', start, { passive: false });
    c.addEventListener('touchmove',  move,  { passive: false });
    c.addEventListener('touchend',   end,   { passive: false });
    c.addEventListener('mousedown',  start as EventListener);
    c.addEventListener('mousemove',  move  as EventListener);
    c.addEventListener('mouseup',    end   as EventListener);
    return () => {
      c.removeEventListener('touchstart', start);
      c.removeEventListener('touchmove',  move);
      c.removeEventListener('touchend',   end);
      c.removeEventListener('mousedown',  start as EventListener);
      c.removeEventListener('mousemove',  move  as EventListener);
      c.removeEventListener('mouseup',    end   as EventListener);
    };
  }, []);

  const clear = () => {
    const c = canvasRef.current;
    if (!c) return;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    onClear();
  };

  return (
    <div className="space-y-1.5">
      <div className="relative border-2 border-dashed border-slate-200 rounded-xl bg-white overflow-hidden touch-none">
        <canvas ref={canvasRef} width={700} height={180} className="w-full h-[90px] cursor-crosshair" />
        <p className="absolute inset-0 flex items-center justify-center text-slate-300 text-xs pointer-events-none select-none">
          Sign here
        </p>
      </div>
      <button type="button" onClick={clear} className="flex items-center gap-1 text-[11px] text-slate-400">
        <Eraser size={11} /> Clear
      </button>
    </div>
  );
}

// ── Send-for-Signature Modal ───────────────────────────────────────────────────

type SendModalState = 'form' | 'generating' | 'link' | 'error';

function SendSignatureModal({
  docType,
  docTitle,
  contactId,
  companyId,
  homeownerName,
  homeownerEmail,
  documentContext,
  onClose,
}: {
  docType: string;
  docTitle: string;
  contactId: string;
  companyId: string;
  homeownerName: string;
  homeownerEmail: string;
  documentContext: Record<string, unknown>;
  onClose: () => void;
}) {
  const [state,    setState]    = useState<SendModalState>('form');
  const [name,     setName]     = useState(homeownerName);
  const [email,    setEmail]    = useState(homeownerEmail);
  const [sigUrl,   setSigUrl]   = useState<string | null>(null);
  const [sigLink,  setSigLink]  = useState('');
  const [copied,   setCopied]   = useState(false);
  const [errMsg,   setErrMsg]   = useState('');

  const handleGenerate = async () => {
    if (!name.trim()) return;
    setState('generating');
    setErrMsg('');

    try {
      // Pre-generate a storage path + signed upload URL so the public page can
      // upload the completed PDF without needing Supabase auth.
      const pdfPath = `signing-requests/${contactId}/${docType}-${Date.now()}.pdf`;
      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from('documents')
        .createSignedUploadUrl(pdfPath);

      if (uploadErr) {
        // Non-fatal — we'll still create the request, upload just won't work
        console.warn('Could not create signed upload URL:', uploadErr.message);
      }

      const { data, error } = await (supabase.from('signing_requests') as any)
        .insert({
          contact_id:    contactId,
          company_id:    companyId,
          doc_type:      docType,
          homeowner_name:  name.trim(),
          homeowner_email: email.trim(),
          document_context: documentContext,
          contractor_signature_data_url: sigUrl || null,
          pdf_upload_url:    uploadData?.signedUrl   || null,
          pdf_storage_path:  uploadData?.path        || pdfPath,
        })
        .select('token')
        .single();

      if (error) throw error;

      const token   = data.token as string;
      const baseUrl = window.location.origin;
      const link    = `${baseUrl}/sign/${token}`;
      setSigLink(link);
      setState('link');
    } catch (err) {
      setErrMsg((err as Error)?.message || 'Failed to create signing request.');
      setState('error');
    }
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(sigLink).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareLink = async () => {
    if (navigator.share) {
      await navigator.share({
        title: `Please sign: ${docTitle}`,
        text:  `${name} — please review and sign your ${docTitle} using the link below.`,
        url:   sigLink,
      }).catch(() => {});
    } else {
      copyLink();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl z-10 overflow-hidden max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center">
              <Send size={15} className="text-blue-600" />
            </div>
            <div>
              <p className="font-bold text-primary text-sm">Send for e-Signature</p>
              <p className="text-[11px] text-slate-400">{docTitle}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 active:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {state === 'generating' && (
            <div className="flex flex-col items-center py-8 gap-3">
              <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-slate-500">Generating signing link…</p>
            </div>
          )}

          {(state === 'form' || state === 'error') && (
            <>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Homeowner Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Full name"
                    className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Email (optional — for your records)
                  </label>
                  <div className="relative">
                    <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="homeowner@email.com"
                      className="w-full pl-8 pr-3 py-2.5 text-sm rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Optional contractor pre-signature */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-600">
                  Your signature (optional — pre-sign before sending)
                </p>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Sign now to include your signature in the document the homeowner receives.
                  Leave blank to add yours after they sign.
                </p>
                <MiniSignaturePad
                  onSignature={(url) => setSigUrl(url)}
                  onClear={() => setSigUrl(null)}
                />
              </div>

              {state === 'error' && (
                <p className="text-red-500 text-xs bg-red-50 rounded-lg p-3">{errMsg}</p>
              )}

              <button
                onClick={handleGenerate}
                disabled={!name.trim()}
                className="w-full py-3.5 rounded-xl font-bold text-sm bg-blue-600 text-white
                  disabled:bg-slate-100 disabled:text-slate-400 active:scale-[0.98] transition-transform"
              >
                Generate Signing Link
              </button>

              <p className="text-center text-[10px] text-slate-400">
                Link expires in 7 days · Homeowner signs in their browser · No app download needed
              </p>
            </>
          )}

          {state === 'link' && (
            <>
              <div className="bg-emerald-50 rounded-xl p-4 space-y-1">
                <p className="text-xs font-bold text-emerald-700">Signing link ready</p>
                <p className="text-[11px] text-emerald-600 leading-relaxed">
                  Share this link with {name}. They'll be able to review and sign in their browser —
                  no app or account needed.
                </p>
              </div>

              {/* Link display */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[11px] text-slate-500 break-all font-mono">
                {sigLink}
              </div>

              {/* Action buttons */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={copyLink}
                  className="flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm
                    border border-slate-200 bg-white active:bg-slate-50 text-primary transition-colors"
                >
                  <Copy size={15} />
                  {copied ? 'Copied!' : 'Copy Link'}
                </button>
                <button
                  onClick={shareLink}
                  className="flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm
                    bg-blue-600 text-white active:scale-[0.98] transition-transform shadow-lg shadow-blue-100"
                >
                  <Share2 size={15} /> Share
                </button>
              </div>

              <p className="text-center text-[10px] text-slate-400">
                You'll see the status update to "Signed" in this list once they complete it.
              </p>

              <button
                onClick={onClose}
                className="w-full py-3 rounded-xl text-sm font-semibold text-slate-500 bg-slate-50"
              >
                Done
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function DocumentManager() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [signedDocDetails, setSignedDocDetails]     = useState<Record<string, LegalDocumentStats>>({});
  const [signingRequests,  setSigningRequests]       = useState<SigningRequest[]>([]);
  const [contact,          setContact]               = useState<any>(null);
  const [loading,          setLoading]               = useState(true);
  const [sendModal,        setSendModal]             = useState<{ docType: string; docTitle: string } | null>(null);

  useEffect(() => {
    if (id) loadAll();
  }, [id]);

  const loadAll = async () => {
    try {
      const docsRes     = await supabase.from('documents').select('id,name,type,created_at').eq('contact_id', id!);
      const { data: contactData } = (await supabase.from('contacts').select('*').eq('id', id!).single()) as any;
      const reqsRes = await (supabase.from('signing_requests') as any)
        .select('id,token,doc_type,homeowner_name,homeowner_email,status,pdf_public_url,signed_at,created_at,expires_at')
        .eq('contact_id', id!)
        .order('created_at', { ascending: false });

      if (docsRes.data) setSignedDocDetails(buildLegalDocumentStats(docsRes.data as any[]));
      if (reqsRes.data) setSigningRequests(reqsRes.data as SigningRequest[]);
      if (contactData)  setContact(contactData);
    } catch (err) {
      console.error('DocumentManager load error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Build the document context object stored in the signing_request
  const buildDocContext = (docType: string) => {
    const meta          = getDocMeta(docType);
    const propertyAddress = [contact?.address, contact?.city, contact?.state, contact?.zip].filter(Boolean).join(', ');
    const companyAddress  = (profile as any)?.companies?.address || '';
    const match           = companyAddress.match(/,\s*([A-Z]{2})\s+\d{5}/i);
    const companyState    = match?.[1]?.toUpperCase() || '';
    const propertyState   = (contact?.state || '').toUpperCase();
    const today           = new Date().toLocaleDateString();

    // cancelDeadline: 3 business days from today
    const addBizDays = (date: Date, n: number) => {
      const d = new Date(date);
      let rem = n;
      while (rem > 0) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) rem--; }
      return d.toLocaleDateString();
    };

    const ctx = {
      title:           meta.title,
      subtitle:        meta.subtitle,
      companyName:     (profile as any)?.companies?.name  || '',
      companyAddress,
      companyState,
      propertyAddress: propertyAddress || 'Property address pending',
      propertyState:   propertyState   || companyState,
      projectValue:    contact?.project_value ? `$${Number(contact.project_value).toLocaleString()}` : 'TBD',
      deductible:      contact?.deductible    ? `$${Number(contact.deductible).toLocaleString()}`    : 'the applicable deductible',
      today,
      cancelDeadline:  addBizDays(new Date(), 3),
      contractorName:  (profile as any)?.companies?.name  || '',
      contractorPhone: (profile as any)?.companies?.phone || '',
    };

    // Pre-render sections with any company customizations so the public page
    // renders the exact same document even without localStorage access
    const renderedSections = getDocSections(profile?.company_id, docType, ctx);
    return { ...ctx, renderedSections };
  };

  const homeownerName  = contact ? `${contact.first_name || ''} ${contact.last_name || ''}`.trim() : '';
  const homeownerEmail = contact?.email || '';

  // For a given doc type, find the most recent signing request
  const latestRequest = (docType: string) =>
    signingRequests.find((r) => r.doc_type === docType);

  const statusBadge = (req: SigningRequest) => {
    if (req.status === 'signed' || req.status === 'saved') {
      return (
        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 rounded-full px-2 py-0.5">
          Signed
        </span>
      );
    }
    if (new Date(req.expires_at) < new Date() || req.status === 'expired') {
      return (
        <span className="text-[10px] font-bold text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">
          Expired
        </span>
      );
    }
    return (
      <span className="text-[10px] font-bold text-amber-600 bg-amber-50 rounded-full px-2 py-0.5">
        Pending
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-10">
      <nav className="p-4 bg-white border-b border-slate-100 flex items-center gap-4 sticky top-0 z-10 shadow-sm">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-slate-400 active:scale-90 transition-transform">
          <ArrowLeft size={24} />
        </button>
        <h1 className="font-bold text-primary">Legal Documents</h1>
      </nav>

      <div className="p-6 space-y-4">
        {loading ? (
          [1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-24 bg-white rounded-2xl animate-pulse border border-slate-100" />
          ))
        ) : (
          LEGAL_DOCUMENT_TEMPLATES.map((doc) => {
            const detail  = signedDocDetails[doc.id];
            const isSigned = !!detail?.isSigned;
            const req      = latestRequest(doc.id);

            return (
              <div
                key={doc.id}
                className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden"
              >
                {/* Main row — tap to sign in person */}
                <button
                  onClick={() => navigate(`/contacts/${id}/documents/${doc.id}`)}
                  className="w-full p-4 flex items-center justify-between active:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className={cn('p-3 rounded-xl', isSigned ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-400')}>
                      {isSigned ? <CheckCircle2 size={22} /> : <FileText size={22} />}
                    </div>
                    <div className="text-left">
                      <p className="font-bold text-primary text-sm">{doc.title}</p>
                      <p className="text-[10px] text-slate-400 font-medium uppercase tracking-tight">{doc.description}</p>
                      {isSigned && detail && (
                        <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-tight mt-0.5">
                          {detail.pdfCount} PDF{detail.pdfCount === 1 ? '' : 's'} · {detail.signatureCount} signature{detail.signatureCount === 1 ? '' : 's'}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!isSigned && <Clock size={14} className="text-amber-500" />}
                    <ChevronRight size={18} className="text-slate-300" />
                  </div>
                </button>

                {/* e-Signature row */}
                <div className="border-t border-slate-50 px-4 py-3 flex items-center justify-between gap-3">
                  {req ? (
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {statusBadge(req)}
                      <span className="text-[11px] text-slate-400 truncate">
                        {req.homeowner_name}
                        {req.signed_at
                          ? ` · signed ${new Date(req.signed_at).toLocaleDateString()}`
                          : ` · sent ${new Date(req.created_at).toLocaleDateString()}`}
                      </span>
                    </div>
                  ) : (
                    <span className="text-[11px] text-slate-400 flex-1">Remote e-Signature</span>
                  )}

                  <div className="flex items-center gap-2 shrink-0">
                    {req?.status === 'signed' && req.pdf_public_url && (
                      <a
                        href={req.pdf_public_url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 text-[11px] font-bold text-blue-600 bg-blue-50 rounded-full px-2.5 py-1"
                      >
                        <ExternalLink size={10} /> View PDF
                      </a>
                    )}
                    <button
                      onClick={() => setSendModal({ docType: doc.id, docTitle: doc.title })}
                      className="flex items-center gap-1.5 text-[11px] font-bold text-blue-600 bg-blue-50
                        rounded-full px-3 py-1.5 active:bg-blue-100 transition-colors"
                    >
                      <Send size={11} />
                      {req ? 'Resend' : 'Send Link'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}

        {/* Custom form card */}
        <div className="bg-blue-600 p-6 rounded-2xl text-white shadow-xl mt-6">
          <h3 className="font-bold text-lg mb-2">Need a custom form?</h3>
          <p className="text-blue-100 text-xs leading-relaxed mb-4">
            Upload custom PDFs or request Change Orders from the office portal.
          </p>
          <button className="w-full py-3 bg-white/20 rounded-xl text-sm font-bold border border-white/30">
            Request New Template
          </button>
        </div>

        {/* Project Quick-Start Templates */}
        <div className="space-y-3 pt-2">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.18em] ml-1">Project Quick-Start</p>
          <p className="text-xs text-slate-500 ml-1">Jump straight to a pre-built estimate for common project types.</p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Roof Replacement', preset: 'roof_replacement', emoji: '🏠' },
              { label: 'Siding', preset: 'siding', emoji: '🏗️' },
              { label: 'Gutters', preset: 'gutters', emoji: '🌧️' },
              { label: 'Windows', preset: 'windows', emoji: '🪟' },
              { label: 'Interior Work', preset: 'interior', emoji: '🎨' },
              { label: 'Roof Repair', preset: 'repair', emoji: '🔧' },
            ].map((item) => (
              <button
                key={item.preset}
                onClick={() => navigate(`/contacts/${id}/estimate?preset=${item.preset}`)}
                className="flex items-center gap-3 p-4 bg-white border border-slate-100 rounded-2xl shadow-sm active:bg-slate-50 transition-colors text-left"
              >
                <span className="text-2xl">{item.emoji}</span>
                <div>
                  <p className="text-xs font-bold text-primary leading-tight">{item.label}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Estimate</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Send for e-Signature modal */}
      {sendModal && profile && contact && (
        <SendSignatureModal
          docType={sendModal.docType}
          docTitle={sendModal.docTitle}
          contactId={id!}
          companyId={profile.company_id!}
          homeownerName={homeownerName}
          homeownerEmail={homeownerEmail}
          documentContext={buildDocContext(sendModal.docType)}
          onClose={() => setSendModal(null)}
        />
      )}
    </div>
  );
}
