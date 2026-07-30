import type { SupabaseClient } from '@supabase/supabase-js'

// Reading and writing pm_schedules from the browser.
//
// Split out of PMScheduleManager because of the awkward part: `assigned_to`
// and `assigned_user_ids` only exist once migration_pm_assignee.sql has been
// run. Every read and write therefore has a fallback path that drops those
// columns and retries, so a database that is behind on migrations still shows
// and saves schedules instead of failing outright. That belongs here, not
// interleaved with JSX.

export interface PMSchedule {
  id: string
  machine_id: string
  pm_type: string
  interval_days: number | null
  description: string | null
  checklist: string | null
  is_active: boolean
  assigned_user_ids: string[]
  assigned_to: string | null
  machine_name?: string
  machine_code?: string | null
}

// Raw pm_schedules row as selected below. `machines` is a single embedded
// object (each schedule has exactly one machine) — the untyped Supabase client
// just infers it as an array without a Database type. The assignee fields are
// optional for the reason above.
interface RawScheduleRow {
  id: string
  machine_id: string
  pm_type: string
  interval_days: number | null
  description: string | null
  checklist: string | null
  is_active: boolean
  assigned_user_ids?: string[]
  assigned_to?: string | null
  machines: { machine_name: string; machine_code: string | null } | null
}

const BASE_COLS = `
  id, machine_id, pm_type, interval_days, description, checklist, is_active,
  machines:machines(machine_name, machine_code)
`
const WITH_ASSIGNEE = `
  id, machine_id, pm_type, interval_days, description, checklist, is_active,
  assigned_user_ids, assigned_to,
  machines:machines(machine_name, machine_code)
`

export async function loadActiveSchedules(supabase: SupabaseClient): Promise<PMSchedule[]> {
  const query = (cols: string) => supabase
    .from('pm_schedules')
    .select(cols)
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  const res = await query(WITH_ASSIGNEE)
  // Only retry without the assignee columns on an actual missing-column error
  // (a DB that hasn't run migration_pm_assignee.sql yet) — same 42703/PGRST204
  // check used elsewhere (see submitIncidentReport.ts / close/route.ts). Any
  // OTHER error retried here would silently render every schedule's
  // assigned_user_ids as [], and startEdit() would then save that empty list
  // back, wiping real assignees on a fully-migrated DB.
  const missingColumn = res.error && (res.error.code === '42703' || res.error.code === 'PGRST204')
  const rows = (missingColumn ? (await query(BASE_COLS)).data : res.data) as unknown as RawScheduleRow[] | null

  return (rows ?? []).map(s => ({
    id: s.id,
    machine_id: s.machine_id,
    pm_type: s.pm_type,
    interval_days: s.interval_days ?? null,
    description: s.description,
    checklist: s.checklist ?? null,
    is_active: s.is_active,
    assigned_user_ids: s.assigned_user_ids ?? [],
    assigned_to: s.assigned_to ?? null,
    machine_name: s.machines?.machine_name || '',
    machine_code: s.machines?.machine_code || null,
  }))
}

export interface SchedulePayload {
  machineId: string
  pmType: string
  intervalDays: number | null
  description: string
  checklist: string[]
  firstDueDate: string
  assignedUserIds: string[]
  // Display summary of the assigned people's names, kept in sync with the ids.
  assignedTo: string | null
}

export async function updateSchedule(
  supabase: SupabaseClient,
  id: string,
  p: SchedulePayload,
): Promise<void> {
  const base = {
    pm_type: p.pmType,
    interval_days: p.intervalDays,
    description: p.description || null,
    checklist: p.checklist.length ? JSON.stringify(p.checklist) : null,
  }
  let { error } = await supabase
    .from('pm_schedules')
    .update({ ...base, assigned_user_ids: p.assignedUserIds, assigned_to: p.assignedTo })
    .eq('id', id)
  // Assignee columns missing — retry without them so the edit still saves.
  if (error) ({ error } = await supabase.from('pm_schedules').update(base).eq('id', id))
  if (error) throw error
}

// Creation goes through the API, not a direct insert, so the first pending
// pm_record is generated too — a schedule without records only ever shows
// projected calendar tasks. One code path for every creation source (the API
// derives factory_id from the machine, so the NOT NULL insert can't fail).
export async function createSchedule(p: SchedulePayload, fallbackError: string): Promise<void> {
  const res = await fetch('/api/pm/schedules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      machine_id: p.machineId,
      pm_type: p.pmType,
      interval_days: p.intervalDays,
      description: p.description || undefined,
      checklist: p.checklist,
      first_due_date: p.firstDueDate || undefined,
      assigned_user_ids: p.assignedUserIds,
      assigned_to: p.assignedTo,
    }),
  })
  if (!res.ok) {
    const j = await res.json().catch(() => null)
    throw new Error(j?.error || fallbackError)
  }
}

// Schedules are never hard-deleted — deactivated, so their pm_records history
// stays intact.
export async function deactivateSchedule(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from('pm_schedules').update({ is_active: false }).eq('id', id)
  if (error) throw error
}

// Checklist is stored as a JSON array string, edited as one item per line.
export function checklistToText(raw: string | null): string {
  if (!raw) return ''
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.join('\n') : ''
  } catch {
    return ''
  }
}

export function textToChecklist(text: string): string[] {
  return text.split('\n').map(l => l.trim()).filter(Boolean)
}
