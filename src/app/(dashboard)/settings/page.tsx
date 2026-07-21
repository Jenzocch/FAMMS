import { redirect } from 'next/navigation'
import { getCurrentUser, PERMISSIONS } from '@/lib/auth'
import { isTelegramConfigured } from '@/lib/telegram'
import { SettingsHeading } from '@/components/settings/SettingsSectionHeader'
import SettingsShell, { type SectionKey } from '@/components/settings/SettingsShell'

export const metadata = { title: 'Settings | FAMMS' }

export default async function SettingsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  // Technicians / supervisors / directors have no settings to manage — keep
  // them out of the page entirely (defence in depth alongside nav gating).
  // Exception: an Account Admin custom role (base tier technician/supervisor,
  // granted the manageUsers capability override — see migration_custom_roles.
  // sql / lib/roles.ts) needs the page open ONLY to reach the user-management
  // section; every other section stays gated by its own PERMISSIONS.* check
  // against the base tier, which an Account Admin does not satisfy.
  if (!PERMISSIONS.viewSettings(user.role) && !user.capabilities.manageUsers) redirect('/dashboard')

  // Which sections this viewer may see, in display order. Same gates as the
  // old stacked layout — only the presentation changed (master-detail, one
  // section mounted at a time). Notes preserved from that layout:
  // - users: true system admin OR an Account Admin custom role (manageUsers
  //   capability). An Account Admin can never assign/see the admin option —
  //   see UserManager's canAssignAdmin prop + the server-side privilege-
  //   escalation checks in the api/admin/users routes.
  // - roles: true system admin only — custom_roles/role_capabilities writes
  //   are RLS-gated to app_is_admin() (migration_custom_roles.sql), and
  //   defining what a role CAN grant is a more sensitive job than assigning
  //   an existing role, which is all an Account Admin does.
  const isSystemAdmin = user.role === 'admin'
  const allowed = ([
    (PERMISSIONS.manageUsers(user.role) || user.capabilities.manageUsers) && 'users',
    isSystemAdmin && 'roles',
    PERMISSIONS.manageMachines(user.role) && 'assets',
    PERMISSIONS.manageFactories(user.role) && 'factories',
    PERMISSIONS.manageIncidentTypes(user.role) && 'incidentTypes',
    PERMISSIONS.manageVendors(user.role) && 'vendors',
    PERMISSIONS.managePMSchedules(user.role) && 'pm',
    PERMISSIONS.manageTelegram(user.role) && 'telegram',
  ] as const).filter((k): k is SectionKey => !!k)

  return (
    <div className="space-y-5">
      <SettingsHeading />
      <SettingsShell
        allowed={[...allowed]}
        currentUserId={user.id}
        canAssignAdmin={isSystemAdmin}
        telegramFactoryId={user.factory_id ?? null}
        telegramConfigured={isTelegramConfigured()}
      />
    </div>
  )
}
