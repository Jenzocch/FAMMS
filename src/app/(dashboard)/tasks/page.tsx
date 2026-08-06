import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser, PERMISSIONS } from '@/lib/auth'
import TasksView, { type TaskRow, type Assignee } from '@/components/tasks/TasksView'
import type { Task } from '@/types'

export const metadata = { title: 'Tugas | FAMMS' }

// Tasks board — meeting action items + personal to-dos. RLS already limits
// what a plain worker sees (own created/assigned only); supervisors+ get the
// whole factory. So there's no explicit filter written here.
export default async function TasksPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  // Names are resolved from a separate profiles read and mapped in JS rather
  // than a PostgREST embed: tasks has TWO foreign keys to profiles
  // (assigned_to_id, created_by_id), and an ambiguous embed fails the whole
  // query (PGRST201) instead of degrading.
  const [tasksRes, profilesRes] = await Promise.all([
    supabase
      .from('tasks')
      .select('*')
      .order('status', { ascending: true })
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(500),
    supabase
      .from('profiles')
      .select('id, full_name, role, factory_id, is_active')
      .eq('is_active', true)
      .order('full_name'),
  ])

  const profiles = profilesRes.data ?? []
  const nameById = new Map(profiles.map(p => [p.id, p.full_name || null]))

  const tasks: TaskRow[] = ((tasksRes.data ?? []) as Task[]).map(t => ({
    ...t,
    assignee_name: t.assigned_to_id ? (nameById.get(t.assigned_to_id) ?? null) : null,
    creator_name: t.created_by_id ? (nameById.get(t.created_by_id) ?? null) : null,
  }))

  // Who a task can be assigned to: active accounts in the viewer's factory
  // (cross-factory viewers see everyone). Sorted, name first.
  const assignees: Assignee[] = profiles
    .filter(p => !user.factory_id || !p.factory_id || p.factory_id === user.factory_id)
    .map(p => ({ id: p.id, name: p.full_name || null }))

  return (
    <TasksView
      tasks={tasks}
      assignees={assignees}
      currentUserId={user.id}
      currentUserName={user.full_name}
      canVerify={PERMISSIONS.verifyTask(user.role)}
    />
  )
}
