import { CustomerStatus } from '../types/supabase';

const DISPLAY_LABELS: Record<string, string> = {
  prospect: 'New Lead',
  lead: 'Contacted / Qualifying',
  appt_set: 'Appointment Set',
  claim_filed: 'Claim Filed',
  adjuster_scheduled: 'Adjuster Scheduled',
  inspection_completed: 'Inspected',
  supplement_filed: 'Supplement Filed',
  estimating: 'Estimating',
  estimate_sent: 'Estimate Sent',
  contingency: 'Contingency',
  approved: 'Approved',
  signed: 'Signed / Won',
  ordering_material: 'Ordering Material',
  in_progress: 'In Progress',
  build_phase: 'In Progress',
  cleanup: 'Cleanup',
  invoicing: 'Invoicing',
  pending_payment: 'Invoicing',
  completed: 'Completed',
  lost: 'Lost',
  retail: 'Retail',
};

const NEXT_LABELS: Record<string, string> = {
  prospect: 'Contacted',
  lead: 'Appointment Set',
  appt_set: 'Inspection',
  claim_filed: 'Adjuster Scheduled',
  adjuster_scheduled: 'Inspected',
  inspection_completed: 'Estimating',
  supplement_filed: 'Estimate Sent',
  estimating: 'Estimate Sent',
  estimate_sent: 'Approved',
  contingency: 'Approved',
  approved: 'Signed',
  signed: 'Order Material',
  ordering_material: 'In Progress',
  in_progress: 'Clean Up',
  build_phase: 'Clean Up',
  cleanup: 'Invoicing',
  invoicing: 'Completed',
  pending_payment: 'Completed',
  completed: 'Closed',
  lost: 'Closed',
  retail: 'Order Material',
};

export function getPipelineStageLabel(status?: string | null) {
  if (!status) return 'Lead';
  return DISPLAY_LABELS[status] || status.replaceAll('_', ' ');
}

export function getNextPipelineStageLabel(status?: CustomerStatus | string | null) {
  if (!status) return 'Contacted';
  return NEXT_LABELS[status] || 'Next Step';
}
