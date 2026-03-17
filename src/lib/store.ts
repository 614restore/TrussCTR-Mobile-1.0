import { supabase } from './supabase';

/**
 * Automation Logic Mapping:
 * submit_inspection  -> status: 'inspected'
 * sign_contingency   -> status: 'appointment_set'
 * sign_csa           -> status: 'approved'
 * sign_completion    -> status: 'completed'
 */
export async function handleAutoMove(contactId: string, action: string) {
  const statusMap: Record<string, string> = {
    submit_inspection: 'inspected',
    sign_contingency: 'appointment_set',
    sign_csa: 'approved',
    sign_completion: 'completed',
  };

  const newStatus = statusMap[action];
  if (!newStatus) return;

  const { error } = await supabase
    .from('contacts')
    .update({ status: newStatus })
    .eq('id', contactId);

  if (error) {
    console.error(`AutoMove failed for ${contactId}:`, error);
  } else {
    console.log(`Pipeline Trigger: Contact ${contactId} -> ${newStatus}`);
  }
}
