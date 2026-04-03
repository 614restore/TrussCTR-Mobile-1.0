/**
 * Centralized Status Management System
 * 
 * This module provides a standardized way to update contact status
 * ensuring automation events are fired consistently and status
 * transitions are properly validated.
 */

import { supabase } from './supabase';
import { fireAutomationEvent } from './automationEngine';
import { handleAutoProgression } from './progressionRules';
import { logAudit } from './auditLogger';

// Define valid contact statuses directly
const VALID_CONTACT_STATUSES = {
  // Sales Pipeline
  'prospect': { label: 'Prospect', type: 'sales' },
  'lead': { label: 'Lead', type: 'sales' },
  'appt_set': { label: 'Appointment Set', type: 'sales' },
  'inspection_completed': { label: 'Inspection Completed', type: 'sales' },
  'estimating': { label: 'Estimating', type: 'sales' },
  'estimate_sent': { label: 'Estimate Sent', type: 'sales' },
  'contingency': { label: 'Contingency', type: 'sales' },
  'signed': { label: 'Signed', type: 'sales' },
  'retail': { label: 'Retail', type: 'sales' },
  
  // Production Pipeline  
  'ordering_material': { label: 'Ordering Material', type: 'production' },
  'in_progress': { label: 'In Progress', type: 'production' },
  'build_phase': { label: 'Build Phase', type: 'production' },
  'cleanup': { label: 'Cleanup', type: 'production' },
  'completed': { label: 'Completed', type: 'production' },
  
  // Billing Pipeline
  'invoicing': { label: 'Invoicing', type: 'billing' },
  'pending_payment': { label: 'Pending Payment', type: 'billing' },
  
  // Insurance Pipeline
  'claim_filed': { label: 'Claim Filed', type: 'insurance' },
  'adjuster_scheduled': { label: 'Adjuster Scheduled', type: 'insurance' },
  'supplement_filed': { label: 'Supplement Filed', type: 'insurance' },
  'approved': { label: 'Approved', type: 'insurance' },
  
  // Terminal States
  'lost': { label: 'Lost', type: 'terminal' },
  'cancelled': { label: 'Cancelled', type: 'terminal' },
  'dead': { label: 'Dead', type: 'terminal' },
  'declined': { label: 'Declined', type: 'terminal' },
  'closed-lost': { label: 'Closed Lost', type: 'terminal' },
  'rejected': { label: 'Rejected', type: 'terminal' },
  'not-interested': { label: 'Not Interested', type: 'terminal' },
  'paid': { label: 'Paid', type: 'terminal' }
} as const;

interface StatusUpdateContext {
  contactId: string;
  newStatus: string;
  oldStatus?: string;
  contactName?: string;
  contactEmail?: string;
  userId: string;
  userEmail: string;
  companyId: string;
  source?: string; // 'manual', 'automation', 'drag_drop', 'api', etc.
  reason?: string; // For audit trail
  skipAutomation?: boolean; // Skip firing automation events
  skipProgression?: boolean; // Skip auto-progression rules
}

interface StatusValidation {
  isValid: boolean;
  error?: string;
  warnings?: string[];
}

/**
 * Main function to update contact status with full automation support
 */
export async function updateContactStatus(context: StatusUpdateContext): Promise<{ success: boolean; error?: string }> {
  const { contactId, newStatus, oldStatus, userId, userEmail, companyId, source = 'manual', reason, skipAutomation = false, skipProgression = false } = context;

  try {
    // 1. Validate the status change
    const validation = await validateStatusChange(contactId, newStatus, oldStatus);
    if (!validation.isValid) {
      return { success: false, error: validation.error };
    }

    // Log warnings if any
    validation.warnings?.forEach(warning => console.warn(`Status update warning: ${warning}`));

    // 2. Get current contact data if oldStatus not provided
    let currentStatus = oldStatus;
    let contactData: any = null;
    
    if (!currentStatus || !context.contactName || !context.contactEmail) {
      const { data, error } = await supabase
        .from('contacts')
        .select('status, name, email')
        .eq('id', contactId)
        .single();
        
      if (error) {
        return { success: false, error: `Failed to fetch contact data: ${error.message}` };
      }
      
      contactData = data;
      currentStatus = currentStatus || data.status;
    }

    // Skip if status is already the same
    if (currentStatus === newStatus) {
      console.log(`Contact ${contactId} already has status ${newStatus}, skipping update`);
      return { success: true };
    }

    // 3. Update the database
    const { error: updateError } = await supabase
      .from('contacts')
      .update({ 
        status: newStatus,
        status_changed_at: new Date().toISOString()
      })
      .eq('id', contactId);

    if (updateError) {
      return { success: false, error: `Database update failed: ${updateError.message}` };
    }

    // 4. Log audit trail
    await logAudit({
      userId,
      userEmail,
      action: 'status_change',
      entityType: 'contact',
      entityId: contactId,
      oldValue: { status: currentStatus },
      newValue: { status: newStatus, source, reason },
    });

    // 5. Fire automation events (unless skipped)
    if (!skipAutomation) {
      await fireAutomationEvent('contact_status_changed', companyId, {
        contactId,
        contactName: context.contactName || contactData?.name || 'Unknown',
        contactEmail: context.contactEmail || contactData?.email || '',
        oldStatus: currentStatus,
        newStatus,
        source,
      }).catch(error => {
        console.error('Automation event firing failed:', error);
        // Don't fail the entire operation if automation fails
      });
    }

    // 6. Handle auto-progression rules (unless skipped)
    if (!skipProgression) {
      await enhancedAutoProgression(contactId, newStatus, userId, userEmail, companyId).catch(error => {
        console.error('Auto-progression failed:', error);
        // Don't fail the entire operation if progression fails
      });
    }

    console.log(`Status updated: Contact ${contactId} changed from ${currentStatus} to ${newStatus} (source: ${source})`);
    return { success: true };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('Status update failed:', error);
    return { success: false, error: errorMsg };
  }
}

