export type EstimatePresetId =
  | 'roof_replacement'
  | 'repair'
  | 'gutters'
  | 'siding'
  | 'custom';

export type EstimateLineItemInput = {
  description: string;
  quantity: number;
  unit: string;
  rate: number;
  amount: number;
};

export type EstimateQuoteMeta = {
  presetId: EstimatePresetId;
  scopeSummary: string;
  paymentTerms: string;
  warrantyPeriod: string;
  validUntil: string;
  depositAmount: number;
  finalPaymentAmount: number;
  customerMessage: string;
};

export type EstimatePreset = {
  id: EstimatePresetId;
  label: string;
  scopeSummary: string;
  defaultItems: Array<{
    name: string;
    qty: number;
    unit: string;
    rate: number;
  }>;
};

export const ESTIMATE_PRESETS: EstimatePreset[] = [
  {
    id: 'roof_replacement',
    label: 'Roof Replacement',
    scopeSummary: 'Complete tear-off and replacement with roofing system accessories and cleanup.',
    defaultItems: [
      { name: 'Architectural Shingles', qty: 30, unit: 'SQ', rate: 150 },
      { name: 'Synthetic Underlayment', qty: 30, unit: 'SQ', rate: 22 },
      { name: 'Ice & Water Shield', qty: 4, unit: 'Roll', rate: 85 },
      { name: 'Starter Course', qty: 12, unit: 'Bundle', rate: 48 },
      { name: 'Ridge Cap', qty: 8, unit: 'Bundle', rate: 55 },
      { name: 'Drip Edge', qty: 180, unit: 'LF', rate: 3.5 },
      { name: 'Labor & Tear-Off', qty: 30, unit: 'SQ', rate: 110 },
    ],
  },
  {
    id: 'repair',
    label: 'Roof Repair',
    scopeSummary: 'Localized repair of identified damage areas with matching materials where available.',
    defaultItems: [
      { name: 'Repair Labor', qty: 8, unit: 'Hour', rate: 95 },
      { name: 'Replacement Shingles', qty: 4, unit: 'Bundle', rate: 52 },
      { name: 'Sealants & Flashing', qty: 1, unit: 'Lot', rate: 180 },
    ],
  },
  {
    id: 'gutters',
    label: 'Gutters',
    scopeSummary: 'Fabrication and installation of seamless gutters, downspouts, and drainage accessories.',
    defaultItems: [
      { name: 'Seamless Gutters', qty: 140, unit: 'LF', rate: 11.5 },
      { name: 'Downspouts', qty: 40, unit: 'LF', rate: 14 },
      { name: 'Leaf Protection', qty: 140, unit: 'LF', rate: 6.5 },
      { name: 'Installation Labor', qty: 1, unit: 'Lot', rate: 950 },
    ],
  },
  {
    id: 'siding',
    label: 'Siding',
    scopeSummary: 'Replacement of exterior siding system including trim, wrap, and installation labor.',
    defaultItems: [
      { name: 'Siding Panels', qty: 1800, unit: 'SF', rate: 4.25 },
      { name: 'House Wrap', qty: 1800, unit: 'SF', rate: 0.6 },
      { name: 'Trim & Corners', qty: 1, unit: 'Lot', rate: 1250 },
      { name: 'Labor', qty: 1800, unit: 'SF', rate: 2.15 },
    ],
  },
  {
    id: 'custom',
    label: 'Custom Quote',
    scopeSummary: 'Custom scope of work based on field measurements and approved project requirements.',
    defaultItems: [],
  },
];

const META_PREFIX = '[TRUSSCTR_ESTIMATE_META]';

export function getEstimatePreset(id: EstimatePresetId) {
  return ESTIMATE_PRESETS.find((preset) => preset.id === id) || ESTIMATE_PRESETS[0];
}

export function buildDefaultQuoteMeta(total: number, presetId: EstimatePresetId = 'roof_replacement'): EstimateQuoteMeta {
  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + 30);
  const depositAmount = Number((total * 0.35).toFixed(2));

  return {
    presetId,
    scopeSummary: getEstimatePreset(presetId).scopeSummary,
    paymentTerms: '35% deposit due upon approval. Balance due at substantial completion.',
    warrantyPeriod: '5 Years Workmanship',
    validUntil: validUntil.toISOString(),
    depositAmount,
    finalPaymentAmount: Number((total - depositAmount).toFixed(2)),
    customerMessage: 'Pricing includes labor, material, disposal, and standard site cleanup unless otherwise noted.',
  };
}

export function serializeEstimateNotes(meta: EstimateQuoteMeta, additionalNotes: string) {
  return `${META_PREFIX}${JSON.stringify(meta)}\n\n${additionalNotes.trim()}`;
}

export function parseEstimateNotes(notes?: string | null) {
  if (!notes) {
    return {
      meta: null as EstimateQuoteMeta | null,
      plainNotes: '',
    };
  }

  if (!notes.startsWith(META_PREFIX)) {
    return {
      meta: null as EstimateQuoteMeta | null,
      plainNotes: notes,
    };
  }

  const firstBreak = notes.indexOf('\n\n');
  const metaChunk = firstBreak === -1 ? notes.slice(META_PREFIX.length) : notes.slice(META_PREFIX.length, firstBreak);
  const plainNotes = firstBreak === -1 ? '' : notes.slice(firstBreak + 2);

  try {
    return {
      meta: JSON.parse(metaChunk) as EstimateQuoteMeta,
      plainNotes,
    };
  } catch {
    return {
      meta: null as EstimateQuoteMeta | null,
      plainNotes: notes,
    };
  }
}

export function estimateItemsTotal(items: EstimateLineItemInput[]) {
  return Number(items.reduce((sum, item) => sum + Number(item.amount || 0), 0).toFixed(2));
}
