// "Next step" guidance for the incident workflow.
//
// For every IncidentStatus the app shows a short hint of what should happen
// next (site-wide: detail page banner + board cards). The hint text lives in
// the i18n dictionaries under the `nextStep.<status>` key so it follows the
// active language; this module only owns the small bits of logic around it.
import type { IncidentStatus } from '@/types'

// Statuses that need no further action — the case is finished.
export const TERMINAL_STATUSES: IncidentStatus[] = ['closed']

export function isTerminalStatus(status: IncidentStatus): boolean {
  return TERMINAL_STATUSES.includes(status)
}

// i18n key holding the guidance text for a status (e.g. 'nextStep.reported').
export function nextStepKey(status: IncidentStatus): string {
  return `nextStep.${status}`
}
