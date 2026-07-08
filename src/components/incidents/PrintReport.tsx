'use client'

import Link from 'next/link'
import { format } from 'date-fns'
import { Printer, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n'
import { URGENCY_FROM_IMPACT, STATUS_ZH } from '@/lib/incident-display'
import type { IncidentStatus } from '@/types'

export interface ReportUpdateRow {
  id: string
  new_status: string | null
  note: string | null
  updated_by: string | null
  photos: string[]
  created_at: string
}

export interface PartsRequestRow {
  id: string
  items: { name: string; part_no: string; qty: number; unit: string }[]
  urgency: string
  status: 'requested' | 'ordered' | 'received' | 'rejected'
  requested_at: string
}

export interface CostRow {
  cost_type: string
  amount: number | string
}

export interface RelatedIncidentRow {
  id: string
  incident_no: string
  title: string | null
  reported_at: string
  status: string
  completion_type?: string | null
}

interface ReportIncident {
  id: string
  incident_no: string
  title: string | null
  description: string | null
  incident_type: string
  status: string
  downtime_impact: string
  reporter_name: string | null
  reported_at: string
  accepted_at: string | null
  closed_at: string | null
  due_date: string | null
  root_cause: string | null
  completion_type: string | null
  location_note: string | null
}

interface Props {
  incident: ReportIncident
  machine: { machine_code: string | null; machine_name: string } | null
  factory: { name: string; code: string | null } | null
  closedByName: string | null
  repairMethod: string | null
  updates: ReportUpdateRow[]
  reportPhotos: string[]
  partsRequests: PartsRequestRow[]
  costs: CostRow[]
  relatedIncidents: RelatedIncidentRow[]
  supabaseUrl: string
  qrDataUrl: string | null
}

function photoUrl(supabaseUrl: string, path: string) {
  return `${supabaseUrl}/storage/v1/object/public/incident-photos/${path}`
}

// Human duration between two ISO timestamps ("2h 15m" style, localized units
// come from the caller). Returns null when either end is missing.
function durationBetween(fromIso: string | null, toIso: string | null): { hours: number; minutes: number } | null {
  if (!fromIso || !toIso) return null
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return null
  const totalMinutes = Math.round(ms / 60000)
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 }
}

