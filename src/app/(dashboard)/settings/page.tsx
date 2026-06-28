import { redirect } from 'next/navigation'
import { getCurrentUser, PERMISSIONS } from '@/lib/auth'
import TelegramSettings from '@/components/settings/TelegramSettings'
import FactoryManager from '@/components/settings/FactoryManager'
import AreaManager from '@/components/settings/AreaManager'
import AssetManager from '@/components/settings/AssetManager'
import IncidentTypeManager from '@/components/settings/IncidentTypeManager'
import UserManager from '@/components/settings/UserManager'
import { isTelegramConfigured } from '@/lib/telegram'

export const metadata = { title: '設定 | 維修系統' }

export default async function SettingsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  // Technicians / supervisors / directors have no settings to manage —
  // keep them out of the page entirely (defence in depth alongside nav gating).
  if (!PERMISSIONS.viewSettings(user.role)) redirect('/dashboard')

  const canManageUsers = PERMISSIONS.manageUsers(user.role)
  const canManageMachines = PERMISSIONS.manageMachines(user.role)
  const canManageAreas = PERMISSIONS.manageAreas(user.role)
  const canManageFactories = PERMISSIONS.manageFactories(user.role)
  const canManageIncidentTypes = PERMISSIONS.manageIncidentTypes(user.role)
  const canManageTelegram = PERMISSIONS.manageTelegram(user.role)

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-gray-900">設定</h1>

      {/* User Management — admin only */}
      {canManageUsers && (
        <section className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <div>
            <h2 className="font-semibold text-gray-900">帳號管理</h2>
            <p className="text-xs text-gray-500 mt-0.5">建立員工帳號、設定角色與密碼（僅管理員）</p>
          </div>
          <UserManager currentUserId={user.id} />
        </section>
      )}

      {/* Asset Management — manager + admin */}
      {canManageMachines && (
        <section className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <div>
            <h2 className="font-semibold text-gray-900">機器/項目管理</h2>
            <p className="text-xs text-gray-500 mt-0.5">依工廠、區域新增或刪除機器與項目</p>
          </div>
          <AssetManager />
        </section>
      )}

      {/* Area Management — manager + admin */}
      {canManageAreas && (
        <section className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <div>
            <h2 className="font-semibold text-gray-900">區域管理</h2>
            <p className="text-xs text-gray-500 mt-0.5">為每個工廠新增、編輯或刪除區域</p>
          </div>
          <AreaManager />
        </section>
      )}

      {/* Factory Management — manager + admin */}
      {canManageFactories && (
        <section className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <div>
            <h2 className="font-semibold text-gray-900">工廠管理</h2>
            <p className="text-xs text-gray-500 mt-0.5">新增、編輯或刪除工廠</p>
          </div>
          <FactoryManager />
        </section>
      )}

      {/* Incident Type Management — manager + admin */}
      {canManageIncidentTypes && (
        <section className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <div>
            <h2 className="font-semibold text-gray-900">問題類型管理</h2>
            <p className="text-xs text-gray-500 mt-0.5">新增或刪除報修時可選的問題類型</p>
          </div>
          <IncidentTypeManager />
        </section>
      )}

      {/* Telegram Notifications — manager + admin */}
      {canManageTelegram && (
        <section className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <div>
            <h2 className="font-semibold text-gray-900">Telegram 通知</h2>
            <p className="text-xs text-gray-500 mt-0.5">有新報修時發送通知</p>
          </div>
          {user.factory_id ? (
            <TelegramSettings factoryId={user.factory_id} configured={isTelegramConfigured()} />
          ) : (
            <p className="text-sm text-gray-500">找不到此帳戶的工廠。</p>
          )}
        </section>
      )}
    </div>
  )
}
