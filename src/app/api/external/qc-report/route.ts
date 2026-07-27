import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { timingSafeEqualString } from '@/lib/timing-safe-equal'
import { reportMachineIssue } from '@/lib/qc-check'

// POST /api/external/qc-report — FQMS (the external QC system) reports a
// machine fault into FAMMS.
//
// The design goal is that FQMS needs to know as little about FAMMS as
// possible: no UUIDs, no login, no incident schema. It sends the codes its
// own operators already see on the machine, plus one boolean, and gets back a
// work-order number and a link to show them.
//
//   POST /api/external/qc-report
//   Authorization: Bearer ${QC_API_SECRET}
//   {
//     "factory_code":   "DIN",             // required
//     "machine_code":   "DIN-HMG-001",     // required
//     "note":           "bearing bunyi kasar",  // what QC saw
//     "machine_stopped": true,             // did production actually stop?
//     "reporter_name":  "Siti (QC)",       // optional, shown on the case
//     "external_ref":   "FQMS-2026-0142"   // optional, see idempotency below
//   }
//
//   → 200 { ok, incident_id, incident_no, url, machine_status }
//
// machine_stopped is the only judgement call asked of QC, deliberately: "did
// it stop?" is a question a QC walker can answer reliably, an A/C/D severity
// scale is not. TRUE ⇒ Critical + machine flips to 'repairing'; FALSE ⇒ 中,
// case opened, machine left 'running' so availability stats stay honest.
//
// The `url` in the response is meant to be rendered as a normal link on the
// FQMS side — never a redirect. QC is mid-checklist and mostly has no FAMMS
// account; the point of this endpoint is that they DON'T have to come here.
//
// Auth: Bearer ${QC_API_SECRET}, the same shared secret as the read-only
// GET /api/external/machine-status. Runs with the service-role client — there
// is no user session on a server-to-server call. This route is exempted from
// the session guard in proxy.ts along with the rest of /api/external/.

interface QcReportBody {
  factory_code?: unknown
  machine_code?: unknown
  note?: unknown
  machine_stopped?: unknown
  reporter_name?: unknown
  external_ref?: unknown
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

export async function POST(req: Request) {
  const secret = process.env.QC_API_SECRET
  const auth = req.headers.get('authorization')
  if (!secret || !auth || !timingSafeEqualString(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await req.json().catch(() => null)) as QcReportBody | null
  if (!body) {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  const factoryCode = str(body.factory_code)
  const machineCode = str(body.machine_code)
  if (!factoryCode || !machineCode) {
    return NextResponse.json(
      { error: 'factory_code and machine_code are required' },
      { status: 400 },
    )
  }
  // Anything other than an explicit true is treated as "still running". A
  // missing field must never silently mark a line as stopped.
  const machineStopped = body.machine_stopped === true
  const note = str(body.note)
  const reporterName = str(body.reporter_name) || 'FQMS (QC)'
  const externalRef = str(body.external_ref)

  const admin = createAdminClient()

  const { data: factory } = await admin
    .from('factories')
    .select('id, code')
    .eq('code', factoryCode)
    .maybeSingle()
  if (!factory) {
    return NextResponse.json({ error: `factory not found: ${factoryCode}` }, { status: 404 })
  }

  const { data: machine } = await admin
    .from('machines')
    .select('id, machine_name, machine_code, status')
    .eq('factory_id', factory.id)
    .eq('machine_code', machineCode)
    .maybeSingle()
  if (!machine) {
    return NextResponse.json(
      { error: `machine not found in ${factoryCode}: ${machineCode}` },
      { status: 404 },
    )
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  // ── Idempotency ───────────────────────────────────────────────────────────
  // FQMS may retry on a timeout, and a retry must not open a second work
  // order for the same QC finding. When they send external_ref we store it in
  // the incidents.client_request_id column — which already carries a UNIQUE
  // constraint for exactly this purpose on the app's own offline retries —
  // namespaced so an FQMS reference can never collide with a browser one.
  //
  // Without external_ref this endpoint is NOT idempotent, and a retry opens a
  // second case. Tell the FQMS side to always send it.
  const clientRequestId = externalRef ? `fqms:${externalRef}` : null
  if (clientRequestId) {
    const { data: existing } = await admin
      .from('incidents')
      .select('id, incident_no')
      .eq('client_request_id', clientRequestId)
      .maybeSingle()
    if (existing) {
      return NextResponse.json({
        ok: true,
        duplicate: true,
        incident_id: existing.id,
        incident_no: existing.incident_no,
        url: `${appUrl}/incidents/${existing.id}`,
      })
    }
  }

  try {
    const result = await reportMachineIssue(admin, {
      factoryId: factory.id,
      machineId: machine.id,
      machineName: machine.machine_name,
      machineCode: machine.machine_code,
      note,
      machineStopped,
      reporterName,
      // No FAMMS account behind an FQMS call — the case is attributed by name.
      reportedById: null,
      via: 'via FQMS',
    })

    // Stamped after the fact rather than passed into the shared creator: it's
    // specific to this integration, and a database that hasn't run
    // SYNC_SCHEMA_LATEST.sql yet has no client_request_id column. Best-effort
    // — losing the retry guard is much better than losing the work order.
    if (clientRequestId) {
      await admin
        .from('incidents')
        .update({ client_request_id: clientRequestId })
        .eq('id', result.incidentId)
    }

    return NextResponse.json({
      ok: true,
      incident_id: result.incidentId,
      incident_no: result.incidentNo,
      url: `${appUrl}/incidents/${result.incidentId}`,
      // What the machine looks like in FAMMS now, so FQMS can echo it back to
      // the QC operator without a second call.
      machine_status: result.machineStatusChanged ? 'repairing' : machine.status,
    })
  } catch (err) {
    console.error('FQMS qc-report failed:', err)
    return NextResponse.json({ error: 'failed to create incident' }, { status: 500 })
  }
}

// GET — so the FQMS developer can check the URL and secret are right before
// wiring up the POST.
export async function GET(req: Request) {
  const secret = process.env.QC_API_SECRET
  const auth = req.headers.get('authorization')
  if (!secret || !auth || !timingSafeEqualString(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json({
    ok: true,
    hint: 'POST here with { factory_code, machine_code, note, machine_stopped, reporter_name, external_ref }',
  })
}