export default function PrintReport({
  incident, machine, factory, closedByName, repairMethod, updates, reportPhotos,
  partsRequests, costs, relatedIncidents, supabaseUrl, qrDataUrl,
}: Props) {
  const { t } = useI18n()

  const statusLabel = (s: string) => t(`boardStatus.${s}`, STATUS_ZH[s as IncidentStatus] || s)
  const urgency = URGENCY_FROM_IMPACT[incident.downtime_impact] ?? { label: incident.downtime_impact, color: '' }
  const urgencyLabel = t(`urgency.${incident.downtime_impact}`, urgency.label)

  const laborCost = costs.filter(c => c.cost_type === 'labor')
    .reduce((sum, c) => sum + (typeof c.amount === 'string' ? parseFloat(c.amount) : c.amount), 0)
  const partsCost = costs.filter(c => c.cost_type === 'parts')
    .reduce((sum, c) => sum + (typeof c.amount === 'string' ? parseFloat(c.amount) : c.amount), 0)
  const otherCost = costs.filter(c => c.cost_type !== 'labor' && c.cost_type !== 'parts')
    .reduce((sum, c) => sum + (typeof c.amount === 'string' ? parseFloat(c.amount) : c.amount), 0)
  const totalCost = laborCost + partsCost + otherCost

  const responseDur = durationBetween(incident.reported_at, incident.accepted_at)
  const repairDur = durationBetween(incident.accepted_at, incident.closed_at)
  const totalDur = durationBetween(incident.reported_at, incident.closed_at)

  const fmtDur = (d: { hours: number; minutes: number } | null) =>
    d ? `${d.hours}${t('printReport.hoursUnit', '時')} ${d.minutes}${t('printReport.minutesUnit', '分')}` : '-'

  const dueMet = incident.due_date
    ? (incident.closed_at
      ? (new Date(incident.closed_at) <= new Date(`${incident.due_date}T23:59:59`)
        ? t('printReport.kpiDueMet', '準時')
        : t('printReport.kpiDueMissed', '逾期'))
      : t('printReport.kpiDueOpen', '尚未結案'))
    : '-'

  const isTemporary = incident.completion_type === 'temporary_fix'
  const isPermanent = incident.completion_type === 'permanent_fix'

  return (
    <div className="bg-white text-black min-h-screen">
      {/* Sticky action bar — hidden on the printed/PDF output */}
      <div className="print:hidden sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-2.5 flex items-center justify-between gap-2">
        <Link
          href={`/incidents/${incident.id}`}
          className="text-sm text-gray-600 inline-flex items-center gap-1 hover:text-gray-900"
        >
          <ArrowLeft className="w-4 h-4" /> {t('printReport.backBtn', '返回工單')}
        </Link>
        <Button size="sm" onClick={() => window.print()} className="gap-1.5">
          <Printer className="w-4 h-4" /> {t('printReport.printBtn', '🖨️ 列印 / 存 PDF')}
        </Button>
      </div>

      <div className="max-w-3xl mx-auto p-6 print:p-0 print:max-w-none space-y-5 print:space-y-3 text-gray-900 print:text-black">
        {/* a. Header */}
        <section className="break-inside-avoid relative border-b border-gray-300 pb-3">
          {qrDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrDataUrl}
              alt="QR"
              className="absolute right-0 top-0 print:top-0"
              style={{ width: 96, height: 96 }}
            />
          )}
          <h1 className="text-lg font-bold pr-28">{t('printReport.reportTitle', '工單檢討報告 / Work Order Review')}</h1>
          <p className="mt-1 font-mono text-sm font-semibold pr-28">{incident.incident_no}</p>
          <h2 className="text-base font-semibold mt-1 pr-28">{incident.title || '-'}</h2>

          <div className="mt-2 text-sm space-y-0.5 pr-28">
            <p>
              {factory?.name || '?'}
              {machine ? ` · ${machine.machine_code ? `[${machine.machine_code}] ` : ''}${machine.machine_name}` : ''}
              {incident.location_note ? ` · ${incident.location_note}` : ''}
            </p>
            <p>{t('printReport.urgencyLabel', '緊急度')}: {urgencyLabel}</p>
            {incident.reporter_name && (
              <p>{t('printReport.reporter', '回報人')}: {incident.reporter_name}</p>
            )}
            <p>{t('printReport.reportedAt', '回報時間')}: {format(new Date(incident.reported_at), 'yyyy-MM-dd HH:mm')}</p>
            <p>{t('printReport.currentStatus', '目前狀態')}: {statusLabel(incident.status)}</p>
          </div>
        </section>

        {/* b. 問題描述 */}
        <section className="break-inside-avoid">
          <h3 className="font-semibold text-sm border-b border-gray-200 pb-1 mb-2">
            {t('printReport.sectionProblem', '問題描述')}
          </h3>
          <p className="text-sm whitespace-pre-wrap">{incident.description || '-'}</p>
          {reportPhotos.length > 0 && (
            <div className="grid grid-cols-4 gap-2 mt-2">
              {reportPhotos.map(p => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={p}
                  src={photoUrl(supabaseUrl, p)}
                  alt=""
                  className="w-full object-cover rounded border border-gray-200"
                  style={{ height: '4cm' }}
                />
              ))}
            </div>
          )}
        </section>

        {/* c. 處理過程 */}
        <section className="break-inside-avoid">
          <h3 className="font-semibold text-sm border-b border-gray-200 pb-1 mb-2">
            {t('printReport.sectionProcess', '處理過程')}
          </h3>
          {updates.length === 0 ? (
            <p className="text-sm text-gray-500">{t('printReport.noUpdates', '尚無處理記錄')}</p>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left border-b border-gray-300">
                  <th className="py-1 pr-2 font-medium w-32">{t('printReport.colTime', '時間')}</th>
                  <th className="py-1 pr-2 font-medium w-24">{t('printReport.colPerson', '人員')}</th>
                  <th className="py-1 pr-2 font-medium w-28">{t('printReport.colStatus', '狀態')}</th>
                  <th className="py-1 font-medium">{t('printReport.colNote', '備註')}</th>
                </tr>
              </thead>
              <tbody>
                {updates.map(u => (
                  <tr key={u.id} className="border-b border-gray-100 align-top break-inside-avoid">
                    <td className="py-1.5 pr-2 whitespace-nowrap">{format(new Date(u.created_at), 'yyyy-MM-dd HH:mm')}</td>
                    <td className="py-1.5 pr-2">{u.updated_by || '-'}</td>
                    <td className="py-1.5 pr-2">{u.new_status ? statusLabel(u.new_status) : '-'}</td>
                    <td className="py-1.5">
                      <p className="whitespace-pre-wrap">{u.note || '-'}</p>
                      {u.photos.length > 0 && (
                        <div className="grid grid-cols-4 gap-1.5 mt-1">
                          {u.photos.map(p => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              key={p}
                              src={photoUrl(supabaseUrl, p)}
                              alt=""
                              className="w-full object-cover rounded border border-gray-200"
                              style={{ height: '3cm' }}
                            />
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* d. 原因與修復 */}
        <section className="break-inside-avoid">
          <h3 className="font-semibold text-sm border-b border-gray-200 pb-1 mb-2">
            {t('printReport.sectionCause', '原因與修復')}
          </h3>
          <div className="text-sm space-y-1">
            <p><span className="font-medium">{t('printReport.rootCause', '原因分析')}:</span> {incident.root_cause || '-'}</p>
            <p><span className="font-medium">{t('printReport.repairMethod', '修復方式')}:</span> {repairMethod || '-'}</p>
            <p>
              <span className="font-medium">{t('printReport.completionType', '完成類型')}:</span>{' '}
              {isTemporary ? (
                <span className="font-bold">⚠ {t('printReport.completionTemp', '臨時修復')}</span>
              ) : isPermanent ? (
                t('printReport.completionPermanent', '永久修復')
              ) : (
                '-'
              )}
            </p>
            <p><span className="font-medium">{t('printReport.closedAt', '結案時間')}:</span> {incident.closed_at ? format(new Date(incident.closed_at), 'yyyy-MM-dd HH:mm') : '-'}</p>
            <p><span className="font-medium">{t('printReport.closedBy', '結案人')}:</span> {closedByName || '-'}</p>
          </div>
        </section>

        {/* e. 成本 */}
        <section className="break-inside-avoid">
          <h3 className="font-semibold text-sm border-b border-gray-200 pb-1 mb-2">
            {t('printReport.sectionCost', '成本')}
          </h3>
          <div className="text-sm flex flex-wrap gap-x-6 gap-y-1 mb-2">
            <span>{t('printReport.laborCost', '工時費')}: <b>{laborCost.toLocaleString()}</b></span>
            <span>{t('printReport.partsCost', '零件費')}: <b>{partsCost.toLocaleString()}</b></span>
            <span>{t('printReport.totalCost', '總計')}: <b>{totalCost.toLocaleString()}</b></span>
          </div>
          {partsRequests.length === 0 ? (
            <p className="text-sm text-gray-500">{t('printReport.noParts', '無叫料記錄')}</p>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left border-b border-gray-300">
                  <th className="py-1 pr-2 font-medium">{t('printReport.colPartName', '品項')}</th>
                  <th className="py-1 pr-2 font-medium w-28">{t('printReport.colPartStatus', '狀態')}</th>
                </tr>
              </thead>
              <tbody>
                {partsRequests.map(r => (
                  <tr key={r.id} className="border-b border-gray-100">
                    <td className="py-1 pr-2">
                      {r.items.map(it => `${it.name} ×${it.qty}${it.unit || ''}`).join('、')}
                    </td>
                    <td className="py-1 pr-2">{t(`gudang.status.${r.status}`, r.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* f. 時效 KPI */}
        <section className="break-inside-avoid">
          <h3 className="font-semibold text-sm border-b border-gray-200 pb-1 mb-2">
            {t('printReport.sectionKpi', '時效 KPI')}
          </h3>
          <div className="text-sm flex flex-wrap gap-x-6 gap-y-1">
            <span>{t('printReport.kpiResponse', '回報 → 接單')}: <b>{fmtDur(responseDur)}</b></span>
            <span>{t('printReport.kpiRepair', '接單 → 結案')}: <b>{fmtDur(repairDur)}</b></span>
            <span>{t('printReport.kpiTotal', '總花費時間')}: <b>{fmtDur(totalDur)}</b></span>
            <span>{t('printReport.kpiDueDate', '預計完成')}: <b>{incident.due_date ? format(new Date(incident.due_date), 'yyyy-MM-dd') : '-'}</b> ({dueMet})</span>
          </div>
        </section>

        {/* g. 同機台近 90 天工單 */}
        {machine && (
          <section className="break-inside-avoid">
            <h3 className="font-semibold text-sm border-b border-gray-200 pb-1 mb-2">
              {t('printReport.sectionRepeat', '同機台近 90 天工單')}
            </h3>
            {relatedIncidents.length === 0 ? (
              <p className="text-sm text-gray-500">{t('printReport.noRepeat', '無')}</p>
            ) : (
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left border-b border-gray-300">
                    <th className="py-1 pr-2 font-medium w-28">{t('printReport.colIncidentNo', '工單編號')}</th>
                    <th className="py-1 pr-2 font-medium w-24">{t('printReport.colDate', '日期')}</th>
                    <th className="py-1 pr-2 font-medium">{t('printReport.colTitle', '標題')}</th>
                    <th className="py-1 font-medium w-24">{t('printReport.colStatus', '狀態')}</th>
                  </tr>
                </thead>
                <tbody>
                  {relatedIncidents.map(r => (
                    <tr key={r.id} className="border-b border-gray-100">
                      <td className="py-1 pr-2 font-mono">{r.incident_no}</td>
                      <td className="py-1 pr-2 whitespace-nowrap">{format(new Date(r.reported_at), 'yyyy-MM-dd')}</td>
                      <td className="py-1 pr-2">{r.title || '-'}</td>
                      <td className="py-1">{statusLabel(r.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}

        {/* h. Signature block */}
        <section className="break-inside-avoid pt-6">
          <div className="grid grid-cols-3 gap-6 text-sm">
            <div>
              <div className="border-b border-gray-400 h-10" />
              <p className="mt-1 text-gray-600">{t('printReport.signReviewer', '檢討人')}</p>
            </div>
            <div>
              <div className="border-b border-gray-400 h-10" />
              <p className="mt-1 text-gray-600">{t('printReport.signApprover', '主管核准')}</p>
            </div>
            <div>
              <div className="border-b border-gray-400 h-10" />
              <p className="mt-1 text-gray-600">{t('printReport.signDate', '日期')}</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
