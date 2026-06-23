'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { CompletionType, COMPLETION_TYPE_LABELS } from '@/types'
import { toast } from 'sonner'
import { Loader2, CheckCircle2 } from 'lucide-react'

interface Props {
  incidentId: string
  rcaBlocked: boolean
}

export default function CloseIncidentButton({ incidentId, rcaBlocked }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [rootCause, setRootCause] = useState('')
  const [completionType, setCompletionType] = useState<CompletionType | ''>('')
  const [submitting, setSubmitting] = useState(false)

  async function close() {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/incidents/${incidentId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          root_cause: rootCause || undefined,
          completion_type: completionType || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        if (json.rca_required) {
          throw new Error('RCA wajib diisi dulu sebelum menutup incident')
        }
        throw new Error(json.error || 'Gagal menutup incident')
      }
      toast.success('Incident ditutup')
      setOpen(false)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menutup incident')
    } finally {
      setSubmitting(false)
    }
  }

  if (rcaBlocked) {
    return (
      <Button disabled variant="outline" className="w-full" title="Isi RCA dulu">
        <CheckCircle2 className="w-4 h-4 mr-2" />
        Tutup Incident (RCA wajib dulu)
      </Button>
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="inline-flex items-center justify-center gap-2 w-full px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition">
        <CheckCircle2 className="w-4 h-4" /> Tutup Incident
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Tutup Incident</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Root Cause (opsional)</Label>
            <Textarea
              value={rootCause}
              onChange={e => setRootCause(e.target.value)}
              placeholder="Ringkasan akar masalah..."
              rows={2}
              className="mt-1"
            />
          </div>
          <div>
            <Label>Tipe Penyelesaian</Label>
            <Select value={completionType} onValueChange={(v) => setCompletionType((v ?? '') as CompletionType)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Temporary / Permanent" /></SelectTrigger>
              <SelectContent>
                {(Object.keys(COMPLETION_TYPE_LABELS) as CompletionType[]).map(t => (
                  <SelectItem key={t} value={t}>{COMPLETION_TYPE_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={close} disabled={submitting} className="w-full bg-green-600 hover:bg-green-700">
            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Konfirmasi Tutup
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
