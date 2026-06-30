'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { Loader2, Plus, X } from 'lucide-react'

interface Machine { id: string; machine_name: string; machine_code: string | null }
interface Factory { id: string; name: string }

interface PMScheduleFormProps {
  factoryId?: string
  onSaved?: () => void
}

const PM_TYPES = [
  { value: 'daily', label: '每日' },
  { value: 'weekly', label: '每週' },
  { value: 'monthly', label: '每月' },
  { value: 'quarterly', label: '每季' },
  { value: 'half_yearly', label: '每半年' },
  { value: 'yearly', label: '每年' },
  { value: 'custom', label: '自訂間隔天數' },
]

export default function PMScheduleForm({ factoryId, onSaved }: PMScheduleFormProps) {
  const supabase = createClient()

  const [factories, setFactories] = useState<Factory[]>([])
  const [machines, setMachines] = useState<Machine[]>([])

  const [selectedFactory, setSelectedFactory] = useState(factoryId || '')
  const [selectedMachine, setSelectedMachine] = useState('')
  const [pmType, setPmType] = useState('monthly')
  const [intervalDays, setIntervalDays] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    supabase.from('factories').select('*').order('name').then(({ data }) => setFactories(data ?? []))
  }, [])

  useEffect(() => {
    if (!selectedFactory) { setMachines([]); return }
    supabase
      .from('machines')
      .select('id, machine_name, machine_code')
      .eq('factory_id', selectedFactory)
      .neq('status', 'scrapped')
      .order('machine_name')
      .then(({ data }) => setMachines(data ?? []))
  }, [selectedFactory])

  async function submit() {
    if (!selectedFactory || !selectedMachine || !pmType) {
      toast.error('請選擇工廠、機器和保養類型')
      return
    }
    if (pmType === 'custom' && !intervalDays.trim()) {
      toast.error('自訂間隔請輸入天數')
      return
    }

    setSubmitting(true)
    try {
      const { error } = await supabase.from('pm_schedules').insert([{
        factory_id: selectedFactory,
        machine_id: selectedMachine,
        pm_type: pmType,
        interval_days: pmType === 'custom' ? parseInt(intervalDays, 10) : null,
        description: description || null,
        is_active: true,
      }])
      if (error) throw error

      toast.success('保養計畫已建立')
      setSelectedMachine('')
      setPmType('monthly')
      setIntervalDays('')
      setDescription('')
      onSaved?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '建立失敗')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-blue-50 rounded-lg border border-blue-200 p-4 space-y-3">
      <h4 className="font-semibold text-gray-900 flex items-center gap-2">
        <Plus className="w-4 h-4" /> 新增保養計畫
      </h4>

      <div>
        <Label className="text-sm">工廠 *</Label>
        <Select value={selectedFactory} onValueChange={(v) => setSelectedFactory(v ?? '')} items={Object.fromEntries(factories.map(f => [f.id, f.name]))}>
          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            {factories.map(f => (
              <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedFactory && (
        <div>
          <Label className="text-sm">機器 *</Label>
          <Select value={selectedMachine} onValueChange={(v) => setSelectedMachine(v ?? '')} items={Object.fromEntries(machines.map(m => [m.id, `${m.machine_code ? `[${m.machine_code}] ` : ''}${m.machine_name}`]))}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="選擇機器" /></SelectTrigger>
            <SelectContent>
              {machines.map(m => (
                <SelectItem key={m.id} value={m.id}>
                  {m.machine_code ? `[${m.machine_code}] ` : ''}{m.machine_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div>
        <Label className="text-sm">保養類型 *</Label>
        <Select value={pmType} onValueChange={(v) => setPmType(v ?? '')} items={Object.fromEntries(PM_TYPES.map(t => [t.value, t.label]))}>
          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PM_TYPES.map(t => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {pmType === 'custom' && (
        <div>
          <Label className="text-sm">間隔天數 *</Label>
          <Input
            type="number"
            value={intervalDays}
            onChange={e => setIntervalDays(e.target.value)}
            placeholder="如：30"
            className="mt-1"
            min={1}
          />
        </div>
      )}

      <div>
        <Label className="text-sm">描述/檢查清單</Label>
        <Textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="如：檢查軸承潤滑、清潔散熱片、測量溫度…"
          className="mt-1"
          rows={3}
        />
      </div>

      <Button onClick={submit} disabled={submitting} className="w-full">
        {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        建立計畫
      </Button>
    </div>
  )
}
