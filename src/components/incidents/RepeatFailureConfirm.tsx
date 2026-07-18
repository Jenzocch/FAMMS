'use client'

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { useI18n } from '@/lib/i18n'

// Non-blocking confirm prompt shown on the newly-created incident's own
// detail page when submitIncidentReport (or the Telegram /lapor flow)
// flagged a CANDIDATE repeat failure — same machine + incident_type, prior
// incident closed as a temporary fix or with no root cause on record, within
// the last 30 days. The incident is already created either way; this only
// decides whether an incident_relations row gets written. Only rendered by
// the detail page when the viewer has supervisor+ permission (checked
// server-side there, since that's where the role is already known).
export default function RepeatFailureConfirm({
  incidentId,
  priorIncidentId,
  priorIncidentNo,
  priorTitle,
}: {
  incidentId: string
  priorIncidentId: string
  priorIncidentNo: string
  priorTitle: string
}) {
  const { t } = useI18n()
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  // Strip the ?repeatOf=... query param so a page refresh (or navigating
  // back) doesn't re-show the prompt for something already answered.
  function clearQueryParam() {
    router.replace(pathname)
  }

  async function confirm(isRepeat: boolean) {
    if (!isRepeat) {
      setOpen(false)
      clearQueryParam()
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/incidents/${incidentId}/relations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ relatedIncidentId: priorIncidentId, relationType: 'repeat_failure' }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || t('repeatFailure.confirmFailed'))
      toast.success(t('repeatFailure.confirmed'))
      setOpen(false)
      clearQueryParam()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('repeatFailure.confirmFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v: boolean) => { if (!v) { setOpen(false); clearQueryParam() } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('repeatFailure.title')}</DialogTitle>
          <DialogDescription>
            {t('repeatFailure.prompt').replace('{title}', priorTitle).replace('{incidentNo}', priorIncidentNo)}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => confirm(false)} disabled={submitting}>
            {t('repeatFailure.no')}
          </Button>
          <Button onClick={() => confirm(true)} disabled={submitting}>
            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {t('repeatFailure.yes')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
