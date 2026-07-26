'use client'

import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useI18n } from '@/lib/i18n'

// Everything the progress-update card only asks for when the chosen status is
// "closed": how it was fixed, the food-safety sign-off, the two optional cost
// numbers, and the knowledge-base capture. Split out of ProgressUpdate, where
// it was ~130 lines of JSX nested inside a single `newStatus === 'closed'`
// branch, pushing the fields that show on EVERY update far down the file.
//
// State stays in the parent because submit() validates it. It travels as one
// object rather than eight useState pairs.

export interface CloseDetails {
  completionType: 'temporary_fix' | 'permanent_fix' | ''
  hygieneTools: boolean
  hygieneLubricant: boolean
  hygieneCleanArea: boolean
  laborCost: string
  partsCost: string
  saveToKb: boolean
  repairMethod: string
}

export const EMPTY_CLOSE_DETAILS: CloseDetails = {
  completionType: '',
  hygieneTools: false,
  hygieneLubricant: false,
  hygieneCleanArea: false,
  laborCost: '',
  partsCost: '',
  // Defaults ON: capturing the fix is the norm, opting out is the exception.
  saveToKb: true,
  repairMethod: '',
}

// All three hygiene boxes must be ticked. Only meaningful for machine
// incidents — see the `hasMachine` note below.
export function isHygieneConfirmed(d: CloseDetails): boolean {
  return d.hygieneTools && d.hygieneLubricant && d.hygieneCleanArea
}

export default function CloseFields({
  value, onChange, hasMachine,
}: {
  value: CloseDetails
  onChange: (patch: Partial<CloseDetails>) => void
  // Whether this incident is attached to a machine — drives the food-safety
  // hygiene sign-off. Maintenance work on equipment is itself a contamination
  // risk; facility/electrical incidents with no machine_id never touch food
  // product, so they skip it entirely.
  hasMachine: boolean
}) {
  const { t } = useI18n()

  return (
    <div>
      {/* Completion type — drives the first-fix / repeat KPI: a temporary fix
          re-arms repeat-failure detection for 30 days. */}
      <Label>{t('progressUpdate.completionType', '修復類型')} <span className="text-red-500">*</span></Label>
      <div className="grid grid-cols-1 gap-1.5 mt-1">
        <FixTypeButton
          selected={value.completionType === 'permanent_fix'}
          onClick={() => onChange({ completionType: 'permanent_fix' })}
          selectedClass="border-green-500 bg-green-50 text-green-800"
          title={`✅ ${t('progressUpdate.permanentFix', '永久修復')}`}
          desc={t('progressUpdate.permanentFixDesc', '已解決根本原因')}
        />
        <FixTypeButton
          selected={value.completionType === 'temporary_fix'}
          onClick={() => onChange({ completionType: 'temporary_fix' })}
          selectedClass="border-amber-500 bg-amber-50 text-amber-800"
          title={`⚠️ ${t('progressUpdate.temporaryFix', '臨時修復')}`}
          desc={t('progressUpdate.temporaryFixDesc', '需觀察 30 天，根本原因未解決')}
        />
      </div>

      {/* Post-maintenance hygiene sign-off — food-safety gate for MACHINE
          incidents. Maintenance is itself a contamination source (tools left
          behind, metal shavings, non-food-grade lubricant), so the case can't
          close until whoever worked on it confirms the area was left clean. */}
      {hasMachine && (
        <div className="mt-3 rounded-lg border border-gray-200 p-3 space-y-2">
          <Label className="text-sm">
            {t('progressUpdate.hygieneHeading', '復產衛生確認')} <span className="text-red-500">*</span>
          </Label>
          <Check
            checked={value.hygieneTools}
            onChange={v => onChange({ hygieneTools: v })}
            label={t('progressUpdate.hygieneTools', '工具清點無缺，無遺留現場')}
          />
          <Check
            checked={value.hygieneLubricant}
            onChange={v => onChange({ hygieneLubricant: v })}
            label={t('progressUpdate.hygieneLubricant', '潤滑油/化學品為食品級或已徹底清除')}
          />
          <Check
            checked={value.hygieneCleanArea}
            onChange={v => onChange({ hygieneCleanArea: v })}
            label={t('progressUpdate.hygieneCleanArea', '現場清潔完成，無金屬屑/異物殘留')}
          />
        </div>
      )}

      {/* Optional costs — feed the monthly report; skippable so closing never
          gets blocked on missing numbers. */}
      <div className="grid grid-cols-2 gap-2 mt-3">
        <Money
          label={t('progressUpdate.laborCost', '工時費用（選填）')}
          value={value.laborCost}
          onChange={v => onChange({ laborCost: v })}
        />
        <Money
          label={t('progressUpdate.partsCost', '零件/材料費用（選填）')}
          value={value.partsCost}
          onChange={v => onChange({ partsCost: v })}
        />
      </div>

      {/* Knowledge base capture */}
      <div className="mt-3">
        <Check
          checked={value.saveToKb}
          onChange={v => onChange({ saveToKb: v })}
          label={t('progressUpdate.saveToKb', '存入知識庫（下次同樣問題可查到怎麼修）')}
        />
      </div>
      {value.saveToKb && (
        <div className="mt-2">
          <Label className="text-xs">{t('progressUpdate.repairMethod', '修理方法（選填，未填則使用下方備註）')}</Label>
          <Textarea
            value={value.repairMethod}
            onChange={e => onChange({ repairMethod: e.target.value })}
            placeholder={t('progressUpdate.repairMethodPh', '例如：更換 bearing 6205、重新校正 sensor 位置…')}
            rows={2}
            className="mt-1"
          />
        </div>
      )}
    </div>
  )
}

function FixTypeButton({ selected, onClick, selectedClass, title, desc }: {
  selected: boolean
  onClick: () => void
  selectedClass: string
  title: string
  desc: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-3 py-2 text-left transition-colors ${
        selected ? selectedClass : 'border-gray-200 bg-white text-gray-700'
      }`}
    >
      <span className="text-sm font-semibold block">{title}</span>
      <span className="text-xs text-gray-500 block mt-0.5">{desc}</span>
    </button>
  )
}

function Check({ checked, onChange, label }: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <label className="flex items-start gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="mt-0.5 w-4 h-4 accent-blue-600 shrink-0"
      />
      <span className="text-sm text-gray-700">{label}</span>
    </label>
  )
}

function Money({ label, value, onChange }: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="0"
        className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
      />
    </div>
  )
}
