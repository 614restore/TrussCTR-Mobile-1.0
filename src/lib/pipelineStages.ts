import { CustomerStatus } from '../types/supabase';

type StatusLike = CustomerStatus | string | null | undefined;

// 8-column Power Pipeline — one representative (primary) status per column.
// Sub-statuses are mapped to their column primary via STATUS_ALIASES.
const CANONICAL_STAGE_ORDER: CustomerStatus[] = [
  'lead',              // Discovery
  'appt_set',          // Inspection
  'contingency',       // Pending Scope
  'signed',            // Approval / Sold
  'ordering_material', // Pre-Production
  'in_progress',       // Active Build
  'invoicing',         // Final Billing
  'completed',         // Closed / Paid
];

const PIPELINE_PROGRESS_ORDER: CustomerStatus[] = [
  ...CANONICAL_STAGE_ORDER,
  'lost',
];

// Column-level display labels (shown in progress bar, pipeline list, next step CTA)
const DISPLAY_LABELS: Record<string, string> = {
  // 8 Power Pipeline columns
  lead:              'Discovery',
  appt_set:          'Inspection',
  contingency:       'Pending Scope',
  signed:            'Approval / Sold',
  ordering_material: 'Pre-Production',
  in_progress:       'Active Build',
  invoicing:         'Final Billing',
  completed:         'Closed / Paid',
  lost:              'Lost',
  // Sub-status labels (used when displaying the raw DB status)
  prospect:              'Prospect',
  contacted:             'Contacted',
  claim_filed:           'Claim Filed',
  adjuster_scheduled:    'Adjuster Scheduled',
  inspection_completed:  'Inspection Completed',
  inspected:             'Inspected',
  estimating:            'Estimating',
  estimate_sent:         'Estimate Sent',
  supplement_filed:      'Supplement Filed',
  retail:                'Retail',
  approved:              'Approved',
  scheduled:             'Scheduled',
  build_phase:           'Build Phase',
  cleanup:               'Cleanup',
  pending_payment:       'Pending Payment',
  paid:                  'Paid',
};

// Next-column labels for the "Next Step" CTA card
const NEXT_LABELS: Record<string, string> = {
  lead:              'Inspection',
  appt_set:          'Pending Scope',
  contingency:       'Approval / Sold',
  signed:            'Pre-Production',
  ordering_material: 'Active Build',
  in_progress:       'Final Billing',
  invoicing:         'Closed / Paid',
  completed:         'Closed',
  lost:              'Closed',
};

// Maps every known sub-status (including legacy DB values) to its column's primary status.
const STATUS_ALIASES: Record<string, CustomerStatus> = {
  // Discovery
  prospect:             'lead',
  new_lead:             'lead',
  contacted:            'lead',
  // Inspection
  appointment_set:      'appt_set',
  inspection_scheduled: 'appt_set',
  claim_filed:          'appt_set',
  adjuster_scheduled:   'appt_set',
  inspection_complete:  'appt_set',
  inspection_completed: 'appt_set',
  inspected:            'appt_set',
  // Pending Scope
  estimating:           'contingency',
  estimate_sent:        'contingency',
  supplement_filed:     'contingency',
  retail:               'contingency',
  follow_up:            'contingency',
  // Approval / Sold
  approved:             'signed',
  signed_won:           'signed',
  // Pre-Production
  scheduled:            'ordering_material',
  // Active Build
  job_started:          'in_progress',
  build_phase:          'in_progress',
  cleanup:              'in_progress',
  // Final Billing
  pending_payment:      'invoicing',
  // Closed / Paid
  paid:                 'completed',
  payment_received:     'completed',
};

export function normalizePipelineStatus(status?: StatusLike): CustomerStatus {
  if (!status) return 'lead';
  const s = String(status).trim().toLowerCase();
  if (STATUS_ALIASES[s]) return STATUS_ALIASES[s];
  return s as CustomerStatus;
}

export function toPipelineBoardStage(status?: StatusLike): CustomerStatus {
  return normalizePipelineStatus(status);
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
  const raw = String(status || '');
  if (DISPLAY_LABELS[raw]) return DISPLAY_LABELS[raw];
  const normalized = normalizePipelineStatus(status);
  return DISPLAY_LABELS[normalized] || 'Discovery';
}

export function getNextPipelineStageLabel(status?: StatusLike) {
  const raw = String(status || '');
  if (NEXT_LABELS[raw]) return NEXT_LABELS[raw];
  const normalized = normalizePipelineStatus(status);
  return NEXT_LABELS[normalized] || 'Next Step';
}
