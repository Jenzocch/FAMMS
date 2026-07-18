// FAMMS repeat-failure detection helpers.
//
// The fault-tree code (failure_code_id) is never populated by any report
// path in the app (see git history / CLAUDE.md), so the original
// "same failure_code within 30 days" rule can never fire. This redefines
// repeat-failure detection to key off the coarse incident_type category
// that every report already carries, matched on the same machine.
//
// Rule: a new incident is a CANDIDATE repeat of a previous incident when —
//   - same machine_id (both non-null — a facility/electrical/etc. incident
//     with no machine attached has nothing to compare across incidents)
//   - same incident_type
//   - the previous incident was reported within the last 30 days
//   - the previous incident is closed, AND its close was either a
//     temporary_fix OR left no root_cause on record (root cause unresolved)
//
// This is only a CANDIDATE — the caller must still get a supervisor's
// explicit yes/no before writing an incident_relations row. See
// src/app/api/incidents/[id]/relations/route.ts for the confirm step.

import type { SupabaseClient } from '@supabase/supabase-js'

const REPEAT_FAILURE_WINDOW_DAYS = 30

export interface PotentialRepeat {
  id: string
  incident_no: string
  title: string
}

// Looks for the most recent matching prior incident on the same machine.
// Best-effort by design: callers (report creation paths) must treat a
// thrown/failed lookup as "no match" and never let it block the report
// itself — this function itself does not swallow errors so callers stay in
// control of that policy, but every call site here wraps it accordingly.
export async function checkPotentialRepeatFailure(
  supabase: SupabaseClient,
  args: { machineId: string | null; incidentType: string; excludeIncidentId?: string }
): Promise<PotentialRepeat | null> {
  if (!args.machineId) return null // no machine to compare across incidents

  const windowStart = new Date(Date.now() - REPEAT_FAILURE_WINDOW_DAYS * 86400000).toISOString()

  let query = supabase
    .from('incidents')
    .select('id, incident_no, title, description, incident_type, root_cause, completion_type')
    .eq('machine_id', args.machineId)
    .eq('incident_type', args.incidentType)
    .eq('status', 'closed')
    .gte('reported_at', windowStart)
    .order('reported_at', { ascending: false })
    .limit(5)
  if (args.excludeIncidentId) query = query.neq('id', args.excludeIncidentId)

  const { data: candidates } = await query
  if (!candidates || candidates.length === 0) return null

  const match = candidates.find(c =>
    c.completion_type === 'temporary_fix' || !c.root_cause || !c.root_cause.trim()
  )
  if (!match) return null

  return {
    id: match.id,
    incident_no: match.incident_no,
    title: match.title || match.description || match.incident_type,
  }
}
