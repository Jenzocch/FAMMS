'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { UserRole } from '@/types'
import { ROLE_LABELS } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Loader2, User } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { useFactories } from '@/lib/useFactories'

export interface ProfileFormUser {
  id: string
  factory_id: string | null
  full_name: string | null
  role: UserRole
}

export default function ProfileForm({ initialProfile }: { initialProfile: ProfileFormUser }) {
  const supabase = createClient()
  const { t } = useI18n()
  const { factories } = useFactories()
  const [profile, setProfile] = useState(initialProfile)
  const [fullName, setFullName] = useState(initialProfile.full_name ?? '')
  const [factoryId, setFactoryId] = useState(initialProfile.factory_id ?? '')
  const [saving, setSaving] = useState(false)

  const isAdmin = profile.role === 'admin'

  async function save() {
    setSaving(true)
    const update: { full_name: string; factory_id?: string | null } = { full_name: fullName.trim() }
    if (isAdmin) update.factory_id = factoryId || null
    const { error } = await supabase.from('profiles').update(update).eq('id', profile.id)
    setSaving(false)
    if (error) {
      toast.error(error.message)
      return
    }

    // Keep this screen consistent without a router.refresh(), which would
    // re-run the dashboard shell after an otherwise local form update.
    setProfile(current => ({
      ...current,
      full_name: update.full_name,
      factory_id: isAdmin ? update.factory_id ?? null : current.factory_id,
    }))
    toast.success(t('profile.saved', '個人資料已儲存'))
  }

  const factoryName = factories.find(f => f.id === profile.factory_id)?.name

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">{t('profile.title', '個人資料')}</h1>
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-center gap-4 mb-2">
          <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center">
            <User className="w-7 h-7 text-blue-600" />
          </div>
          <div>
            <p className="font-semibold text-gray-900">{profile.full_name}</p>
            <p className="text-xs text-blue-600 mt-0.5">{t(`roles.${profile.role}`, ROLE_LABELS[profile.role])}</p>
          </div>
        </div>

        <div>
          <Label htmlFor="name">{t('profile.fullName', '姓名')}</Label>
          <Input id="name" value={fullName} onChange={e => setFullName(e.target.value)} className="mt-1" />
        </div>

        <div>
          <Label>{t('profile.factory', '工廠')}</Label>
          {isAdmin ? (
            <Select value={factoryId} onValueChange={(v) => setFactoryId(v ?? '')} items={Object.fromEntries(factories.map(f => [f.id, f.name]))}>
              <SelectTrigger className="mt-1"><SelectValue placeholder={t('profile.selectFactory', '選擇工廠')} /></SelectTrigger>
              <SelectContent>
                {factories.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : (
            <p className="mt-1 text-sm text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
              {factoryName || t('profile.noFactory', '未指派')} — {t('profile.contactAdminFactory', '請聯繫管理員修改工廠')}
            </p>
          )}
        </div>

        <div>
          <Label>{t('profile.role', '角色')}</Label>
          <p className="mt-1 text-sm text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
            {t(`roles.${profile.role}`, ROLE_LABELS[profile.role])} — {t('profile.contactAdmin', '請聯繫管理員修改角色')}
          </p>
        </div>

        <Button onClick={save} disabled={saving} className="w-full">
          {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {t('profile.save', '儲存')}
        </Button>
      </div>
    </div>
  )
}
