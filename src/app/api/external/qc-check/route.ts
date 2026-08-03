import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { timingSafeEqualString } from '@/lib/timing-safe-equal'
import { wibTodayStr } from '@/lib/pm'
import { reportMachineIssue } from '@/lib/qc-check'

// POST /api/external/qc-check — FQMS posts a QC round back to FAMMS.
//
// QC does the daily ticking in FQMS. FAMMS receives the outcome: an 'ok' is
// just recorded, an 'issue' additionally opens a work order and — only when
// the machine actually stopped — moves the machine to 'repairing'.
//
// A WHOLE ROUND PER CALL, not one call per machine. A QC round is 20-40
// machines; per-machine calls would be that many round trips from the shop
// floor, and a half-finished round would be indistinguishable from a finished
// one. Sending the full array is also what makes re-sending safe (see below).
//
//   POST /api/external/qc-check
//   Authorization: Bearer ${QC_API_SECRET}
//   {
//     "factory_code": "DIN",
//     "checked_by":   "Siti (QC)",
//     "check_date":   "2026-07-27",          // optional, defaults to today (WIB)
//     "results": [
//       { "machine_code": "DIN-HMG-001", "result": "ok" },
//       { "machine_code": "DIN-MIX-002", "result": "issue",
//         "note": "bearing bunyi kasar", "machine_stopped": true,
//         "external_ref": "FQMS-2026-0142" }
//     ]
//   }
//
// NOT ATOMIC, on purpose. One unknown machine_code must not throw away the
// other 29 good ticks. Every entry gets its own outcome in the response, so
// FQMS can show exactly which ones failed and why.
//
// Re-sending the same round is safe: ticks upsert on (machine_id, check_date),
// and an 'issue' carrying external_ref won't open a second work order. Without
// external_ref a re-send DOES open a duplicate case — always send it.
//
// Auth: Bearer ${QC_API_SECRET}, the same secret as the other external QC
// routes. Runs service-role; /api/external/* is exempt from the session guard
// in proxy.ts.

interface ResultEntry {
  machine_id?: unknown
  machine_code?: unknown
  result?: unknown
  note?: unknown
  machine_stopped?: unknown
  external_ref?: unknown
}

interface Body {
  factory_code?: unknown
  checked_by?: unknown
  check_date?: unknown
  results?: unknown
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

// A machine as looked up for this round.
interface MachineRow {
  id: string
  area_id: string
  machine_code: string | null
  machine_name: string
  status: string
}

export async function POST(req: Request) {
  const secret = process.env.QC_API_SECRET
  const auth = req.headers.get('authorization')
  if (!secret || !auth || !timingSafeEqualString(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await req.json().catch(() => null)) as Body | null
  if (!body) return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })

  const factoryCode = str(body.factory_code)
  if (!factoryCode) {
    return NextResponse.json({ error: 'factory_code is required' }, { status: 400 })
  }
  if (!Array.isArray(body.results) || body.results.length === 0) {
    return NextResponse.json({ error: 'results must be a non-empty array' }, { status: 400 })
  }
  const entries = body.results as ResultEntry[]

  const checkedBy = str(body.checked_by) || 'FQMS (QC)'
  // A date FQMS sends wins, so a round finished just after midnight can still
  // be filed against the shift it belongs to. Otherwise: today in WIB, which
  // is the factories' own clock.
  const rawDate = str(body.check_date)
  const checkDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : wibTodayStr()

  const admin = createAdminClient()

  const { data: factory } = await admin
    .from('factories')
    .select('id, code')
    .eq('code', factoryCode)
    .maybeSingle()
  if (!factory) {
    return NextResponse.json({ error: `factory not found: ${factoryCode}` }, { status: 404 })
  }

  // Resolve every machine referenced in this round up front — one query, not
  // one per entry. Indexed by BOTH id and code so an entry can use either.
  const wantedIds = entries.map(e => str(e.machine_id)).filter(Boolean)
  const wantedCodes = entries.map(e => str(e.machine_code)).filter(Boolean)

  const lookups = await Promise.all([
    wantedIds.length
      ? admin.from('machines')
          .select('id, area_id, machine_code, machine_name, status')
          .eq('factory_id', factory.id).in('id', wantedIds)
      : Promise.resolve({ data: [] as MachineRow[] }),
    wantedCodes.length
      ? admin.from('machines')
          .select('id, area_id, machine_code, machine_name, status')
          .eq('factory_id', factory.id).in('machine_code', wantedCodes)
      : Promise.resolve({ data: [] as MachineRow[] }),
  ])

  const byId = new Map<string, MachineRow>()
  const byCode = new Map<string, MachineRow>()
  for (const res of lookups) {
    for (const m of (res.data ?? []) as MachineRow[]) {
      byId.set(m.id, m)
      if (m.machine_code) byCode.set(m.machine_code, m)
    }
  }

  const outcomes: Record<string, unknown>[] = []
  const checkRows: Record<string, unknown>[] = []

