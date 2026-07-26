import type { UserRole } from '@/types'
import { ROLE_ZH } from '@/lib/incident-display'

// Who can be put on a job — shared by the incident assign form and the PM
// schedule form. Both had their own copy of the rule below, comment and all;
// it encodes a policy decision, not layout, so the two must not drift.

export interface Account {
  id: string
  full_name: string | null
  role: UserRole
  factory_id: string | null
  custom_role_key: string | null
}

// A plain technician in this factory. Cross-factory accounts (no factory_id
// of their own) always qualify.
//
// Excludes accounts on a custom role (e.g. QC) even though they share the
// technician DB tier: a custom role signals a distinct job function, not
// literally "on the repair team", so a bulk-assign shouldn't sweep them in.
export function isFactoryTechnician(a: Account, factoryId?: string | null): boolean {
  return a.role === 'technician'
    && !a.custom_role_key
    && (!factoryId || !a.factory_id || a.factory_id === factoryId)
}

// Display name, falling back to the role when an account has no name on file.
export function accountName(a: Account): string {
  return a.full_name || `(${ROLE_ZH[a.role] ?? a.role})`
}
