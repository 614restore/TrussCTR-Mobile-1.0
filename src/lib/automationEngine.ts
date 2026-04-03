import { supabase } from './supabase';

export interface AutomationContext {
  contactName?: string;
  contactEmail?: string;
  contactId?: string;
  oldStatus?: string;
  newStatus?: string;
  invoiceNumber?: string;
  amount?: number;
  assignedTo?: string;
  [key: string]: any;
}

function buildNotificationMessage(actionName: string, eventType: string, ctx: AutomationContext): { title: string; message: string } {
  const name = ctx.contactName || 'a contact';

  if (eventType.includes('status')) {
    const change = ctx.oldStatus && ctx.newStatus ? ` from "${ctx.oldStatus}" to "${ctx.newStatus}"` : '';
    return {
      title: `Status Changed — ${actionName}`,
      message: `${name} status updated${change}.`,
    };
  }

  if (eventType.includes('invoice')) {
    const inv = ctx.invoiceNumber ? ` #${ctx.invoiceNumber}` : '';
    const amt = ctx.amount != null ? ` ($${ctx.amount.toFixed(2)})` : '';
    return {
      title: `Invoice Generated — ${actionName}`,
      message: `New invoice${inv} created for ${name}${amt}.`,
    };
  }

  if (eventType.includes('payment')) {
    const amt = ctx.amount != null ? ` $${ctx.amount.toFixed(2)}` : '';
    return {
      title: `Payment Received — ${actionName}`,
      message: `Payment${amt} received from ${name}.`,
    };
  }

  // Default fallback
  return {
    title: actionName,
    message: `Automation triggered for ${name}.`,
  };
}

export async function fireAutomationEvent(
  eventType: string, 
  context: AutomationContext = {}
): Promise<void> {
  console.log(`[AutomationEngine] Firing event: ${eventType}`, context);

  try {
    // Log automation event to database
    await supabase.from('automation_logs').insert({
      event_type: eventType,
      contact_id: context.contactId,
      context: context,
      created_at: new Date().toISOString()
    });

    // Handle different event types
    switch (eventType) {
      case 'contact_status_changed':
        await handleStatusChangeEvent(context);
        break;
      case 'invoice_generated':
        await handleInvoiceEvent(context);
        break;
      case 'payment_received':
        await handlePaymentEvent(context);
        break;
      default:
        console.log(`[AutomationEngine] No handler for event: ${eventType}`);
    }
  } catch (error) {
    console.error(`[AutomationEngine] Error firing event ${eventType}:`, error);
  }
}

async function handleStatusChangeEvent(context: AutomationContext) {
  if (!context.contactId || !context.newStatus) return;

  // Example: Send notification on certain status changes
  if (context.newStatus === 'approved' || context.newStatus === 'signed') {
    console.log('[AutomationEngine] Contract approved - triggering next steps');
  }

  if (context.newStatus === 'completed') {
    console.log('[AutomationEngine] Job completed - triggering invoicing workflow');
  }
}

async function handleInvoiceEvent(context: AutomationContext) {
  console.log('[AutomationEngine] Invoice event handler - placeholder for mobile');
}

async function handlePaymentEvent(context: AutomationContext) {
  console.log('[AutomationEngine] Payment event handler - placeholder for mobile');
}