export type LegalTemplateId = 'contingency' | 'csa' | 'rescind' | 'completion' | 'change-order';

export type DocumentLike = {
  id?: string;
  name?: string | null;
  type?: string | null;
  created_at?: string | null;
};

export const LEGAL_DOCUMENT_TEMPLATES: Array<{
  id: LegalTemplateId;
  title: string;
  description: string;
  keywords: string[];
}> = [
  {
    id: 'contingency',
    title: 'Contingency Agreement',
    description: 'Insurance claim representation',
    keywords: ['contingency agreement', 'contingency'],
  },
  {
    id: 'csa',
    title: 'Customer Service Agreement',
    description: 'Retail sales & work order',
    keywords: ['customer service agreement', 'csa'],
  },
  {
    id: 'rescind',
    title: '3-Day Right to Rescind',
    description: 'Legal cancellation period',
    keywords: ['3-day right to rescind', '3 day right to rescind', 'notice of cancellation', '3-day'],
  },
  {
    id: 'completion',
    title: 'Completion Certificate',
    description: 'Work satisfaction sign-off',
    keywords: ['completion certificate', 'completion'],
  },
  {
    id: 'change-order',
    title: 'Change Order',
    description: 'Scope or price adjustments',
    keywords: ['change order', 'change-order'],
  },
];

function normalizeName(name?: string | null): string {
  return String(name || '').trim().toLowerCase();
}

export function getSignatureParentName(name: string): string | null {
  if (name.includes(' Customer Signature - ')) return name.replace(' Customer Signature - ', ' - ');
  if (name.includes(' Contractor Signature - ')) return name.replace(' Contractor Signature - ', ' - ');
  if (name.includes(' Signature - ')) return name.replace(' Signature - ', ' - ');
  return null;
}

export function isSignatureDocumentName(name?: string | null): boolean {
  return !!getSignatureParentName(String(name || ''));
}

export function getLegalTemplateIdFromName(name?: string | null): LegalTemplateId | null {
  const normalized = normalizeName(name);
  if (!normalized) return null;

  for (const template of LEGAL_DOCUMENT_TEMPLATES) {
    if (template.keywords.some((keyword) => normalized.includes(keyword))) {
      return template.id;
    }
  }

  return null;
}

export function getLegalTemplateIdFromDocument(doc: DocumentLike): LegalTemplateId | null {
  return getLegalTemplateIdFromName(doc.name);
}

export function isLegalDocument(doc: DocumentLike): boolean {
  return !!getLegalTemplateIdFromDocument(doc);
}

export type LegalDocumentStats = {
  isSigned: boolean;
  pdfCount: number;
  signatureCount: number;
  latestSignedPdf: DocumentLike | null;
};

export function buildLegalDocumentStats(documents: DocumentLike[]) {
  const stats = Object.fromEntries(
    LEGAL_DOCUMENT_TEMPLATES.map((template) => [
      template.id,
      {
        isSigned: false,
        pdfCount: 0,
        signatureCount: 0,
        latestSignedPdf: null,
      } as LegalDocumentStats,
    ])
  ) as Record<LegalTemplateId, LegalDocumentStats>;

  for (const template of LEGAL_DOCUMENT_TEMPLATES) {
    const related = documents.filter((doc) => getLegalTemplateIdFromDocument(doc) === template.id);

    const sortedPdfs = related
      .filter((doc) => String(doc.type || '').toLowerCase() === 'contract')
      .sort((left, right) => new Date(String(right.created_at || 0)).getTime() - new Date(String(left.created_at || 0)).getTime());

    const signatureCount = related.filter((doc) => isSignatureDocumentName(doc.name)).length;

    stats[template.id] = {
      pdfCount: sortedPdfs.length,
      signatureCount,
      latestSignedPdf: sortedPdfs[0] || null,
      isSigned: sortedPdfs.length > 0 || signatureCount > 0,
    };
  }

  return stats;
}
