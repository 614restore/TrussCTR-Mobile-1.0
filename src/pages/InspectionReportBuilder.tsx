import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, CheckCircle2, Circle as CircleIcon,
  Download, Loader2, Pen, Pencil, RotateCcw, Share2, Square, X,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import {
  buildDocumentDisplayUrl,
  buildStoredDocumentUrl,
  fetchDocumentObjectUrl,
  resolveDocumentSignedUrl,
} from '../lib/documentAccess';
import { uploadToAvailableBucket } from '../lib/pdfService';

// ─── Types ────────────────────────────────────────────────────────────────────

type DamageTag = 'Hail' | 'Wind' | 'Water' | 'Structural' | 'Wear' | 'Missing' | 'Other';
type DrawTool = 'pen' | 'arrow' | 'circle' | 'rect';

const DAMAGE_TAGS: DamageTag[] = ['Hail', 'Wind', 'Water', 'Structural', 'Wear', 'Missing', 'Other'];

const DAMAGE_TAG_CLASSES: Record<DamageTag, string> = {
  Hail: 'bg-blue-100 text-blue-800',
  Wind: 'bg-amber-100 text-amber-800',
  Water: 'bg-cyan-100 text-cyan-800',
  Structural: 'bg-red-100 text-red-800',
  Wear: 'bg-slate-100 text-slate-700',
  Missing: 'bg-rose-100 text-rose-800',
  Other: 'bg-purple-100 text-purple-800',
};

// PDF tag colors [bg R,G,B] and [text R,G,B]
const PDF_TAG_COLORS: Record<string, { bg: [number, number, number]; fg: [number, number, number] }> = {
  Hail:       { bg: [219, 234, 254], fg: [30, 64, 175] },
  Wind:       { bg: [254, 243, 199], fg: [146, 64, 14] },
  Water:      { bg: [207, 250, 254], fg: [22, 78, 99] },
  Structural: { bg: [254, 226, 226], fg: [153, 27, 27] },
  Wear:       { bg: [241, 245, 249], fg: [71, 85, 105] },
  Missing:    { bg: [255, 228, 230], fg: [159, 18, 57] },
  Other:      { bg: [245, 243, 255], fg: [91, 33, 182] },
};

type PhotoEntry = {
  id: string;
  name: string;
  url: string;
  displayUrl?: string;
  note: string;
  damageTags: DamageTag[];
  markupDataUrl: string | null;
};

// ─── PDF Builder ──────────────────────────────────────────────────────────────

function formatAddress(contact: any): string {
  return [contact?.address, contact?.city, contact?.state, contact?.zip].filter(Boolean).join(', ');
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Unable to read image'));
    reader.readAsDataURL(blob);
  });
}

async function loadPhotoDataUrl(documentUrl: string): Promise<string> {
  const loaded = await fetchDocumentObjectUrl(documentUrl);
  try {
    return await blobToDataUrl(loaded.blob);
  } finally {
    URL.revokeObjectURL(loaded.objectUrl);
  }
}

