'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { deadlineFromUrgency } from '@/lib/incident-display'
import { useIncidentTypes } from '@/lib/useIncidentTypes'
import { useIncidentTypeLabel } from '@/lib/incident-type-label'
import { useReportLocation } from '@/lib/hooks/useReportLocation'
import { useReporterAccounts } from '@/lib/hooks/useReporterAccounts'
import { usePhotoCapture } from '@/lib/hooks/usePhotoCapture'
import { usePastRecords } from '@/lib/hooks/usePastRecords'
import { submitIncidentReport } from '@/lib/incidents/submitIncidentReport'
import { enqueueReport, isNetworkError } from '@/lib/offline-queue'
import ReportLocationFields from './report/ReportLocationFields'
import PhotoPicker from '@/components/shared/PhotoPicker'
import PastRecordsPanel from './report/PastRecordsPanel'
import SpeechMicButton from '@/components/shared/SpeechMicButton'

interface IssueType { value: string; label: string }

// Three urgency levels (mapped to impact codes A / C / D). "High" (B) is
// retired from the picker but still renders for any legacy incident that has it.
const URGENCY = [
  { value: 'critical', labelKey: 'report.urgencyCritical', descKey: 'report.urgencyCriticalDesc' },
  { value: 'medium', labelKey: 'report.urgencyMedium', descKey: 'report.urgencyMediumDesc' },
  { value: 'low', labelKey: 'report.urgencyLow', descKey: 'report.urgencyLowDesc' },
]

