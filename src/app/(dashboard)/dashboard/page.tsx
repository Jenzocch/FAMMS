import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser, PERMISSIONS } from '@/lib/auth'
import { addDays, addWeeks, addMonths } from 'date-fns'
import { IncidentStatus } from '@/types'
import DashboardView, { DashboardRow } from '@/components/dashboard/DashboardView'

export const metadata = { title: '主管追蹤 | 維修系統' }

const UNSPECIFIED = '__unspecified__'

const OPEN_STATUSES: IncidentStatus[] = [
  'reported', 'accepted', 'analyzing', 'waiting_parts', 'waiting_approval',
  'waiting_vendor', 'waiting_shutdown', 'repairing', 'testing', 'observation',
]

export default async function DashboardPage() {
  const user = await getCurrentUser()
  if (!user || !PERMISSIONS.dashboard(user.role)) {
    redirect('/incidents')
  }

  const supabase = await createClient()

  const { data } = await supabase
    .from('incidents')
    .select('id, incident_no, status, downtime_impact, incident_type, title, reported_at, updated_at, factory:factories(name)')
    .order('reported_at', { ascending: false })
    .limit(500)

  const rows = (data ?? []) as unknown as DashboardRow[]
  const open = rows.filter(r => OPEN_STATUSES.includes(r.status))

  // Get overdue machines
  const { data: schedules } = await supabase
    .from('pm_schedules')
    .select('machine_id, pm_type, machines(machine_name, machine_code)')
    .eq('is_active', true)

  const { data: logs } = await supabase
    .from('maintenance_logs')
    .select('machine_id, performed_at')
    .order('performed_at', { ascending: false })

  const lastByMachine: Record<string, string> = {}
  if (logs) {
    for (const log of logs) {
      if (!lastByMachine[log.machine_id]) {
        lastByMachine[log.machine_id] = log.performed_at
      }
    }
  }

  function getNextDueDate(lastMaintained: string | null, pmType: string): Date {
    const base = lastMaintained ? new Date(lastMaintained) : new Date()
    switch (pmType) {
      case 'daily': return addDays(base, 1)
      case 'weekly': return addWeeks(base, 1)
      case 'monthly': return addMonths(base, 1)
      case 'quarterly': return addMonths(base, 3)
      case 'half_yearly': return addMonths(base, 6)
      case 'yearly': return addMonths(base, 12)
      default: return addMonths(base, 1)
    }
  }

  const overdue = (schedules ?? [])
    .filter(s => (s as any).machines)
    .map(s => {
      const lastMaintained = lastByMachine[s.machine_id]
      const dueDate = getNextDueDate(lastMaintained, s.pm_type)
      const daysOverdue = Math.floor((Date.now() - dueDate.getTime()) / 86400000)
      return {
        machine_id: s.machine_id,
        machine_name: (s as any).machines.machine_name,
        machine_code: (s as any).machines.machine_code,
        pm_type: s.pm_type,
        days_overdue: daysOverdue,
      }
    })
    .filter(m => m.days_overdue > 0)
    .sort((a, b) => b.days_overdue - a.days_overdue)
    .slice(0, 10)

  // Open count per factory
  const byFactory = new Map<string, number>()
  for (const r of open) {
    const name = r.factory?.name || UNSPECIFIED
    byFactory.set(name, (byFactory.get(name) ?? 0) + 1)
  }

  // Urgent open cases (impact A or B)
  const urgent = open.filter(r => r.downtime_impact === 'A' || r.downtime_impact === 'B')

  // Stale: open + not updated in 3+ days
  const now = Date.now()
  const stale = open.filter(r => now - new Date(r.updated_at).getTime() > 3 * 86400000)

  const byFactoryEntries: [string, number][] = [...byFactory.entries()]

  return (
    <DashboardView
      openCount={open.length}
      urgentCount={urgent.length}
      staleCount={stale.length}
      byFactory={byFactoryEntries}
      urgent={urgent}
      stale={stale}
      overdue={overdue.map(m => ({
        machine_id: m.machine_id,
        machine_name: m.machine_name,
        machine_code: m.machine_code,
        pm_type: m.pm_type,
        days_overdue: m.days_overdue,
      }))}
    />
  )
}
