import { CustomerStatus } from '../types/supabase';

const DISPLAY_LABELS: Record<string, string> = {
  lead: 'Lead',
  contacted: 'Contacted',
  appointment_set: 'Appointment Set',
  inspection_scheduled: 'Appointment Set',
  inspected: 'Inspection',
  inspection_complete: 'Inspection',
  estimate_sent: 'Follow Up / Negotiating',
  approved: 'Sold',
  signed_won: 'Sold',
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Completed',
  paid: 'Paid',
  lost: 'Lost',
  retail: 'Retail',
};

const NEXT_LABELS: Record<string, string> = {
  lead: 'Contacted',
  contacted: 'Appointment Set',
  appointment_set: 'Inspection',
  inspection_scheduled: 'Inspection',
  inspected: 'Estimating',
  inspection_complete: 'Estimating',
  estimate_sent: 'Sold',
  approved: 'Scheduled',
  signed_won: 'Scheduled',
  scheduled: 'In Progress',
  in_progress: 'Clean Up',
  completed: 'Pick Up Check',
  paid: 'Closed',
  lost: 'Closed',
  retail: 'Scheduled',
};

export function getPipelineStageLabel(status?: string | null) {
  if (!status) return 'Lead';
  return DISPLAY_LABELS[status] || status.replaceAll('_', ' ');
}

export function getNextPipelineStageLabel(status?: CustomerStatus | string | null) {
  if (!status) return 'Contacted';
  return NEXT_LABELS[status] || 'Next Step';
}

// Canonical pipeline order (board stage IDs)
const PIPELINE_ORDER: CustomerStatus[] = [
  'lead', 'contacted', 'appointment_set', 'inspected', 'estimate_sent',
  'approved', 'scheduled', 'in_progress', 'completed', 'paid', 'retail', 'lost',
];

// Alias map — non-canonical statuses → their canonical board stage
const STATUS_ALIAS: Record<string, CustomerStatus> = {
  new_lead: 'lead',
  inspection_scheduled: 'appointment_set',
  inspection_complete: 'inspected',
  signed_won: 'approved',
};

/** Map any status (including aliases) to its canonical CustomerStatus */
export function normalizePipelineStatus(status?: string | null): CustomerStatus {
  if (!status) return 'lead';
  return STATUS_ALIAS[status] ?? ((status as CustomerStatus) || 'lead');
}

/** Map any status to the representative board-column stage */
export function toPipelineBoardStage(status?: string | null): CustomerStatus {
  return normalizePipelineStatus(status);
}

/** Ordered list of canonical CustomerStatus values for use in dropdowns / stage arrays */
export function getPipelineStageOrder(): CustomerStatus[] {
  return [...PIPELINE_ORDER];
}

/** Returns a Set of every canonical (and alias) status at or before the current stage */
export function getReachedPipelineStatuses(status?: string | null): Set<CustomerStatus> {
  const normalized = normalizePipelineStatus(status);
  const idx = PIPELINE_ORDER.indexOf(normalized);
  const reached = new Set<CustomerStatus>();
  for (let i = 0; i <= Math.max(idx, 0); i++) {
    reached.add(PIPELINE_ORDER[i]);
  }
  // Include aliases for reached canonical stages
  (Object.entries(STATUS_ALIAS) as [CustomerStatus, CustomerStatus][]).forEach(([alias, canonical]) => {
    if (reached.has(canonical)) reached.add(alias);
  });
  return reached;
}
