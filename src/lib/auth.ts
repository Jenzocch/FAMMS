import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { UserRole } from '@/types'
import { baseCapabilityDefaults, type CustomRole, type EffectiveCapabilities, CAPABILITY_KEYS } from '@/lib/roles'
export { PERMISSIONS } from '@/lib/permissions'

export type CurrentUser = {
  id: string
  factory_id: string | null
  full_name: string | null
  role: UserRole
  custom_role_key: string | null
  customRole: CustomRole | null
  // Soft, non-DB-enforced visibility — a custom role's overlay on top of its
  // base role's PERMISSIONS defaults. Everything DB-enforced (accept/close/
  // RCA/manage-*) still goes through PERMISSIONS(user.role) as before; this
  // is ONLY for the couple of capabilities lib/roles.ts allows overriding.
  capabilities: EffectiveCapabilities
  is_active: boolean
}

// Server-only: looks up a custom role's base tier + capability overrides.
// Cached per (role, key) within a request — getCurrentUser and the dashboard
// layout would otherwise each trigger this independently.
const resolveRoleOverlay = cache(async function resolveRoleOverlay(
  role: UserRole,
  customRoleKey: string | null
): Promise<{ capabilities: EffectiveCapabilities; customRole: CustomRole | null }> {
  if (!customRoleKey) return { capabilities: baseCapabilityDefaults(role), customRole: null }

  const supabase = await createClient()
  const [{ data: cr }, { data: caps }] = await Promise.all([
    supabase.from('custom_roles').select('*').eq('key', customRoleKey).maybeSingle(),
    supabase.from('role_capabilities').select('capability, allowed').eq('role_key', customRoleKey),
  ])
  if (!cr) return { capabilities: baseCapabilityDefaults(role), customRole: null }

  const capabilities = baseCapabilityDefaults(cr.base_role as UserRole)
  for (const row of caps ?? []) {
    if ((CAPABILITY_KEYS as readonly string[]).includes(row.capability)) {
      (capabilities as Record<string, boolean>)[row.capability] = row.allowed
    }
  }
  return { capabilities, customRole: cr as CustomRole }
})

// Cheap per-request identity check. getClaims() verifies the session JWT
// locally (cached JWKS) on projects with asymmetric signing keys — no auth
// round-trip per navigation, which is what made page switching stutter. On
// legacy symmetric-key projects it falls back to a server check, so it is
// never less safe than getUser(). Returns the JWT claims (sub = user id) or
// null when not logged in.
export const getAuthClaims = cache(async function getAuthClaims() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  return data?.claims ?? null
})

// Returns the logged-in user's profile, or null when unauthenticated.
// Wrapped in React cache() so repeated calls within a single server render
// (page + nested guards/components) reuse one auth + profile lookup.
// Authenticity backstop: even if a forged cookie got past the local check,
// the profiles query runs under that JWT against PostgREST, which verifies
// the signature server-side — a bad token returns no profile → null.
export const getCurrentUser = cache(async function getCurrentUser(): Promise<CurrentUser | null> {
  const claims = await getAuthClaims()
  if (!claims?.sub) return null

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('factory_id, full_name, role, custom_role_key, is_active')
    .eq('id', claims.sub)
    .single()

  if (!profile) return null

  const role = (profile.role ?? 'technician') as UserRole
  const { capabilities, customRole } = await resolveRoleOverlay(role, profile.custom_role_key ?? null)

  return {
    id: claims.sub,
    factory_id: profile.factory_id ?? null,
    full_name: profile.full_name ?? null,
    role,
    custom_role_key: profile.custom_role_key ?? null,
    customRole,
    capabilities,
    is_active: profile.is_active ?? true,
  }
})

// Guard for admin-only API routes. Returns the admin user or an error reason.
export async function requireAdmin(): Promise<
  | { ok: true; user: CurrentUser }
  | { ok: false; status: 401 | 403 }
> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, status: 401 }
  // Deactivated accounts must not pass admin checks even with a valid session —
  // the layout blocks them in the browser, but API routes don't go through it.
  if (!user.is_active) return { ok: false, status: 403 }
  if (user.role !== 'admin') return { ok: false, status: 403 }
  return { ok: true, user }
}

