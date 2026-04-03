import { supabase } from './supabase'
import { logAudit } from './auditLogger'

export async function handleAutoProgression(
  contactId: string,
  newStatus: string,
  userId: string,
  userEmail: string
) {
  // When a job is signed/won, advance to ordering material on Production Board
  if (newStatus === 'signed' || newStatus === 'approved') {
    await moveToBoard(contactId, 'production', 'ordering_material', userId, userEmail)
  }
  // When a job is completed, advance to invoicing on Billing Board
  if (newStatus === 'completed') {
    await moveToBoard(contactId, 'billing', 'invoicing', userId, userEmail)
  }
  // When invoicing is done, advance to pending payment
  if (newStatus === 'invoicing') {
    await moveToBoard(contactId, 'billing', 'pending_payment', userId, userEmail)
  }
}

export async function checkDownPaymentGate(
  contactId: string
): Promise<{ allowed: boolean; reason?: string }> {
  const { data: payments } = await supabase
    .from('payments')
    .select('amount, type')
    .eq('contact_id', contactId)
    .in('type', ['down_payment', 'deposit'])

  const totalDownPayment = payments?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0

  // Check if minimum down payment threshold is met
  if (totalDownPayment < 100) { // configurable minimum
    return { 
      allowed: false, 
      reason: `Down payment of $${totalDownPayment} is below minimum required` 
    }
  }

  return { allowed: true }
}

async function moveToBoard(
  contactId: string,
  boardName: string,
  status: string,
  userId: string,
  userEmail: string
) {
  console.log(`[AutoProgression] Moving contact ${contactId} to ${boardName} board with status ${status}`)
  
  try {
    const { error } = await supabase
      .from('contacts')
      .update({ 
        status, 
        board: boardName,
        status_changed_at: new Date().toISOString() 
      })
      .eq('id', contactId)

    if (error) {
      console.error(`[AutoProgression] Failed to move to ${boardName}:`, error)
      return
    }

    // Log the board transition
    await logAudit({
      userId,
      userEmail,
      action: 'board_transition',
      entityType: 'contact',
      entityId: contactId,
      newValue: { board: boardName, status },
      metadata: { source: 'auto_progression', reason: 'status_based_board_move' }
    })

    console.log(`[AutoProgression] Successfully moved contact ${contactId} to ${boardName} board`)
  } catch (error) {
    console.error(`[AutoProgression] Exception moving to ${boardName}:`, error)
  }
}