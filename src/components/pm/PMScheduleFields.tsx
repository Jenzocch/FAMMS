'use client'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Loader2, Users, X } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { PM_TYPE_KEYS, PM_TYPE_LABELS } from '@/lib/pm'
import { type Account, accountName, isFactoryTechnician } from '@/lib/assignees'
import AssigneeChip from '@/components/shared/AssigneeChip'

// The create/edit form for a PM schedule. Split out of PMScheduleManager,
// which is now just the data owner around it and the list below it.
//
// Form state lives in the parent as one object rather than nine useState
// pairs, so resetting after a save (and pre-filling when editing an existing
// schedule) is a single assignment.

export interface ScheduleFormState {
  machineId: string
  pmType: string
  intervalDays: string
  description: string
  // First due date — only meaningful when creating (the API generates the
  // first pm_record off it); left blank it defaults to one interval from today.
  firstDueDate: string
  // One checklist item per line; stored as a JSON array string on the schedule.
  checklistText: string
  assignees: string[]
}

export const EMPTY_SCHEDULE_FORM: ScheduleFormState = {
  machineId: '',
  pmType: 'monthly',
  intervalDays: '',
  description: '',
  firstDueDate: '',
  checklistText: '',
  assignees: [],
}

export default function PMScheduleFields({
  value, onChange, editing, submitting, onSubmit, onCancel,
  factories, areas, machines, accounts,
  factoryId, areaId, onFactoryChange, onAreaChange,
}: {
  value: ScheduleFormState
  onChange: (patch: Partial<ScheduleFormState>) => void
  editing: boolean
  submitting: boolean
  onSubmit: () => void
  onCancel: () => void
  factories: { id: string; name: string }[]
  areas: { id: string; name: string }[]
  machines: { id: string; machine_name: string; machine_code: string | null }[]
  accounts: Account[]
  // Factory/area live in the parent because they also drive the option loads.
  factoryId: string
  areaId: string
  onFactoryChange: (id: string) => void
  onAreaChange: (id: string) => void
}) {
  const { t } = useI18n()

  const setAssignees = (next: string[]) => onChange({ assignees: next })
  const toggleAssignee = (id: string) =>
    setAssignees(value.assignees.includes(id)
      ? value.assignees.filter(x => x !== id)
      : [...value.assignees, id])

  const factoryTechnicians = accounts.filter(a => isFactoryTechnician(a, factoryId))
  // Accounts selectable for this schedule's factory. Cross-factory accounts and
  // anyone already assigned stay visible so they can still be de-selected.
  const factoryAccounts = accounts.filter(
    a => value.assignees.includes(a.id) || !factoryId || !a.factory_id || a.factory_id === factoryId
  )

  // value→label maps so Base UI <SelectValue> shows names, not raw IDs/codes
  const machineLabel = (m: { machine_name: string; machine_code: string | null }) =>
    `${m.machine_code ? `[${m.machine_code}] ` : ''}${m.machine_name}`
  const pmTypeItems = Object.fromEntries(
    Object.keys(PM_TYPE_KEYS).map(k => [k, t(PM_TYPE_KEYS[k], PM_TYPE_LABELS[k])])
  )

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
      <p className="text-sm font-medium text-blue-900">
        {editing ? t('pm.editSchedulePlan') : t('pm.addSchedulePlan')}
      </p>

      <Select
        value={factoryId}
        onValueChange={(v) => onFactoryChange(v ?? '')}
        items={Object.fromEntries(factories.map(f => [f.id, f.name]))}
      >
        <SelectTrigger><SelectValue placeholder={t('pm.selectFactoryPh')} /></SelectTrigger>
        <SelectContent>
          {factories.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
        </SelectContent>
      </Select>

      {areas.length > 0 && (
        <Select
          value={areaId}
          onValueChange={(v) => onAreaChange(v ?? '')}
          items={Object.fromEntries(areas.map(a => [a.id, a.name]))}
        >
          <SelectTrigger><SelectValue placeholder={t('pm.selectAreaPh')} /></SelectTrigger>
          <SelectContent>
            {areas.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      {machines.length > 0 && (
        <Select
          value={value.machineId}
          onValueChange={(v) => onChange({ machineId: v ?? '' })}
          items={Object.fromEntries(machines.map(m => [m.id, machineLabel(m)]))}
        >
          <SelectTrigger><SelectValue placeholder={t('pm.selectMachineStar')} /></SelectTrigger>
          <SelectContent>
            {machines.map(m => <SelectItem key={m.id} value={m.id}>{machineLabel(m)}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      <div>
        <Label>{t('pm.pmFrequency')}</Label>
        <Select
          value={value.pmType}
          onValueChange={(v) => onChange({ pmType: v ?? 'monthly' })}
          items={pmTypeItems}
        >
          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(pmTypeItems).map(([k, label]) => (
              <SelectItem key={k} value={k}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {value.pmType === 'custom' && (
        <div>
          <Label>{t('pm.customDaysLabel')}</Label>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-sm text-gray-500">{t('pm.every')}</span>
            <input
              type="number"
              min={1}
              value={value.intervalDays}
              onChange={e => onChange({ intervalDays: e.target.value })}
              placeholder={t('pm.customDaysPlaceholder')}
              className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
            <span className="text-sm text-gray-500">{t('pm.days')}</span>
          </div>
        </div>
      )}

      <div>
        <Label>{t('pm.notesOptional')}</Label>
        <input
          value={value.description}
          onChange={e => onChange({ description: e.target.value })}
          placeholder={t('pm.notesPlaceholder')}
          className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
      </div>

      {/* First due date — only meaningful on create; the API derives it from
          today + interval when left blank, so editing doesn't need it. */}
      {!editing && (
        <div>
          <Label>{t('pmForm.firstDueDate', '首次預定日期')}</Label>
          <input
            type="date"
            value={value.firstDueDate}
            onChange={e => onChange({ firstDueDate: e.target.value })}
            className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <p className="text-xs text-gray-400 mt-1">
            {t('pmForm.firstDueDateHint', '留空則自動設為今天起一個週期後')}
          </p>
        </div>
      )}

      {/* Checklist — one item per line; ticked off when completing the task */}
      <div>
        <Label>{t('pm.checklistLabel', '檢查清單 Checklist（選填，一行一項）')}</Label>
        <textarea
          value={value.checklistText}
          onChange={e => onChange({ checklistText: e.target.value })}
          placeholder={t('pm.checklistPlaceholder', '例如：\n檢查 bearing 潤滑\n清潔散熱片\n測量運轉溫度')}
          rows={3}
          className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
      </div>

      {/* Responsible person(s) — who this maintenance is assigned to */}
      <div>
        <div className="flex items-center justify-between gap-2">
          <Label>{t('pm.responsible', '負責人（可多選）')}</Label>
          <div className="flex items-center gap-3">
            {factoryTechnicians.length > 0 && (
              <button
                type="button"
                onClick={() => setAssignees(
                  Array.from(new Set([...value.assignees, ...factoryTechnicians.map(a => a.id)]))
                )}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                <Users className="w-3.5 h-3.5" /> {t('assign.allTechnicians', '指派給全部一般員工')} ({factoryTechnicians.length})
              </button>
            )}
            {value.assignees.length > 0 && (
              <button
                type="button"
                onClick={() => setAssignees([])}
                className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-red-600"
              >
                <X className="w-3.5 h-3.5" /> {t('assign.clearAll', '取消全部')}
              </button>
            )}
          </div>
        </div>
        {factoryAccounts.length === 0 ? (
          <p className="text-xs text-gray-400 mt-1">{t('assign.noAccounts', '尚無可指派的帳號')}</p>
        ) : (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {factoryAccounts.map(a => (
              <AssigneeChip
                key={a.id}
                label={accountName(a)}
                selected={value.assignees.includes(a.id)}
                onClick={() => toggleAssignee(a.id)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Button onClick={onSubmit} disabled={submitting || !value.machineId}>
          {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {editing ? t('pm.updatePlan') : t('pm.createPlan')}
        </Button>
        <Button variant="outline" onClick={onCancel}>{t('pm.cancelBtn')}</Button>
      </div>
    </div>
  )
}
