'use client'

import Link from 'next/link'
import { Check, AlertTriangle, Circle, ClipboardCheck, ExternalLink } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { MACHINE_STATUS_LABELS, MACHINE_STATUS_COLORS } from '@/types'

export interface QCArea {
  id: string
  name: string
  code: string | null
}

export interface QCMachine {
  id: string
  areaId: string
  name: string
  code: string | null
  status: 'running' | 'repairing' | 'standby' | 'scrapped'
  /** Today's tick from FQMS, or null when this machine hasn't been checked. */
  result: 'ok' | 'issue' | null
  note: string | null
  checkedBy: string | null
  /** Set when maintenance has an open case on this machine. */
  openIncidentNo: string | null
  openIncidentId: string | null
}

// READ-ONLY. The daily ticking happens in FQMS, which posts the round back to
// /api/external/qc-check — this page shows what arrived.
//
// It deliberately has no tick buttons: QC signing off the same machine in both
// systems is double entry, and the two records would disagree the first time
// someone only did one of them. What FAMMS needs from this data is the
// maintenance view — which machines got flagged today, and which never got
// looked at — not a second place to record it.
export default function QCDailyCheck({
  areas, machines, orphanCount, today,
}: {
  areas: QCArea[]
  machines: QCMachine[]
  orphanCount: number
  today: string
}) {
  const { t } = useI18n()

  const checked = machines.filter(m => m.result !== null).length
  const issues = machines.filter(m => m.result === 'issue').length
  const complete = machines.length > 0 && checked === machines.length

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
          <ClipboardCheck className="w-6 h-6 text-blue-600" />
          {t('qc.title', '每日點檢')}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {today} · {t('qc.sourceHint', '由 FQMS 回傳，此頁唯讀')}
        </p>
      </div>

      {/* Progress + issue count — the two numbers a supervisor wants. */}
      <div className="grid grid-cols-2 gap-2 lg:gap-3">
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-[13px] font-medium text-gray-500">{t('qc.progress', '今日進度')}</span>
            <span className="text-sm font-bold text-gray-900">{checked} / {machines.length}</span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-gray-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${complete ? 'bg-green-500' : 'bg-blue-500'}`}
              style={{ width: machines.length ? `${(checked / machines.length) * 100}%` : '0%' }}
            />
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-4 text-center">
          <p className={`text-2xl font-bold ${issues > 0 ? 'text-red-600' : 'text-green-600'}`}>{issues}</p>
          <p className="text-[13px] text-gray-500 mt-0.5">{t('qc.issuesToday', '今日異常')}</p>
        </div>
      </div>

      {machines.length === 0 && (
        <div className="bg-white rounded-2xl shadow-sm p-6 text-center">
          <p className="text-sm text-gray-500">{t('qc.noMachines', '這個工廠還沒有登錄機器')}</p>
          <Link href="/machines/new" className="mt-2 inline-block text-sm font-medium text-blue-600">
            {t('qc.addMachine', '新增機器 →')}
          </Link>
        </div>
      )}

      {areas.map(area => {
        const rows = machines.filter(m => m.areaId === area.id)
        const done = rows.filter(m => m.result !== null).length
        return (
          <section key={area.id}>
            <h2 className="font-semibold text-gray-700 text-sm mb-2 flex items-center justify-between">
              <span>{area.code ? `[${area.code}] ` : ''}{area.name}</span>
              <span className={`text-xs font-medium ${done === rows.length ? 'text-green-600' : 'text-gray-400'}`}>
                {done}/{rows.length}
              </span>
            </h2>
            <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-100">
              {rows.map(m => <MachineRow key={m.id} machine={m} t={t} />)}
            </div>
          </section>
        )
      })}

      {orphanCount > 0 && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {t('qc.orphanWarning', '有 {count} 台機器的區域讀不到，請檢查機器主檔').replace('{count}', String(orphanCount))}
        </p>
      )}
    </div>
  )
}

function MachineRow({ machine, t }: {
  machine: QCMachine
  t: (key: string, fallback?: string) => string
}) {
  const label = `${machine.code ? `[${machine.code}] ` : ''}${machine.name}`

  // Unchecked is a real state, not an absence — a machine nobody looked at is
  // exactly what a supervisor is scanning this page for, so it gets its own
  // marker rather than just being blank.
  const mark = machine.result === 'ok'
    ? { icon: <Check className="w-4 h-4" />, cls: 'bg-green-100 text-green-700', label: t('qc.resultOk', '正常') }
    : machine.result === 'issue'
      ? { icon: <AlertTriangle className="w-4 h-4" />, cls: 'bg-red-100 text-red-700', label: t('qc.resultIssue', '有問題') }
      : { icon: <Circle className="w-4 h-4" />, cls: 'bg-gray-100 text-gray-400', label: t('qc.notChecked', '未檢查') }

  const body = (
    <>
      <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${mark.cls}`} aria-hidden>
        {mark.icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900 truncate">{label}</p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="sr-only">{mark.label}</span>
          <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${MACHINE_STATUS_COLORS[machine.status]}`}>
            {MACHINE_STATUS_LABELS[machine.status]}
          </span>
          {machine.openIncidentNo && (
            <span className="text-[11px] text-amber-700 inline-flex items-center gap-0.5">
              {machine.openIncidentNo} <ExternalLink className="w-3 h-3" />
            </span>
          )}
        </div>
        {(machine.note || machine.checkedBy) && (
          <p className="text-xs text-gray-500 mt-1 truncate">
            {machine.note}
            {machine.note && machine.checkedBy ? ' · ' : ''}
            {machine.checkedBy}
          </p>
        )}
      </div>
    </>
  )

  // A flagged machine links straight to its work order — that's the whole
  // reason maintenance opens this page.
  return machine.openIncidentId ? (
    <Link href={`/incidents/${machine.openIncidentId}`} className="flex items-start gap-3 p-3 active:bg-gray-50">
      {body}
    </Link>
  ) : (
    <div className="flex items-start gap-3 p-3">{body}</div>
  )
}
