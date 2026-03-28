export type DocumentContext = {
  companyAddress: string;
  companyState: string;
  propertyAddress: string;
  /** Two-letter state code derived from the contact/property address (e.g. "OH"). */
  propertyState: string;
  projectValue: string;
  deductible: string;
  today: string;
  cancelDeadline: string;
  /** Company/contractor display name — defaults to "614 Restore LLC" */
  contractorName?: string;
  /** Contractor phone number — defaults to "(614) 808-8899" */
  contractorPhone?: string;
};

export type DocDefinition = {
  title: string;
  subtitle: string;
  sections: (context: DocumentContext) => string[];
};

/** Placeholder context for showing template syntax in the editor */
export const PLACEHOLDER_CTX: DocumentContext = {
  companyAddress: '{companyAddress}',
  companyState: '{companyState}',
  propertyAddress: '{propertyAddress}',
  propertyState: '{propertyState}',
  projectValue: '{projectValue}',
  deductible: '{deductible}',
  today: '{today}',
  cancelDeadline: '{cancelDeadline}',
  contractorName: '{contractorName}',
  contractorPhone: '{contractorPhone}',
};

/**
 * Whether this document type requires the customer to check a
 * "I understand I am responsible for my deductible" box before signing.
 * Required for insurance restoration docs under Ohio anti-rebating law.
 */
export function requiresDeductibleAck(docType: string): boolean {
  return docType === 'contingency' || docType === 'rescind';
}

// ---------------------------------------------------------------------------
// State-specific Notice of Cancellation builder
// ---------------------------------------------------------------------------

function getRescindSections(ctx: DocumentContext): string[] {
  const state = (ctx.propertyState || ctx.companyState || '').trim().toUpperCase();

  if (state === 'OH') {
    // Ohio Home Solicitation Sales Act — R.C. §1345.21 et seq.
    // Statute requires all-caps text, bold minimum 10pt, and duplicate delivery.
    return [
      `NOTICE OF CANCELLATION\n\nDate of Transaction: ${ctx.today}`,
      `YOU MAY CANCEL THIS TRANSACTION, WITHOUT ANY PENALTY OR OBLIGATION, WITHIN THREE BUSINESS DAYS FROM THE ABOVE DATE.\n\nIF YOU CANCEL, ANY PROPERTY TRADED IN, ANY PAYMENTS MADE BY YOU UNDER THE CONTRACT OR SALE, AND ANY NEGOTIABLE INSTRUMENT EXECUTED BY YOU WILL BE RETURNED WITHIN TEN BUSINESS DAYS FOLLOWING RECEIPT BY THE SELLER OF YOUR CANCELLATION NOTICE. ANY SECURITY INTEREST ARISING OUT OF THE TRANSACTION WILL BE CANCELLED.`,
      `TO CANCEL THIS TRANSACTION, MAIL OR DELIVER A SIGNED AND DATED COPY OF THIS CANCELLATION NOTICE, OR SEND AN EMAIL TO:\n\nSeller: ${ctx.contractorName || '614 Restore LLC'}\nAddress: ${ctx.companyAddress}\nPhone: ${ctx.contractorPhone || '(614) 808-8899'}\n\nNOT LATER THAN MIDNIGHT OF: ${ctx.cancelDeadline}`,
      `I HEREBY CANCEL THIS TRANSACTION.\n\nBuyer / Homeowner Signature: ____________________\n\nDate of Transaction: ${ctx.today}\nCancellation Deadline: ${ctx.cancelDeadline}`,
    ];
  }

  // Generic multi-state default (HSSA-style language)
  return [
    `NOTICE OF RIGHT TO CANCEL\n\nYou may cancel this transaction, without any penalty or obligation, within three (3) business days from ${ctx.today}. If you cancel, any property traded in, any payments made by you under the contract or sale, and any negotiable instrument executed by you will be returned within 20 calendar days following receipt by the Contractor of your cancellation notice.`,
    `YOUR RIGHT TO CANCEL\n\nYou are entering into a transaction that will result in a lien, mortgage, or other security interest in your home. You have a legal right under federal law to cancel this transaction, without cost, within three (3) business days from whichever of the following events occurs last: (1) the date of the transaction, which is ${ctx.today}; (2) the date you received your Truth in Lending disclosures; or (3) the date you received this notice of your right to cancel.`,
    `CANCELLATION DEADLINE\n\nTo cancel this transaction, mail or deliver a signed and dated copy of this notice, or any other written notice, to the Contractor at ${ctx.companyAddress}, in the state of ${ctx.companyState}, not later than midnight of ${ctx.cancelDeadline}.`,
    `HOW TO CANCEL\n\nIf you decide to cancel, you may do so by notifying the Contractor in writing at the address shown above. You may use any written statement that is signed and dated by you and states your intention to cancel. We recommend sending your cancellation notice via certified mail, return receipt requested, to ensure proof of delivery.`,
    `EFFECT OF CANCELLATION\n\nIf you cancel this transaction: (1) the lien, mortgage, or other security interest in your home is also cancelled; (2) any property or money given to us in connection with this transaction will be returned within 20 calendar days; and (3) we must take the steps necessary to reflect the fact that the lien or security interest in your home has been cancelled. You are not required to provide any reason for your cancellation.\n\nBy signing below, I/we acknowledge receipt of this Notice of Right to Cancel and understand my/our right to cancel this transaction within three (3) business days.\n\nDate of transaction: ${ctx.today}\nCancellation deadline: ${ctx.cancelDeadline}`,
  ];
}

