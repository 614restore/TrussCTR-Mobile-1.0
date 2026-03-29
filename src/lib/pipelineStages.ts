import { CustomerStatus } from '../types/supabase';

type StatusLike = CustomerStatus | string | null | undefined;

const CANONICAL_STAGE_ORDER: CustomerStatus[] = [
  'lead',
  'contacted',
  'appointment_set',
  'inspected',
  'estimate_sent',
  'approved',
  'scheduled',
  'in_progress',
  'completed',
];

const PIPELINE_PROGRESS_ORDER: CustomerStatus[] = [
  ...CANONICAL_STAGE_ORDER,
  'paid',
];

const DISPLAY_LABELS: Record<string, string> = {
  lead: 'Lead',
  contacted: 'Contacted',
  appointment_set: 'Appointment Set',
  appt_set: 'Appointment Set',
  inspection_scheduled: 'Appointment Set',
  inspected: 'Inspection',
  inspection_complete: 'Inspection',
  inspection_completed: 'Inspection',
  estimate_sent: 'Follow Up / Negotiating',
  approved: 'Sold',
  signed: 'Sold',
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
  appt_set: 'Inspection',
  inspection_scheduled: 'Inspection',
  inspected: 'Estimating',
  inspection_complete: 'Estimating',
  inspection_completed: 'Estimating',
  estimate_sent: 'Sold',
  approved: 'Scheduled',
  signed: 'Scheduled',
  signed_won: 'Scheduled',
  scheduled: 'In Progress',
  in_progress: 'Clean Up',
  completed: 'Pick Up Check',
  paid: 'Closed',
  lost: 'Closed',
  retail: 'Scheduled',
};

const STATUS_ALIASES: Record<string, CustomerStatus> = {
  new_lead: 'lead',
  prospect: 'lead',
  appt_set: 'appointment_set',
  inspection_scheduled: 'appointment_set',
  inspection_complete: 'inspected',
  inspection_completed: 'inspected',
  signed: 'approved',
  signed_won: 'approved',
  job_started: 'in_progress',
};

export function normalizePipelineStatus(status?: StatusLike): CustomerStatus {
  if (!status) return 'lead';
  if (status === 'paid') return 'paid';
  if (STATUS_ALIASES[status]) return STATUS_ALIASES[status];
  return status as CustomerStatus;
}

export function toPipelineBoardStage(status?: StatusLike): CustomerStatus {
  const normalized = normalizePipelineStatus(status);
  return normalized === 'paid' ? 'completed' : normalized;
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
  return normalizePipelineStatus(status) === 'paid';
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
