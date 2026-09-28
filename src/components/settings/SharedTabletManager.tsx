'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, Tablet, Power, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n } from '@/lib/i18n'

type Factory = { id: string; name: string }
type Technician = { id: string; full_name: string | null; factory_id: string | null; is_shared_device: boolean }
type Device = { id: string; auth_user_id: string; factory_id: string; label: string; enabled: boolean; roster: string[] }

export default function SharedTabletManager() {
  const { t } = useI18n()
  const [factories, setFactories] = useState<Factory[]>([])
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [devices, setDevices] = useState<Device[]>([])
  const [factoryId, setFactoryId] = useState('')
  const [accountId, setAccountId] = useState('')
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null)
  const [rosterIds, setRosterIds] = useState<string[]>([])
  const [label, setLabel] = useState(() => t('settings.sharedTabletDefaultLabel'))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/shared-devices', { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? '平板設定載入失敗')
      setFactories(data.factories ?? [])
      setTechnicians(data.technicians ?? [])
      setDevices(data.devices ?? [])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('settings.sharedTabletLoadFailed'))
    } finally { setLoading(false) }
  }, [t])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])
  const sharedAccounts = useMemo(() => technicians.filter(person => person.is_shared_device), [technicians])
  const members = useMemo(() => technicians.filter(person => person.factory_id === factoryId && !person.is_shared_device), [technicians, factoryId])

  function chooseFactory(value: string) {
    setFactoryId(value); setAccountId(''); setRosterIds([]); setEditingDeviceId(null)
  }

  function editDevice(device: Device) {
    setEditingDeviceId(device.id)
    setFactoryId(device.factory_id)
    setAccountId(device.auth_user_id)
    setRosterIds(device.roster)
    setLabel(device.label)
    document.getElementById('shared-tablet-config')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function toggleMember(id: string) {
    setRosterIds(previous => previous.includes(id) ? previous.filter(member => member !== id) : [...previous, id])
  }

  async function save() {
    if (!factoryId || !accountId || !label.trim() || rosterIds.length === 0) {
      toast.error(t('settings.sharedTabletRequired'))
      return
    }
    setSaving(true)
    try {
      const response = await fetch('/api/admin/shared-devices', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ factory_id: factoryId, auth_user_id: accountId, label: label.trim(), technician_ids: rosterIds }),
      })
      const data = await response.json()
    if (!response.ok) throw new Error(data.error ?? t('settings.sharedTabletSaveFailed'))
      toast.success(t('settings.sharedTabletSaved'))
      setRosterIds([])
      setEditingDeviceId(null)
      await load()
    } catch (error) { toast.error(error instanceof Error ? error.message : t('settings.sharedTabletSaveFailed')) }
    finally { setSaving(false) }
  }

  async function toggleDevice(device: Device) {
    try {
      const response = await fetch(`/api/admin/shared-devices/${device.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !device.enabled }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? '狀態更新失敗')
      await load()
    } catch (error) { toast.error(error instanceof Error ? error.message : t('settings.sharedTabletSaveFailed')) }
  }

  return <section id="shared-tablet-config" className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 space-y-4">
    <div>
      <h3 className="flex items-center gap-2 font-semibold text-gray-900"><Tablet className="h-4 w-4 text-indigo-600"/>{t('settings.sharedTabletTitle')}</h3>
      <p className="mt-1 text-sm text-gray-600">{t('settings.sharedTabletDescription')}</p>
    </div>
    {loading ? <div className="flex items-center gap-2 py-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin"/>{t('settings.sharedTabletLoading')}</div> : <>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium text-gray-700">{t('settings.sharedTabletFactory')}
          <select className="mt-1 h-11 w-full rounded-lg border border-gray-300 bg-white px-3" value={factoryId} onChange={event => chooseFactory(event.target.value)}>
            <option value="">{t('settings.sharedTabletChooseFactory')}</option>{factories.map(factory => <option key={factory.id} value={factory.id}>{factory.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-gray-700">{t('settings.sharedTabletAccount')}
          <select className="mt-1 h-11 w-full rounded-lg border border-gray-300 bg-white px-3" value={accountId} onChange={event => setAccountId(event.target.value)}>
            <option value="">{t('settings.sharedTabletChooseAccount')}</option>{sharedAccounts.filter(account => account.factory_id === factoryId).map(account => <option key={account.id} value={account.id}>{account.full_name || t('settings.sharedTabletUnnamed')}</option>)}
          </select>
        </label>
      </div>
      <label className="block text-sm font-medium text-gray-700">{t('settings.sharedTabletLabel')}
        <input className="mt-1 h-11 w-full rounded-lg border border-gray-300 bg-white px-3" maxLength={100} value={label} onChange={event => setLabel(event.target.value)} />
      </label>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-gray-700">{t('settings.sharedTabletRoster')}</legend>
        {!factoryId ? <p className="text-sm text-gray-500">{t('settings.sharedTabletChooseFactoryFirst')}</p> : members.length ? <div className="grid gap-2 sm:grid-cols-2">
          {members.map(member => <label key={member.id} className="flex min-h-11 items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-indigo-600" checked={rosterIds.includes(member.id)} onChange={() => toggleMember(member.id)} />
            {member.full_name || '未命名技師'}
          </label>)}
        </div> : <p className="text-sm text-gray-500">{t('settings.sharedTabletNoTechnicians')}</p>}
      </fieldset>
      <Button type="button" onClick={save} disabled={saving || loading} className="min-h-11">
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}{editingDeviceId ? t('settings.sharedTabletSaveChanges') : t('settings.sharedTabletSaveActivate')}
      </Button>
      {devices.length > 0 && <div className="space-y-2 border-t border-indigo-100 pt-3">
        <h4 className="text-sm font-semibold text-gray-800">{t('settings.sharedTabletConfigured')}</h4>
        {devices.map(device => <div key={device.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3">
          <div className="min-w-0"><p className="truncate text-sm font-medium">{device.label}</p><p className="text-xs text-gray-500">{factories.find(factory => factory.id === device.factory_id)?.name ?? t('settings.sharedTabletUnknownFactory')} · {device.roster.length} {t('settings.sharedTabletTechnicians')} · {device.enabled ? t('settings.sharedTabletEnabled') : t('settings.sharedTabletDisabled')}</p></div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => editDevice(device)} className="min-h-10">
            <Pencil className="mr-1.5 h-4 w-4"/>{t('settings.sharedTabletEdit')}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => void toggleDevice(device)} className="min-h-10">
            <Power className="mr-1.5 h-4 w-4"/>{device.enabled ? t('settings.sharedTabletDisable') : t('settings.sharedTabletReenable')}
          </Button>
          </div>
        </div>)}
      </div>}
    </>}
  </section>
}