export const DEFAULT_DOC_CONTENT: Record<string, DocDefinition> = {
  contingency: {
    title: 'Contingency Agreement',
    subtitle: 'Insurance Restoration Authorization',
    sections: ({ companyAddress, propertyAddress, deductible, today, contractorName, contractorPhone }) => [
      // ── Required initial line: RCV / deductible / supplements ────────────
      `Scope of Work and Payment: Contractor (${contractorName || '614 Restore LLC'}) agrees to perform the repairs approved by the Owner's insurance carrier for the total replacement cost value (RCV). The total contract price shall be the sum of the initial insurance proceeds, the applicable policy deductible, and any supplemental insurance proceeds approved for required code upgrades or unforeseen items. Owner acknowledges they are responsible for the payment of the full deductible as required by applicable state law. Contact ${contractorName || '614 Restore LLC'} at ${contractorPhone || '(614) 808-8899'} with any questions regarding this scope.`,
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
    // Sections are state-specific — see getRescindSections() above.
    sections: (ctx) => getRescindSections(ctx),
  },
  completion: {
    title: 'Completion Certificate',
    subtitle: 'Project Completion & Satisfaction Acknowledgment',
    sections: ({ propertyAddress, projectValue, today }) => [
      `CERTIFICATE OF COMPLETION\n\nThis certifies that the work performed by the Contractor at ${propertyAddress} has been substantially completed as of ${today}, in accordance with the contract specifications and to the satisfaction of all parties involved.`,
      `SCOPE CONFIRMATION\n\nThe customer confirms that the project area has been reviewed and that all contracted work has been completed in a professional and workmanlike manner. The Contractor may proceed with project closeout and final billing, subject to any separately documented warranty or punch-list obligations.`,
      `FINAL CONTRACT VALUE\n\nThe parties acknowledge a final contract value of ${projectValue}, unless further revised by signed change order or final insurance supplementation. All outstanding balance is due and payable upon execution of this Certificate.`,
      `WARRANTY ACKNOWLEDGMENT\n\nThe Contractor warrants workmanship for the period stated in the original contract or work order. Material warranties are passed through to the customer per manufacturer terms. This warranty does not cover damage caused by acts of nature, customer modification, or pre-existing conditions outside the contracted scope.`,
      `By signing below, the customer acknowledges that all contracted work has been completed satisfactorily, accepts the final deliverables, and authorizes the Contractor to submit for any remaining insurance proceeds and final payment.`,
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

const STORAGE_KEY = (companyId: string) => `trussctr_doc_templates_${companyId}`;

/** Replace {placeholder} tokens with actual values */
export function interpolateTemplate(template: string, ctx: DocumentContext): string {
  return template
    .replace(/\{today\}/g, ctx.today)
    .replace(/\{cancelDeadline\}/g, ctx.cancelDeadline)
    .replace(/\{propertyAddress\}/g, ctx.propertyAddress)
    .replace(/\{propertyState\}/g, ctx.propertyState)
    .replace(/\{companyAddress\}/g, ctx.companyAddress)
    .replace(/\{companyState\}/g, ctx.companyState)
    .replace(/\{projectValue\}/g, ctx.projectValue)
    .replace(/\{deductible\}/g, ctx.deductible)
    .replace(/\{contractorName\}/g, ctx.contractorName || '614 Restore LLC')
    .replace(/\{contractorPhone\}/g, ctx.contractorPhone || '(614) 808-8899');
}

/** Load saved custom templates for a company. Returns null if none saved. */
export function loadCustomTemplates(companyId: string): Record<string, string[]> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY(companyId));
    if (!raw) return null;
    return JSON.parse(raw) as Record<string, string[]>;
  } catch {
    return null;
  }
}

/** Save custom templates for a company to localStorage */
export function saveCustomTemplates(companyId: string, templates: Record<string, string[]>): void {
  try {
    localStorage.setItem(STORAGE_KEY(companyId), JSON.stringify(templates));
  } catch {
    console.error('Failed to save document templates to localStorage');
  }
}

/** Get the rendered sections for a document, using company customizations if available */
export function getDocSections(
  companyId: string | null | undefined,
  docType: string,
  context: DocumentContext
): string[] {
  if (companyId) {
    const custom = loadCustomTemplates(companyId);
    if (custom && Array.isArray(custom[docType]) && custom[docType].length > 0) {
      return custom[docType].map((section) => interpolateTemplate(section, context));
    }
  }
  const def = DEFAULT_DOC_CONTENT[docType];
  if (!def) return ['Document content not found.'];
  return def.sections(context);
}

/** Get the title/subtitle for a document type */
export function getDocMeta(docType: string): { title: string; subtitle: string } {
  const def = DEFAULT_DOC_CONTENT[docType];
  return { title: def?.title || 'Document', subtitle: def?.subtitle || '' };
}
