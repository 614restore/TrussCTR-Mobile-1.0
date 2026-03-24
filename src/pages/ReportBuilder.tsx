import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Download, Loader2, Share2, GitMerge, X, Plus } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { buildDocumentDisplayUrl, buildStoredDocumentUrl, fetchDocumentObjectUrl, resolveDocumentSignedUrl } from '../lib/documentAccess';
import { uploadToAvailableBucket } from '../lib/pdfService';

type PhotoDocument = {
  id: string;
  name: string;
  url: string;
  displayUrl?: string;
  created_at?: string;
};

type PhotoPair = {
  id: string;
  beforePhotoId: string;
  afterPhotoId: string;
  label: string;
};

async function blobToDataUrl(blob: Blob) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Unable to prepare image for PDF'));
    reader.readAsDataURL(blob);
  });
}

async function loadPhotoForPdf(documentUrl: string) {
  const loaded = await fetchDocumentObjectUrl(documentUrl);
  try {
    return await blobToDataUrl(loaded.blob);
  } finally {
    URL.revokeObjectURL(loaded.objectUrl);
  }
}

function formatPropertyAddress(contact: any) {
  return [contact?.address, contact?.city, contact?.state, contact?.zip].filter(Boolean).join(', ');
}

async function buildBeforeAfterReportPdf({
  companyName,
  companyAddress,
  companyPhone,
  companyEmail,
  contactName,
  propertyAddress,
  reportTitle,
  reportAudience,
  progressSummary,
  completionSummary,
  projectStatus,
  beforePhotos,
  afterPhotos,
  pairedPhotos,
}: {
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  contactName: string;
  propertyAddress: string;
  reportTitle: string;
  reportAudience: string;
  progressSummary: string;
  completionSummary: string;
  projectStatus: string;
  beforePhotos: Array<{ name: string; dataUrl: string }>;
  afterPhotos: Array<{ name: string; dataUrl: string }>;
  pairedPhotos: Array<{ label: string; before: { name: string; dataUrl: string }; after: { name: string; dataUrl: string } }>;
}) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const left = 14;
  const right = pageWidth - 14;
  const width = right - left;
  let y = 16;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - 16) {
      pdf.addPage();
      y = 16;
    }
  };

  const sectionTitle = (title: string, subtitle?: string) => {
    ensureSpace(14);
    pdf.setFillColor(15, 23, 42);
    pdf.roundedRect(left, y, width, 10, 3, 3, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.text(title, left + 4, y + 6.4);
    y += 14;
    if (subtitle) {
      pdf.setTextColor(100, 116, 139);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8.5);
      pdf.text(subtitle, left, y);
      y += 6;
    }
  };

  const paragraphBlock = (heading: string, body: string) => {
    const lines = pdf.splitTextToSize(body || 'None provided.', width - 8);
    const blockHeight = Math.max(18, lines.length * 4.2 + 10);
    ensureSpace(blockHeight);
    pdf.setFillColor(248, 250, 252);
    pdf.roundedRect(left, y, width, blockHeight, 3, 3, 'F');
    pdf.setTextColor(51, 65, 85);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.text(heading, left + 4, y + 5);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.text(lines, left + 4, y + 10);
    y += blockHeight + 6;
  };

  const photoSection = (title: string, photos: Array<{ name: string; dataUrl: string }>) => {
    sectionTitle(title, `${photos.length} photo${photos.length === 1 ? '' : 's'} included`);
    if (!photos.length) {
      paragraphBlock('Photo Log', 'No photos were selected for this section.');
      return;
    }

    const cardWidth = (width - 6) / 2;
    const imageHeight = 50;

    photos.forEach((photo, index) => {
      const x = index % 2 === 0 ? left : left + cardWidth + 6;
      if (index % 2 === 0) {
        ensureSpace(66);
      }
      if (index % 2 === 0 && index > 0) {
        y += 4;
      }

      pdf.setDrawColor(226, 232, 240);
      pdf.setFillColor(255, 255, 255);
      pdf.roundedRect(x, y, cardWidth, 62, 3, 3, 'FD');
      pdf.addImage(photo.dataUrl, photo.dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG', x + 2, y + 2, cardWidth - 4, imageHeight, undefined, 'FAST');
      pdf.setTextColor(51, 65, 85);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      const photoLabel = pdf.splitTextToSize(photo.name, cardWidth - 6);
      pdf.text(photoLabel, x + 3, y + 56);

      if (index % 2 === 1 || index === photos.length - 1) {
        y += 66;
      }
    });

    y += 2;
  };

  pdf.setFillColor(30, 64, 175);
  pdf.roundedRect(left, y, width, 28, 4, 4, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(18);
  pdf.text(companyName, left + 5, y + 10);
  pdf.setFontSize(9);
  pdf.text(reportTitle, left + 5, y + 17);
  pdf.setFontSize(8);
  pdf.text(`Prepared for ${reportAudience}`, left + 5, y + 23);
  y += 34;

  pdf.setTextColor(15, 23, 42);
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Customer', left, y);
  pdf.text('Project Location', left + 92, y);
  y += 5;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9.5);
  pdf.text(pdf.splitTextToSize(contactName || 'Customer', 84), left, y);
  pdf.text(pdf.splitTextToSize(propertyAddress || 'Project address pending', 84), left + 92, y);
  y += 16;

  pdf.setFont('helvetica', 'bold');
  pdf.text('Contractor Contact', left, y);
  pdf.text('Current Pipeline Stage', left + 92, y);
  y += 5;
  pdf.setFont('helvetica', 'normal');
  pdf.text(pdf.splitTextToSize([companyAddress, companyPhone, companyEmail].filter(Boolean).join('\n') || 'Company details pending', 84), left, y);
  pdf.text(String(projectStatus || 'Unknown').replaceAll('_', ' '), left + 92, y);
  y += 18;

  paragraphBlock('Progress Summary', progressSummary);
  paragraphBlock('Completion / Next-Step Summary', completionSummary);

  if (pairedPhotos.length > 0) {
    sectionTitle('Side-by-Side Comparisons', `${pairedPhotos.length} matched pair${pairedPhotos.length === 1 ? '' : 's'}`);
    const halfW = (width - 4) / 2;
    const imgH = 46;
    const cardH = imgH + 22;
    for (const pair of pairedPhotos) {
      ensureSpace(cardH + 14);
      // Before card
      pdf.setFillColor(255, 251, 235);
      pdf.roundedRect(left, y, halfW, cardH, 3, 3, 'F');
      pdf.setTextColor(180, 83, 9);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7);
      pdf.text('BEFORE', left + 3, y + 5);
      pdf.addImage(pair.before.dataUrl, pair.before.dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG', left + 2, y + 7, halfW - 4, imgH, undefined, 'FAST');
      pdf.setTextColor(51, 65, 85);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.5);
      const beforeLabel = pdf.splitTextToSize(pair.before.name, halfW - 6);
      pdf.text(beforeLabel, left + 3, y + imgH + 10);
      // After card
      const rx = left + halfW + 4;
      pdf.setFillColor(240, 253, 244);
      pdf.roundedRect(rx, y, halfW, cardH, 3, 3, 'F');
      pdf.setTextColor(21, 128, 61);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7);
      pdf.text('AFTER', rx + 3, y + 5);
      pdf.addImage(pair.after.dataUrl, pair.after.dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG', rx + 2, y + 7, halfW - 4, imgH, undefined, 'FAST');
      pdf.setTextColor(51, 65, 85);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.5);
      const afterLabel = pdf.splitTextToSize(pair.after.name, halfW - 6);
      pdf.text(afterLabel, rx + 3, y + imgH + 10);
      y += cardH + 4;
      // Pair label
      pdf.setTextColor(100, 116, 139);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.text(pair.label, left, y);
      y += 8;
    }
    y += 4;
  }

  photoSection('Before Conditions', beforePhotos);
  photoSection('After / Current Conditions', afterPhotos);

  ensureSpace(16);
  pdf.setDrawColor(226, 232, 240);
  pdf.line(left, y, right, y);
  y += 6;
  pdf.setTextColor(100, 116, 139);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.text(`Generated ${new Date().toLocaleString()} • Saved from TrussCTR Mobile`, left, y);

  return pdf.output('blob');
}

