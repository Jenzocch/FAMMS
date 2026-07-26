'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CloudUpload } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { submitIncidentReport } from '@/lib/incidents/submitIncidentReport'
import {
  listQueuedReports, removeQueuedReport, countQueuedReports, filesFrom, isNetworkError,
} from '@/lib/offline-queue'
import { useI18n } from '@/lib/i18n'

// Sends reports that were filled in without signal (see lib/offline-queue).
// Mounted once in the dashboard layout so it runs on every page — a
// technician who queued a report on the shop floor and then walks past the
// office wifi gets it filed without having to reopen anything.
//
// Module-level, NOT component state: React StrictMode mounts effects twice in
// dev, and a second concurrent flush would send every queued report twice.
// (Harmless server-side thanks to clientRequestId idempotency, but it would
// double the network traffic and the toasts.)
let flushing = false

export default function OfflineQueueFlusher() {
  const { t } = useI18n()
  const router = useRouter()
  const [pending, setPending] = useState(0)

  const flush = useCallback(async () => {
    if (flushing) return
    if (typeof navigator !== 'undefined' && !navigator.onLine) return
    flushing = true
    try {
      const queued = await listQueuedReports()
      if (queued.length === 0) { setPending(0); return }

      const supabase = createClient()
      let sent = 0
      for (const report of queued) {
        try {
          await submitIncidentReport(supabase, {
            ...report,
            photos: filesFrom(report),
            clientRequestId: report.clientRequestId,
          })
          await removeQueuedReport(report.clientRequestId)
          sent++
        } catch (err) {
          // Still no usable connection — stop and keep the rest queued rather
          // than burning through them one failure at a time.
          if (isNetworkError(err)) break
          // A server rejection would fail identically forever and block every
          // report behind it, so drop this one and keep going. Told to the
          // user because it's the one case where their report is genuinely
          // lost and they may want to re-file it.
          await removeQueuedReport(report.clientRequestId)
          toast.error(
            t('report.offlineSendFailed', '一筆離線回報送出失敗，已從佇列移除，請重新回報：')
            + (err instanceof Error ? err.message : ''),
            { duration: 10000 }
          )
        }
      }

      if (sent > 0) {
        toast.success(t('report.offlineSent', '已自動送出 {count} 筆離線回報').replace('{count}', String(sent)))
        router.refresh() // so the board/list shows them immediately
      }
      setPending(await countQueuedReports())
    } finally {
      flushing = false
    }
  }, [router, t])

  useEffect(() => {
    countQueuedReports().then(setPending)
    flush()
    window.addEventListener('online', flush)
    return () => window.removeEventListener('online', flush)
  }, [flush])

  if (pending === 0) return null

  // Persistent, tappable reminder that work is still sitting on this device —
  // a technician who never regains signal on this shift should be able to see
  // that, not assume it was filed. Sits above BottomNav on phones.
  return (
    <button
      type="button"
      onClick={flush}
      className="print:hidden fixed bottom-20 lg:bottom-4 right-3 z-40 inline-flex items-center gap-2 rounded-full bg-amber-500 px-3.5 py-2 text-xs font-semibold text-white shadow-lg hover:bg-amber-600"
    >
      <CloudUpload className="w-4 h-4" />
      {t('report.offlinePending', '{count} 筆待送出').replace('{count}', String(pending))}
    </button>
  )
}
