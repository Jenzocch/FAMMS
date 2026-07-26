'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { PM_TYPE_KEYS, PM_TYPE_LABELS } from '@/lib/pm'
import { type Account, accountName } from '@/lib/assignees'
import { loadMyFactoryId } from '@/lib/useMyFactory'
import { loadFactories } from '@/lib/useFactories'
import {
  type PMSchedule, type SchedulePayload,
  loadActiveSchedules, createSchedule, updateSchedule, deactivateSchedule,
  checklistToText, textToChecklist,
} from '@/lib/pm-schedules'
import PMScheduleFields, { EMPTY_SCHEDULE_FORM, type ScheduleFormState } from './PMScheduleFields'
import PMScheduleList from './PMScheduleList'

// Owns the data for the PM schedule section of the PM page: reference lists
// (factories → areas → machines, accounts), the schedule list, and the
// create/edit submit. The form and the list render in PMScheduleFields /
// PMScheduleList; the reads and writes live in lib/pm-schedules.

interface Area { id: string; name: string }
interface Machine { id: string; machine_name: string; machine_code: string | null }

export default function PMScheduleManager() {
  const { t } = useI18n()
  const supabase = createClient()

  // Human label for a schedule's cadence, including custom "每 N 天".
  const cadenceLabel = (pmType: string, intervalDays?: number | null): string => {
    if (pmType === 'custom') {
      return intervalDays
        ? t('pm.cadEveryNDays').replace('{days}', String(intervalDays))
        : t('pm.cadCustom')
    }
    return PM_TYPE_KEYS[pmType] ? t(PM_TYPE_KEYS[pmType], PM_TYPE_LABELS[pmType]) : pmType
  }

  const [factories, setFactories] = useState<{ id: string; name: string }[]>([])
  const [areas, setAreas] = useState<Area[]>([])
  const [machines, setMachines] = useState<Machine[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [schedules, setSchedules] = useState<PMSchedule[]>([])
  const [loading, setLoading] = useState(true)

  // Factory/area sit outside the form state because they also drive the
  // option loads below, and survive a form reset.
  const [factoryId, setFactoryId] = useState('')
  const [areaId, setAreaId] = useState('')

  const [form, setForm] = useState<ScheduleFormState>(EMPTY_SCHEDULE_FORM)
  const patchForm = (patch: Partial<ScheduleFormState>) => setForm(prev => ({ ...prev, ...patch }))
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  async function refreshSchedules() {
    const rows = await loadActiveSchedules(supabase)
    setSchedules(rows)
  }

  useEffect(() => {
    Promise.all([loadFactories(), loadMyFactoryId()]).then(([data, myFactoryId]) => {
      setFactories(data ?? [])
      if (data && data.length > 0) {
        // Preselect the user's own factory so technicians see their machines.
        const preferred = myFactoryId && data.some(f => f.id === myFactoryId) ? myFactoryId : data[0].id
        setFactoryId(preferred)
      }
      setLoading(false)
    })
    supabase.from('profiles')
      .select('id, full_name, role, factory_id, custom_role_key')
      .eq('is_active', true).order('full_name')
      .then(({ data }) => setAccounts((data ?? []) as Account[]))
    // Initial fetch, not a synchronous setState: refreshSchedules only sets
    // state after awaiting the query. The rule can't see through the async
    // boundary.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshSchedules()
    // Mount-only load. `supabase`/`refreshSchedules` are intentionally omitted:
    // createClient() returns a new client instance every call (not memoized)
    // and refreshSchedules closes over it, so depending on either would re-run
    // this effect on every render instead of once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // Intentional reset-before-refetch: clears the stale option list
    // synchronously so the dropdown doesn't show the previous factory's
    // areas while the new factory's areas are loading.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!factoryId) { setAreas([]); setAreaId(''); return }
    supabase.from('areas').select('id, name').eq('factory_id', factoryId).order('name')
      .then(({ data }) => setAreas(data ?? []))
    setAreaId('')
    // `supabase` is intentionally omitted: createClient() returns a new client
    // instance every call (not memoized), so adding it here would re-run this
    // effect on every render instead of only when factoryId changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [factoryId])

  useEffect(() => {
    // Intentional reset-before-refetch (see areas effect above).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!areaId) { setMachines([]); patchForm({ machineId: '' }); return }
    supabase.from('machines').select('id, machine_name, machine_code')
      .eq('area_id', areaId).neq('status', 'scrapped').order('machine_name')
      .then(({ data }) => setMachines(data ?? []))
    patchForm({ machineId: '' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaId])

  function closeForm() {
    setForm(EMPTY_SCHEDULE_FORM)
    setShowForm(false)
    setEditingId(null)
  }

  async function submit() {
    if (!form.machineId) {
      toast.error(t('pm.selectMachineErr'))
      return
    }
    const days = parseInt(form.intervalDays, 10)
    if (form.pmType === 'custom' && (!days || days < 1)) {
      toast.error(t('pm.customDaysRequired'))
      return
    }

    const payload: SchedulePayload = {
      machineId: form.machineId,
      pmType: form.pmType,
      intervalDays: form.pmType === 'custom' ? days : null,
      description: form.description,
      checklist: textToChecklist(form.checklistText),
      firstDueDate: form.firstDueDate,
      assignedUserIds: form.assignees,
      assignedTo: form.assignees
        .map(id => accounts.find(a => a.id === id))
        .filter((a): a is Account => !!a)
        .map(accountName)
        .join(', ') || null,
    }

    setSubmitting(true)
    try {
      if (editingId) {
        await updateSchedule(supabase, editingId, payload)
        toast.success(t('pm.scheduleUpdated'))
      } else {
        await createSchedule(payload, t('pm.operationFailed'))
        toast.success(t('pm.scheduleCreated'))
      }
      closeForm()
      refreshSchedules()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('pm.operationFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  async function removeSchedule(id: string) {
    if (!confirm(t('pm.confirmDeactivate'))) return
    try {
      await deactivateSchedule(supabase, id)
      toast.success(t('pm.deactivated'))
      refreshSchedules()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('pm.deleteFailed'))
    }
  }

  function startEdit(s: PMSchedule) {
    setEditingId(s.id)
    setForm({
      machineId: s.machine_id,
      pmType: s.pm_type,
      intervalDays: s.interval_days ? String(s.interval_days) : '',
      description: s.description || '',
      firstDueDate: '',
      checklistText: checklistToText(s.checklist),
      assignees: s.assigned_user_ids ?? [],
    })
    setShowForm(true)
  }

  if (loading) return <div className="text-center text-gray-500 text-sm py-4">{t('common.loading')}</div>

  return (
    <div className="space-y-4">
      {!showForm && (
        <Button
          onClick={() => { setEditingId(null); setForm(EMPTY_SCHEDULE_FORM); setShowForm(true) }}
          className="gap-2 w-full"
        >
          <Plus className="w-4 h-4" /> {t('pm.addSchedulePlan')}
        </Button>
      )}

      {showForm && (
        <PMScheduleFields
          value={form}
          onChange={patchForm}
          editing={!!editingId}
          submitting={submitting}
          onSubmit={submit}
          onCancel={closeForm}
          factories={factories}
          areas={areas}
          machines={machines}
          accounts={accounts}
          factoryId={factoryId}
          areaId={areaId}
          onFactoryChange={setFactoryId}
          onAreaChange={setAreaId}
        />
      )}

      <PMScheduleList
        schedules={schedules}
        cadenceLabel={cadenceLabel}
        onEdit={startEdit}
        onRemove={removeSchedule}
      />
    </div>
  )
}
