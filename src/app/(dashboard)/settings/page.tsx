import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import TelegramSettings from '@/components/settings/TelegramSettings'
import FactoryManager from '@/components/settings/FactoryManager'
import AreaManager from '@/components/settings/AreaManager'
import { isTelegramConfigured } from '@/lib/telegram'

export const metadata = { title: 'Pengaturan | FAMMS' }

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('factory_id')
    .eq('id', user.id)
    .single()

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">設定管理</h1>

      {/* Factory Management */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">工廠管理</h2>
        <p className="text-sm text-gray-600">新增、編輯或刪除工廠</p>
        <FactoryManager />
      </section>

      {/* Area Management */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">區域管理</h2>
        <p className="text-sm text-gray-600">為每個工廠管理區域</p>
        <AreaManager />
      </section>

      {/* Telegram Notifications */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">通知設定</h2>
        <p className="text-sm text-gray-600">Telegram 通知設置</p>
        {profile?.factory_id ? (
          <TelegramSettings factoryId={profile.factory_id} configured={isTelegramConfigured()} />
        ) : (
          <p className="text-sm text-gray-500">找不到此帳戶的工廠。</p>
        )}
      </section>
    </div>
  )
}
