import { redirect } from 'next/navigation'
import { getCurrentUser, PERMISSIONS } from '@/lib/auth'
import TelegramSettings from '@/components/settings/TelegramSettings'
import FactoryManager from '@/components/settings/FactoryManager'
import AssetManager from '@/components/settings/AssetManager'
import IncidentTypeManager from '@/components/settings/IncidentTypeManager'
import VendorManager from '@/components/settings/VendorManager'
import PMScheduleManager from '@/components/pm/PMScheduleManager'
import UserManager from '@/components/settings/UserManager'
import RoleManager from '@/components/settings/RoleManager'
import { isTelegramConfigured } from '@/lib/telegram'
import {
  SettingsHeading,
  SettingsSectionHeader,
} from '@/components/settings/SettingsSectionHeader'

export const metadata = { title: 'Settings | FAMMS' }

export default async function SettingsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  // Technicians / supervisors / directors have no settings to manage — keep
  // them out of the page entirely (defence in depth alongside nav gating).
  // Exception: an Account Admin custom role (base tier technician/supervisor,
  // granted the manageUsers capability override — see migration_custom_roles.
  // sql / lib/roles.ts) needs the page open ONLY to reach the user-management
  // section below; every other section stays gated by its own PERMISSIONS.*
  // check against the base tier, which an Account Admin does not satisfy.
  if (!PERMISSIONS.viewSettings(user.role) && !user.capabilities.manageUsers) redirect('/dashboard')

  // User accounts (Settings → 使用者管理): true system admin OR an Account
  // Admin custom role (manageUsers capability). Kept separate from the Role
  // Management gate below — role_capabilities/custom_roles writes go through
  // the browser Supabase client and are RLS-restricted to app_is_admin()
  // (migration_custom_roles.sql), so exposing that section to a non-admin
  // base tier would just show a section whose saves always fail RLS.
  const canManageUserAccounts = PERMISSIONS.manageUsers(user.role) || user.capabilities.manageUsers
  // Role definitions (Settings → 角色管理): true system admin only — creating/
  // editing custom_roles or role_capabilities is a DB write gated by
  // app_is_admin() at the RLS layer (see above), and defining what a role
  // CAN grant is a different, more sensitive job than assigning an existing
  // role to a user, which is all an Account Admin is meant to do.
  const isSystemAdmin = user.role === 'admin'
  const canManageMachines = PERMISSIONS.manageMachines(user.role)
  const canManageFactories = PERMISSIONS.manageFactories(user.role)
  const canManageIncidentTypes = PERMISSIONS.manageIncidentTypes(user.role)
  const canManageVendors = PERMISSIONS.manageVendors(user.role)
  const canManagePMSchedules = PERMISSIONS.managePMSchedules(user.role)
  const canManageTelegram = PERMISSIONS.manageTelegram(user.role)

  return (
    <div className="space-y-5">
      <SettingsHeading />

      {/* User Management — system admin, or an Account Admin custom role
          (manageUsers capability). An Account Admin can never assign/see the
          admin option here — see UserManager's canAssignAdmin prop and the
          server-side privilege-escalation checks in the API routes. */}
      {canManageUserAccounts && (
        <section className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <SettingsSectionHeader titleKey="settings.userSectionTitle" descKey="settings.userSectionDesc" />
          <UserManager currentUserId={user.id} canAssignAdmin={isSystemAdmin} />
        </section>
      )}

      {/* Role Management — system admin only (see canManageUserAccounts vs.
          isSystemAdmin comment above). Lets new job functions (QC, warehouse,
          etc.) get created without a code change; see migration_custom_roles.sql. */}
      {isSystemAdmin && (
        <section className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <SettingsSectionHeader titleKey="settings.roleSectionTitle" descKey="settings.roleSectionDesc" />
          <RoleManager />
        </section>
      )}

      {/* Asset Management — manager + admin */}
      {canManageMachines && (
        <section className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <SettingsSectionHeader titleKey="settings.assetSectionTitle" descKey="settings.assetSectionDesc" />
          <AssetManager />
        </section>
      )}

      {/* Factory & Area Management — manager + admin. One hierarchical
          section: expand a factory to manage its areas right underneath,
          instead of two disconnected sections with a factory dropdown. */}
      {canManageFactories && (
        <section className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <SettingsSectionHeader titleKey="settings.factorySectionTitle" descKey="settings.factorySectionDesc" />
          <FactoryManager />
        </section>
      )}

      {/* Incident Type Management — manager + admin */}
      {canManageIncidentTypes && (
        <section className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <SettingsSectionHeader titleKey="settings.incidentTypeSectionTitle" descKey="settings.incidentTypeSectionDesc" />
          <IncidentTypeManager />
        </section>
      )}

      {/* Vendor Roster — manager + admin */}
      {canManageVendors && (
        <section className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <SettingsSectionHeader titleKey="settings.vendorSectionTitle" descKey="settings.vendorSectionDesc" />
          <VendorManager />
        </section>
      )}

      {/* PM Schedule Management — admin only */}
      {canManagePMSchedules && (
        <section className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <SettingsSectionHeader titleKey="settings.pmSectionTitle" descKey="settings.pmSectionDesc" />
          <PMScheduleManager />
        </section>
      )}

      {/* Telegram Notifications — manager + admin. A cross-factory admin
          (no factory_id) manages the shared, all-factory groups; a
          factory-scoped user manages their factory's own. */}
      {canManageTelegram && (
        <section className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <SettingsSectionHeader titleKey="settings.telegramSectionTitle" descKey="settings.telegramSectionDesc" />
          <TelegramSettings factoryId={user.factory_id ?? null} configured={isTelegramConfigured()} />
        </section>
      )}
    </div>
  )
}
