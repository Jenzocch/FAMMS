import type { SupabaseClient } from '@supabase/supabase-js'

export interface OpenWork {
  incidents: number
  tasks: number
  pmSchedules: number
  total: number
}

// Postgres/PostgREST codes for "this column/table does not exist on this
// database yet" — nothing can be assigned through it, so it counts as zero.
const MISSING_SCHEMA_CODES = new Set(['42703', '42P01', 'PGRST204', 'PGRST205'])

async function head(
  q: PromiseLike<{ count: number | null; error: { code?: string; message: string } | null }>,
): Promise<number> {
  const { count, error } = await q
  if (error) {
    if (error.code && MISSING_SCHEMA_CODES.has(error.code)) return 0
    // Unknown failure: refuse to guess "no open work" — the caller must not
    // go ahead with something irreversible on a number it couldn't read.
    throw new Error(error.message)
  }
  return count ?? 0
}

// Unfinished work currently carried by one account.
//
// Why this exists: incidents.assigned_user_ids and pm_schedules.assigned_user_ids
// are plain uuid[] columns with no foreign key, so deleting an account leaves its
// id behind in every open case — and a case whose only assignee was deleted is
// seen by nobody (data_integrity_check.sql ⑩). tasks.assigned_to_id is
// ON DELETE SET NULL, so those tasks silently lose their owner instead.
// Closed incidents / done tasks are history and are not counted.
export async function countOpenWork(admin: SupabaseClient, userId: string): Promise<OpenWork> {
  const [incidents, tasks, pmSchedules] = await Promise.all([
    head(admin.from('incidents').select('id', { count: 'exact', head: true })
      .neq('status', 'closed').contains('assigned_user_ids', [userId])),
    head(admin.from('tasks').select('id', { count: 'exact', head: true })
      .neq('status', 'done').eq('assigned_to_id', userId)),
    head(admin.from('pm_schedules').select('id', { count: 'exact', head: true })
      .eq('is_active', true).contains('assigned_user_ids', [userId])),
  ])
  return { incidents, tasks, pmSchedules, total: incidents + tasks + pmSchedules }
}
