import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import { wibTodayStr } from '@/lib/pm'
import { OPEN_STATUSES } from '@/lib/incident-display'
import QCDailyCheck, { type QCArea, type QCMachine } from '@/components/qc/QCDailyCheck'

export const metadata = { title: 'QC Check | FAMMS' }

// Daily QC sweep: every machine in the factory, grouped by the area it sits
// in, ticked once a day. See lib/qc-check.ts for what a "not OK" tick does.
export default async function QCPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const supabase = await createClient()
  const today = wibTodayStr()

  // Areas and machines are both RLS-scoped to what this account may see, so
  // there is no factory filter written here — a cross-factory account gets
  // every factory's areas, a normal account gets its own.
  const [areasRes, machinesRes, checksRes, openRes] = await Promise.all([
    supabase.from('areas').select('id, name, code, factory_id').order('name'),
    supabase
      .from('machines')
      .select('id, machine_name, machine_code, status, area_id, factory_id')
      // Scrapped machines are gone from the floor — nothing to walk up to and
      // check. Standby ones stay: idle today is still a machine to eyeball.
      .neq('status', 'scrapped')
      .order('machine_code', { nullsFirst: false })
      .order('machine_name'),
    supabase
      .from('qc_daily_checks')
      .select('machine_id, result, note, machine_stopped, incident_id, checked_by_name')
      .eq('check_date', today),
    // Machines that already have an open case — shown so QC doesn't file a
    // second report for a fault maintenance is already on. Covers cases from
    // every channel, including the ones FQMS opened.
    supabase
      .from('incidents')
      .select('machine_id, incident_no')
      .in('status', OPEN_STATUSES)
      .not('machine_id', 'is', null)
      .limit(1000),
  ])

  const checksByMachine = new Map(
    (checksRes.data ?? []).map(c => [c.machine_id as string, c])
  )
  const openByMachine = new Map<string, string>()
  for (const r of openRes.data ?? []) {
    const mid = r.machine_id as string
    if (!openByMachine.has(mid)) openByMachine.set(mid, r.incident_no as string)
  }

  const machines: QCMachine[] = (machinesRes.data ?? []).map(m => {
    const check = checksByMachine.get(m.id)
    return {
      id: m.id,
      areaId: m.area_id,
      name: m.machine_name,
      code: m.machine_code,
      status: m.status,
      result: (check?.result as 'ok' | 'issue' | undefined) ?? null,
      note: check?.note ?? null,
      checkedBy: check?.checked_by_name ?? null,
      openIncidentNo: openByMachine.get(m.id) ?? null,
    }
  })

  // Only areas that actually hold a machine — an empty area is noise on a
  // walk-round checklist. Machine CRUD is where empty areas get dealt with.
  const areas: QCArea[] = (areasRes.data ?? [])
    .map(a => ({ id: a.id, name: a.name, code: a.code }))
    .filter(a => machines.some(m => m.areaId === a.id))

  // Machines whose area was deleted or is otherwise unreadable still have to
  // be checkable, so they get their own bucket rather than silently vanishing.
  const orphans = machines.filter(m => !areas.some(a => a.id === m.areaId))

  return (
    <QCDailyCheck
      areas={areas}
      machines={machines}
      orphanCount={orphans.length}
      today={today}
      userName={user.full_name}
    />
  )
}
