import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import TelegramSettings from '@/components/settings/TelegramSettings'
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
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-xl font-bold text-gray-900">Pengaturan</h1>

      <section className="space-y-3">
        <h2 className="font-semibold text-gray-900">Notifikasi Telegram</h2>
        {profile?.factory_id ? (
          <TelegramSettings factoryId={profile.factory_id} configured={isTelegramConfigured()} />
        ) : (
          <p className="text-sm text-gray-500">Factory tidak ditemukan untuk akun ini.</p>
        )}
      </section>
    </div>
  )
}
