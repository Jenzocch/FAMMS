'use client'

import { Button } from '@/components/ui/button'
import { Trash2, Edit2, Users } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import type { PMSchedule } from '@/lib/pm-schedules'

export default function PMScheduleList({
  schedules, cadenceLabel, onEdit, onRemove,
}: {
  schedules: PMSchedule[]
  cadenceLabel: (pmType: string, intervalDays?: number | null) => string
  onEdit: (s: PMSchedule) => void
  onRemove: (id: string) => void
}) {
  const { t } = useI18n()

  if (schedules.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-4">{t('pm.noSchedules')}</p>
  }

  return (
    <div className="space-y-2">
      {schedules.map(s => (
        <div key={s.id} className="flex items-center justify-between p-3 border rounded-lg bg-white">
          <div className="flex-1">
            <p className="text-sm font-medium">
              {s.machine_code ? `[${s.machine_code}] ` : ''}{s.machine_name}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {cadenceLabel(s.pm_type, s.interval_days)}
              {s.description && ` · ${s.description}`}
            </p>
            {s.assigned_to && (
              <p className="text-xs text-blue-600 mt-0.5 flex items-center gap-1">
                <Users className="w-3 h-3 shrink-0" /> {s.assigned_to}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" aria-label={t('pm.editSchedulePlan')} onClick={() => onEdit(s)}>
              <Edit2 className="w-4 h-4" />
            </Button>
            <Button size="sm" variant="outline" aria-label={t('pm.deactivated')} onClick={() => onRemove(s.id)}>
              <Trash2 className="w-4 h-4 text-red-600" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}