function PhotoCard({
  photo,
  selected,
  onClick,
  tone,
}: {
  photo: PhotoDocument;
  selected: boolean;
  onClick: () => void;
  tone: 'before' | 'after';
}) {
  const activeClasses = tone === 'before'
    ? 'border-amber-400 ring-2 ring-amber-200'
    : 'border-emerald-400 ring-2 ring-emerald-200';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`overflow-hidden rounded-2xl border bg-white text-left shadow-sm transition ${selected ? activeClasses : 'border-slate-200'}`}
    >
      <div className="aspect-[4/3] bg-slate-100">
        <img
          src={photo.displayUrl || photo.url}
          alt={photo.name}
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
        />
      </div>
      <div className="space-y-1 p-3">
        <p className="truncate text-xs font-bold text-primary">{photo.name}</p>
        <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400">
          {selected ? (tone === 'before' ? 'Before selected' : 'After selected') : 'Tap to add'}
        </p>
      </div>
    </button>
  );
}

export default function ReportBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [contact, setContact] = useState<any>(null);
  const [company, setCompany] = useState<any>(null);
  const [photos, setPhotos] = useState<PhotoDocument[]>([]);
  const [beforeSelection, setBeforeSelection] = useState<string[]>([]);
  const [afterSelection, setAfterSelection] = useState<string[]>([]);
  const [reportTitle, setReportTitle] = useState('Before & After Project Report');
  const [reportAudience, setReportAudience] = useState('Homeowner and insurance adjuster');
  const [progressSummary, setProgressSummary] = useState('');
  const [completionSummary, setCompletionSummary] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [savedDocumentId, setSavedDocumentId] = useState<string | null>(null);
  const [savedDocumentUrl, setSavedDocumentUrl] = useState<string | null>(null);
  const [savedBlob, setSavedBlob] = useState<Blob | null>(null);
  const [pairs, setPairs] = useState<PhotoPair[]>([]);
  const [pairBeforeId, setPairBeforeId] = useState('');
  const [pairAfterId, setPairAfterId] = useState('');
  const [pairLabel, setPairLabel] = useState('');

  const addPair = () => {
    if (!pairBeforeId || !pairAfterId) return;
    const beforePhoto = photos.find(p => p.id === pairBeforeId);
    const label = pairLabel.trim() || beforePhoto?.name || 'Comparison';
    setPairs(prev => [...prev, { id: `${Date.now()}`, beforePhotoId: pairBeforeId, afterPhotoId: pairAfterId, label }]);
    setPairBeforeId('');
    setPairAfterId('');
    setPairLabel('');
  };

  const removePair = (pairId: string) => setPairs(prev => prev.filter(p => p.id !== pairId));

  useEffect(() => {
    const fetchData = async () => {
      if (!id || !profile?.company_id) return;
      setLoading(true);
      try {
        const [{ data: contactData, error: contactError }, { data: photoData, error: photoError }, { data: companyData, error: companyError }] = await Promise.all([
          supabase.from('contacts').select('*').eq('id', id).single(),
          supabase.from('documents').select('*').eq('contact_id', id).eq('type', 'photo').order('created_at', { ascending: true }),
          supabase.from('companies').select('*').eq('id', profile.company_id).single(),
        ]);

        if (contactError) throw contactError;
        if (photoError) throw photoError;
        setContact(contactData);
        setCompany(companyError ? null : companyData);

        type RawPhoto = { id: string; name: string; url: string; created_at: string };
        const preparedPhotos = await Promise.all(
          ((photoData || []) as RawPhoto[]).map(async (photo): Promise<PhotoDocument> => ({
            id: photo.id,
            name: photo.name,
            url: photo.url,
            displayUrl: typeof photo.url === 'string' ? await buildDocumentDisplayUrl(photo.url) : photo.url,
            created_at: photo.created_at,
          }))
        );

        setPhotos(preparedPhotos);
      } catch (err) {
        console.error('Error loading report builder:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id, profile?.company_id]);

  const beforePhotos = useMemo(
    () => photos.filter((photo) => beforeSelection.includes(photo.id)),
    [photos, beforeSelection]
  );
  const afterPhotos = useMemo(
    () => photos.filter((photo) => afterSelection.includes(photo.id)),
    [photos, afterSelection]
  );

  const togglePhoto = (photoId: string, bucket: 'before' | 'after') => {
    if (bucket === 'before') {
      setBeforeSelection((current) =>
        current.includes(photoId) ? current.filter((id) => id !== photoId) : [...current, photoId]
      );
      setAfterSelection((current) => current.filter((id) => id !== photoId));
      return;
    }

    setAfterSelection((current) =>
      current.includes(photoId) ? current.filter((id) => id !== photoId) : [...current, photoId]
    );
    setBeforeSelection((current) => current.filter((id) => id !== photoId));
  };

  const saveReport = async () => {
    if (!id || !profile || !contact) return;
    if (!beforeSelection.length && !afterSelection.length) {
      alert('Select at least one before or after photo before saving the report.');
      return;
    }

    setSaving(true);
    try {
      const preparedBefore = await Promise.all(beforePhotos.map(async (photo) => ({
        name: photo.name,
        dataUrl: await loadPhotoForPdf(photo.url),
      })));

      const preparedAfter = await Promise.all(afterPhotos.map(async (photo) => ({
        name: photo.name,
        dataUrl: await loadPhotoForPdf(photo.url),
      })));

      const preparedPairs = await Promise.all(pairs.map(async (pair) => {
        const before = photos.find(p => p.id === pair.beforePhotoId);
        const after = photos.find(p => p.id === pair.afterPhotoId);
        if (!before || !after) return null;
        return {
          label: pair.label,
          before: { name: before.name, dataUrl: await loadPhotoForPdf(before.url) },
          after: { name: after.name, dataUrl: await loadPhotoForPdf(after.url) },
        };
      }));
      const validPairs = preparedPairs.filter(Boolean) as Array<{ label: string; before: { name: string; dataUrl: string }; after: { name: string; dataUrl: string } }>;

      const contactName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 'Customer';
      const propertyAddress = formatPropertyAddress(contact);
      const pdfBlob = await buildBeforeAfterReportPdf({
        companyName: company?.name || 'TrussCTR',
        companyAddress: company?.address || 'Company address pending',
        companyPhone: company?.phone || '',
        companyEmail: company?.email || '',
        contactName,
        propertyAddress,
        reportTitle,
        reportAudience,
        progressSummary,
        completionSummary,
        projectStatus: contact.status,
        beforePhotos: preparedBefore,
        afterPhotos: preparedAfter,
        pairedPhotos: validPairs,
      });

      const fileName = `${reportTitle.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${Date.now()}.pdf`;
      const uploaded = await uploadToAvailableBucket(`${id}/reports/${fileName}`, pdfBlob, 'application/pdf');
      const savedUrl = buildStoredDocumentUrl(uploaded.publicUrl, uploaded.bucket, uploaded.path);

      const { data: savedDocument, error: saveError } = await (supabase.from('documents') as any)
        .insert({
          contact_id: id,
          company_id: profile.company_id,
          name: `${reportTitle} - ${contactName}`,
          type: 'insurance',
          url: savedUrl,
          size: pdfBlob.size,
          uploaded_by: profile.id,
        })
        .select('id')
        .single();

      if (saveError) throw saveError;

      await (supabase.from('communications') as any).insert({
        contact_id: id,
        company_id: profile.company_id,
        type: 'note',
        content: `Before & after report saved. Before photos: ${beforeSelection.length}. After photos: ${afterSelection.length}. Audience: ${reportAudience}.`,
        user_id: profile.id,
        direction: 'outbound',
      });

      setSavedBlob(pdfBlob);
      setSavedDocumentId(savedDocument?.id || null);
      setSavedDocumentUrl(uploaded.signedUrl);
    } catch (err) {
      console.error('Error saving before/after report:', err);
      alert(`Unable to save the report. ${(err as Error)?.message || ''}`);
    } finally {
      setSaving(false);
    }
  };

  const shareSavedReport = async () => {
    if (!savedDocumentId || !savedDocumentUrl || !savedBlob) {
      alert('Save the report first before sharing it.');
      return;
    }

    const contactName = `${contact?.first_name || ''} ${contact?.last_name || ''}`.trim() || 'Customer';
    const propertyAddress = formatPropertyAddress(contact);
    setSharing(true);
    try {
      const file = new File([savedBlob], `${reportTitle.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`, { type: 'application/pdf' });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: `${reportTitle} - ${contactName}`,
          text: `Project progress report for ${contactName}${propertyAddress ? ` at ${propertyAddress}` : ''}`,
          files: [file],
        });
      } else if (navigator.share) {
        await navigator.share({
          title: `${reportTitle} - ${contactName}`,
          text: `Project progress report for ${contactName}${propertyAddress ? ` at ${propertyAddress}` : ''}`,
          url: savedDocumentUrl,
        });
      } else {
        window.open(savedDocumentUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      console.error('Error sharing before/after report:', err);
    } finally {
      setSharing(false);
    }
  };

  const reopenSavedReport = async () => {
    if (savedDocumentId) {
      navigate(`/documents/view/${savedDocumentId}`);
      return;
    }

    if (savedDocumentUrl) {
      try {
        const { signedUrl } = await resolveDocumentSignedUrl(savedDocumentUrl);
        window.open(signedUrl, '_blank', 'noopener,noreferrer');
      } catch {
        window.open(savedDocumentUrl, '_blank', 'noopener,noreferrer');
      }
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-slate-100">
        <nav className="sticky top-0 z-20 flex items-center gap-4 border-b border-slate-100 bg-white p-4 shadow-sm">
          <button onClick={() => navigate(-1)} className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100">
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-bold text-primary">Before & After Report</h1>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">Saved PDF for homeowners and adjusters</p>
          </div>
        </nav>

        <div className="flex-1 space-y-4 overflow-y-auto p-4 pb-32">
          <div className="rounded-3xl bg-primary p-5 text-white shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-blue-100">Project Report</p>
            <h2 className="mt-2 text-2xl font-black">{contact?.first_name} {contact?.last_name}</h2>
            <p className="mt-2 text-sm text-blue-100">{formatPropertyAddress(contact) || 'Property address pending'}</p>
            <p className="mt-4 inline-flex rounded-full bg-white/15 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em]">
              Current stage: {String(contact?.status || 'unknown').replaceAll('_', ' ')}
            </p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Report title</label>
                <input
                  value={reportTitle}
                  onChange={(event) => setReportTitle(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-primary outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Audience</label>
                <input
                  value={reportAudience}
                  onChange={(event) => setReportAudience(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-primary outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Progress summary</label>
                <textarea
                  value={progressSummary}
                  onChange={(event) => setProgressSummary(event.target.value)}
                  placeholder="Summarize where the project started, what damage or conditions were documented, and what changed during the job."
                  className="mt-2 h-28 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-primary outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Completion / next-step summary</label>
                <textarea
                  value={completionSummary}
                  onChange={(event) => setCompletionSummary(event.target.value)}
                  placeholder="Summarize completed work, open items, pick-up-check notes, or what the homeowner / adjuster should review next."
                  className="mt-2 h-28 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-primary outline-none focus:border-accent"
                />
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-amber-900">Before Photos</h3>
                <p className="text-[11px] text-amber-700">Select evidence of pre-job conditions, storm damage, or starting scope.</p>
              </div>
              <span className="rounded-full bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-amber-700">
                {beforeSelection.length} selected
              </span>
            </div>
            {photos.length ? (
              <div className="grid grid-cols-2 gap-3">
                {photos.map((photo: PhotoDocument) => (
                  <PhotoCard
                    key={`before-${photo.id}`}
                    photo={photo}
                    selected={beforeSelection.includes(photo.id)}
                    onClick={() => togglePhoto(photo.id, 'before')}
                    tone="before"
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-amber-800">No customer photos are available yet. Upload project photos from the Docs tab first.</p>
            )}
          </div>

          <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-emerald-900">After / Current Photos</h3>
                <p className="text-[11px] text-emerald-700">Select progress or completion images to show results and current job condition.</p>
              </div>
              <span className="rounded-full bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-700">
                {afterSelection.length} selected
              </span>
            </div>
            {photos.length ? (
              <div className="grid grid-cols-2 gap-3">
                {photos.map((photo: PhotoDocument) => (
                  <PhotoCard
                    key={`after-${photo.id}`}
                    photo={photo}
                    selected={afterSelection.includes(photo.id)}
                    onClick={() => togglePhoto(photo.id, 'after')}
                    tone="after"
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-emerald-800">No customer photos are available yet. Upload project photos from the Docs tab first.</p>
            )}
          </div>

          {/* Photo Pairs */}
          <div className="rounded-3xl border border-indigo-200 bg-indigo-50 p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-bold text-indigo-900">
                  <GitMerge size={15} /> Photo Pairs
                </h3>
                <p className="text-[11px] text-indigo-700">Match a Before + After photo to show them side by side in the PDF.</p>
              </div>
              <span className="rounded-full bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-700">
                {pairs.length} pair{pairs.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Existing pairs */}
            {pairs.length > 0 && (
              <div className="mb-4 space-y-3">
                {pairs.map(pair => {
                  const before = photos.find(p => p.id === pair.beforePhotoId);
                  const after = photos.find(p => p.id === pair.afterPhotoId);
                  return (
                    <div key={pair.id} className="rounded-2xl bg-white border border-indigo-100 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-bold text-indigo-800 truncate max-w-[220px]">{pair.label}</p>
                        <button onClick={() => removePair(pair.id)} className="text-slate-400 hover:text-rose-500 p-1">
                          <X size={13} />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {before && (
                          <div className="space-y-1">
                            <p className="text-[9px] font-bold uppercase text-amber-600">Before</p>
                            <div className="aspect-[4/3] rounded-xl overflow-hidden bg-amber-50 border border-amber-100">
                              <img src={before.displayUrl || before.url} alt={before.name} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                            </div>
                            <p className="text-[9px] text-slate-500 truncate">{before.name}</p>
                          </div>
                        )}
                        {after && (
                          <div className="space-y-1">
                            <p className="text-[9px] font-bold uppercase text-emerald-600">After</p>
                            <div className="aspect-[4/3] rounded-xl overflow-hidden bg-emerald-50 border border-emerald-100">
                              <img src={after.displayUrl || after.url} alt={after.name} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                            </div>
                            <p className="text-[9px] text-slate-500 truncate">{after.name}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add new pair */}
            {photos.length >= 2 ? (
              <div className="rounded-2xl bg-white border border-indigo-100 p-4 space-y-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">New Pair</p>
                <div>
                  <label className="text-[10px] font-bold text-amber-700 uppercase block mb-1">Before Photo</label>
                  <select
                    value={pairBeforeId}
                    onChange={e => setPairBeforeId(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-amber-50 px-3 py-2 text-xs text-primary outline-none"
                  >
                    <option value="">Select before photo…</option>
                    {photos.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-emerald-700 uppercase block mb-1">After Photo</label>
                  <select
                    value={pairAfterId}
                    onChange={e => setPairAfterId(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-emerald-50 px-3 py-2 text-xs text-primary outline-none"
                  >
                    <option value="">Select after photo…</option>
                    {photos.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Pair Label (optional)</label>
                  <input
                    value={pairLabel}
                    onChange={e => setPairLabel(e.target.value)}
                    placeholder="e.g. North Elevation"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-primary outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={addPair}
                  disabled={!pairBeforeId || !pairAfterId}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-xs font-bold text-white disabled:opacity-40"
                >
                  <Plus size={13} /> Add Pair
                </button>
              </div>
            ) : (
              <p className="text-sm text-indigo-700">Upload at least two photos to create pairs.</p>
            )}
          </div>

          {(savedDocumentId || savedDocumentUrl) && (
            <div className="rounded-3xl border border-emerald-200 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
                  <CheckCircle2 size={22} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-emerald-700">Report saved to Documents</p>
                  <p className="mt-1 text-[11px] text-slate-500">You can reopen it later from the customer Docs tab or the Documents screen.</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={reopenSavedReport}
                  className="rounded-2xl bg-primary py-3 text-sm font-bold text-white"
                >
                  View PDF
                </button>
                <button
                  type="button"
                  onClick={shareSavedReport}
                  disabled={sharing}
                  className="rounded-2xl bg-slate-100 py-3 text-sm font-bold text-primary disabled:opacity-50"
                >
                  {sharing ? 'Sharing...' : 'Share'}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="fixed bottom-0 w-full max-w-md border-t border-slate-100 bg-white p-4 shadow-[0_-8px_24px_rgba(15,23,42,0.08)]">
          <div className="grid grid-cols-3 gap-3">
            <button
              type="button"
              onClick={saveReport}
              disabled={saving}
              className="col-span-2 rounded-2xl bg-primary py-4 text-sm font-bold text-white disabled:opacity-50"
            >
              {saving ? 'Saving Report...' : 'Save Report PDF'}
            </button>
            <button
              type="button"
              onClick={savedDocumentId ? reopenSavedReport : shareSavedReport}
              disabled={!savedDocumentId || saving}
              className="rounded-2xl bg-slate-100 py-4 text-sm font-bold text-primary disabled:opacity-50"
            >
              {savedDocumentId ? <Download className="mx-auto h-5 w-5" /> : <Share2 className="mx-auto h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
