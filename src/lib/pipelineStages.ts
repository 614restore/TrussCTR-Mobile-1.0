import { CustomerStatus } from '../types/supabase';

type StatusLike = CustomerStatus | string | null | undefined;

// Use the SAME status order as the web app (from crmData.ts)
const CANONICAL_STAGE_ORDER: CustomerStatus[] = [
  'prospect',
  'lead',
  'contacted',
  'appt_set',
  'inspection_completed',
  'estimating',
  'estimate_sent',
  'contingency',
  'approved',
  'signed',
  'ordering_material',
  'in_progress',
  'build_phase',
  'cleanup',
  'invoicing',
  'pending_payment',
  'completed',
];

const PIPELINE_PROGRESS_ORDER: CustomerStatus[] = [
  ...CANONICAL_STAGE_ORDER,
  'lost',
];

// Use the SAME labels as web app (from crmData.ts statusLabels)
const DISPLAY_LABELS: Record<string, string> = {
  prospect: 'Prospect',
  lead: 'Lead',
  contacted: 'Contacted',
  appt_set: 'Appointment Set',
  inspection_completed: 'Inspection Completed',
  estimating: 'Estimating',
  estimate_sent: 'Estimate Sent',
  contingency: 'Contingency',
  approved: 'Approved / Final Scope',
  signed: 'Signed Customer',
  ordering_material: 'Ordering Material',
  in_progress: 'In Progress',
  build_phase: 'Build Phase',
  cleanup: 'Cleanup',
  invoicing: 'Invoicing',
  pending_payment: 'Pending Payment',
  completed: 'Completed',
  lost: 'Lost',
  retail: 'Retail Customer',
  claim_filed: 'Claim Filed',
  adjuster_scheduled: 'Adjuster Scheduled',
  supplement_filed: 'Supplement Filed',
};

// Use the SAME next step logic as web app auto-progression
const NEXT_LABELS: Record<string, string> = {
  prospect: 'Lead',
  lead: 'Contacted',
  contacted: 'Appointment Set',
  appt_set: 'Inspection',
  inspection_completed: 'Estimating',
  estimating: 'Estimate Sent',
  estimate_sent: 'Contingency',
  contingency: 'Approved',
  approved: 'Signed Customer',
  signed: 'Ordering Material',
  ordering_material: 'In Progress',
  in_progress: 'Build Phase',
  build_phase: 'Cleanup',
  cleanup: 'Completed',
  invoicing: 'Pending Payment',
  pending_payment: 'Completed',
  completed: 'Closed',
  lost: 'Closed',
  retail: 'Scheduled',
};

// Legacy status mapping for backwards compatibility
const STATUS_ALIASES: Record<string, CustomerStatus> = {
  new_lead: 'lead',
  appointment_set: 'appt_set',
  inspection_scheduled: 'appt_set',
  inspection_complete: 'inspection_completed',
  inspected: 'inspection_completed',
  signed_won: 'signed',
  job_started: 'in_progress',
};

export function normalizePipelineStatus(status?: StatusLike): CustomerStatus {
  if (!status) return 'lead';
  if (STATUS_ALIASES[status]) return STATUS_ALIASES[status];
  return status as CustomerStatus;
}

export function toPipelineBoardStage(status?: StatusLike): CustomerStatus {
  const normalized = normalizePipelineStatus(status);
  return normalized;
}

export function getReachedPipelineStatuses(status?: StatusLike): Set<CustomerStatus> {
  const reachedStatuses = new Set<CustomerStatus>();
  const normalized = normalizePipelineStatus(status);
  const currentIndex = PIPELINE_PROGRESS_ORDER.indexOf(normalized);

  if (currentIndex < 0) return reachedStatuses;

  for (let index = 0; index <= currentIndex; index += 1) {
    reachedStatuses.add(PIPELINE_PROGRESS_ORDER[index]);
  }

  return reachedStatuses;
}

export function isPaidPipelineStatus(status?: StatusLike): boolean {
  return normalizePipelineStatus(status) === 'completed';
}

export function getPipelineStageOrder() {
  return [...CANONICAL_STAGE_ORDER];
}

export function getPipelineStageLabel(status?: StatusLike) {
  const normalized = normalizePipelineStatus(status);
  return DISPLAY_LABELS[String(status || '')] || DISPLAY_LABELS[normalized] || 'Lead';
}

export function getNextPipelineStageLabel(status?: StatusLike) {
  const normalized = normalizePipelineStatus(status);
  return NEXT_LABELS[String(status || '')] || NEXT_LABELS[normalized] || 'Next Step';
}
