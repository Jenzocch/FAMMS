'use client'

import { useI18n } from '@/lib/i18n'
import { DAY_ABBRS, PM_TYPE_LABELS, PM_TYPE_KEYS, STATUS_DOT, STATUS_BADGE, STATUS_KEYS, STATUS_LABELS, type PMTask } from './types'

// Week view — vertical day-by-day agenda. On a phone, 7 side-by-side columns
// are too narrow to read (events collapse to "DI… Ad…"), so we list each day
// full width with legible task rows. Tapping a task opens the detail/action
// panel below (owned by the parent, driven by onSelectDate).
export default function WeekAgenda({
  weekDates, eventMap, today, selectedDate, onSelectDate,
}: {
  weekDates: string[]
  eventMap: Record<string, PMTask[]>
  today: string
  selectedDate: string | null
  onSelectDate: (date: string) => void
}) {
  const { t } = useI18n()
  const dayAbbr = (idx: number) => t(`weekdays.${idx}`, DAY_ABBRS[idx])
  const typeLabel = (task: PMTask): string => {
    if (task.ad_hoc) return t('pm.adhocLabel')
    const key = PM_TYPE_KEYS[task.pm_type || '']
    return key ? t(key, PM_TYPE_LABELS[task.pm_type || ''] || task.pm_type || '') : (task.pm_type || '')
  }
  const statusLabel = (status: string) =>
    t(STATUS_KEYS[status] ?? '', STATUS_LABELS[status] || status)

  return (
    <div className="space-y-2">
      {weekDates.map((dateStr, idx) => {
        const tasks = eventMap[dateStr] || []
        const isToday = dateStr === today
        const isSelected = dateStr === selectedDate
        const dayNum = parseInt(dateStr.split('-')[2])

        return (
          <div
            key={dateStr}
            className={`bg-white rounded-xl border overflow-hidden ${
              isSelected ? 'border-blue-300 ring-2 ring-blue-100' : isToday ? 'border-amber-300' : 'border-gray-200'
            }`}
          >
            {/* Day header */}
            <div className={`flex items-center gap-3 px-3 py-2 border-b ${
              isToday ? 'bg-amber-50 border-amber-100' : 'bg-gray-50 border-gray-100'
            }`}>
              <div className="flex flex-col items-center justify-center w-10 shrink-0">
                <span className="text-xs text-gray-500">{dayAbbr(idx)}</span>
                <span className={`text-lg font-bold leading-none ${isToday ? 'text-blue-600' : 'text-gray-800'}`}>{dayNum}</span>
              </div>
              <span className="text-sm text-gray-500">{dateStr.slice(5).replace('-', '/')}</span>
              {tasks.length > 0 && (
                <span className="ml-auto text-xs text-gray-500">
                  {t('dash.cases', '{count}').replace('{count}', String(tasks.length))}
                </span>
              )}
            </div>

            {/* Tasks for the day */}
            {tasks.length === 0 ? (
              <p className="text-xs text-gray-300 px-3 py-2.5">{t('pm.noPlanToday')}</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {tasks.map(task => (
                  <button
                    key={task.record_id}
                    onClick={() => onSelectDate(dateStr)}
                    className="w-full text-left flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 transition-colors"
                  >
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${STATUS_DOT[task.status] || 'bg-gray-400'}`} />
                    <span className="font-medium text-sm text-gray-800 truncate">
                      {task.machine_code ? `[${task.machine_code}] ` : ''}{task.machine_name}
                    </span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 shrink-0">
                      {typeLabel(task)}
                    </span>
                    <span className={`ml-auto text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${STATUS_BADGE[task.status] || 'bg-gray-100 text-gray-600'}`}>
                      {statusLabel(task.status)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