async function buildInspectionReportPdf({
  companyName,
  companyAddress,
  companyPhone,
  companyEmail,
  contactName,
  propertyAddress,
  inspectorName,
  reportTitle,
  overallNotes,
  photos,
}: {
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  contactName: string;
  propertyAddress: string;
  inspectorName: string;
  reportTitle: string;
  overallNotes: string;
  photos: Array<{ name: string; dataUrl: string; note: string; damageTags: DamageTag[] }>;
}): Promise<Blob> {
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

  const textBox = (heading: string, body: string) => {
    const lines = pdf.splitTextToSize(body || 'None provided.', width - 8);
    const blockH = Math.max(18, lines.length * 4.2 + 10);
    ensureSpace(blockH);
    pdf.setFillColor(248, 250, 252);
    pdf.roundedRect(left, y, width, blockH, 3, 3, 'F');
    pdf.setTextColor(51, 65, 85);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.text(heading, left + 4, y + 5);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.text(lines, left + 4, y + 10);
    y += blockH + 6;
  };

  // Header
  pdf.setFillColor(30, 64, 175);
  pdf.roundedRect(left, y, width, 28, 4, 4, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(18);
  pdf.text(companyName, left + 5, y + 10);
  pdf.setFontSize(9);
  pdf.text(reportTitle, left + 5, y + 17);
  pdf.setFontSize(8);
  pdf.text('Prepared for Homeowner & Insurance Adjuster', left + 5, y + 23);
  y += 34;

  // Property / Inspector info
  pdf.setTextColor(15, 23, 42);
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Property Owner', left, y);
  pdf.text('Property Address', left + 92, y);
  y += 5;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9.5);
  pdf.text(pdf.splitTextToSize(contactName || '—', 84), left, y);
  pdf.text(pdf.splitTextToSize(propertyAddress || '—', 84), left + 92, y);
  y += 14;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.text('Inspector', left, y);
  pdf.text('Inspection Date', left + 92, y);
  y += 5;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9.5);
  pdf.text(
    pdf.splitTextToSize(
      [inspectorName, companyAddress, companyPhone, companyEmail].filter(Boolean).join('\n'),
      84,
    ),
    left,
    y,
  );
  pdf.text(
    new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    left + 92,
    y,
  );
  y += 22;

  if (overallNotes.trim()) {
    textBox('Inspector Summary', overallNotes);
  }

  // Findings
  sectionTitle(
    'Inspection Findings',
    `${photos.length} photo${photos.length === 1 ? '' : 's'} documented`,
  );

  for (const photo of photos) {
    const imgH = 82;
    const noteLines = photo.note.trim()
      ? pdf.splitTextToSize(photo.note, width - 8)
      : [];
    const noteH = noteLines.length ? Math.max(14, noteLines.length * 4.2 + 8) : 0;
    const tagRowH = photo.damageTags.length ? 12 : 0;
    const needed = 6 + imgH + 4 + tagRowH + noteH + 10;
    ensureSpace(needed);

    // Photo label
    pdf.setTextColor(51, 65, 85);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.text(photo.name, left, y + 4);
    y += 7;

    // Photo image
    pdf.setDrawColor(226, 232, 240);
    pdf.setFillColor(255, 255, 255);
    pdf.roundedRect(left, y, width, imgH, 3, 3, 'FD');
    try {
      const fmt = photo.dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      pdf.addImage(photo.dataUrl, fmt, left + 1, y + 1, width - 2, imgH - 2, undefined, 'FAST');
    } catch {
      // image failed — leave white box
    }
    y += imgH + 4;

    // Damage tags
    if (photo.damageTags.length) {
      let tagX = left;
      pdf.setFontSize(7.5);
      pdf.setFont('helvetica', 'bold');
      for (const tag of photo.damageTags) {
        const tagW = pdf.getTextWidth(tag) + 7;
        const { bg, fg } = PDF_TAG_COLORS[tag] ?? { bg: [241, 245, 249], fg: [51, 65, 85] };
        pdf.setFillColor(...bg);
        pdf.roundedRect(tagX, y, tagW, 6.5, 2, 2, 'F');
        pdf.setTextColor(...fg);
        pdf.text(tag, tagX + 3.5, y + 4.5);
        tagX += tagW + 3;
      }
      y += 12;
    }

    // Note
    if (noteLines.length) {
      pdf.setFillColor(248, 250, 252);
      pdf.roundedRect(left, y, width, noteH, 3, 3, 'F');
      pdf.setTextColor(71, 85, 105);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8.5);
      pdf.text(noteLines, left + 4, y + 5);
      y += noteH + 4;
    }

    y += 10;
  }

  // Footer
  ensureSpace(14);
  pdf.setDrawColor(226, 232, 240);
  pdf.line(left, y, right, y);
  y += 6;
  pdf.setTextColor(100, 116, 139);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.text(`Generated ${new Date().toLocaleString()} • TrussCTR Mobile`, left, y);

  return pdf.output('blob');
}

// ─── Arrow helper ─────────────────────────────────────────────────────────────

