import React, { useRef, useState } from 'react';
import { X, Upload, FileText, CheckCircle2, AlertCircle, ChevronRight, Building2 } from 'lucide-react';
import {
  parseRoofrPdf,
  roofrToEstimatorPatch,
  type RoofrMeasurements,
  type StructureMeasurements,
  type EstimatorPatch,
} from '../lib/roofrParser';

type Props = {
  onClose: () => void;
  onApply: (patch: EstimatorPatch, measurements: StructureMeasurements) => void;
};

type ParseState = 'idle' | 'parsing' | 'preview' | 'error';

// Which structure the user has selected
type StructureSelection =
  | { type: 'combined' }
  | { type: 'single'; index: number }; // 1-based

function MeasurementRow({
  label, value, unit,
}: { label: string; value: number | string | null; unit?: string }) {
  if (value === null || value === undefined) return null;
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-bold text-primary">{value}{unit ? ` ${unit}` : ''}</span>
    </div>
  );
}

function StructureCard({
  label,
  sub,
  selected,
  onSelect,
}: {
  label: string;
  sub: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`flex-1 rounded-2xl border-2 p-3 text-left transition-all active:scale-95 ${
        selected
          ? 'border-accent bg-accent/5'
          : 'border-slate-200 bg-white'
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <Building2 size={14} className={selected ? 'text-accent' : 'text-slate-400'} />
        <p className={`text-xs font-black uppercase tracking-wide ${selected ? 'text-accent' : 'text-slate-500'}`}>
          {label}
        </p>
      </div>
      <p className={`text-sm font-bold ${selected ? 'text-primary' : 'text-slate-400'}`}>{sub}</p>
    </button>
  );
}

function getMeasurementsForSelection(
  result: RoofrMeasurements,
  selection: StructureSelection,
): StructureMeasurements & { suggestedWaste: number } {
  if (selection.type === 'combined' || result.structures.length === 0) {
    return { ...result, suggestedWaste: result.suggestedWaste };
  }
  const s = result.structures.find((s) => s.index === selection.index);
  return { ...(s ?? result), suggestedWaste: result.suggestedWaste };
}

export default function RoofrImportModal({ onClose, onApply }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parseState, setParseState] = useState<ParseState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [result, setResult] = useState<RoofrMeasurements | null>(null);
  const [fileName, setFileName] = useState('');
  const [selection, setSelection] = useState<StructureSelection>({ type: 'combined' });

  const isMultiStructure = (result?.structures.length ?? 0) > 1;

  const handleFile = async (file: File) => {
    if (file.type !== 'application/pdf') {
      setErrorMsg('Please upload a PDF file.');
      setParseState('error');
      return;
    }
    setFileName(file.name);
    setParseState('parsing');
    try {
      const parsed = await parseRoofrPdf(file);
      if (parsed.totalSquares === null && parsed.eavesLF === null) {
        setErrorMsg(
          'No roofing measurements found. Make sure you uploaded a Roofr measurement report, not an estimate or invoice.'
        );
        setParseState('error');
        return;
      }
      setResult(parsed);
      // Default to combined if multi-structure, otherwise the only structure
      setSelection({ type: 'combined' });
      setParseState('preview');
    } catch (err) {
      console.error('[RoofrImport]', err);
      setErrorMsg('Could not read this PDF. Please make sure it is a valid Roofr measurement report.');
      setParseState('error');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleApply = () => {
    if (!result) return;
    const m = getMeasurementsForSelection(result, selection);
    onApply(roofrToEstimatorPatch(m), m);
  };

  // Active measurements based on selection
  const active = result ? getMeasurementsForSelection(result, selection) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-t-3xl bg-white shadow-2xl max-h-[92vh] flex flex-col">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="h-1 w-10 rounded-full bg-slate-200" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-blue-50 flex items-center justify-center">
              <FileText size={18} className="text-blue-600" />
            </div>
            <div>
              <p className="font-bold text-primary text-base">Import Roofr Report</p>
              <p className="text-[11px] text-slate-400">Extracts measurements from your PDF</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 active:scale-90 transition-transform">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* ── IDLE / ERROR: Upload area ── */}
          {(parseState === 'idle' || parseState === 'error') && (
            <>
              <div
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-200 rounded-2xl p-8 flex flex-col items-center justify-center gap-3 text-center cursor-pointer active:bg-slate-50 transition-colors"
              >
                <div className="h-14 w-14 rounded-2xl bg-blue-50 flex items-center justify-center">
                  <Upload size={24} className="text-blue-500" />
                </div>
                <div>
                  <p className="font-bold text-primary text-sm">Tap to upload Roofr PDF</p>
                  <p className="text-xs text-slate-400 mt-1">Measurement report from roofr.com</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                    e.target.value = '';
                  }}
                />
              </div>

              {parseState === 'error' && (
                <div className="flex items-start gap-3 rounded-2xl bg-rose-50 border border-rose-100 p-4">
                  <AlertCircle size={18} className="text-rose-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-rose-600">{errorMsg}</p>
                </div>
              )}

              <div className="rounded-2xl bg-slate-50 p-4 space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">What gets imported</p>
                {[
                  ['Total Squares', 'Pre-fills roof area'],
                  ['Waste Factor', 'Set to 15% (Roofr standard)'],
                  ['Eaves + Rakes (LF)', 'Updates drip edge qty'],
                  ['Ridges (LF)', 'Updates ridge cap qty'],
                  ['Valleys (LF)', 'Updates valley flashing qty'],
                  ['Pitch', 'Shown for reference'],
                ].map(([field, desc]) => (
                  <div key={field} className="flex items-center gap-2">
                    <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
                    <span className="text-xs text-slate-600">
                      <span className="font-semibold">{field}</span> — {desc}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── PARSING ── */}
          {parseState === 'parsing' && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="h-12 w-12 animate-spin rounded-full border-4 border-accent border-t-transparent" />
              <div className="text-center">
                <p className="font-bold text-primary text-sm">Reading PDF…</p>
                <p className="text-xs text-slate-400 mt-1 max-w-xs truncate">{fileName}</p>
              </div>
            </div>
          )}

          {/* ── PREVIEW ── */}
          {parseState === 'preview' && result && active && (
            <>
              <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 border border-emerald-100 p-3">
                <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                <p className="text-sm font-semibold text-emerald-700 truncate">
                  Measurements extracted — <span className="font-bold">{fileName}</span>
                </p>
              </div>

              {/* ── Structure selector (only shown for multi-structure reports) ── */}
              {isMultiStructure && (
                <div className="space-y-2">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 ml-1">
                    Select Structure to Import
                  </p>

                  {/* Combined option */}
                  <StructureCard
                    label="All Structures"
                    sub={`${result.totalSquares ?? '?'} SQ combined`}
                    selected={selection.type === 'combined'}
                    onSelect={() => setSelection({ type: 'combined' })}
                  />

                  {/* Per-structure options */}
                  <div className="flex gap-2">
                    {result.structures.map((s) => (
                      <StructureCard
                        key={s.index}
                        label={`Structure #${s.index}`}
                        sub={`${s.totalSquares ?? '?'} SQ`}
                        selected={selection.type === 'single' && selection.index === s.index}
                        onSelect={() => setSelection({ type: 'single', index: s.index })}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* ── Measurements for selected structure ── */}
              <div className="card p-4">
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2">
                  {isMultiStructure
                    ? selection.type === 'combined'
                      ? 'Combined Measurements'
                      : `Structure #${(selection as { type: 'single'; index: number }).index} Measurements`
                    : 'Roof Measurements'}
                </p>
                <MeasurementRow label="Total Squares" value={active.totalSquares} unit="SQ" />
                <MeasurementRow label="Waste Factor" value={15} unit="% (suggested)" />
                <MeasurementRow label="Predominant Pitch" value={active.pitch} />
              </div>

              <div className="card p-4">
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2">
                  Linear Measurements (LF)
                </p>
                <MeasurementRow label="Eaves" value={active.eavesLF} unit="LF" />
                <MeasurementRow label="Rakes" value={active.rakesLF} unit="LF" />
                <MeasurementRow label="Eaves + Rakes (Drip Edge)" value={active.totalPerimeterLF} unit="LF" />
                <MeasurementRow label="Ridges" value={active.ridgesLF} unit="LF" />
                <MeasurementRow label="Hips" value={active.hipsLF} unit="LF" />
                <MeasurementRow label="Valleys" value={active.valleysLF} unit="LF" />
                {(active.wallFlashingLF ?? 0) > 0 && (
                  <MeasurementRow label="Wall Flashing" value={active.wallFlashingLF} unit="LF" />
                )}
                {(active.stepFlashingLF ?? 0) > 0 && (
                  <MeasurementRow label="Step Flashing" value={active.stepFlashingLF} unit="LF" />
                )}
              </div>

              <div className="rounded-2xl bg-amber-50 border border-amber-100 p-3">
                <p className="text-xs text-amber-700">
                  <span className="font-bold">Review before applying.</span>{' '}
                  Squares, waste %, and matching line item quantities will be updated.
                  You can adjust any value in the estimator after importing.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {parseState === 'preview' && result && (
          <div className="px-6 pb-6 pt-3 shrink-0 border-t border-slate-100 flex gap-3">
            <button
              onClick={() => { setParseState('idle'); setResult(null); }}
              className="flex-1 bg-slate-100 text-primary font-bold py-4 rounded-2xl text-sm"
            >
              Try Another
            </button>
            <button
              onClick={handleApply}
              className="flex-1 bg-primary text-white font-bold py-4 rounded-2xl text-sm flex items-center justify-center gap-2 active:scale-95 transition-transform"
            >
              Apply to Estimate
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
