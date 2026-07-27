import type { IncidentStatus } from '@/types'

// Which status moves are legal. Separate from incident-display.ts, which is
// about how a status LOOKS (label, colour, board tab); this is about what a
// case is allowed to do next.
//
// Shared deliberately: the progress-update form and the Telegram status
// buttons each used to carry their own copy of MAIN_ORDER / WAITING_STATES,
// which is exactly the kind of pair that drifts — one channel would start
// permitting a move the other rejects, on the same case.

// Linear forward order of the main workflow. A case may only move to its
// current status or one further along this line — never backwards.
export const MAIN_ORDER: IncidentStatus[] = [
  'reported', 'accepted', 'analyzing', 'repairing', 'testing', 'observation', 'closed',
]

// "Waiting" side-states are temporary blocks reachable any time before close.
export const WAITING_STATES: IncidentStatus[] = [
  'waiting_parts', 'waiting_approval', 'waiting_vendor', 'waiting_shutdown',
]

// Statuses a maintenance person can move an incident TO (simplified set).
// All four waiting-states must be here so a blocked case can be unblocked.
export const SELECTABLE: IncidentStatus[] = [
  'accepted', 'analyzing',
  'waiting_parts', 'waiting_approval', 'waiting_vendor', 'waiting_shutdown',
  'repairing', 'testing', 'observation', 'closed',
]

// Where a case picks the main line back up. A waiting side-state isn't ON the
// main line, so it resumes at 處理中 (analyzing) — otherwise a case parked in
// e.g. waiting_parts could never move forward at all.
export function resumePoint(status: IncidentStatus): IncidentStatus {
  return WAITING_STATES.includes(status) ? 'analyzing' : status
}

// Is `target` at or ahead of `current` on the main line? Waiting states are
// never "ahead" of anything — they're reachable separately (see
// allowedStatuses), so this answers only the main-line question.
export function isForwardMove(current: IncidentStatus, target: IncidentStatus): boolean {
  const from = MAIN_ORDER.indexOf(resumePoint(current))
  const to = MAIN_ORDER.indexOf(target)
  return from >= 0 && to >= 0 && to >= from
}

// Which statuses a form may offer, given where the case is now. Forward-only
// on the main line; waiting states stay open until the case is closed; always
// intersected with SELECTABLE.
export function allowedStatuses(
  currentStatus: IncidentStatus,
  allowRollback: boolean = false,
): IncidentStatus[] {
  // Rollback allowed (supervisor+): every selectable status except 'reported'.
  if (allowRollback) return SELECTABLE.filter(s => s !== 'reported')

  return SELECTABLE.filter(s => {
    if (WAITING_STATES.includes(s)) return currentStatus !== 'closed'
    return isForwardMove(currentStatus, s)
  })
}
