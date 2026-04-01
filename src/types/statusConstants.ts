/**
 * Standardized status constants for consistent status checking across the CRM
 * 
 * These constants ensure that different components use the same status definitions
 * for determining won/lost deals, completed/pending tasks, etc.
 */

// Contact/Lead statuses that indicate successful conversion (won deals)
export const SOLD_STATUSES = [
  'signed',
  'approved', 
  'completed',
  'closed-won',
  'sold'
] as const;

// Contact/Lead statuses that indicate lost opportunities
export const LOST_STATUSES = [
  'lost',
  'cancelled',
  'dead',
  'declined',
  'closed-lost',
  'rejected',
  'not-interested'
] as const;

// Project statuses that indicate active work
export const ACTIVE_PROJECT_STATUSES = [
  'active',
  'in-progress', 
  'scheduled',
  'material-ordered',
  'crew-assigned'
] as const;

// Project statuses that indicate completion
export const COMPLETED_PROJECT_STATUSES = [
  'completed',
  'finished',
  'invoiced',
  'paid'
] as const;

// Estimate/Quote statuses that indicate approval
export const APPROVED_ESTIMATE_STATUSES = [
  'approved',
  'accepted',
  'signed'
] as const;

// Work Order statuses that indicate completion  
export const COMPLETED_WORK_ORDER_STATUSES = [
  'completed',
  'finished',
  'verified'
] as const;

// Invoice statuses that indicate payment received
export const PAID_INVOICE_STATUSES = [
  'paid',
  'collected',
  'closed'
] as const;

// Type exports for TypeScript
export type SoldStatus = typeof SOLD_STATUSES[number];
export type LostStatus = typeof LOST_STATUSES[number]; 
export type ActiveProjectStatus = typeof ACTIVE_PROJECT_STATUSES[number];
export type CompletedProjectStatus = typeof COMPLETED_PROJECT_STATUSES[number];
export type ApprovedEstimateStatus = typeof APPROVED_ESTIMATE_STATUSES[number];
export type CompletedWorkOrderStatus = typeof COMPLETED_WORK_ORDER_STATUSES[number];
export type PaidInvoiceStatus = typeof PAID_INVOICE_STATUSES[number];

// Helper functions for status checking
export const isSoldStatus = (status: string): status is SoldStatus => {
  return SOLD_STATUSES.includes(status as SoldStatus);
};

export const isLostStatus = (status: string): status is LostStatus => {
  return LOST_STATUSES.includes(status as LostStatus);
};

export const isActiveProject = (status: string): status is ActiveProjectStatus => {
  return ACTIVE_PROJECT_STATUSES.includes(status as ActiveProjectStatus);
};

export const isCompletedProject = (status: string): status is CompletedProjectStatus => {
  return COMPLETED_PROJECT_STATUSES.includes(status as CompletedProjectStatus);
};

export const isApprovedEstimate = (status: string): status is ApprovedEstimateStatus => {
  return APPROVED_ESTIMATE_STATUSES.includes(status as ApprovedEstimateStatus);
};

export const isCompletedWorkOrder = (status: string): status is CompletedWorkOrderStatus => {
  return COMPLETED_WORK_ORDER_STATUSES.includes(status as CompletedWorkOrderStatus);
};

export const isPaidInvoice = (status: string): status is PaidInvoiceStatus => {
  return PAID_INVOICE_STATUSES.includes(status as PaidInvoiceStatus);
};

// Combined helper functions
export const isDealWon = (status: string): boolean => isSoldStatus(status);
export const isDealLost = (status: string): boolean => isLostStatus(status);
export const isDealClosed = (status: string): boolean => isDealWon(status) || isDealLost(status);