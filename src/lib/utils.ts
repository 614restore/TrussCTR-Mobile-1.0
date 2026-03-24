import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const formatPhone = (phone: string | null) => {
  if (!phone) return 'N/A';
  const cleaned = ('' + phone).replace(/\D/g, '');
  const match = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/);
  if (match) {
    return '(' + match[1] + ') ' + match[2] + '-' + match[3];
  }
  return phone;
};

export const formatCurrency = (amount: number | null) => {
  if (amount === null) return 'TBD';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
};

export const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    prospect: 'bg-slate-400',
    lead: 'bg-blue-500',
    appt_set: 'bg-indigo-500',
    claim_filed: 'bg-sky-500',
    adjuster_scheduled: 'bg-cyan-500',
    inspection_completed: 'bg-amber-500',
    supplement_filed: 'bg-yellow-500',
    estimating: 'bg-orange-400',
    estimate_sent: 'bg-orange-500',
    contingency: 'bg-purple-400',
    approved: 'bg-emerald-500',
    signed: 'bg-green-600',
    ordering_material: 'bg-teal-500',
    in_progress: 'bg-primary',
    build_phase: 'bg-primary',
    cleanup: 'bg-slate-500',
    invoicing: 'bg-violet-500',
    pending_payment: 'bg-violet-500',
    completed: 'bg-slate-800',
    lost: 'bg-error',
    retail: 'bg-purple-500',
  };
  return colors[status] || 'bg-slate-400';
};
