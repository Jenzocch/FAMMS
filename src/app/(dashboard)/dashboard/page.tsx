import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import type { IncidentStatus } from '@/types'
import DashboardView, { DashboardRow } from '@/components/dashboard/DashboardView'
import { OPEN_STATUSES } from '@/lib/incident-display'
import { getOverduePM } from '@/lib/pm-overdue'

export const metadata = { title: 'Dashboard | FAMMS' }

const UNSPECIFIED = '__unspecified__'

export default async function DashboardPage() {
  const user = await getCurrentUser()
  // capabilities.dashboard already IS PERMISSIONS.dashboard(user.role) unless
  // a custom role overrides it (see resolveRoleOverlay in lib/auth.ts).
  if (!user || !user.capabilities.dashboard) {
    redirect('/incidents')
  }

  const supabase = await createClient()

  // Scope incidents to the user's factory (admins without factory see all).
  // Filter to open statuses IN SQL: the dashboard only counts open cases, and
  // fetching "newest 500 of everything" then filtering in memory silently
  // undercounted open/urgent/stale once total history passed 500 rows —
  // old-but-still-open cases fell off the end.
  let incidentQuery = supabase
    .from('incidents')
    .select('id, incident_no, status, downtime_impact, incident_type, title, reported_at, updated_at, factory_id, factory:factories(name)')
    .in('status', OPEN_STATUSES)
    .order('reported_at', { ascending: false })
    .limit(1000)
  if (user.factory_id && user.role !== 'admin') incidentQuery = incidentQuery.eq('factory_id', user.factory_id)

  // Deliberately NOT awaited — the overdue-PM read is the slow part of this
  // page (see lib/pm-overdue.ts). Kicked off first so it runs alongside the
  // incident read; the page paints as soon as the incidents come back and the
  // PM widget streams in behind it.
  // The count is the FULL total; only the list is trimmed. (It used to be
  // taken from the already-trimmed list, so the tile read "10" whether ten
  // machines were overdue or ninety.)
  const overduePromise = getOverduePM(user.factory_id, user.role === 'admin')
    .then(all => ({ count: all.length, top: all.slice(0, 10) }))

  const { data } = await incidentQuery
  const open = (data ?? []) as unknown as DashboardRow[]

  // Open count per factory (keep factory_id so the row can link to a filtered list)
  const byFactory = new Map<string, { count: number; factoryId: string | null }>()
  for (const r of open) {
    const name = r.factory?.name || UNSPECIFIED
    const prev = byFactory.get(name)
    byFactory.set(name, {
      count: (prev?.count ?? 0) + 1,
      factoryId: prev?.factoryId ?? r.factory_id ?? null,
    })
  }

  // Action inbox — the three queues a supervisor drains daily. Keys map to the
  // board's filter tabs so each card deep-links to the matching filtered list.
  const WAITING: IncidentStatus[] = ['waiting_parts', 'waiting_approval', 'waiting_vendor', 'waiting_shutdown']
  const inbox = {
    reported: open.filter(r => r.status === 'reported').length,
    waiting: open.filter(r => WAITING.includes(r.status)).length,
    confirm: open.filter(r => r.status === 'testing' || r.status === 'observation').length,
  }

  // "Urgent" = Critical (A). (The old 'B' tier was retired and its rows
  // normalized to 'A'.)
  const urgent = open.filter(r => r.downtime_impact === 'A')
  // Server Component (see note above) — same false-positive purity flag.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()
  const stale = open.filter(r => now - new Date(r.updated_at).getTime() > 3 * 86400000)
  const byFactoryEntries: [string, number, string | null][] =
    [...byFactory.entries()].map(([name, v]) => [name, v.count, v.factoryId])

  return (
    <DashboardView
      openCount={open.length}
      urgentCount={urgent.length}
      staleCount={stale.length}
      inbox={inbox}
      byFactory={byFactoryEntries}
      urgent={urgent}
      stale={stale}
      overdue={overduePromise}
      userRole={user.role}
    />
  )
}
