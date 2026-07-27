'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { Check, AlertTriangle, Loader2, ClipboardCheck, ChevronRight } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
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
  /** Today's tick, or null when this machine hasn't been checked yet. */
  result: 'ok' | 'issue' | null
  note: string | null
  checkedBy: string | null
  /** Set when maintenance already has an open case on this machine. */
  openIncidentNo: string | null
}

// The daily walk-round. Deliberately a flat list per area with two big
// buttons per machine, not a form: this is used one-handed on a tablet while
// walking a production floor, often with gloves on.
export default function QCDailyCheck({
  areas, machines, orphanCount, today, userName,
}: {
  areas: QCArea[]
  machines: QCMachine[]
  orphanCount: number
  today: string
  userName: string | null
}) {
  const { t } = useI18n()
  const router = useRouter()
  // Which machine's "report a problem" panel is open.
  const [reporting, setReporting] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const checked = machines.filter(m => m.result !== null).length

  async function submitCheck(
    machine: QCMachine,
    result: 'ok' | 'issue',
    note = '',
    machineStopped = false,
  ) {
    setBusy(machine.id)
    try {
      const res = await fetch('/api/qc/checks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ machine_id: machine.id, result, note, machine_stopped: machineStopped }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || t('qc.saveFailed', '儲存失敗'))

      if (result === 'ok') {
        toast.success(t('qc.markedOk', '已確認正常'))
      } else {
        toast.success(
          t('qc.issueFiled', '已開工單 {no}').replace('{no}', json.incident_no ?? ''),
          { duration: 6000 },
        )
      }
      setReporting(null)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('qc.saveFailed', '儲存失敗'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
          <ClipboardCheck className="w-6 h-6 text-blue-600" />
          {t('qc.title', '每日點檢')}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {today} · {userName || ''}
        </p>
      </div>

      {/* Overall progress — the one number a supervisor wants at a glance. */}
      <div className="bg-white rounded-2xl shadow-sm p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium text-gray-700">{t('qc.progress', '今日進度')}</span>
          <span className="text-sm font-bold text-gray-900">
            {checked} / {machines.length}
          </span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-gray-100 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${checked === machines.length && machines.length > 0 ? 'bg-green-500' : 'bg-blue-500'}`}
            style={{ width: machines.length ? `${(checked / machines.length) * 100}%` : '0%' }}
          />
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
              {rows.map(m => (
                <MachineRow
                  key={m.id}
                  machine={m}
                  busy={busy === m.id}
                  reporting={reporting === m.id}
                  onOpenReport={() => setReporting(m.id)}
                  onCancelReport={() => setReporting(null)}
                  onOk={() => submitCheck(m, 'ok')}
                  onIssue={(note, stopped) => submitCheck(m, 'issue', note, stopped)}
                  t={t}
                />
              ))}
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

function MachineRow({
  machine, busy, reporting, onOpenReport, onCancelReport, onOk, onIssue, t,
}: {
  machine: QCMachine
  busy: boolean
  reporting: boolean
  onOpenReport: () => void
  onCancelReport: () => void
  onOk: () => void
  onIssue: (note: string, machineStopped: boolean) => void
  t: (key: string, fallback?: string) => string
}) {
  const [note, setNote] = useState('')
  const [stopped, setStopped] = useState(false)

  const label = `${machine.code ? `[${machine.code}] ` : ''}${machine.name}`

  return (
    <div className="p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900 truncate">{label}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${MACHINE_STATUS_COLORS[machine.status]}`}>
              {MACHINE_STATUS_LABELS[machine.status]}
            </span>
            {/* Already-open case: the reason not to file a duplicate. */}
            {machine.openIncidentNo && (
              <span className="text-[11px] text-amber-700">
                {t('qc.hasOpenCase', '已有工單')} {machine.openIncidentNo}
              </span>
            )}
          </div>
          {machine.result !== null && (
            <p className="text-xs text-gray-500 mt-1">
              {machine.result === 'ok'
                ? `✅ ${t('qc.resultOk', '正常')}`
                : `⚠️ ${t('qc.resultIssue', '有問題')}`}
              {machine.checkedBy ? ` · ${machine.checkedBy}` : ''}
              {machine.note ? ` · ${machine.note}` : ''}
            </p>
          )}
        </div>

        {!reporting && (
          <div className="flex gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onOk}
              disabled={busy}
              aria-label={t('qc.markOk', '正常')}
              className={`w-11 h-11 rounded-xl flex items-center justify-center border transition-colors disabled:opacity-50 ${
                machine.result === 'ok'
                  ? 'bg-green-600 border-green-600 text-white'
                  : 'bg-white border-gray-300 text-green-600 hover:border-green-400'
              }`}
            >
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
            </button>
            <button
              type="button"
              onClick={onOpenReport}
              disabled={busy}
              aria-label={t('qc.markIssue', '有問題')}
              className={`w-11 h-11 rounded-xl flex items-center justify-center border transition-colors disabled:opacity-50 ${
                machine.result === 'issue'
                  ? 'bg-red-600 border-red-600 text-white'
                  : 'bg-white border-gray-300 text-red-600 hover:border-red-400'
              }`}
            >
              <AlertTriangle className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>

      {reporting && (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 space-y-3">
          <Textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder={t('qc.notePlaceholder', '看到什麼問題？例如：bearing 有異音')}
            rows={2}
            autoFocus
          />
          {/* The one judgement call QC makes. Only this flips the machine to
              維修中 — see lib/qc-check.ts for why a non-stopping fault
              deliberately leaves the machine running. */}
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={stopped}
              onChange={e => setStopped(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-red-600 shrink-0"
            />
            <span className="text-sm text-gray-800">
              {t('qc.machineStopped', '機器已停機（會轉成「維修中」並列為緊急）')}
            </span>
          </label>
          <div className="flex gap-2">
            <Button
              onClick={() => onIssue(note, stopped)}
              disabled={busy}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('qc.fileIssue', '送出並開工單')}
            </Button>
            <Button variant="outline" onClick={onCancelReport} disabled={busy}>
              {t('common.cancel', '取消')}
            </Button>
          </div>
        </div>
      )}

      {machine.result === 'issue' && machine.openIncidentNo && !reporting && (
        <Link
          href="/incidents"
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-600"
        >
          {t('qc.viewCase', '查看工單')} <ChevronRight className="w-3 h-3" />
        </Link>
      )}
    </div>
  )
}
