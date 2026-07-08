'use client'

import { useState } from 'react'
import { AlertTriangle, ChevronDown } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import type { Locale as DateFnsLocale } from 'date-fns'
import { useI18n } from '@/lib/i18n'
import type { OverdueMachine } from '@/lib/hooks/useOverdueMaintenanceData'
import { PM_TYPE_LABELS, PM_TYPE_KEYS } from './types'

// Collapsible "PM overdue" summary banner shown above the calendar.
export default function OverdueBanner({ overdue, dateLocale }: {
  overdue: OverdueMachine[]
  dateLocale: DateFnsLocale
}) {
  const { t } = useI18n()
  const [expanded, setExpanded] = useState(false)
  const pmTypeLabel = (pmType: string) =>
    t(PM_TYPE_KEYS[pmType] ?? '', PM_TYPE_LABELS[pmType] || pmType)

  if (overdue.length === 0) return null

  return (
    <div className="border-l-4 border-red-500 bg-red-50 rounded-lg p-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 hover:opacity-75 transition-opacity"
      >
        <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
        <div className="flex-1 text-left">
          <p className="font-semibold text-sm text-red-900">
            {t('pm.machinesOverdue', '逾期警示').replace('{count}', String(overdue.length))}
          </p>
        </div>
        <ChevronDown className={`w-4 h-4 text-red-600 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="mt-3 space-y-2 border-t border-red-200 pt-3">
          {overdue.map(m => (
            <div key={m.machine_id} className="bg-white rounded-lg p-2.5 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">
                    {m.machine_code ? `[${m.machine_code}] ` : ''}{m.machine_name}
                  </p>
                  <p className="text-gray-600 mt-0.5">
                    {pmTypeLabel(m.pm_type)}
                  </p>
                  {m.last_maintained_at && (
                    <p className="text-gray-500 mt-0.5">
                      {formatDistanceToNow(new Date(m.last_maintained_at), { addSuffix: true, locale: dateLocale })}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-red-600">
                    {m.days_overdue}d
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
