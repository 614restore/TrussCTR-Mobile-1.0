/**
 * Roofr PDF Parser — multi-structure aware
 * Calibrated against real Roofr Roof Reports (v2026 format).
 *
 * Key format facts:
 *  - Cover / Area page:   "Total roof area: 1411 sqft", "Predominant pitch 6/12"
 *  - Length page (p3):    "Eaves: 143ft 3in"  ← always combined across all structures
 *  - Per-structure pages: "Structure #1 summary … Total eaves 101ft 11in …"
 *  - Report summary:      "Total eaves 143ft 3in" — combined but appears AFTER per-structure pages
 *  - Waste: shown as a table of options; we suggest 15% (Roofr's middle column)
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type StructureMeasurements = {
  index: number;              // 1-based (Structure #1, #2, …)
  totalSquares: number | null;
  totalSqft: number | null;
  pitch: string | null;
  eavesLF: number | null;
  rakesLF: number | null;
  ridgesLF: number | null;
  hipsLF: number | null;
  valleysLF: number | null;
  totalPerimeterLF: number | null;
  wallFlashingLF: number | null;
  stepFlashingLF: number | null;
};

export type RoofrMeasurements = StructureMeasurements & {
  suggestedWaste: number;
  structures: StructureMeasurements[];   // empty when only one structure
  rawText: string;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/** "143ft 3in" → 143.25,  "47ft 0in" → 47,  "128ft" → 128 */
function parseFtIn(raw: string | undefined): number | null {
  if (!raw) return null;
  const withIn = raw.match(/(\d+)\s*ft\s*(\d+)\s*in/i);
  if (withIn) {
    return Math.round((parseInt(withIn[1], 10) + parseInt(withIn[2], 10) / 12) * 10) / 10;
  }
  const ftOnly = raw.match(/(\d+)\s*ft/i);
  if (ftOnly) return parseInt(ftOnly[1], 10);
  return null;
}

const LF_TOKEN = '(\\d+ft\\s*\\d+in|\\d+ft)';

function extractFtIn(text: string, patterns: RegExp[]): number | null {
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) return parseFtIn(m[1].trim());
  }
  return null;
}

function extractNum(text: string, patterns: RegExp[]): number | null {
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) {
      const n = parseFloat(m[1].replace(/,/g, ''));
      return isNaN(n) ? null : n;
    }
  }
  return null;
}

