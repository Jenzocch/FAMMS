'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePhotoCapture } from '@/lib/hooks/usePhotoCapture'
import SpeechMicButton from '@/components/shared/SpeechMicButton'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { Loader2, Package } from 'lucide-react'
import { OPEN_GUDANG_REQUEST_EVENT } from '@/lib/constants'
import type { IncidentStatus, UserRole } from '@/types'
import { STATUS_ZH } from '@/lib/incident-display'
import { PERMISSIONS } from '@/lib/permissions'
import { logAuditEvent } from '@/lib/audit'
import { useI18n } from '@/lib/i18n'
import { allowedStatuses } from '@/lib/incident-workflow'
import PhotoPicker from '@/components/shared/PhotoPicker'
import CloseFields, { EMPTY_CLOSE_DETAILS, isHygieneConfirmed, type CloseDetails } from './CloseFields'
import RCAForm from './RCAForm'

export default function ProgressUpdate({
  incidentId, currentStatus, userRole = 'technician', userName, estimatedCompletionDate, hasMachine = false,
  machineId, incidentType, factoryId,
}: {
  incidentId: string
  currentStatus: IncidentStatus
  userRole?: UserRole
  userName?: string | null
  estimatedCompletionDate?: string | null
  // Whether this incident is attached to a machine — drives the food-safety
  // hygiene sign-off at close (maintenance work on equipment is itself a
  // contamination risk; facility/electrical incidents with no machine_id
  // never touch food product, so they skip it).
  hasMachine?: boolean
  // Only needed to render the inline RCA form if the close attempt is
  // rejected with rca_required — see checkRCARequirement in src/lib/rca.ts.
  machineId?: string | null
  incidentType?: string
  factoryId?: string
}) {
  const router = useRouter()
  const supabase = createClient()
  const { t } = useI18n()
  const statusLabel = (s: IncidentStatus) => t(`boardStatus.${s}`, STATUS_ZH[s])
  const canClose = PERMISSIONS.closeIncident(userRole)

  const [newStatus, setNewStatus] = useState<string>(currentStatus)
  const [note, setNote] = useState('')
  // The assignee's own ETA ("I expect to finish by…"), reported upward. NOT
  // due_date — that's the supervisor-set deadline the SLA measures against,
  // which technicians deliberately cannot move.
  const [eta, setEta] = useState(estimatedCompletionDate || '')
  const [updaterName, setUpdaterName] = useState(userName ?? '')
  const { photos, photoPreviews, compressing, addPhotos, removePhoto, resetPhotos } = usePhotoCapture(5)
  const [allowRollback, setAllowRollback] = useState(false)
  // Only read when closing — see CloseFields.
  const [closeDetails, setCloseDetails] = useState<CloseDetails>(EMPTY_CLOSE_DETAILS)
  const patchClose = (patch: Partial<CloseDetails>) => setCloseDetails(prev => ({ ...prev, ...patch }))
  const [submitting, setSubmitting] = useState(false)
  // Set when a close attempt is rejected with rca_required — renders the
  // inline RCA form in place of the generic error. Filing the RCA there
  // re-triggers this same submit(), which retries the close.
  const [rcaGate, setRcaGate] = useState<{ occurrenceCount: number } | null>(null)

  // Status options based on rollback setting. Only supervisors+ may move a case to "closed".
  const availableStatuses = allowedStatuses(currentStatus, allowRollback)
  const base = canClose ? availableStatuses : availableStatuses.filter(s => s !== 'closed')
  // Always include the current status as a (selected, no-op) option. Some
  // statuses aren't forward targets in SELECTABLE (e.g. 'reported', or the
  // waiting_vendor/approval/shutdown side-states), so without this the Select's
  // default value would not match any item and render blank.
  const selectableStatuses = base.includes(currentStatus) ? base : [currentStatus, ...base]

  async function submit() {
    const statusChanged = newStatus !== currentStatus
    const etaChanged = eta !== (estimatedCompletionDate || '')
    if (!note.trim() && !statusChanged && !etaChanged) {
      toast.error(t('progressUpdate.needStatusOrNote'))
      return
    }
    if (newStatus === 'closed' && !canClose) {
      toast.error(t('progressUpdate.onlySupervisorClose'))
      return
    }
    if (newStatus === 'closed' && !closeDetails.completionType) {
      toast.error(t('progressUpdate.completionRequired', '結案前請選擇修復類型（臨時 / 永久）'))
      return
    }
    if (newStatus === 'closed' && hasMachine && !isHygieneConfirmed(closeDetails)) {
      toast.error(t('progressUpdate.hygieneRequired', '請完成復產衛生確認的三項勾選'))
      return
    }
    setSubmitting(true)
    // Set once the close API call itself succeeds. If anything AFTER that
    // point throws (timeline insert, ETA patch, audit log), the incident is
    // already closed server-side — the catch block below must not report a
    // generic failure, which would read as "did not close" and send the user
    // into a confusing retry that then hits "already closed".
    let closedSuccessfully = false
    try {
      const { data: { user } } = await supabase.auth.getUser()

      // A retry after filing the RCA below should re-check the gate fresh
      // rather than assume it's now satisfied.
      setRcaGate(null)

      // Upload photos
      const paths: string[] = []
      for (const photo of photos) {
        const ext = photo.name.split('.').pop()
        const path = `${incidentId}/updates/${Date.now()}-${paths.length}.${ext}`
        const { error: upErr } = await supabase.storage.from('incident-photos').upload(path, photo)
        if (!upErr) paths.push(path)
      }

      // Closing goes through the close API so the RCA gate is enforced and
      // closed_at / closed_by_id are stamped server-side.
      if (newStatus === 'closed') {
        const res = await fetch(`/api/incidents/${incidentId}/close`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            root_cause: note || undefined,
            completion_type: closeDetails.completionType || undefined,
            labor_cost: closeDetails.laborCost ? parseFloat(closeDetails.laborCost) : undefined,
            parts_cost: closeDetails.partsCost ? parseFloat(closeDetails.partsCost) : undefined,
            save_to_kb: closeDetails.saveToKb,
            repair_method: closeDetails.repairMethod || undefined,
            // Only sent when actually confirmed — the server independently
            // re-checks this for machine incidents, so this is not the only
            // gate, just the client-side UX for it.
            hygiene_confirmed: hasMachine && isHygieneConfirmed(closeDetails) ? true : undefined,
          }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) {
          if (json?.rca_required) {
            // Not a dead end: show the inline RCA form right here instead of
            // just an error toast. Filing it there retries this same close.
            toast.error(t('progressUpdate.rcaRequired').replace('{count}', String(json.occurrence_count ?? '≥3')))
            setRcaGate({ occurrenceCount: json.occurrence_count ?? 3 })
            return
          }
          throw new Error(json?.error || t('progressUpdate.closeFailed'))
        }
        closedSuccessfully = true
      }

      // Log the update row (timeline)
      const { error: logErr } = await supabase.from('incident_updates').insert({
        incident_id: incidentId,
        new_status: statusChanged ? newStatus : null,
        note: note || null,
        updated_by: updaterName || null,
        updated_by_id: user?.id ?? null,
        photos: paths.length > 0 ? JSON.stringify(paths) : null,
      })
      if (logErr) throw logErr

      // Update incident status (+ stamp accepted_at) and/or the assignee's
      // ETA. For 'closed' the close API already updated status/closed_at
      // above, so skip the status part there.
      if ((statusChanged && newStatus !== 'closed') || etaChanged) {
        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
        if (statusChanged && newStatus !== 'closed') {
          patch.status = newStatus
          if (currentStatus === 'reported' && newStatus !== 'reported') {
            patch.accepted_at = new Date().toISOString()
            patch.accepted_by_id = user?.id ?? null
          }
        }
        if (etaChanged) patch.estimated_completion_date = eta || null
        let { error: updErr } = await supabase.from('incidents').update(patch).eq('id', incidentId)
        // DB without the ETA column yet (SYNC_SCHEMA_LATEST not run): drop
        // just that field and retry, so a schema-drift DB can't block status
        // updates. Postgres says 42703; PostgREST's schema cache says PGRST204.
        if (updErr && etaChanged && (updErr.code === '42703' || updErr.code === 'PGRST204')) {
          delete patch.estimated_completion_date
          if (Object.keys(patch).length > 1) {
            ({ error: updErr } = await supabase.from('incidents').update(patch).eq('id', incidentId))
          } else {
            updErr = null
          }
        }
        if (updErr) throw updErr
      }

      // Audit trail
      if (statusChanged) {
        await logAuditEvent(supabase, {
          userId: user?.id ?? null,
          userName: updaterName || userName || null,
          actionType: 'status_change',
          resourceType: 'incident',
          resourceId: incidentId,
          oldValue: currentStatus,
          newValue: newStatus,
          changeSummary: `狀態從 "${STATUS_ZH[currentStatus]}" 變更為 "${STATUS_ZH[newStatus as IncidentStatus]}"`,
        })
      }

      toast.success(t('progressUpdate.updated'))
      setNote('')
      resetPhotos()
      router.refresh()
    } catch (err) {
      if (closedSuccessfully) {
        // The close itself already committed — this is a downstream step
        // (timeline note, ETA patch, audit log) failing afterward, not the
        // close. Say so, and still refresh so the board reflects 'closed'.
        toast.error(t('progressUpdate.closedButNoteFailed'))
        router.refresh()
      } else {
        toast.error(err instanceof Error ? err.message : t('progressUpdate.updateFailed'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
      <div>
        <h3 className="font-semibold text-gray-900">{t('progressUpdate.heading')}</h3>
        <p className="text-xs text-gray-500 mt-0.5">{t('progressUpdate.sectionHint', '記錄目前做了什麼、發現什麼問題，可附照片')}</p>
      </div>

      <div>
        <Label>{t('progressUpdate.updater')}</Label>
        {/* Auto-filled with the logged-in user's name and locked, so the
            handler is recorded accurately. If the account has no name on file
            we leave it editable as a fallback. */}
        <Input
          value={updaterName}
          onChange={e => setUpdaterName(e.target.value)}
          placeholder={t('progressUpdate.updaterPlaceholder')}
          readOnly={!!userName}
          className={`mt-1 ${userName ? 'bg-gray-50 text-gray-600 cursor-not-allowed' : ''}`}
        />
      </div>

      {/* Moving a case backwards is an exceptional action — supervisors+ only
          (same gate as closing), so technicians can't undo workflow progress. */}
      {canClose && (
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="allowRollback"
            checked={allowRollback}
            onChange={e => setAllowRollback(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300"
          />
          <Label htmlFor="allowRollback" className="mb-0 text-sm cursor-pointer">
            {t('progressUpdate.allowRollback')}
          </Label>
        </div>
      )}

      <div>
        <Label>{t('progressUpdate.newStatus')}</Label>
        <Select value={newStatus} onValueChange={(v) => setNewStatus(v ?? currentStatus)} items={Object.fromEntries(selectableStatuses.map(s => [s, statusLabel(s)]))}>
          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            {selectableStatuses.map(s => (
              <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Assignee's own ETA — reported upward, never touches due_date (the
          supervisor-set SLA deadline technicians can't move). Hidden when
          closing: an ETA is meaningless on a case being closed right now. */}
      {newStatus !== 'closed' && (
        <div>
          <Label>{t('progressUpdate.etaLabel', '你預計什麼時候可以完成？（選填）')}</Label>
          <Input type="date" value={eta} onChange={e => setEta(e.target.value)} className="mt-1" />
          <p className="text-xs text-gray-400 mt-1">{t('progressUpdate.etaHint', '回報給主管參考，不會改動主管設定的截止日')}</p>
        </div>
      )}

      {/* Parking a case on "waiting for parts" IS the moment the technician
          needs to order them — but the Gudang form lives in a different card
          (the management rail), so without this they'd set the status, submit,
          then have to go hunting for it. Jumps to + expands that form. */}
      {newStatus === 'waiting_parts' && (
        <button
          type="button"
          onClick={() => {
            window.dispatchEvent(new Event(OPEN_GUDANG_REQUEST_EVENT))
            const el = document.getElementById('section-gudang')
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' })
              el.classList.add('ring-2', 'ring-emerald-400', 'rounded-xl')
              setTimeout(() => el.classList.remove('ring-2', 'ring-emerald-400', 'rounded-xl'), 1500)
            }
          }}
          className="w-full flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2.5 text-left text-sm text-emerald-800 hover:bg-emerald-100 transition-colors"
        >
          <Package className="w-4 h-4 shrink-0" />
          <span>{t('progressUpdate.needPartsHint', '要跟倉庫叫料嗎？點這裡開叫料單')}</span>
        </button>
      )}

      {/* Close-only fields: fix type, hygiene sign-off, costs, KB capture. */}
      {newStatus === 'closed' && (
        <CloseFields value={closeDetails} onChange={patchClose} hasMachine={hasMachine} />
      )}

      {/* RCA gate — only ever set after a close attempt was rejected with
          rca_required (see submit() above). Filing it here retries the same
          close instead of leaving the case permanently stuck. */}
      {newStatus === 'closed' && rcaGate && machineId && incidentType && factoryId && (
        <RCAForm
          machineId={machineId}
          incidentType={incidentType}
          factoryId={factoryId}
          occurrenceCount={rcaGate.occurrenceCount}
          onSaved={() => submit()}
        />
      )}

      <div>
        <div className="flex items-center justify-between gap-2">
          <Label>{t('progressUpdate.note')}</Label>
          {/* Dictation shortcut — technicians with dirty/gloved hands speak
              instead of typing; text lands in the editable field for review,
              never auto-submitted. Hidden when the browser can't do it. */}
          <SpeechMicButton onText={txt => setNote(prev => (prev ? prev + ' ' : '') + txt)} />
        </div>
        <Textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder={t('progressUpdate.notePlaceholder')}
          className="mt-1"
          rows={3}
        />
      </div>

      <PhotoPicker
        photos={photos}
        photoPreviews={photoPreviews}
        compressing={compressing}
        maxPhotos={5}
        onAddPhotos={addPhotos}
        onRemovePhoto={removePhoto}
        variant="update"
      />

      <Button
        onClick={submit}
        disabled={submitting}
        className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white"
      >
        {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        {t('progressUpdate.submit')}
      </Button>
    </div>
  )
}
