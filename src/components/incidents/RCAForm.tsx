'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { Loader2, AlertTriangle } from 'lucide-react'

interface Profile {
  id: string
  full_name: string
}

interface Props {
  failureCodeId: string
  occurrenceCount: number
}

export default function RCAForm({ failureCodeId, occurrenceCount }: Props) {
  const router = useRouter()
  const supabase = createClient()

  const [people, setPeople] = useState<Profile[]>([])
  const [rootCause, setRootCause] = useState('')
  const [corrective, setCorrective] = useState('')
  const [preventive, setPreventive] = useState('')
  const [responsibleId, setResponsibleId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('is_active', true)
        .order('full_name')
      setPeople(data ?? [])
    }
    load()
  }, [])

  async function submit() {
    if (!rootCause || !corrective || !preventive || !responsibleId || !dueDate) {
      toast.error('Lengkapi semua field RCA')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/rca', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          failure_code_id: failureCodeId,
          root_cause: rootCause,
          corrective_action: corrective,
          preventive_action: preventive,
          responsible_person_id: responsibleId,
          due_date: dueDate,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal menyimpan RCA')
      toast.success('RCA tersimpan. Incident sekarang bisa ditutup.')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan RCA')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-red-50 rounded-xl border border-red-200 p-6 space-y-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
        <div>
          <h3 className="font-semibold text-red-900">RCA Wajib Diisi</h3>
          <p className="text-sm text-red-700 mt-0.5">
            Failure code ini sudah terjadi <strong>{occurrenceCount}×</strong> dalam 90 hari.
            Isi Root Cause Analysis sebelum incident dapat ditutup.
          </p>
        </div>
      </div>

      <div>
        <Label>Root Cause (Akar Masalah) <span className="text-red-500">*</span></Label>
        <Textarea
          value={rootCause}
          onChange={e => setRootCause(e.target.value)}
          placeholder="Kenapa kerusakan ini berulang terjadi?"
          rows={2}
          className="mt-1 bg-white"
        />
      </div>

      <div>
        <Label>Corrective Action (Tindakan Korektif) <span className="text-red-500">*</span></Label>
        <Textarea
          value={corrective}
          onChange={e => setCorrective(e.target.value)}
          placeholder="Bagaimana cara memperbaiki sekarang?"
          rows={2}
          className="mt-1 bg-white"
        />
      </div>

      <div>
        <Label>Preventive Action (Tindakan Preventif) <span className="text-red-500">*</span></Label>
        <Textarea
          value={preventive}
          onChange={e => setPreventive(e.target.value)}
          placeholder="Bagaimana cara mencegah agar tidak terulang?"
          rows={2}
          className="mt-1 bg-white"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>Penanggung Jawab (PIC) <span className="text-red-500">*</span></Label>
          <Select value={responsibleId} onValueChange={(v) => setResponsibleId(v ?? '')}>
            <SelectTrigger className="mt-1 bg-white"><SelectValue placeholder="Pilih PIC" /></SelectTrigger>
            <SelectContent>
              {people.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Due Date <span className="text-red-500">*</span></Label>
          <Input
            type="date"
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
            className="mt-1 bg-white"
          />
        </div>
      </div>

      <Button onClick={submit} disabled={submitting} className="w-full">
        {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        Simpan RCA
      </Button>
    </div>
  )
}
