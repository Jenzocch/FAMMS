import { SupabaseClient } from '@supabase/supabase-js'

// Audit values are heterogeneous by design: some callers log a plain scalar
// (e.g. the old/new status string), others log a partial record of the
// fields that changed (e.g. { title, description, ... }).
export type AuditValue = Record<string, unknown> | string | null

export interface AuditLogEntry {
  id: string
  user_id: string | null
  user_name: string | null
  action_type: string
  resource_type: string
  resource_id: string
  old_value: AuditValue
  new_value: AuditValue
  change_summary: string | null
  timestamp: string
  ip_address: string | null
}

export async function logAuditEvent(
  supabase: SupabaseClient,
  {
    userId,
    userName,
    actionType,
    resourceType,
    resourceId,
    oldValue,
    newValue,
    changeSummary,
    ipAddress,
    factoryId,
  }: {
    userId: string | null
    userName: string | null
    actionType: 'create' | 'update' | 'delete' | 'status_change' | 'assign' | 'comment'
    resourceType: 'incident' | 'machine' | 'pm_schedule' | 'maintenance_log'
    resourceId: string
    oldValue?: AuditValue
    newValue?: AuditValue
    changeSummary?: string
    ipAddress?: string
    factoryId?: string
  },
) {
  try {
    const { error } = await supabase.from('audit_logs').insert({
      user_id: userId,
      user_name: userName,
      action_type: actionType,
      resource_type: resourceType,
      resource_id: resourceId,
      old_value: oldValue || null,
      new_value: newValue || null,
      change_summary: changeSummary,
      ip_address: ipAddress,
      factory_id: factoryId,
    })

    if (error) console.error('Audit log error:', error)
  } catch (err) {
    console.error('Failed to log audit event:', err)
  }
}
