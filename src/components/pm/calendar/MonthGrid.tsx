'use client'

import { useI18n } from '@/lib/i18n'
import { DAY_ABBRS, STATUS_DOT, type PMTask } from './types'

// Dot priority for a day: which colored dots to render (deduped, capped)
function dayDots(tasks: PMTask[]) {
  const set = new Set(tasks.map(task => task.status))
  const order = ['overdue', 'pending', 'scheduled', 'completed', 'skipped']
  return order.filter(s => set.has(s as PMTask['status']))
}

export default function MonthGrid({
  calendarDays, eventMap, today, selectedDate, onSelectDate,
}: {
  calendarDays: (string | null)[]
  eventMap: Record<string, PMTask[]>
  today: string
  selectedDate: string | null
  onSelectDate: (date: string | null) => void
}) {
  const { t } = useI18n()
  const dayAbbr = (idx: number) => t(`weekdays.${idx}`, DAY_ABBRS[idx])

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="grid grid-cols-7 border-b border-gray-100">
        {DAY_ABBRS.map((d, i) => (
          <div key={d} className="text-center text-xs font-medium text-gray-400 py-2">{dayAbbr(i)}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {calendarDays.map((dateStr, idx) => {
          const tasks = dateStr ? (eventMap[dateStr] || []) : []
          const isToday = dateStr === today
          const isSelected = dateStr === selectedDate
          const dots = dayDots(tasks)

          return (
            <div
              key={idx}
              onClick={() => dateStr && onSelectDate(isSelected ? null : dateStr)}
              className={`min-h-14 p-1 border-b border-r border-gray-100 transition-colors ${
                !dateStr ? 'bg-gray-50' :
                isSelected ? 'bg-blue-50 cursor-pointer' :
                'hover:bg-gray-50 cursor-pointer'
              }`}
            >
              {dateStr && (
                <>
                  <div className={`text-xs font-semibold w-5 h-5 flex items-center justify-center rounded-full mb-1 ${
                    isToday ? 'bg-blue-600 text-white' : 'text-gray-700'
                  }`}>
                    {parseInt(dateStr.split('-')[2])}
                  </div>
                  <div className="flex flex-wrap gap-0.5">
                    {dots.map(s => (
                      <div key={s} className={`w-2 h-2 rounded-full ${STATUS_DOT[s]}`} />
                    ))}
                    {tasks.length > 1 && (
                      <span className="text-xs text-gray-400 leading-none self-end">{tasks.length}</span>
                    )}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
