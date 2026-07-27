import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { wibTodayStr } from '@/lib/pm'
import { reportMachineIssue } from '@/lib/qc-check'

// POST /api/qc/checks — record today's QC tick for one machine.
//
//   { machine_id, result: 'ok' | 'issue', note?, machine_stopped? }
//
// 'ok'    → just the sign-off row.
// 'issue' → the sign-off row PLUS a real incident (and, when the machine
//           actually stopped, machines.status → 'repairing'). See lib/qc-check.
//
// Re-ticking the same machine on the same day UPDATEs the row rather than
// stacking duplicates (unique index on machine_id + check_date). Correcting an
// 'ok' to an 'issue' therefore works and opens the case; correcting an
// 'issue' back to 'ok' updates the row but deliberately does NOT delete the
// incident it already opened — a filed case is the maintenance team's, not
// QC's, to close.

interface Body {
  machine_id?: unknown
  result?: unknown
  note?: unknown
  machine_stopped?: unknown
}

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.is_active) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = (await req.json().catch(() => null)) as Body | null
  const machineId = typeof body?.machine_id === 'string' ? body.machine_id : ''
  const result = body?.result === 'issue' ? 'issue' : body?.result === 'ok' ? 'ok' : null
  if (!machineId || !result) {
    return NextResponse.json({ error: 'machine_id and result are required' }, { status: 400 })
  }
  const note = typeof body?.note === 'string' ? body.note.trim() : ''
  const machineStopped = body?.machine_stopped === true

  // Read the machine under the USER's session, not the admin client: this is
  // what confines a QC account to machines in a factory they can actually see.
  // RLS decides, not a factory_id comparison written here.
  const supabase = await createClient()
  const { data: machine } = await supabase
    .from('machines')
    .select('id, factory_id, area_id, machine_name, machine_code, status')
    .eq('id', machineId)
    .maybeSingle()
  if (!machine) {
    return NextResponse.json({ error: 'machine not found' }, { status: 404 })
  }

  const checkDate = wibTodayStr()

  let incidentId: string | null = null
  let incidentNo: string | null = null
  let machineStatusChanged = false

  if (result === 'issue') {
    // Incident creation runs service-role (same as the Telegram and FQMS
    // paths) so it can stamp fields the RLS field-guard trigger reserves for
    // supervisors. Safe for the same reason: everything written here is what
    // any reporter is allowed to set on a NEW case.
    const admin = createAdminClient()
    const reported = await reportMachineIssue(admin, {
      factoryId: machine.factory_id,
      machineId: machine.id,
      machineName: machine.machine_name,
      machineCode: machine.machine_code,
      note,
      machineStopped,
      reporterName: user.full_name,
      reportedById: user.id,
      via: 'via QC 點檢',
    })
    incidentId = reported.incidentId
    incidentNo = reported.incidentNo
    machineStatusChanged = reported.machineStatusChanged
  }

  const { error } = await supabase
    .from('qc_daily_checks')
    .upsert({
      factory_id: machine.factory_id,
      area_id: machine.area_id,
      machine_id: machine.id,
      check_date: checkDate,
      result,
      note: note || null,
      machine_stopped: result === 'issue' ? machineStopped : false,
      // Keep the FIRST incident this machine's check opened today. A re-tick
      // that opens a second case would otherwise orphan the link to the first.
      ...(incidentId ? { incident_id: incidentId } : {}),
      checked_by_id: user.id,
      checked_by_name: user.full_name,
    }, { onConflict: 'machine_id,check_date' })

  if (error) {
    console.error('QC check upsert failed:', error)
    // The incident (if any) is already filed and notified — report the
    // partial success rather than implying nothing happened.
    return NextResponse.json(
      { error: 'check not saved', incident_id: incidentId, incident_no: incidentNo },
      { status: 500 },
    )
  }

  return NextResponse.json({
    ok: true,
    check_date: checkDate,
    incident_id: incidentId,
    incident_no: incidentNo,
    machine_status: machineStatusChanged ? 'repairing' : machine.status,
  })
}
