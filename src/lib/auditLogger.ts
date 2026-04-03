import { supabase } from './supabase'

interface AuditEntry {
  userId: string
  userEmail: string
  action: string
  entityType: string
  entityId?: string
  oldValue?: Record<string, unknown>
  newValue?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  const { error } = await supabase.from('audit_logs').insert({
    user_id:     entry.userId,
    user_email:  entry.userEmail,
    action:      entry.action,
    entity_type: entry.entityType,
    entity_id:   entry.entityId ?? null,
    old_value:   entry.oldValue ?? null,
    new_value:   entry.newValue ?? null,
    metadata:    entry.metadata ?? null,
  })

  if (error) {
    console.error('[auditLogger] Failed to log audit entry:', error.message)
  }
}