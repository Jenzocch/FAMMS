import { createClient } from '@/lib/supabase/server'
import { nextDueFromLast } from '@/lib/pm'

// Which machines are past due for preventive maintenance.
//
// This is the single most expensive read in the app, and both landing pages
// (dashboard + incident board) want it. There is no per-machine "last
// maintained" column, so the answer has to be assembled client-side from two
// separate history tables — up to ~4000 rows fetched to produce a ten-line
// widget and one banner number.
//
// Because of that cost, callers should NOT await this before their first
// paint: pass the promise into a <Suspense> boundary and let it stream in.
// See app/(dashboard)/dashboard/page.tsx and .../incidents/page.tsx.
//
// It never rejects — an unawaited rejected promise is an unhandled rejection,
// and neither the PM widget nor the banner is worth taking a landing page
// down for. On failure it resolves to an empty list.

export interface OverdueMachine {
  machine_id: string
  machine_name: string
  machine_code: string | null
  pm_type: string
  days_overdue: number
}

// Row shapes for the joined selects below. The untyped Supabase client (no
// generated Database type) infers embedded to-one relations as arrays, which
// doesn't match the actual single-row PostgREST response for these foreign
// keys — these describe the real shape returned.
interface ScheduleRow {
  id: string
  machine_id: string
  pm_type: string
  interval_days: number | null
  machines: { machine_name: string; machine_code: string | null } | null
}
interface MaintenanceLogRow { machine_id: string; performed_at: string }
interface PMRecordRow { pm_schedule_id: string; completed_at: string | null }

/**
 * All overdue active PM schedules the viewer can see, most overdue first.
 *
 * @param factoryId  Restrict to this factory. RLS already scopes the read, but
 *                   the explicit filter keeps the payload small.
 * @param allFactories  True for admin / cross-factory accounts — skips the
 *                      factory filter so the whole group is covered.
 */
export async function getOverduePM(
  factoryId: string | null,
  allFactories: boolean,
): Promise<OverdueMachine[]> {
  try {
    const supabase = await createClient()

    // Only maintenance within the last year can change the answer (anything
    // older means the machine reads as overdue either way) — time-bound the
    // history reads so this doesn't scan every row ever written.
    const historyFloor = new Date(Date.now() - 366 * 86400000).toISOString()

    let scheduleQuery = supabase
      .from('pm_schedules')
      .select('id, machine_id, pm_type, interval_days, machines(machine_name, machine_code)')
      .eq('is_active', true)
    if (factoryId && !allFactories) scheduleQuery = scheduleQuery.eq('factory_id', factoryId)

    const [schedulesRes, logsRes, pmRecordsRes] = await Promise.all([
      scheduleQuery,
      supabase
        .from('maintenance_logs')
        .select('machine_id, performed_at')
        .gte('performed_at', historyFloor)
        .order('performed_at', { ascending: false })
        .limit(2000),
      supabase
        .from('pm_records')
        .select('pm_schedule_id, completed_at')
        .eq('status', 'completed')
        .gte('completed_at', historyFloor)
        .order('completed_at', { ascending: false })
        .limit(2000),
    ])

    const schedules = (schedulesRes.data ?? []) as unknown as ScheduleRow[]
    const logs = (logsRes.data ?? []) as unknown as MaintenanceLogRow[]
    const pmRecords = (pmRecordsRes.data ?? []) as unknown as PMRecordRow[]

    // pm_records is keyed by pm_schedule_id, so map through the schedules.
    const scheduleToMachine: Record<string, string> = {}
    for (const s of schedules) scheduleToMachine[s.id] = s.machine_id

    // Last maintenance date per machine, from both history sources.
    const lastByMachine: Record<string, string> = {}
    const recordLatest = (machineId: string, date: string) => {
      const existing = lastByMachine[machineId]
      if (!existing || date > existing) lastByMachine[machineId] = date
    }
    for (const log of logs) recordLatest(log.machine_id, log.performed_at)
    for (const rec of pmRecords) {
      const machineId = scheduleToMachine[rec.pm_schedule_id]
      if (machineId && rec.completed_at) recordLatest(machineId, rec.completed_at)
    }

    const now = Date.now()
    return schedules
      .filter(s => s.machines)
      .map(s => ({
        machine_id: s.machine_id,
        machine_name: s.machines!.machine_name,
        machine_code: s.machines!.machine_code,
        pm_type: s.pm_type,
        days_overdue: Math.floor((now - nextDueFromLast(lastByMachine[s.machine_id] ?? null, s.pm_type, s.interval_days).getTime()) / 86400000),
      }))
      .filter(m => m.days_overdue > 0)
      .sort((a, b) => b.days_overdue - a.days_overdue)
  } catch {
    return []
  }
}
