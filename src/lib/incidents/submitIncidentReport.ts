import { createClient } from '@/lib/supabase/client'
import { logAuditEvent } from '@/lib/audit'

type SupabaseClient = ReturnType<typeof createClient>

export interface SubmitIncidentReportInput {
  factoryId: string
  incidentType: string
  machineId: string | null
  title: string
  description: string
  reporterName: string
  impactCode: 'A' | 'C' | 'D'
  dueDate: string
  locationNote: string
  photos: File[]
  userId: string | null
}

// Creates an incident end-to-end: unique incident_no (retry on collision),
// insert, best-effort photo upload, audit trail, Telegram notify. Any of the
// post-insert steps failing must not undo the incident itself — the case is
// already real to the reporter the moment this function returns.
export async function submitIncidentReport(
  supabase: SupabaseClient,
  input: SubmitIncidentReportInput
): Promise<{ id: string; incident_no: string; photoUploadFailed: boolean }> {
  const { data: { user } } = await supabase.auth.getUser()

  const now = new Date()
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  const { count } = await supabase
    .from('incidents')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString())

  const insertPayload: Record<string, unknown> = {
    factory_id: input.factoryId,
    incident_type: input.incidentType,
    machine_id: input.machineId,
    title: input.title,
    description: input.description,
    reporter_name: input.reporterName || null,
    downtime_impact: input.impactCode,
    due_date: input.dueDate,
    status: 'reported',
    reported_by_id: user?.id ?? null,
  }
  // Only send location_note when actually filled, so reporting still works on
  // databases where migration_incident_location_note.sql hasn't run yet (an
  // unknown column would otherwise fail the whole insert).
  const trimmedLocation = input.locationNote.trim()
  if (trimmedLocation) insertPayload.location_note = trimmedLocation

  // The number is "today's count + 1". Two people reporting at once would
  // compute the same value, so on a unique-violation (23505 — once the
  // incidents_incident_no_key constraint is in place) bump the sequence and
  // retry. Without the DB constraint this still works; it just can't catch a
  // true simultaneous collision.
  let incident: { id: string; incident_no: string } | null = null
  let lastErr: unknown = null
  let seq = (count ?? 0) + 1
  for (let attempt = 0; attempt < 6; attempt++) {
    const incident_no = `FIT-${ym}-${String(seq).padStart(3, '0')}`
    const { data, error } = await supabase
      .from('incidents')
      .insert({ ...insertPayload, incident_no })
      .select('*')
      .single()
    if (!error) { incident = data; break }
    if (error.code === '23505') { seq++; lastErr = error; continue }
    throw error
  }
  if (!incident) throw lastErr ?? new Error('無法產生不重複的工單編號，請重試')
  const incident_no = incident.incident_no

  // Upload photos if any. Best-effort: the incident is already saved, so a
  // storage problem (missing bucket / permissions) must not fail the report.
  let photoUploadFailed = false
  if (input.photos.length > 0) {
    try {
      for (const photo of input.photos) {
        const ext = photo.name.split('.').pop()
        const path = `${incident.id}/${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage.from('incident-photos').upload(path, photo)
        if (upErr) throw upErr
      }
    } catch (photoErr) {
      console.error('Photo upload failed:', photoErr)
      photoUploadFailed = true
    }
  }

  await logAuditEvent(supabase, {
    userId: user?.id ?? null,
    userName: input.reporterName || null,
    actionType: 'create',
    resourceType: 'incident',
    resourceId: incident.id,
    newValue: { incident_no, title: input.title, incident_type: input.incidentType },
    changeSummary: `工單已建立：${incident_no}`,
    factoryId: input.factoryId || undefined,
  })

  await fetch('/api/incidents/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ incidentId: incident.id }),
  }).catch(() => {})

  return { id: incident.id, incident_no, photoUploadFailed }
}
