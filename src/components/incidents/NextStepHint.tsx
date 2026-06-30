'use client'

import { Lightbulb, CheckCircle2, ArrowRight } from 'lucide-react'
import type { IncidentStatus } from '@/types'
import { useI18n } from '@/lib/i18n'
import { isTerminalStatus, nextStepKey } from '@/lib/incident-next-step'

/**
 * "What should I do next?" guidance for a case's current status.
 *
 * - `banner` (default): a highlighted card for the incident detail page.
 * - `inline`: a compact one-liner for dense lists (board cards).
 *
 * Closed cases render a "done" variant (green + checkmark) suggesting the
 * follow-up (knowledge base entry) instead of a forward action.
 */
export default function NextStepHint({
  status,
  variant = 'banner',
}: {
  status: IncidentStatus
  variant?: 'banner' | 'inline'
}) {
  const { t } = useI18n()
  const done = isTerminalStatus(status)
  const text = t(nextStepKey(status))

  if (variant === 'inline') {
    return (
      <p className="flex items-start gap-1 text-xs text-gray-500">
        {done ? (
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5 text-green-500" />
        ) : (
          <ArrowRight className="w-3.5 h-3.5 shrink-0 mt-0.5 text-blue-500" />
        )}
        <span>{text}</span>
      </p>
    )
  }

  return (
    <div
      className={`rounded-xl border p-3 flex items-start gap-2.5 ${
        done ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'
      }`}
    >
      {done ? (
        <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-green-600" />
      ) : (
        <Lightbulb className="w-5 h-5 shrink-0 mt-0.5 text-blue-600" />
      )}
      <div>
        <p className={`text-xs font-semibold ${done ? 'text-green-700' : 'text-blue-700'}`}>
          {done ? t('nextStep.doneLabel') : t('nextStep.label')}
        </p>
        <p className={`text-sm mt-0.5 ${done ? 'text-green-900' : 'text-blue-900'}`}>{text}</p>
      </div>
    </div>
  )
}
