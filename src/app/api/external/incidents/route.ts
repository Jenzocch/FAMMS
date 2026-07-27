import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { timingSafeEqualString } from '@/lib/timing-safe-equal'

// POST /api/external/incidents
//
// Lets QC (FQMS) open a work order straight from a failed zone check, instead
// of QC noticing a problem in one system and someone re-typing it into this
// one. The machine also flips to 'repairing' so it shows up as under repair on
// the machines board the moment QC reports it — that visible state change is
// the whole point of the integration, and a plain deep-link could not do it.
//
// Body:
//   factory_code       required — 'DIN' | 'SJA' | 'OLT'
//   machine_code       required — must already exist in this factory
//   title              required
//   description        optional
//   reporter_name      optional — the QC person, free text (they have no
//                      profile here, so reported_by_id stays null)
//   impact             optional — 'A' | 'C' | 'D', default 'D'
//   client_request_id  optional but strongly recommended — a UUID the caller
//                      keeps stable across retries. QC sends from an outbox
//                      that retries on network failure; without this, one
//                      report becomes several work orders.
//
// Auth: Authorization: Bearer ${QC_API_SECRET}, same secret as the other
// external endpoints. Service-role client — no user session on a
// server-to-server call.

const VALID_IMPACT = ['A', 'C', 'D']
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function incidentUrl(id: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '')
  // Relative path when APP_URL is unset: the caller can still render a link
  // against whatever host it knows, instead of getting a localhost URL that
  // goes nowhere from a phone on the factory floor.
  return base ? `${base}/incidents/${id}` : `/incidents/${id}`
}

export async function POST(req: Request) {
  const secret = process.env.QC_API_SECRET
  const auth = req.headers.get('authorization')
  if (!secret || !auth || !timingSafeEqualString(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  const factoryCode = typeof body.factory_code === 'string' ? body.factory_code : ''
  const machineCode = typeof body.machine_code === 'string' ? body.machine_code : ''
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  const description = typeof body.description === 'string' ? body.description.trim() : ''
  const reporterName = typeof body.reporter_name === 'string' ? body.reporter_name.trim() : ''
  const impact = typeof body.impact === 'string' ? body.impact : 'D'
  const clientRequestId = typeof body.client_request_id === 'string' ? body.client_request_id : null

  if (!factoryCode || !machineCode || !title) {
    return NextResponse.json(
      { error: 'factory_code, machine_code and title are required' },
      { status: 400 },
    )
  }
  if (!VALID_IMPACT.includes(impact)) {
    return NextResponse.json(
      { error: `impact must be one of ${VALID_IMPACT.join(', ')}` },
      { status: 400 },
    )
  }
  if (clientRequestId && !UUID_RE.test(clientRequestId)) {
    return NextResponse.json({ error: 'client_request_id must be a UUID' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Idempotency first, before any lookup or write: a retry after an ambiguous
  // timeout must return the work order the first attempt already created, not
  // open a second one. Same contract as submitIncidentReport.
  if (clientRequestId) {
    const { data: existing } = await supabase
      .from('incidents')
      .select('id, incident_no')
      .eq('client_request_id', clientRequestId)
      .maybeSingle()
    if (existing) {
      return NextResponse.json({
        incident_id: existing.id,
        incident_no: existing.incident_no,
        url: incidentUrl(existing.id),
        duplicate: true,
      })
    }
  }

  const { data: factory } = await supabase
    .from('factories')
    .select('id')
    .eq('code', factoryCode)
    .single()
  if (!factory) {
    return NextResponse.json({ error: 'factory not found' }, { status: 404 })
  }

  const { data: machine } = await supabase
    .from('machines')
    .select('id, status')
    .eq('factory_id', factory.id)
    .eq('machine_code', machineCode)
    .single()
  if (!machine) {
    return NextResponse.json({ error: 'machine not found' }, { status: 404 })
  }

  // incident_no is "FIT-YYYYMMDD-NNN" where NNN counts today's incidents, the
  // same scheme submitIncidentReport uses — QC work orders must not be
  // distinguishable by number from ones raised inside FAMMS.
  const now = new Date()
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  const { count } = await supabase
    .from('incidents')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString())

  const basePayload: Record<string, unknown> = {
    factory_id: factory.id,
    machine_id: machine.id,
    incident_type: 'machine',
    title,
    description: description || null,
    reporter_name: reporterName || null,
    downtime_impact: impact,
    status: 'reported',
  }

  // Same backward-compatibility handling as submitIncidentReport: a database
  // that hasn't run SYNC_SCHEMA_LATEST.sql yet has no client_request_id
  // column, and an unknown column fails the whole insert. Drop just that field
  // and retry rather than losing the work order.
  let sendClientRequestId = !!clientRequestId
  let incident: { id: string; incident_no: string } | null = null
  let seq = (count ?? 0) + 1

  for (let attempt = 0; attempt < 6; attempt++) {
    const payload: Record<string, unknown> = {
      ...basePayload,
      incident_no: `FIT-${ym}-${String(seq).padStart(3, '0')}`,
    }
    if (sendClientRequestId) payload.client_request_id = clientRequestId
    const { data, error } = await supabase
      .from('incidents')
      .insert(payload)
      .select('id, incident_no')
      .single()
    if (!error) { incident = data; break }
    if ((error.code === '42703' || error.code === 'PGRST204') && sendClientRequestId) {
      sendClientRequestId = false
      continue
    }
    if (error.code === '23505') {
      // A client_request_id collision means a parallel retry of THIS request
      // won the race — return its work order instead of bumping forever.
      if (sendClientRequestId && `${error.message} ${error.details ?? ''}`.includes('client_request_id')) {
        const { data: winner } = await supabase
          .from('incidents')
          .select('id, incident_no')
          .eq('client_request_id', clientRequestId!)
          .maybeSingle()
        if (winner) {
          return NextResponse.json({
            incident_id: winner.id,
            incident_no: winner.incident_no,
            url: incidentUrl(winner.id),
            duplicate: true,
          })
        }
      }
      seq++
      continue
    }
    return NextResponse.json({ error: 'insert failed' }, { status: 500 })
  }

  if (!incident) {
    return NextResponse.json({ error: 'could not allocate incident_no' }, { status: 503 })
  }

  // Flip the machine to 'repairing' — this is what QC actually asked for: the
  // machine shows as under repair the moment they report it.
  //
  // Only from 'running'. A machine already 'repairing' needs no change, and
  // 'standby'/'scrapped' are deliberate states that a QC report must not
  // silently overwrite. Best-effort: the work order is already real, so a
  // failure here must not fail the request — it is reported back so the caller
  // can say "work order raised, machine status unchanged" rather than lie.
  let machineStatus = machine.status
  if (machine.status === 'running') {
    const { error: statusErr } = await supabase
      .from('machines')
      .update({ status: 'repairing', updated_at: new Date().toISOString() })
      .eq('id', machine.id)
      .eq('status', 'running')
    if (!statusErr) machineStatus = 'repairing'
  }

  return NextResponse.json({
    incident_id: incident.id,
    incident_no: incident.incident_no,
    url: incidentUrl(incident.id),
    machine_status: machineStatus,
    duplicate: false,
  })
}