/**
 * Validate status change before applying
 */
async function validateStatusChange(contactId: string, newStatus: string, oldStatus?: string): Promise<StatusValidation> {
  const warnings: string[] = [];

  // Check if status exists
  if (!VALID_CONTACT_STATUSES[newStatus as keyof typeof VALID_CONTACT_STATUSES]) {
    return { isValid: false, error: `Invalid status: ${newStatus}` };
  }

  // Get contact data for validation
  const { data: contact, error } = await supabase
    .from('contacts')
    .select('id, status, is_retail, claim_number, insurance_company')
    .eq('id', contactId)
    .single();

  if (error) {
    return { isValid: false, error: `Failed to validate contact: ${error.message}` };
  }

  const currentStatus = oldStatus || contact.status;
  
  // Check for invalid transitions
  const invalidTransitions = validateStatusTransition(currentStatus, newStatus);
  if (invalidTransitions.length > 0) {
    return { isValid: false, error: `Invalid transition from ${currentStatus} to ${newStatus}: ${invalidTransitions.join(', ')}` };
  }

  // Check contact type compatibility
  const typeWarnings = validateContactTypeCompatibility(contact, newStatus);
  warnings.push(...typeWarnings);

  return { isValid: true, warnings };
}

/**
 * Validate status transitions (business logic rules)
 */
function validateStatusTransition(fromStatus: string, toStatus: string): string[] {
  const errors: string[] = [];

  // Terminal states shouldn't be changed
  if (['completed', 'lost', 'cancelled', 'paid'].includes(fromStatus) && fromStatus !== toStatus) {
    errors.push(`Cannot change status from terminal state: ${fromStatus}`);
  }

  // Backwards progression warnings (not blocking)
  const statusOrder = [
    'prospect', 'lead', 'appt_set', 'inspection_completed', 'estimating', 
    'estimate_sent', 'contingency', 'signed', 'ordering_material', 
    'in_progress', 'build_phase', 'cleanup', 'completed'
  ];
  
  const fromIndex = statusOrder.indexOf(fromStatus);
  const toIndex = statusOrder.indexOf(toStatus);
  
  if (fromIndex !== -1 && toIndex !== -1 && toIndex < fromIndex - 1) {
    // Allow going backwards by 1 step, but warn on larger jumps
    console.warn(`Status regression detected: ${fromStatus} -> ${toStatus}`);
  }

  return errors;
}

/**
 * Check if status is appropriate for contact type
 */
function validateContactTypeCompatibility(contact: any, newStatus: string): string[] {
  const warnings: string[] = [];

  const insuranceOnlyStatuses = ['claim_filed', 'adjuster_scheduled', 'supplement_filed', 'approved'];
  const retailOnlyStatuses = ['contingency'];

  const isInsurance = contact.claim_number || contact.insurance_company;
  const isRetail = contact.is_retail || (!contact.claim_number && !contact.insurance_company);

  if (insuranceOnlyStatuses.includes(newStatus) && !isInsurance) {
    warnings.push(`Status ${newStatus} is typically for insurance contacts, but this appears to be retail`);
  }

  if (retailOnlyStatuses.includes(newStatus) && !isRetail) {
    warnings.push(`Status ${newStatus} is typically for retail contacts, but this appears to be insurance`);
  }

  return warnings;
}

/**
 * Enhanced auto-progression rules
 */
