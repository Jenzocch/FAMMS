'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, Tablet, Power, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n } from '@/lib/i18n'

type Factory = { id: string; name: string }
type Account = { id: string; full_name: string | null; is_shared_device: boolean }
type Performer = { id?: string; full_name: string }
type Device = { id: string; auth_user_id: string; factory_ids: string[]; label: string; enabled: boolean; roster: string[] }
const STARTER_NAMES = ['Pak Dasir', 'Suwardi', 'Wiwit', 'Rudi']
const INPUT = 'mt-1 min-h-12 w-full rounded-lg border border-gray-300 bg-white px-3 text-base'

export default function SharedTabletManager() {
  const { t } = useI18n()
  const [factories, setFactories] = useState<Factory[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [catalog, setCatalog] = useState<Performer[]>([])
  const [devices, setDevices] = useState<Device[]>([])
  const [factoryIds, setFactoryIds] = useState<string[]>([])
  const [accountId, setAccountId] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [performers, setPerformers] = useState<Performer[]>(() => STARTER_NAMES.map(full_name => ({ full_name })))
  const [label, setLabel] = useState(() => t('settings.sharedTabletDefaultLabel'))
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const busy = saving || Boolean(togglingId)

  const load = useCallback(async () => {
    setLoadError(false)
    try {
      const response = await fetch('/api/admin/shared-devices', { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? t('settings.sharedTabletLoadFailed'))
      setFactories(data.factories ?? [])
      setAccounts((data.technicians ?? []).filter((account: Account) => account.is_shared_device))
      setCatalog(data.performers ?? [])
      setDevices(data.devices ?? [])
    } catch (error) {
      setLoadError(true)
      toast.error(error instanceof Error ? error.message : t('settings.sharedTabletLoadFailed'))
    } finally { setLoading(false) }
  }, [t])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  function resetForm() {
    setEditingId(null); setAccountId(''); setFactoryIds([])
    setPerformers(STARTER_NAMES.map(full_name => ({ full_name })))
    setLabel(t('settings.sharedTabletDefaultLabel'))
  }

  function editDevice(device: Device) {
    setEditingId(device.id); setFactoryIds(device.factory_ids); setAccountId(device.auth_user_id)
    setPerformers(device.roster.map(id => catalog.find(person => person.id === id)).filter((person): person is Performer => Boolean(person)))
    setLabel(device.label)
    document.getElementById('shared-tablet-config')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const names = performers.map(person => person.full_name.trim())
    if (!factoryIds.length || !accountId || !label.trim() || !names.length || names.some(name => !name) || new Set(names.map(name => name.toLocaleLowerCase())).size !== names.length) {
      toast.error(t('settings.sharedTabletRequired')); return
    }
    setSaving(true)
    try {
      const response = await fetch('/api/admin/shared-devices', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ factory_ids: factoryIds, auth_user_id: accountId, label: label.trim(), performers: performers.map(person => ({ ...person, full_name: person.full_name.trim() })) }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? t('settings.sharedTabletSaveFailed'))
      toast.success(t('settings.sharedTabletSaved')); resetForm(); await load()
    } catch (error) { toast.error(error instanceof Error ? error.message : t('settings.sharedTabletSaveFailed')) }
    finally { setSaving(false) }
  }

  async function toggleDevice(device: Device) {
    if (busy) return
    setTogglingId(device.id)
    try {
      const response = await fetch(`/api/admin/shared-devices/${device.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: !device.enabled }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? t('settings.sharedTabletSaveFailed'))
      await load()
    } catch (error) { toast.error(error instanceof Error ? error.message : t('settings.sharedTabletSaveFailed')) }
    finally { setTogglingId(null) }
  }

  return <section id="shared-tablet-config" className="space-y-4 rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
    <div><h3 className="flex items-center gap-2 font-semibold text-gray-900"><Tablet className="h-4 w-4 text-indigo-600"/>{t('settings.sharedTabletTitle')}</h3><p className="mt-1 text-sm leading-6 text-gray-600">{t('settings.sharedTabletDescription')}</p></div>
    {loading ? <p role="status" className="flex items-center gap-2 py-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin"/>{t('settings.sharedTabletLoading')}</p> : loadError ? <div role="alert"><p>{t('settings.sharedTabletLoadFailed')}</p><Button type="button" onClick={() => void load()}>{t('settings.sharedTabletRetry')}</Button></div> : <>
      <form onSubmit={save} className="space-y-4">
        <fieldset disabled={busy} className="space-y-4 disabled:opacity-60">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium text-gray-700">{t('settings.sharedTabletAccount')}
              <select required className={INPUT} value={accountId} disabled={Boolean(editingId)} onChange={event => setAccountId(event.target.value)}>
                <option value="">{t('settings.sharedTabletChooseAccount')}</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.full_name || t('settings.sharedTabletUnnamed')}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-gray-700">{t('settings.sharedTabletLabel')}<input required className={INPUT} maxLength={100} value={label} onChange={event => setLabel(event.target.value)} /></label>
          </div>
          {!accounts.length && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{t('settings.sharedTabletNoAccount')}</p>}
          <fieldset><legend className="mb-2 text-sm font-medium text-gray-700">{t('settings.sharedTabletFactory')}</legend>
            <div className="grid gap-2 sm:grid-cols-2">{factories.map(factory => <label key={factory.id} className="flex min-h-12 items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 text-sm">
              <input type="checkbox" className="size-4 accent-indigo-600" checked={factoryIds.includes(factory.id)} onChange={() => setFactoryIds(previous => previous.includes(factory.id) ? previous.filter(id => id !== factory.id) : [...previous, factory.id])} />{factory.name}
            </label>)}</div><p className="mt-2 text-xs leading-5 text-gray-500">{t('settings.sharedTabletFactoryHint')}</p>
          </fieldset>
          <fieldset><legend className="mb-2 text-sm font-medium text-gray-700">{t('settings.sharedTabletRoster')}</legend>
            <div className="grid gap-3 sm:grid-cols-2">{performers.map((person, index) => <label key={person.id ?? `new-${index}`} className="text-sm text-gray-700">{t('settings.sharedTabletPerformerName')} {index + 1}
              <div className="flex gap-2"><input required maxLength={100} value={person.full_name} className={INPUT} onChange={event => setPerformers(previous => previous.map((member, memberIndex) => memberIndex === index ? { ...member, full_name: event.target.value } : member))} />
                <Button type="button" variant="outline" className="mt-1 min-h-12" aria-label={`${t('settings.sharedTabletRemove')} ${person.full_name || index + 1}`} disabled={performers.length <= 1} onClick={() => setPerformers(previous => previous.filter((_, memberIndex) => memberIndex !== index))}>{t('settings.sharedTabletRemove')}</Button></div>
            </label>)}</div><p className="mt-2 text-xs leading-5 text-gray-500">{t('settings.sharedTabletRosterHint')}</p>
            <Button type="button" variant="outline" className="mt-2 min-h-12" disabled={performers.length >= 20} onClick={() => setPerformers(previous => [...previous, { full_name: '' }])}>{t('settings.sharedTabletAddName')}</Button>
          </fieldset>
          <div className="flex flex-wrap gap-2"><Button type="submit" disabled={!accounts.length} className="min-h-12">{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}{editingId ? t('settings.sharedTabletSaveChanges') : t('settings.sharedTabletSaveActivate')}</Button>{editingId && <Button type="button" variant="outline" onClick={resetForm} className="min-h-12">{t('settings.sharedTabletCancel')}</Button>}</div>
        </fieldset>
      </form>
      {devices.length > 0 && <div className="space-y-2 border-t border-indigo-100 pt-3"><h4 className="text-sm font-semibold text-gray-800">{t('settings.sharedTabletConfigured')}</h4>
        {devices.map(device => <div key={device.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3">
          <div className="min-w-0"><p className="break-words text-sm font-medium">{device.label}</p><p className="text-xs leading-5 text-gray-500">{device.factory_ids.map(id => factories.find(factory => factory.id === id)?.name ?? t('settings.sharedTabletUnknownFactory')).join(' / ')} · {device.roster.length} {t('settings.sharedTabletTechnicians')} · {device.enabled ? t('settings.sharedTabletEnabled') : t('settings.sharedTabletDisabled')}</p></div>
          <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => editDevice(device)} className="min-h-12"><Pencil className="mr-1.5 h-4 w-4"/>{t('settings.sharedTabletEdit')}</Button>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void toggleDevice(device)} className="min-h-12"><Power className="mr-1.5 h-4 w-4"/>{device.enabled ? t('settings.sharedTabletDisable') : t('settings.sharedTabletReenable')}</Button></div>
        </div>)}
      </div>}
    </>}
  </section>
}
