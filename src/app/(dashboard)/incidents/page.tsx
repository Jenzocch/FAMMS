import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import IncidentBoard, { BoardRow } from '@/components/incidents/IncidentBoard'
import IncidentsBoardWithSearch from '@/components/incidents/IncidentsBoardWithSearch'

export const metadata = { title: 'Board | FAMMS' }

export default async function IncidentsPage({
  searchParams,
}: {
  searchParams: Promise<{ factory?: string; filter?: string }>
}) {
  const { factory, filter } = await searchParams
  const user = await getCurrentUser()
  const supabase = await createClient()

  const SELECT = `
    id, incident_no, status, downtime_impact, incident_type,
    title, reporter_name, reported_at, assigned_to, due_date, observation_end_date, photo_count,
    machine:machines(machine_code, machine_name),
    factory:factories(id, name)
  `

  // user.capabilities.boardFull already IS PERMISSIONS.boardFull(user.role)
  // unless a custom role overrides it (see resolveRoleOverlay in lib/auth.ts).
  const isFullBoard = !user || user.capabilities.boardFull

  let rows: BoardRow[]

  if (isFullBoard) {
    // Supervisors/managers see the whole board, scoped to their factory.
    // Admins/cross-factory accounts see every factory's cases — `factory`
    // from the URL (the dashboard's per-factory links) is no longer applied
    // as a server-side restriction here; it's only used below to pre-select
    // the board's client-side factory tab, so switching factories on the
    // board itself doesn't need a full page refetch.
    let query = supabase
      .from('incidents')
      .select(SELECT)
      .order('reported_at', { ascending: false })
      .limit(200)
    if (user?.factory_id && user.role !== 'admin') query = query.eq('factory_id', user.factory_id)

    // Cross-factory assignments must stay visible: a supervisor assigned to a
    // case in another factory still needs it on their board. Fetched as a
    // separate .contains() query — array-contains inside .or() is unreliable
    // in supabase-js (silently drops multi-assignee rows).
    const needsAssignedExtra = !!user && !!user.factory_id && user.role !== 'admin'
    const [scopedRes, assignedRes] = await Promise.all([
      query,
      needsAssignedExtra
        ? supabase.from('incidents').select(SELECT)
            .contains('assigned_user_ids', [user!.id])
            .order('reported_at', { ascending: false }).limit(200)
        : Promise.resolve({ data: null }),
    ])
    const byId = new Map<string, BoardRow>()
    for (const r of [...(scopedRes.data ?? []), ...(assignedRes.data ?? [])]) {
      byId.set((r as { id: string }).id, r as unknown as BoardRow)
    }
    rows = [...byId.values()].sort(
      (a, b) => new Date(b.reported_at).getTime() - new Date(a.reported_at).getTime()
    )
  } else {
    // Technicians (no full-board access) see cases assigned to them OR reported
    // by them — across ALL factories, since they can be assigned cross-factory.
    //
    // Two reliable queries merged + deduped, NOT a single
    // .or('assigned_user_ids.cs.{me},...'): the array-contains operator inside
    // .or() is unreliable in supabase-js and silently dropped multi-assignee
    // cases from the board (they were still counted by the nav badge, which uses
    // .contains() — exactly the "assigned to two people → case won't show" bug).
    // .contains() here matches the badge's filter, so board and badge agree.
    const [assignedRes, reportedRes] = await Promise.all([
      supabase.from('incidents').select(SELECT)
        .contains('assigned_user_ids', [user!.id])
        .order('reported_at', { ascending: false }).limit(200),
      supabase.from('incidents').select(SELECT)
        .eq('reported_by_id', user!.id)
        .order('reported_at', { ascending: false }).limit(200),
    ])
    const byId = new Map<string, BoardRow>()
    for (const r of [...(assignedRes.data ?? []), ...(reportedRes.data ?? [])]) {
      byId.set((r as { id: string }).id, r as unknown as BoardRow)
    }
    rows = [...byId.values()].sort(
      (a, b) => new Date(b.reported_at).getTime() - new Date(a.reported_at).getTime()
    )
  }

  return <IncidentsBoardWithSearch rows={rows} userRole={user?.role} initialFilter={filter} initialFactory={factory} />
}