function drawArrow(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  headLen: number,
) {
  const angle = Math.atan2(toY - fromY, toX - fromX);
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - headLen * Math.cos(angle - Math.PI / 6), toY - headLen * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(toX - headLen * Math.cos(angle + Math.PI / 6), toY - headLen * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}

// ─── Markup Modal ─────────────────────────────────────────────────────────────

function MarkupModal({
  photo,
  onDone,
  onClose,
}: {
  photo: PhotoEntry;
  onDone: (markupDataUrl: string) => void;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<DrawTool>('pen');
  const [color, setColor] = useState('#ef4444');

  // Use refs inside event handlers to avoid stale closure
  const toolRef = useRef(tool);
  const colorRef = useRef(color);
  const isDrawingRef = useRef(false);
  const startPosRef = useRef({ x: 0, y: 0 });
  const snapshotsRef = useRef<ImageData[]>([]);
  const imageLoadedRef = useRef(false);
  const scaleRef = useRef({ x: 1, y: 1 });

  useEffect(() => { toolRef.current = tool; }, [tool]);
  useEffect(() => { colorRef.current = color; }, [color]);

  // Load photo into canvas via fetch (CORS-safe for canvas operations)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    imageLoadedRef.current = false;
    snapshotsRef.current = [];

    let objectUrl: string | null = null;

    const load = async () => {
      try {
        const imgSrc = photo.markupDataUrl
          ? photo.markupDataUrl
          : await (async () => {
              const loaded = await fetchDocumentObjectUrl(photo.url);
              objectUrl = loaded.objectUrl;
              return loaded.objectUrl;
            })();

        const img = new Image();
        img.onload = () => {
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(img, 0, 0);
          snapshotsRef.current = [ctx.getImageData(0, 0, canvas.width, canvas.height)];
          imageLoadedRef.current = true;
          if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
        };
        img.onerror = () => {
          if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
        };
        img.src = imgSrc;
      } catch (err) {
        console.error('[MarkupModal] image load error:', err);
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      }
    };

    load();
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [photo.url, photo.markupDataUrl]);

  const getPos = useCallback((e: TouchEvent | MouseEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    scaleRef.current = { x: sx, y: sy };

    let clientX: number;
    let clientY: number;
    if ('touches' in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if ('changedTouches' in e && (e as TouchEvent).changedTouches.length > 0) {
      clientX = (e as TouchEvent).changedTouches[0].clientX;
      clientY = (e as TouchEvent).changedTouches[0].clientY;
    } else {
      clientX = (e as MouseEvent).clientX;
      clientY = (e as MouseEvent).clientY;
    }
    return { x: (clientX - rect.left) * sx, y: (clientY - rect.top) * sy };
  }, []);

  // Native event listeners (passive: false so we can call preventDefault)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const setupCtx = (ctx: CanvasRenderingContext2D) => {
      ctx.strokeStyle = colorRef.current;
      ctx.fillStyle = colorRef.current;
      ctx.lineWidth = Math.max(3, 3 * scaleRef.current.x);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    };

    const onStart = (e: TouchEvent | MouseEvent) => {
      e.preventDefault();
      if (!imageLoadedRef.current) return;
      isDrawingRef.current = true;
      const pos = getPos(e);
      startPosRef.current = pos;

      const ctx = canvas.getContext('2d')!;
      setupCtx(ctx);
      if (toolRef.current === 'pen') {
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
      }
    };

    const onMove = (e: TouchEvent | MouseEvent) => {
      e.preventDefault();
      if (!isDrawingRef.current) return;
      const pos = getPos(e);
      const ctx = canvas.getContext('2d')!;

      if (toolRef.current === 'pen') {
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
      } else {
        // Restore pre-stroke snapshot for live preview
        const snaps = snapshotsRef.current;
        if (snaps.length) ctx.putImageData(snaps[snaps.length - 1], 0, 0);
        setupCtx(ctx);
        const { x: sx, y: sy } = startPosRef.current;
        const headLen = Math.max(16, 16 * scaleRef.current.x);

        if (toolRef.current === 'arrow') {
          drawArrow(ctx, sx, sy, pos.x, pos.y, headLen);
        } else if (toolRef.current === 'circle') {
          const rx = Math.abs(pos.x - sx) / 2;
          const ry = Math.abs(pos.y - sy) / 2;
          ctx.beginPath();
          ctx.ellipse((sx + pos.x) / 2, (sy + pos.y) / 2, rx, ry, 0, 0, Math.PI * 2);
          ctx.stroke();
        } else if (toolRef.current === 'rect') {
          ctx.beginPath();
          ctx.strokeRect(sx, sy, pos.x - sx, pos.y - sy);
        }
      }
    };

    const onEnd = (e: TouchEvent | MouseEvent) => {
      e.preventDefault();
      if (!isDrawingRef.current) return;
      isDrawingRef.current = false;
      const ctx = canvas.getContext('2d')!;
      if (toolRef.current === 'pen') ctx.closePath();
      // Save snapshot after stroke completes
      snapshotsRef.current = [
        ...snapshotsRef.current,
        ctx.getImageData(0, 0, canvas.width, canvas.height),
      ];
    };

    canvas.addEventListener('touchstart', onStart as EventListener, { passive: false });
    canvas.addEventListener('touchmove', onMove as EventListener, { passive: false });
    canvas.addEventListener('touchend', onEnd as EventListener, { passive: false });
    canvas.addEventListener('mousedown', onStart as EventListener);
    canvas.addEventListener('mousemove', onMove as EventListener);
    canvas.addEventListener('mouseup', onEnd as EventListener);

    return () => {
      canvas.removeEventListener('touchstart', onStart as EventListener);
      canvas.removeEventListener('touchmove', onMove as EventListener);
      canvas.removeEventListener('touchend', onEnd as EventListener);
      canvas.removeEventListener('mousedown', onStart as EventListener);
      canvas.removeEventListener('mousemove', onMove as EventListener);
      canvas.removeEventListener('mouseup', onEnd as EventListener);
    };
  }, [getPos]);

  const undo = () => {
    const canvas = canvasRef.current;
    if (!canvas || snapshotsRef.current.length <= 1) return;
    snapshotsRef.current = snapshotsRef.current.slice(0, -1);
    const ctx = canvas.getContext('2d')!;
    ctx.putImageData(snapshotsRef.current[snapshotsRef.current.length - 1], 0, 0);
  };

  const DRAW_TOOLS: Array<{ id: DrawTool; Icon: React.ElementType; label: string }> = [
    { id: 'pen', Icon: Pen, label: 'Draw' },
    { id: 'arrow', Icon: ArrowRight, label: 'Arrow' },
    { id: 'circle', Icon: CircleIcon, label: 'Circle' },
    { id: 'rect', Icon: Square, label: 'Box' },
  ];

  const COLORS = ['#ef4444', '#f59e0b', '#3b82f6', '#ffffff'];

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900">
      {/* Top toolbar */}
      <div className="flex items-center gap-1 px-3 py-2 bg-slate-800 border-b border-white/10">
        <button
          onClick={onClose}
          className="p-2 rounded-full text-slate-400 hover:text-white transition-colors"
        >
          <X size={20} />
        </button>

        <div className="flex items-center gap-1 flex-1">
          {DRAW_TOOLS.map(({ id, Icon, label }) => (
            <button
              key={id}
              onClick={() => setTool(id)}
              className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                tool === id ? 'bg-accent text-white' : 'text-slate-400 hover:bg-white/10'
              }`}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 mx-2">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`w-6 h-6 rounded-full border-2 transition-transform ${
                color === c ? 'scale-125 border-white' : 'border-white/20'
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>

        <button
          onClick={undo}
          className="p-2 rounded-full text-slate-400 hover:text-white transition-colors"
        >
          <RotateCcw size={18} />
        </button>
      </div>

      {/* Canvas area */}
      <div className="flex-1 overflow-hidden flex items-center justify-center bg-slate-950 p-2">
        <canvas
          ref={canvasRef}
          className="max-w-full max-h-full rounded-lg"
          style={{ touchAction: 'none', cursor: 'crosshair' }}
        />
      </div>

      {/* Bottom action */}
      <div className="p-4 bg-slate-800 border-t border-white/10">
        <button
          onClick={() => {
            const canvas = canvasRef.current;
            if (canvas) onDone(canvas.toDataURL('image/jpeg', 0.92));
          }}
          className="w-full bg-accent text-white font-bold py-3 rounded-2xl text-sm"
        >
          Apply Markup
        </button>
      </div>
    </div>
  );
}

// ─── Photo Card ───────────────────────────────────────────────────────────────

function PhotoCard({
  photo,
  onMarkup,
  onTagToggle,
  onNoteChange,
}: {
  photo: PhotoEntry;
  onMarkup: () => void;
  onTagToggle: (tag: DamageTag) => void;
  onNoteChange: (note: string) => void;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Photo with markup overlay button */}
      <div className="relative">
        <img
          src={photo.markupDataUrl || photo.displayUrl || photo.url}
          alt={photo.name}
          className="w-full aspect-[4/3] object-cover"
          referrerPolicy="no-referrer"
        />
        {photo.markupDataUrl && (
          <div className="absolute top-3 left-3 rounded-full bg-accent/90 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide text-white shadow">
            Marked up
          </div>
        )}
        <button
          onClick={onMarkup}
          className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-primary/85 px-3 py-1.5 text-[11px] font-bold text-white shadow-lg backdrop-blur-sm"
        >
          <Pencil size={12} />
          {photo.markupDataUrl ? 'Edit' : 'Markup'}
        </button>
      </div>

      {/* Photo name */}
      <div className="px-4 pt-3">
        <p className="text-xs font-bold text-primary truncate">{photo.name}</p>
      </div>

      {/* Damage tags */}
      <div className="px-4 pt-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 mb-2">
          Damage Types
        </p>
        <div className="flex flex-wrap gap-2">
          {DAMAGE_TAGS.map((tag) => (
            <button
              key={tag}
              onClick={() => onTagToggle(tag)}
              className={`rounded-full px-3 py-1 text-[11px] font-bold transition-colors ${
                photo.damageTags.includes(tag)
                  ? DAMAGE_TAG_CLASSES[tag]
                  : 'bg-slate-50 text-slate-400'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Note */}
      <div className="p-4">
        <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
          Photo Note
        </label>
        <textarea
          value={photo.note}
          onChange={(e) => onNoteChange(e.target.value)}
          placeholder="Describe what's visible — e.g. 'Hail dents on south-facing shingles, granule loss near ridge.'"
          className="mt-2 h-20 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-primary outline-none focus:border-accent resize-none"
        />
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function InspectionReportBuilder() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [contact, setContact] = useState<any>(null);
  const [company, setCompany] = useState<any>(null);
  const [photos, setPhotos] = useState<PhotoEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Report-level fields
  const [reportTitle, setReportTitle] = useState('Property Damage Inspection Report');
  const [inspectorName, setInspectorName] = useState('');
  const [overallNotes, setOverallNotes] = useState('');

  // Markup modal
  const [markupPhoto, setMarkupPhoto] = useState<PhotoEntry | null>(null);

  // Save / share state
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [savedDocumentId, setSavedDocumentId] = useState<string | null>(null);
  const [savedDocumentUrl, setSavedDocumentUrl] = useState<string | null>(null);
  const [savedBlob, setSavedBlob] = useState<Blob | null>(null);

  useEffect(() => {
    if (!id || !profile?.company_id) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const [{ data: contactData }, { data: photoData }, { data: companyData }] =
          await Promise.all([
            supabase.from('contacts').select('*').eq('id', id).single(),
            (supabase.from('documents') as any)
              .select('*')
              .eq('contact_id', id)
              .eq('type', 'photo')
              .order('created_at', { ascending: true }),
            supabase.from('companies').select('*').eq('id', profile.company_id).single(),
          ]);

        setContact(contactData);
        setCompany(companyData);

        const entries: PhotoEntry[] = await Promise.all(
          ((photoData || []) as any[]).map(async (p) => ({
            id: p.id,
            name: p.name,
            url: p.url,
            displayUrl:
              typeof p.url === 'string' ? await buildDocumentDisplayUrl(p.url) : p.url,
            note: '',
            damageTags: [],
            markupDataUrl: null,
          })),
        );
        setPhotos(entries);

        const pAny = profile as any;
        const fullName = [pAny.first_name, pAny.last_name].filter(Boolean).join(' ');
        if (fullName) setInspectorName(fullName);
      } catch (err) {
        console.error('[InspectionReport] load error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id, profile?.company_id]);

  const updatePhoto = (photoId: string, updates: Partial<PhotoEntry>) => {
    setPhotos((prev) => prev.map((p) => (p.id === photoId ? { ...p, ...updates } : p)));
  };

  const toggleTag = (photoId: string, tag: DamageTag) => {
    setPhotos((prev) =>
      prev.map((p) => {
        if (p.id !== photoId) return p;
        return {
          ...p,
          damageTags: p.damageTags.includes(tag)
            ? p.damageTags.filter((t) => t !== tag)
            : [...p.damageTags, tag],
        };
      }),
    );
  };

  const saveReport = async () => {
    if (!id || !profile || !contact) return;
    if (!photos.length) {
      alert('No photos available. Upload project photos from the Docs tab first.');
      return;
    }

    setSaving(true);
    try {
      const preparedPhotos = await Promise.all(
        photos.map(async (p) => ({
          name: p.name,
          dataUrl: p.markupDataUrl ?? (await loadPhotoDataUrl(p.url)),
          note: p.note,
          damageTags: p.damageTags,
        })),
      );

      const contactName =
        `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 'Customer';
      const propertyAddress = formatAddress(contact);

      const pdfBlob = await buildInspectionReportPdf({
        companyName: company?.name || 'TrussCTR',
        companyAddress: company?.address || '',
        companyPhone: company?.phone || '',
        companyEmail: company?.email || '',
        contactName,
        propertyAddress,
        inspectorName: inspectorName || company?.name || 'TrussCTR',
        reportTitle,
        overallNotes,
        photos: preparedPhotos,
      });

      const fileName = `inspection-report-${Date.now()}.pdf`;
      const uploaded = await uploadToAvailableBucket(
        `${id}/reports/${fileName}`,
        pdfBlob,
        'application/pdf',
      );
      const savedUrl = buildStoredDocumentUrl(uploaded.publicUrl, uploaded.bucket, uploaded.path);

      const { data: savedDoc, error: saveError } = await (supabase.from('documents') as any)
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
        content: `Inspection report saved — ${photos.length} photos documented. ${
          photos.filter((p) => p.markupDataUrl).length
        } with markup. Inspector: ${inspectorName || 'N/A'}.`,
        user_id: profile.id,
        direction: 'outbound',
      });

      setSavedBlob(pdfBlob);
      setSavedDocumentId(savedDoc?.id ?? null);
      setSavedDocumentUrl(uploaded.signedUrl);
    } catch (err) {
      console.error('[InspectionReport] save error:', err);
      alert(`Unable to save report. ${(err as Error)?.message || ''}`);
    } finally {
      setSaving(false);
    }
  };

  const shareReport = async () => {
    if (!savedBlob || !savedDocumentUrl) {
      alert('Save the report first before sharing.');
      return;
    }
    const contactName =
      `${contact?.first_name || ''} ${contact?.last_name || ''}`.trim() || 'Customer';
    setSharing(true);
    try {
      const file = new File([savedBlob], 'inspection-report.pdf', { type: 'application/pdf' });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: `${reportTitle} - ${contactName}`, files: [file] });
      } else if (navigator.share) {
        await navigator.share({ title: `${reportTitle} - ${contactName}`, url: savedDocumentUrl });
      } else {
        window.open(savedDocumentUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      console.error('[InspectionReport] share error:', err);
    } finally {
      setSharing(false);
    }
  };

  const openSavedReport = async () => {
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

  const contactName =
    `${contact?.first_name || ''} ${contact?.last_name || ''}`.trim() || 'Customer';
  const markedUpCount = photos.filter((p) => p.markupDataUrl).length;

  return (
    <>
      {markupPhoto && (
        <MarkupModal
          photo={markupPhoto}
          onDone={(markupDataUrl) => {
            updatePhoto(markupPhoto.id, { markupDataUrl });
            setMarkupPhoto(null);
          }}
          onClose={() => setMarkupPhoto(null)}
        />
      )}

      <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-slate-100">
        <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-slate-100">
          {/* Nav */}
          <nav className="sticky top-0 z-20 flex items-center gap-4 border-b border-slate-100 bg-white p-4 shadow-sm">
            <button
              onClick={() => navigate(-1)}
              className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-bold text-primary">Inspection Report</h1>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">
                Markup photos · document damage · share with adjuster
              </p>
            </div>
          </nav>

          <div className="flex-1 space-y-4 overflow-y-auto p-4 pb-32">
            {/* Hero card */}
            <div className="rounded-3xl bg-primary p-5 text-white shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-blue-100">
                Damage Inspection
              </p>
              <h2 className="mt-2 text-2xl font-black">{contactName}</h2>
              <p className="mt-2 text-sm text-blue-100">
                {formatAddress(contact) || 'Property address pending'}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="inline-flex rounded-full bg-white/15 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em]">
                  {photos.length} photo{photos.length !== 1 ? 's' : ''}
                </span>
                {markedUpCount > 0 && (
                  <span className="inline-flex rounded-full bg-accent/80 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em]">
                    {markedUpCount} marked up
                  </span>
                )}
              </div>
            </div>

            {/* Report fields */}
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                  Report Title
                </label>
                <input
                  value={reportTitle}
                  onChange={(e) => setReportTitle(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-primary outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                  Inspector Name
                </label>
                <input
                  value={inspectorName}
                  onChange={(e) => setInspectorName(e.target.value)}
                  placeholder="Your name"
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-primary outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                  Overall Summary
                </label>
                <textarea
                  value={overallNotes}
                  onChange={(e) => setOverallNotes(e.target.value)}
                  placeholder="Describe the overall scope of damage, areas inspected, and any recommendations for the homeowner and insurance adjuster."
                  className="mt-2 h-28 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-primary outline-none focus:border-accent resize-none"
                />
              </div>
            </div>

            {/* Photos */}
            {photos.length === 0 ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
                <p className="text-sm font-medium text-slate-500">
                  No photos yet. Upload project photos from the Docs tab first.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="ml-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                  Photo Documentation — tap Markup to annotate
                </p>
                {photos.map((photo) => (
                  <PhotoCard
                    key={photo.id}
                    photo={photo}
                    onMarkup={() => setMarkupPhoto(photo)}
                    onTagToggle={(tag) => toggleTag(photo.id, tag)}
                    onNoteChange={(note) => updatePhoto(photo.id, { note })}
                  />
                ))}
              </div>
            )}

            {/* Saved confirmation */}
            {(savedDocumentId || savedDocumentUrl) && (
              <div className="rounded-3xl border border-emerald-200 bg-white p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
                    <CheckCircle2 size={22} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-emerald-700">Report saved to Documents</p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Share directly with the homeowner or adjuster to support your supplement.
                    </p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <button
                    onClick={openSavedReport}
                    className="rounded-2xl bg-primary py-3 text-sm font-bold text-white"
                  >
                    View PDF
                  </button>
                  <button
                    onClick={shareReport}
                    disabled={sharing}
                    className="rounded-2xl bg-slate-100 py-3 text-sm font-bold text-primary disabled:opacity-50"
                  >
                    {sharing ? 'Sharing…' : 'Share'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Bottom action bar */}
          <div className="fixed bottom-0 w-full max-w-md border-t border-slate-100 bg-white p-4 shadow-[0_-8px_24px_rgba(15,23,42,0.08)]">
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={saveReport}
                disabled={saving || !photos.length}
                className="col-span-2 rounded-2xl bg-primary py-4 text-sm font-bold text-white disabled:opacity-50"
              >
                {saving ? 'Building Report…' : 'Save Inspection Report'}
              </button>
              <button
                onClick={savedDocumentId ? openSavedReport : shareReport}
                disabled={!savedDocumentId && !savedDocumentUrl}
                className="rounded-2xl bg-slate-100 py-4 text-sm font-bold text-primary disabled:opacity-50"
              >
                {savedDocumentId ? (
                  <Download className="mx-auto h-5 w-5" />
                ) : (
                  <Share2 className="mx-auto h-5 w-5" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
