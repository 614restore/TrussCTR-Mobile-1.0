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
    lead: 'bg-blue-500',
    contacted: 'bg-sky-500',
    appointment_set: 'bg-indigo-500',
    inspected: 'bg-amber-500',
    estimate_sent: 'bg-orange-500',
    approved: 'bg-emerald-500',
    scheduled: 'bg-teal-500',
    in_progress: 'bg-primary',
    completed: 'bg-slate-800',
    paid: 'bg-emerald-600',
    lost: 'bg-error',
    retail: 'bg-purple-500',
  };
  return colors[status] || 'bg-slate-400';
};
