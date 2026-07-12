'use client'

import { Lightbulb, BookOpen, ClipboardList, ExternalLink } from 'lucide-react'
import { format } from 'date-fns'
import { useI18n } from '@/lib/i18n'
import type { PastIncident, KBMatch } from '@/lib/hooks/usePastRecords'

// "This happened before" panel shown inside the report form (and reusable
// elsewhere). Renders nothing when there is nothing to show — it must never
// add noise to a first-ever report on a new machine.
export default function PastRecordsPanel({
  pastIncidents,
  kbEntries,
}: {
  pastIncidents: PastIncident[]
  kbEntries: KBMatch[]
}) {
  const { t } = useI18n()
  if (pastIncidents.length === 0 && kbEntries.length === 0) return null

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 space-y-2.5">
      <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
        <Lightbulb className="w-4 h-4 shrink-0" />
        {t('pastRecords.heading', '這裡有以前的紀錄')}
      </div>

      {pastIncidents.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-amber-800">
            {t('pastRecords.machineHistory', '這台機器最近的工單')}
          </p>
          {pastIncidents.map(inc => (
            <a
              key={inc.id}
              href={`/incidents/${inc.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-2 bg-white/70 border border-amber-100 rounded-lg px-2.5 py-2 text-sm text-gray-800 hover:bg-white"
            >
              <ClipboardList className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{inc.title}</span>
                <span className="block text-xs text-gray-400">
                  {inc.incident_no} · {format(new Date(inc.reported_at), 'yyyy-MM-dd')} · {t(`boardStatus.${inc.status}`, inc.status)}
                </span>
              </span>
              <ExternalLink className="w-3 h-3 text-gray-300 shrink-0 mt-1" />
            </a>
          ))}
        </div>
      )}

      {kbEntries.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-amber-800">
            {t('pastRecords.kbMatches', '知識庫相關經驗')}
          </p>
          {kbEntries.map(kb => (
            <a
              key={kb.id}
              href={`/knowledge-base/${kb.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-2 bg-white/70 border border-amber-100 rounded-lg px-2.5 py-2 text-sm text-gray-800 hover:bg-white"
            >
              <BookOpen className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{kb.problem}</span>
                <span className="block text-xs text-gray-500 truncate">
                  {t('pastRecords.fixWas', '當時修法')}：{kb.repair_method}
                </span>
              </span>
              <ExternalLink className="w-3 h-3 text-gray-300 shrink-0 mt-1" />
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
