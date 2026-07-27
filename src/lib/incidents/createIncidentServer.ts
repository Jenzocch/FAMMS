import type { createAdminClient } from '@/lib/supabase/admin'
import { logAuditEvent } from '@/lib/audit'
import { deadlineFromUrgency } from '@/lib/incident-display'

type AdminClient = ReturnType<typeof createAdminClient>

// Creating an incident from the SERVER, with the service-role client — the
// counterpart to submitIncidentReport.ts, which does the same job from the
// browser under the user's own session.
//
// Two callers today: the Telegram /lapor flow and the QC daily check (both
// the in-app page and FQMS's external report). Each of those used to carry
// its own copy of the incident_no generation + collision retry below, which
// is precisely the code you do not want three subtly different versions of —
// a numbering bug would show up on one channel and not the others.
//
// Runs as service_role, so it does NOT pass through the incidents RLS
// field-guard trigger. That is only safe because every caller here writes the
// same fields a technician is already allowed to set on a NEW report — never
// due_date after creation, never a status other than 'reported'.

export interface CreateIncidentInput {
  factoryId: string
  machineId: string | null
  incidentType: string
  title: string
  description: string
  reporterName: string | null
  reportedById: string | null
  impact: 'A' | 'C' | 'D'
  /** Audit-trail suffix identifying the channel, e.g. "via Telegram". */
  via: string
  factoryIdForAudit?: string
}

export interface CreatedIncident {
  id: string
  incident_no: string
}

export async function createIncidentServer(
  admin: AdminClient,
  input: CreateIncidentInput,
): Promise<CreatedIncident> {
  const now = new Date()
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`

  const { count } = await admin
    .from('incidents')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString())

  const base = {
    factory_id: input.factoryId,
    machine_id: input.machineId,
    incident_type: input.incidentType,
    title: input.title,
    description: input.description,
    reporter_name: input.reporterName,
    downtime_impact: input.impact,
    due_date: deadlineFromUrgency(input.impact),
    status: 'reported' as const,
    reported_by_id: input.reportedById,
  }

  // The number is "today's count + 1". Two reports landing at once compute
  // the same value, so on a unique violation (23505) bump the sequence and
  // retry.
  let incident: CreatedIncident | null = null
  let seq = (count ?? 0) + 1
  for (let attempt = 0; attempt < 6; attempt++) {
    const incident_no = `FIT-${ymd}-${String(seq).padStart(3, '0')}`
    const { data, error } = await admin
      .from('incidents')
      .insert({ ...base, incident_no })
      .select('id, incident_no')
      .single()
    if (!error) { incident = data; break }
    if (error.code === '23505') { seq++; continue }
    throw error
  }
  if (!incident) {
    throw new Error('無法產生不重複的工單編號 / Gagal membuat nomor laporan')
  }

  await logAuditEvent(admin, {
    userId: input.reportedById,
    userName: input.reporterName,
    actionType: 'create',
    resourceType: 'incident',
    resourceId: incident.id,
    newValue: {
      incident_no: incident.incident_no,
      title: input.title,
      incident_type: input.incidentType,
    },
    changeSummary: `工單已建立：${incident.incident_no}（${input.via}）`,
    factoryId: input.factoryIdForAudit ?? input.factoryId,
  })

  return incident
}
