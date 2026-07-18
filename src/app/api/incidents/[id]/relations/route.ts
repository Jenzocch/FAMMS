import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getCurrentUser, PERMISSIONS } from '@/lib/auth'

// POST /api/incidents/[id]/relations — confirm a candidate repeat failure,
// linking a newly reported incident to the prior one it may be a repeat of.
// The candidate itself is only ever DETECTED (submitIncidentReport /
// Telegram /lapor) — nothing writes to incident_relations without a human
// confirming it here. Body: { relatedIncidentId, relationType? }.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Same tier as closing/RCA/editing the due date — confirming "yes, this is
  // the same failure again" is a supervisory judgment call, not something a
  // technician should self-certify. remindProgress is the closest existing
  // capability at that tier (no dedicated "confirmRepeat" permission exists).
  if (!PERMISSIONS.remindProgress(user.role)) {
    return NextResponse.json(
      { error: 'Hanya supervisor ke atas yang dapat mengonfirmasi kegagalan berulang' },
      { status: 403 }
    )
  }

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const relatedIncidentId = typeof body?.relatedIncidentId === 'string' ? body.relatedIncidentId : ''
  const relationType = typeof body?.relationType === 'string' ? body.relationType : 'repeat_failure'
  if (!relatedIncidentId) {
    return NextResponse.json({ error: 'relatedIncidentId wajib diisi' }, { status: 400 })
  }

  const [{ data: incident, error: incErr }, { data: related, error: relErr }] = await Promise.all([
    supabase.from('incidents').select('id, factory_id, machine_id').eq('id', id).single(),
    supabase.from('incidents').select('id, factory_id, machine_id').eq('id', relatedIncidentId).single(),
  ])
  if (incErr || !incident) return NextResponse.json({ error: 'Kasus tidak ditemukan' }, { status: 404 })
  if (relErr || !related) return NextResponse.json({ error: 'Kasus terkait tidak ditemukan' }, { status: 404 })

  // Factory-scope guard: RLS already confines both SELECTs above to what this
  // user can access, but a repeat-failure relation only makes sense between
  // two incidents on the SAME machine (hence the same factory) — reject
  // anything else outright rather than silently linking across factories.
  if (incident.factory_id !== related.factory_id || !incident.machine_id || incident.machine_id !== related.machine_id) {
    return NextResponse.json({ error: 'Kedua kasus harus berada di mesin dan pabrik yang sama' }, { status: 400 })
  }

  const { error: insErr } = await supabase.from('incident_relations').insert({
    incident_id: incident.id,
    related_incident_id: related.id,
    relation_type: relationType,
    confirmed_by_id: user.id,
    confirmed_at: new Date().toISOString(),
  })
  // Already-linked (UNIQUE incident_id/related_incident_id/relation_type) is
  // not an error from the caller's point of view — the relation exists
  // either way, which is what they asked for.
  if (insErr && insErr.code !== '23505') {
    return NextResponse.json({ error: insErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
