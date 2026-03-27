// Legal document templates — the signable contracts available for each contact

export interface LegalDocumentTemplate {
  id: string;
  title: string;
}

export const LEGAL_DOCUMENT_TEMPLATES: LegalDocumentTemplate[] = [
  { id: 'contract', title: 'Customer Contract' },
  { id: 'change_order', title: 'Change Order' },
  { id: 'certificate_of_completion', title: 'Certificate of Completion' },
];

/** True if the document is a legal/contract type that belongs in the Legal tab */
export function isLegalDocument(doc: { type?: string | null; name?: string | null } | null): boolean {
  if (!doc) return false;
  return doc.type === 'contract';
}

/**
 * If the filename looks like a signature attachment (e.g. "contract_signed_abc.pdf"),
 * returns the parent template name so the file can be filtered out of the main grid.
 * Returns null if this is a normal document.
 */
export function getSignatureParentName(name: string): string | null {
  const lower = name.toLowerCase();
  for (const template of LEGAL_DOCUMENT_TEMPLATES) {
    if (lower.includes(`${template.id}_signed`) || lower.includes(`${template.id}-signed`)) {
      return template.id;
    }
  }
  return null;
}

export interface LegalDocStat {
  latestSignedPdf: string | null;
}

/** Build a map of templateId → { latestSignedPdf } from a list of documents */
export function buildLegalDocumentStats(documents: Array<{ name?: string | null; url?: string | null; type?: string | null }>): Record<string, LegalDocStat> {
  const stats: Record<string, LegalDocStat> = {};
  for (const template of LEGAL_DOCUMENT_TEMPLATES) {
    stats[template.id] = { latestSignedPdf: null };
  }
  for (const doc of documents) {
    const name = String(doc.name || '').toLowerCase();
    const url = doc.url || null;
    if (!url) continue;
    for (const template of LEGAL_DOCUMENT_TEMPLATES) {
      if (name.includes(template.id) && (name.includes('sign') || name.includes('complete'))) {
        stats[template.id] = { latestSignedPdf: url };
      }
    }
  }
  return stats;
}
