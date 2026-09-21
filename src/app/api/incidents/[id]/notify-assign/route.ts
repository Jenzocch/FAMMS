import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { requireActiveUser } from '@/lib/auth'
import { notifyAssignees, formatAssignment, incidentActionButtons } from '@/lib/telegram'
import type { DowntimeImpact } from '@/types'

// POST /api/incidents/[id]/notify-assign — personal Telegram ping for newly
// assigned users. Called by AssignForm after a successful save with only the
// ADDED user ids, so re-saving an assignment doesn't re-notify everyone.
// Best-effort by design: a Telegram problem must never fail the assignment.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireActiveUser()
  if (!guard.ok) return NextResponse.json({ error: 'unauthorized' }, { status: guard.status })

  const { id } = await params
  const body = await req.json().catch(() => null)
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  const rawAddedUserIds: unknown[] = Array.isArray(body?.addedUserIds) ? body.addedUserIds : []
  const addedUserIds: string[] = [
    ...new Set(rawAddedUserIds.filter((value): value is string => typeof value === 'string' && uuid.test(value))),
  ].slice(0, 50)
  if (addedUserIds.length === 0) {
    return NextResponse.json({ ok: true, sent: 0 })
  }

  const supabase = await createClient()
  const { data: incident } = await supabase
    .from('incidents')
    .select(`
      id, incident_no, title, incident_type, downtime_impact, due_date, assigned_user_ids,
      machine:machines(machine_code, machine_name),
      factory:factories(name)
    `)
    .eq('id', id)
    .single()

  if (!incident) {
    return NextResponse.json({ error: 'incident not found' }, { status: 404 })
  }

  // The browser may only suggest recipients. The incident row is authoritative:
  // never let this endpoint become a general Telegram DM relay.
  const assignedIds = Array.isArray(incident.assigned_user_ids)
    ? (incident.assigned_user_ids as unknown[]).filter((value): value is string => typeof value === 'string')
    : []
  const requestedAssignedIds = addedUserIds.filter(id => assignedIds.includes(id))
  if (requestedAssignedIds.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, failed: 0, unregistered: 0 })
  }

  // Disabled accounts must never receive a new work-assignment notification.
  // If RLS cannot reveal a profile, omit it rather than disclose incident data.
  const { data: activeProfiles } = await supabase
    .from('profiles')
    .select('id')
    .in('id', requestedAssignedIds)
    .eq('is_active', true)
  const recipientIds = (activeProfiles ?? []).map(profile => profile.id)
  if (recipientIds.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, failed: 0, unregistered: 0 })
  }

  const machine = incident.machine as unknown as { machine_code: string | null; machine_name: string } | null
  const factory = incident.factory as unknown as { name: string } | null
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  const html = formatAssignment({
    incidentNo: incident.incident_no,
    title: incident.title || incident.incident_type,
    locationLabel: `${factory?.name || '?'}${machine ? ` · ${machine.machine_name}` : ''}`,
    impact: (incident.downtime_impact || 'D') as DowntimeImpact,
    dueDate: incident.due_date,
    appUrl,
    incidentId: incident.id,
  })

  try {
    const result = await notifyAssignees(supabase, {
      profileIds: recipientIds,
      type: 'assignment',
      html,
      // Status buttons: the assignee can report 開工/完成 straight from
      // Telegram without opening the app (handled by the bot webhook).
      replyMarkup: incidentActionButtons(incident.id),
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : 'notify failed' })
  }
}