function extractStr(text: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

// ── Per-block extractor (used for both individual structures and combined) ───

function extractMeasurements(block: string, index: number): StructureMeasurements {
  // Total area — "Total roof area 1066 sqft" or "Total roof area: 1411 sqft"
  const totalSqft = extractNum(block, [
    /Total\s+roof\s+area\s*:?\s*([\d,]+)\s*sqft/i,
  ]);
  const totalSquares = totalSqft !== null
    ? Math.round((totalSqft / 100) * 10) / 10
    : null;

  const pitch = extractStr(block, [
    /Predominant\s+pitch\s*:?\s*(\d+\/12)/i,
    /Pitch\s*:?\s*(\d+\/12)/i,
  ]);

  // Per-structure pages use "Total eaves XXft YYin"
  // Combined length page uses "Eaves: XXft YYin" (passed as-is for combined block)
  const eavesLF = extractFtIn(block, [
    new RegExp(`Eaves\\s*:\\s*${LF_TOKEN}`, 'i'),
    new RegExp(`Total\\s+eaves\\s+${LF_TOKEN}`, 'i'),
  ]);

  const rakesLF = extractFtIn(block, [
    new RegExp(`Rakes\\s*:\\s*${LF_TOKEN}`, 'i'),
    new RegExp(`Total\\s+rakes\\s+${LF_TOKEN}`, 'i'),
  ]);

  const ridgesLF = extractFtIn(block, [
    new RegExp(`Ridges\\s*:\\s*${LF_TOKEN}`, 'i'),
    new RegExp(`Total\\s+ridges\\s+${LF_TOKEN}`, 'i'),
  ]);

  const hipsLF = extractFtIn(block, [
    new RegExp(`Hips\\s*:\\s*${LF_TOKEN}`, 'i'),
    new RegExp(`Total\\s+hips\\s+${LF_TOKEN}`, 'i'),
  ]);

  const valleysLF = extractFtIn(block, [
    new RegExp(`Valleys\\s*:\\s*${LF_TOKEN}`, 'i'),
    new RegExp(`Total\\s+valleys\\s+${LF_TOKEN}`, 'i'),
  ]);

  const wallFlashingLF = extractFtIn(block, [
    new RegExp(`Wall\\s+flashing\\s*:\\s*${LF_TOKEN}`, 'i'),
    new RegExp(`Total\\s+wall\\s+flashing\\s+${LF_TOKEN}`, 'i'),
  ]);

  const stepFlashingLF = extractFtIn(block, [
    new RegExp(`Step\\s+flashing\\s*:\\s*${LF_TOKEN}`, 'i'),
    new RegExp(`Total\\s+step\\s+flashing\\s+${LF_TOKEN}`, 'i'),
  ]);

  // Prefer "Eaves + rakes XXft" line; fall back to sum
  const totalPerimeterLF = extractFtIn(block, [
    new RegExp(`Eaves\\s*\\+\\s*rakes\\s+${LF_TOKEN}`, 'i'),
  ]) ?? ((eavesLF !== null || rakesLF !== null)
    ? Math.round(((eavesLF ?? 0) + (rakesLF ?? 0)) * 10) / 10
    : null);

  return {
    index,
    totalSquares,
    totalSqft,
    pitch,
    eavesLF,
    rakesLF,
    ridgesLF,
    hipsLF,
    valleysLF,
    totalPerimeterLF,
    wallFlashingLF,
    stepFlashingLF,
  };
}

// ── Main parser ──────────────────────────────────────────────────────────────

export async function parseRoofrPdf(file: File): Promise<RoofrMeasurements> {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    fullText += content.items.map((item: any) => ('str' in item ? item.str : '')).join(' ') + '\n';
  }

  // Normalize to single line for regex
  const text = fullText.replace(/\s+/g, ' ');

  // ── Extract per-structure blocks ──────────────────────────────────────────
  // Find all "Structure #N summary" positions in the text
  const structureHeaderRe = /Structure\s+#(\d+)\s+summary/gi;
  const structurePositions: Array<{ num: number; start: number }> = [];
  let headerMatch: RegExpExecArray | null;
  while ((headerMatch = structureHeaderRe.exec(text)) !== null) {
    structurePositions.push({ num: parseInt(headerMatch[1], 10), start: headerMatch.index });
  }

  const structures: StructureMeasurements[] = structurePositions.map((pos, i) => {
    // Slice from this structure's header to the next one (or end of text)
    const blockEnd = structurePositions[i + 1]?.start ?? text.length;
    const block = text.slice(pos.start, blockEnd);
    return extractMeasurements(block, pos.num);
  });

  // ── Extract combined measurements ─────────────────────────────────────────
  // For the combined view, use the full text but prioritise:
  //   1. "Eaves: XXft YYin" from the Length measurement report page (always combined)
  //   2. "Total eaves XXft YYin" only as fallback (single-structure reports)
  // This avoids accidentally matching a per-structure "Total eaves" first.
  const combined = extractMeasurements(text, 0);

  return {
    ...combined,
    index: 0,
    suggestedWaste: 15,
    structures,
    rawText: fullText,
  };
}

// ── Patch builder ─────────────────────────────────────────────────────────────

export type EstimatorPatch = {
  squares?: number;
  waste?: number;
  lineItemPatches: Array<{ nameFragment: string; qty: number }>;
};

export function roofrToEstimatorPatch(m: StructureMeasurements & { suggestedWaste?: number }): EstimatorPatch {
  const patch: EstimatorPatch = { lineItemPatches: [] };

  if (m.totalSquares !== null) patch.squares = m.totalSquares;
  patch.waste = m.suggestedWaste ?? 15;

  if (m.totalPerimeterLF !== null) {
    patch.lineItemPatches.push({ nameFragment: 'Drip Edge', qty: Math.ceil(m.totalPerimeterLF) });
  }
  if (m.ridgesLF !== null && m.ridgesLF > 0) {
    patch.lineItemPatches.push({ nameFragment: 'Ridge Cap', qty: Math.ceil(m.ridgesLF / 35) });
  }
  if (m.valleysLF !== null && m.valleysLF > 0) {
    patch.lineItemPatches.push({ nameFragment: 'Valley', qty: Math.ceil(m.valleysLF) });
  }
  if (m.eavesLF !== null && m.eavesLF > 0) {
    patch.lineItemPatches.push({ nameFragment: 'Ice', qty: Math.ceil(m.eavesLF) });
  }

  return patch;
}