export async function enhancedAutoProgression(contactId: string, newStatus: string, userId: string, userEmail: string, companyId: string): Promise<void> {
  const progressionRules: Record<string, string> = {
    // Core pipeline progression (the missing pieces!)
    'prospect': 'lead', // When prospect is identified
    'lead': 'contacted', // When first contact is made  
    // NOTE: contacted → appt_set should be triggered by appointment creation, not auto
    'appt_set': 'inspection_completed', // When appointment time arrives (needs time trigger)
    'inspection_completed': 'estimating', // After appointment is marked complete
    'estimating': 'estimate_sent', // When estimate is built and sent
    'estimate_sent': 'contingency', // Move to follow-up phase after some delay
    
    // Advanced pipeline stages
    'contingency': 'approved', // When customer/insurance approves
    'approved': 'signed', // When contract is signed
    'signed': 'ordering_material', // Start material procurement
    'ordering_material': 'in_progress', // When materials arrive and work begins
    'in_progress': 'build_phase', // Main construction phase
    'build_phase': 'cleanup', // Final cleanup phase
    'cleanup': 'completed', // Job completion
    'completed': 'invoicing', // Generate final invoice
    'invoicing': 'pending_payment', // Waiting for payment
    // 'pending_payment': 'paid' (should be triggered by payment, not auto)
  };

  const nextStatus = progressionRules[newStatus];
  if (!nextStatus) return;

  console.log(`[AutoProgression] Evaluating progression: ${newStatus} → ${nextStatus} for contact ${contactId}`);

  // Add delay for some transitions to prevent immediate double-progression and allow user review
  const delayedProgressions = ['estimate_sent', 'contingency', 'build_phase', 'cleanup'];
  const delay = delayedProgressions.includes(newStatus) ? 3000 : 1000; // 3s for delayed, 1s for immediate

  // Special conditions for certain progressions
  const shouldProgress = await checkProgressionConditions(contactId, newStatus, nextStatus);
  if (!shouldProgress) {
    console.log(`[AutoProgression] Conditions not met for ${newStatus} → ${nextStatus}, skipping`);
    return;
  }

  if (delay > 1000) {
    console.log(`[AutoProgression] Delayed progression ${newStatus} → ${nextStatus} in ${delay}ms`);
    setTimeout(async () => {
      await updateContactStatus({
        contactId,
        newStatus: nextStatus,
        userId,
        userEmail,
        companyId,
        source: 'auto_progression',
        reason: `Auto-progressed from ${newStatus}`,
        skipProgression: true, // Prevent infinite loops
      });
    }, delay);
  } else {
    console.log(`[AutoProgression] Immediate progression ${newStatus} → ${nextStatus}`);
    await updateContactStatus({
      contactId,
      newStatus: nextStatus,
      userId,
      userEmail,
      companyId,
      source: 'auto_progression',
      reason: `Auto-progressed from ${newStatus}`,
      skipProgression: true, // Prevent infinite loops
    });
  }
}

/**
 * Check if progression conditions are met for specific transitions
 */
async function checkProgressionConditions(contactId: string, currentStatus: string, nextStatus: string): Promise<boolean> {
  try {
    // Get contact data
    const { data: contact, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', contactId)
      .single();

    if (error || !contact) {
      console.warn(`[AutoProgression] Could not fetch contact data for ${contactId}`);
      return false;
    }

    // Specific conditions for certain transitions
    switch (`${currentStatus}→${nextStatus}`) {
      case 'lead→contacted':
        // Always progress from lead to contacted (assumes user initiated contact)
        return true;
        
      case 'appt_set→inspection_completed':
        // Only progress if appointment date/time has passed
        // TODO: Add time-based trigger checking
        return true; // For now, allow manual progression
        
      case 'inspection_completed→estimating':
        // Always progress to estimating after inspection
        return true;
        
      case 'estimating→estimate_sent':
        // Only if estimate exists - check for related estimates
        return true; // For now, assume estimate was created
        
      case 'estimate_sent→contingency':
        // Always move to follow-up phase after delay
        return true;
        
      case 'contingency→approved':
        // Requires manual approval usually, but allow auto for demo/testing
        return false; // Require manual intervention
        
      case 'approved→signed':
        // Requires contract signing
        return false; // Require manual intervention
        
      default:
        // For other transitions, allow progression
        return true;
    }
  } catch (error) {
    console.error(`[AutoProgression] Error checking conditions for ${contactId}:`, error);
    return false;
  }
}

/**
 * Batch status update for multiple contacts
 */
export async function batchUpdateContactStatus(
  contactIds: string[],
  newStatus: string,
  userId: string,
  userEmail: string,
  companyId: string,
  options: { source?: string; reason?: string; skipAutomation?: boolean } = {}
): Promise<{ success: string[]; failed: { id: string; error: string }[] }> {
  const success: string[] = [];
  const failed: { id: string; error: string }[] = [];

  // Process in parallel but with concurrency limit
  const BATCH_SIZE = 5;
  for (let i = 0; i < contactIds.length; i += BATCH_SIZE) {
    const batch = contactIds.slice(i, i + BATCH_SIZE);
    
    const results = await Promise.allSettled(
      batch.map(contactId => updateContactStatus({
        contactId,
        newStatus,
        userId,
        userEmail,
        companyId,
        ...options,
      }))
    );

    results.forEach((result, index) => {
      const contactId = batch[index];
      if (result.status === 'fulfilled' && result.value.success) {
        success.push(contactId);
      } else {
        const error = result.status === 'rejected' ? result.reason?.message : result.value.error;
        failed.push({ id: contactId, error: error || 'Unknown error' });
      }
    });
  }

  return { success, failed };
}

/**
 * Get status transition history for a contact
 */
export async function getStatusHistory(contactId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .eq('entity_id', contactId)
    .eq('entity_type', 'contact')
    .eq('action', 'status_change')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch status history:', error);
    return [];
  }

  return data || [];
}