export default function IncidentForm({ presetMachineId }: { presetMachineId?: string } = {}) {
  const router = useRouter()
  const supabase = createClient()
  const { t } = useI18n()

  const location = useReportLocation(presetMachineId)
  const reporter = useReporterAccounts()
  const photoCapture = usePhotoCapture(5)

  const { types: cachedTypes } = useIncidentTypes()
  const typeLabel = useIncidentTypeLabel()
  // Fallback list used if the incident_types table is empty/unavailable.
  // Built from i18n (issueTypes.*) so an Indonesian-locale user never sees a
  // hardcoded Chinese label — fallback strings below are only used if a
  // locale is somehow missing the key.
  const DEFAULT_ISSUE_TYPES: IssueType[] = [
    { value: 'machine', label: t('issueTypes.machine', '🔧 機器故障') },
    { value: 'pipe', label: t('issueTypes.pipe', '🚿 水管/管線') },
    { value: 'electrical', label: t('issueTypes.electrical', '💡 電力/照明') },
    { value: 'facility', label: t('issueTypes.facility', '🏭 設施/基礎建設') },
    { value: 'safety', label: t('issueTypes.safety', '⚠️ 安全問題') },
    { value: 'cleanliness', label: t('issueTypes.cleanliness', '🧹 衛生/清潔') },
    { value: 'other', label: t('issueTypes.other', '📋 其他') },
  ]
  // Use shared cache when populated; otherwise the built-in defaults. Labels
  // follow the active app language.
  const issueTypes: IssueType[] = cachedTypes.length > 0
    ? cachedTypes.map(ct => ({ value: ct.code, label: typeLabel(ct.code) }))
    : DEFAULT_ISSUE_TYPES

  const [locationNote, setLocationNote] = useState('')
  const [issueType, setIssueType] = useState('machine')
  const hasSelectedIssueType = issueTypes.some(type => type.value === issueType)
  const [urgency, setUrgency] = useState('medium')
  const [dueDate, setDueDate] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [reportingForSomeoneElse, setReportingForSomeoneElse] = useState(false)
  const [reporterOverride, setReporterOverride] = useState('')
  // Generated ONCE per logical report (not per submit attempt) so that a retry
  // after a flaky-signal timeout — user hits submit again because it looked
  // like it failed — is recognized as the same report instead of creating a
  // duplicate incident. See submitIncidentReport's idempotency check.
  // Regenerated only after a successful offline enqueue, where the form stays
  // on screen for the NEXT report — reusing the id there would make the queue
  // treat two different reports as the same one.
  const [clientRequestId, setClientRequestId] = useState(() => crypto.randomUUID())

  // Past incidents on the picked machine + KB entries matching the typed
  // problem — surfaced live in the form so last time's fix is one tap away.
  const { pastIncidents, kbEntries } = usePastRecords(location.assetId, description)
  const reporterName = reporter.isSharedDevice
    ? reporter.reporterName.trim()
    : reportingForSomeoneElse ? reporterOverride.trim() : reporter.defaultReporterName.trim()

  async function submit() {
    if (reporter.identityStatus !== 'ready') {
      toast.error(t(reporter.identityStatus === 'loading' ? 'report.identityLoading' : 'report.identityLoadFailed'))
      return
    }
    if (!location.factoryId || !description.trim()) {
      toast.error(t('report.fillRequired'))
      return
    }
    if (!hasSelectedIssueType) {
      toast.error(t('report.specifyType'))
      return
    }
    if ((reporter.isSharedDevice && !reporterName) || (reportingForSomeoneElse && !reporterName)) {
      toast.error(t('report.reporterRequired', '請填寫實際回報人的姓名'))
      return
    }
    // Title is auto-derived from the description (same truncation rule as
    // the Telegram /lapor flow — see handleNewReportUrgency) so the reporter
    // only ever fills in one field.
    const trimmedDesc = description.trim()
    const title = trimmedDesc.length > 60 ? `${trimmedDesc.slice(0, 57)}...` : trimmedDesc
    // For "other", use the problem title as the incident type label on the board.
    // 'other' stays literally 'other'. It used to store the short title as a
    // pseudo-type, but since the title/description merge the title IS the
    // first 60 chars of the description — storing a whole sentence as the
    // type broke the board's type chip and made repeat-failure matching
    // (same machine + same incident_type) never match for 'other' cases.
    const incidentType = issueType

    // Deadline = manual pick if given, else auto-derived from urgency (SLA).
    const impactCode = urgency === 'critical' ? 'A' : urgency === 'medium' ? 'C' : 'D'
    const computedDueDate = dueDate || deadlineFromUrgency(impactCode)

    setSubmitting(true)
    // Save the report on this device instead of losing it. Called both when
    // the device is already offline (don't even try) and when a submit dies
    // mid-flight on a network error — the plant has dead-signal corners, and
    // a technician standing at the broken machine must be able to finish and
    // walk away. The queued copy keeps this form's clientRequestId, so the
    // later auto-send can't create a duplicate (see offline-queue.ts).
    async function queueOffline(userId: string | null): Promise<boolean> {
      try {
        await enqueueReport({
          clientRequestId,
          queuedAt: Date.now(),
          factoryId: location.factoryId,
          incidentType,
          machineId: location.assetId || null,
          title,
          description,
          reporterName,
          impactCode,
          dueDate: computedDueDate,
          locationNote,
          userId,
          photos: photoCapture.photos.map(f => ({ name: f.name, type: f.type, blob: f })),
        })
        location.rememberLocation()
        // STAY on the form — do not navigate. Offline, a client-side route
        // change needs a server round trip for the RSC payload, so
        // router.push('/incidents') just stalled: on a real phone the submit
        // looked like it did nothing (caught in live testing). This page is
        // already loaded and working; clear the per-report fields so the next
        // report can be filed immediately, keep the location/type/urgency
        // (repeat reports are usually from the same spot), and mint a fresh
        // clientRequestId — reusing it would make the queue see the NEXT
        // report as a duplicate of this one.
        setDescription('')
        setDueDate('')
        setLocationNote('')
        photoCapture.resetPhotos()
        setClientRequestId(crypto.randomUUID())
        toast.success(t('report.savedOffline', '已存在這台裝置 — 有訊號時會自動送出'), { duration: 6000 })
        return true
      } catch {
        return false // IndexedDB unavailable (private mode) — fall through
      }
    }

    try {
      // Already offline: skip the doomed round trip entirely.
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        const { data: { user: offlineUser } } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }))
        if (await queueOffline(offlineUser?.id ?? null)) return
      }

      const { data: { user } } = await supabase.auth.getUser()
      const { incident_no, id, photoUploadFailed, potentialRepeatOf } = await submitIncidentReport(supabase, {
        factoryId: location.factoryId,
        incidentType,
        machineId: location.assetId || null,
        title,
        description,
        reporterName,
        impactCode,
        dueDate: computedDueDate,
        locationNote,
        photos: photoCapture.photos,
        userId: user?.id ?? null,
        clientRequestId,
      })

      if (photoUploadFailed) toast.warning('工單已建立，但照片上傳失敗')
      location.rememberLocation()
      toast.success(`工單 ${incident_no} 已建立`)
      // A candidate repeat failure gets surfaced on the new incident's own
      // detail page (not here) — that's where the viewer's role is known
      // server-side, so only a supervisor+ actually sees the confirm prompt.
      // Navigation is never blocked on this either way.
      router.push(potentialRepeatOf ? `/incidents/${id}?repeatOf=${potentialRepeatOf.id}` : `/incidents/${id}`)
    } catch (err) {
      // Signal dropped mid-submit — queue rather than making them retype.
      // Only for network-shaped failures: a server REJECTION (validation, RLS)
      // would just fail again on every flush, so those still surface as errors.
      if (isNetworkError(err) && await queueOffline(null)) return
      // Supabase errors (PostgrestError / StorageError) are plain objects with
      // a `message`, NOT Error instances — extract it so the real cause shows.
      const msg =
        err instanceof Error ? err.message
        : (err && typeof err === 'object' && 'message' in err) ? String((err as { message: unknown }).message)
        : t('report.submitFailed')
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const submitDisabled =
    submitting || reporter.identityStatus !== 'ready' || !hasSelectedIssueType || !location.factoryId || !description.trim() ||
    ((reporter.isSharedDevice || reportingForSomeoneElse) && !reporterName)

  return (
    // Extra bottom padding on phone clears the fixed submit bar (which itself
    // sits above BottomNav) — see the fixed bar below. Not needed on desktop,
    // where submit is inline.
    <div className="space-y-4 lg:space-y-5 pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">{t('report.title')}</h1>
        <p className="text-base text-gray-500 mt-1">{t('report.subtitle')}</p>
      </div>

      {/* Two-column on tablet and desktop so the form uses horizontal space instead of
          a single narrow stack. On phone the two column divs simply stack
          full-width one after another, which is exactly the intended reading
          order: reporter → ①location → ②issue text → photos → ③urgency. */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] md:items-start md:gap-5 lg:gap-6">
      {/* ---- Left column (desktop) / top of page (phone) ---- */}
      <div className="min-w-0 space-y-4">
      {/* Personal sessions use the authenticated profile by default. Only
          shared-device sessions or explicit on-behalf reports need this field. */}
      {reporter.identityStatus === 'error' && <p role="alert" className="text-sm text-red-700">{t('report.identityLoadFailed')}</p>}
      {reporter.isSharedDevice ? <div>
        <Label htmlFor="shared-reporter-name" className="text-sm">
          {t('report.reporterName')}
          <span className="text-red-500 ml-0.5">*</span>
        </Label>
        <p className="text-xs text-amber-700 mt-0.5">
          {t('report.sharedDeviceHint', '這是共用裝置，請輸入實際回報人的姓名')}
        </p>
        <Input
          id="shared-reporter-name"
          value={reporter.reporterName}
          onChange={e => reporter.setReporterName(e.target.value)}
          placeholder={t('report.reporterPlaceholder')}
          className="mt-1.5 min-h-11"
        />
      </div> : <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg bg-gray-50 px-3 py-2">
        <p className="min-w-0 flex-1 basis-36 break-words text-sm text-gray-700">
          {reporter.identityStatus === 'loading' ? t('report.identityLoading') : `${t('report.reportingAs', '回報人')}：${reporter.defaultReporterName || t('report.currentAccount', '目前登入帳號')}`}
        </p>
        {!reportingForSomeoneElse && <button type="button" aria-expanded={false} aria-controls="reporter-override-fields" className="min-h-11 max-w-full px-1 text-left text-sm font-medium text-blue-700 underline underline-offset-2" onClick={() => { setReporterOverride(''); setReportingForSomeoneElse(true) }}>
          {t('report.reportForSomeoneElse', '代他人回報')}
        </button>}
        {reportingForSomeoneElse && <button type="button" aria-expanded={true} aria-controls="reporter-override-fields" className="min-h-11 shrink-0 px-1 text-sm text-gray-600 underline underline-offset-2" onClick={() => { setReporterOverride(''); setReportingForSomeoneElse(false) }}>
          {t('report.cancelOverride', '取消')}
        </button>}
      </div>}
      <div id="reporter-override-fields" hidden={!reportingForSomeoneElse || reporter.isSharedDevice}>
        <Label htmlFor="reporter-override" className="text-sm">{t('report.reporterName')} <span className="text-red-500">*</span></Label>
        <Input id="reporter-override" value={reporterOverride} onChange={e => setReporterOverride(e.target.value)} placeholder={t('report.reporterPlaceholder')} className="mt-1.5 min-h-11" />
      </div>

      {/* ① Where */}
      <div>
        <SectionHeader number={1} title={t('report.sectionLocation', '在哪裡')} />
        <ReportLocationFields
          factories={location.factories}
          areas={location.areas}
          assets={location.assets}
          factoryId={location.factoryId}
          setFactoryId={location.setFactoryId}
          areaId={location.areaId}
          setAreaId={location.setAreaId}
          assetId={location.assetId}
          setAssetId={location.setAssetId}
          locationNote={locationNote}
          setLocationNote={setLocationNote}
        />
      </div>

      {/* ② What's wrong — text parts. Photos are grouped with this section on
          phone (they render immediately after, with no header in between,
          since the two-column divs stack seamlessly) but move to the right
          column on desktop. */}
      <div className="space-y-3">
        <SectionHeader number={2} title={t('report.sectionIssue', '什麼問題')} />

        <div>
          <Label id="report-issue-type-label" htmlFor="report-issue-type" className="text-base">{t('report.issueType')}</Label>
          {/* The native phone picker keeps the form short and uses the
              device's familiar selection controls. Both layouts share state. */}
          <select
            id="report-issue-type"
            value={hasSelectedIssueType ? issueType : ''}
            onChange={event => setIssueType(event.target.value)}
            className="mt-1 block min-h-12 w-full min-w-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 lg:hidden"
          >
            <option value="" disabled>{t('report.specifyType')}</option>
            {issueTypes.map(it => <option key={it.value} value={it.value}>{it.label}</option>)}
          </select>
          <div role="group" aria-labelledby="report-issue-type-label" className="hidden grid-cols-2 gap-2 mt-1 lg:grid xl:grid-cols-3">
            {issueTypes.map(it => (
              <button
                key={it.value}
                type="button"
                aria-pressed={issueType === it.value}
                onClick={() => setIssueType(it.value)}
                className={`text-left rounded-lg border px-3 py-2.5 text-base font-medium transition-colors ${
                  issueType === it.value
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 bg-white text-gray-700'
                }`}
              >
                {it.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="report-description" className="text-base">{t('report.problemDesc')} <span className="text-red-500">*</span></Label>
            {/* Dictation shortcut — appends into the SAME editable textarea,
                so mis-recognitions from factory noise get fixed before
                submitting, never auto-sent. Hidden when unsupported. */}
            <SpeechMicButton onText={txt => setDescription(prev => (prev ? prev + ' ' : '') + txt)} />
          </div>
          <Textarea
            id="report-description"
            aria-required="true"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder={t('report.descPlaceholder')}
            className="mt-1 min-h-24 resize-y text-base"
            rows={3}
          />
        </div>

        {/* Past experience for the picked machine / typed problem — shows the
            fix from last time at the exact moment it's most useful. Hidden
            entirely when there's nothing to show. */}
        <PastRecordsPanel pastIncidents={pastIncidents} kbEntries={kbEntries} />
      </div>
      </div>
      {/* ---- Right column (desktop) / continues down the page (phone) ---- */}
      <div className="min-w-0 space-y-4 md:rounded-xl md:border md:border-gray-200 md:bg-gray-50/50 md:p-4">

      {/* Compact report controls preserve two explicit photo sources and generous tap targets. */}
      <PhotoPicker
        photos={photoCapture.photos}
        photoPreviews={photoCapture.photoPreviews}
        compressing={photoCapture.compressing}
        maxPhotos={5}
        onAddPhotos={photoCapture.addPhotos}
        onRemovePhoto={photoCapture.removePhoto}
        compact
      />

      {/* ③ How urgent */}
      <div>
        <SectionHeader number={3} title={t('report.sectionUrgency', '有多急')} />
        <div className="grid grid-cols-3 gap-1.5 mt-1">
          {URGENCY.map(u => (
            <button
              key={u.value}
              type="button"
              onClick={() => setUrgency(u.value)}
              aria-pressed={urgency === u.value}
              className={`min-h-12 rounded-lg border px-2 py-2 text-left transition-colors ${
                urgency === u.value
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 bg-white text-gray-700'
              }`}
            >
              <span className="text-sm font-semibold block">{t(u.labelKey)}</span>
              <span className="text-sm text-gray-600 block mt-1 leading-snug break-words">{t(u.descKey)}</span>
            </button>
          ))}
        </div>

        {/* Deadline — advanced/optional. Collapsed by default so new users
            aren't distracted: leaving it empty auto-derives the date from
            urgency. */}
        <details className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 mt-3">
          <summary className="min-h-11 content-center text-sm text-gray-600 cursor-pointer select-none">
            {t('report.advancedOptions', '進階選項（截止日，可不填）')}
          </summary>
          <div className="mt-2">
            <Label htmlFor="report-due-date" className="text-sm">{t('report.dueDate', '截止日')}</Label>
            <Input
              id="report-due-date"
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className="mt-1 min-h-11"
            />
            <p className="text-xs text-gray-400 mt-1">
              {t('report.dueDateHint', '留空則依緊急程度自動計算（緊急=當天、中=7天、一般=30天）')}
            </p>
          </div>
        </details>
      </div>

      {/* Submit — inline on desktop only; phone uses the fixed bottom bar below */}
      <Button
        onClick={submit}
        disabled={submitDisabled}
        className="hidden lg:flex w-full h-12 text-base"
      >
        {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        {t('report.submit')}
      </Button>
      </div>
      {/* ---- End two-column grid ---- */}
      </div>

      {/* Sticky submit bar (phone only) — pinned above the BottomNav and its
          iPhone safe area, so it stays reachable without covering navigation. */}
      <div className="lg:hidden fixed inset-x-0 bottom-above-mobile-nav z-40 border-t border-gray-200 bg-white/95 backdrop-blur px-4 py-2 md:px-6">
        <div className="max-w-lg mx-auto md:max-w-3xl">
          <Button
            onClick={submit}
            disabled={submitDisabled}
            className="w-full h-12 text-base"
          >
            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {t('report.submit')}
          </Button>
        </div>
      </div>
    </div>
  )
}

// Big numbered circle + short title — lets non-technical staff scanning the
// page on a phone always know which of the three chunks they're in.
function SectionHeader({ number, title }: { number: number; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-600 text-white text-sm font-bold shrink-0">
        {number}
      </span>
      <h2 className="text-base font-bold text-gray-900">
        {title}
      </h2>
    </div>
  )
}