  for (const entry of entries) {
    const id = str(entry.machine_id)
    const code = str(entry.machine_code)
    const ref = id || code || '(unidentified)'
    const machine = (id && byId.get(id)) || (code && byCode.get(code)) || null

    if (!machine) {
      outcomes.push({ machine: ref, ok: false, error: 'machine not found in this factory' })
      continue
    }
    const result = entry.result === 'issue' ? 'issue' : entry.result === 'ok' ? 'ok' : null
    if (!result) {
      outcomes.push({ machine: ref, ok: false, error: "result must be 'ok' or 'issue'" })
      continue
    }

    const note = str(entry.note)
    // Anything other than an explicit true is "still running". A missing field
    // must never silently mark a production line as stopped.
    const machineStopped = result === 'issue' && entry.machine_stopped === true
    const externalRef = str(entry.external_ref)
    const clientRequestId = externalRef ? `fqms:${externalRef}` : null

    let incidentId: string | null = null
    let incidentNo: string | null = null
    let machineStatus = machine.status

    if (result === 'issue') {
      // Idempotency: a retry of this round must not dispatch a technician
      // twice. Reuses incidents.client_request_id, which already carries a
      // UNIQUE constraint for the app's own offline retries — namespaced so an
      // FQMS reference can never collide with a browser one.
      if (clientRequestId) {
        // factory_id scoped too, in addition to the UNIQUE constraint on
        // client_request_id itself: defense in depth so a same-day
        // external_ref reused across two factories by FQMS can't match this
        // round's incident to a different factory's case.
        const { data: existing } = await admin
          .from('incidents')
          .select('id, incident_no')
          .eq('client_request_id', clientRequestId)
          .eq('factory_id', factory.id)
          .maybeSingle()
        if (existing) {
          incidentId = existing.id
          incidentNo = existing.incident_no
        }
      }

      if (!incidentId) {
        try {
          const reported = await reportMachineIssue(admin, {
            factoryId: factory.id,
            machineId: machine.id,
            machineName: machine.machine_name,
            machineCode: machine.machine_code,
            note,
            machineStopped,
            reporterName: checkedBy,
            // No FAMMS account behind an FQMS call — attributed by name.
            reportedById: null,
            via: 'via FQMS',
          })
          incidentId = reported.incidentId
          incidentNo = reported.incidentNo
          if (reported.machineStatusChanged) machineStatus = 'repairing'

          if (clientRequestId) {
            // Best-effort: losing the retry guard beats losing the work order,
            // and a DB without the column yet must not fail the round.
            await admin.from('incidents')
              .update({ client_request_id: clientRequestId })
              .eq('id', incidentId)
          }
        } catch (err) {
          console.error(`qc-check: failed to open case for ${ref}`, err)
          outcomes.push({ machine: ref, ok: false, error: 'failed to create work order' })
          continue
        }
      }
    }

    checkRows.push({
      factory_id: factory.id,
      area_id: machine.area_id,
      machine_id: machine.id,
      check_date: checkDate,
      result,
      note: note || null,
      machine_stopped: machineStopped,
      // Always explicit (never omitted): a bulk upsert of rows with
      // different key sets builds ONE insert statement for the whole batch,
      // so whether an omitted column is left alone or forced to NULL on the
      // ON CONFLICT DO UPDATE is not something to rely on. Explicit null
      // when this entry has no incident is also the correct value — this
      // column only means something for result='issue' (see the table's own
      // comment).
      incident_id: incidentId,
      checked_by_id: null,
      checked_by_name: checkedBy,
    })

    outcomes.push({
      machine: ref,
      ok: true,
      result,
      ...(incidentId ? { incident_id: incidentId, incident_no: incidentNo } : {}),
      machine_status: machineStatus,
    })
  }

  // One upsert for the whole round. Conflicts on (machine_id, check_date)
  // update in place, so re-sending a round — or correcting one machine and
  // re-sending — never stacks duplicate rows.
  let checksSaved = 0
  if (checkRows.length > 0) {
    const { error } = await admin
      .from('qc_daily_checks')
      .upsert(checkRows, { onConflict: 'machine_id,check_date' })
    if (error) {
      console.error('qc-check: check upsert failed', error)
      // Work orders for the 'issue' rows are already filed and notified —
      // report the partial success rather than implying nothing happened.
      return NextResponse.json({
        ok: false,
        error: 'work orders created, but the QC ticks were not saved',
        check_date: checkDate,
        results: outcomes,
      }, { status: 500 })
    }
    checksSaved = checkRows.length
  }

  const failed = outcomes.filter(o => o.ok === false).length
  return NextResponse.json({
    ok: failed === 0,
    check_date: checkDate,
    saved: checksSaved,
    failed,
    results: outcomes,
  })
}

// GET — so the FQMS developer can confirm the URL and secret before wiring
// up the POST.
export async function GET(req: Request) {
  const secret = process.env.QC_API_SECRET
  const auth = req.headers.get('authorization')
  if (!secret || !auth || !timingSafeEqualString(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json({
    ok: true,
    hint: 'POST { factory_code, checked_by, check_date?, results: [{ machine_code | machine_id, result, note?, machine_stopped?, external_ref? }] }',
  })
}
