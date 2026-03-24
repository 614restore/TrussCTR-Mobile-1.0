import { CustomerStatus } from '../types/supabase';

const DISPLAY_LABELS: Record<string, string> = {
  lead: 'Lead',
  contacted: 'Contacted',
  appointment_set: 'Appointment Set',
  inspection_scheduled: 'Appointment Set',
  inspected: 'Inspected',
  inspection_complete: 'Inspected',
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
