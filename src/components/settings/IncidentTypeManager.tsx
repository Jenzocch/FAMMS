'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Loader2, Trash2, Plus } from 'lucide-react'

interface IncidentType {
  id: string
  code: string
  label: string
  sort_order: number
  is_active: boolean
}

export default function IncidentTypeManager() {
  const supabase = createClient()
  const [types, setTypes] = useState<IncidentType[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [label, setLabel] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('incident_types')
        .select('*')
        .eq('is_active', true)
        .order('sort_order')
      setTypes(data ?? [])
    } catch {
      toast.error('載入問題類型失敗')
    } finally {
      setLoading(false)
    }
  }

  async function add() {
    if (!label.trim()) {
      toast.error('請輸入問題類型名稱')
      return
    }
    setSubmitting(true)
    try {
      const maxOrder = types.reduce((m, t) => Math.max(m, t.sort_order), 0)
      // code = label for user-added types, so the board shows the label directly.
      const { error } = await supabase.from('incident_types').insert([{
        code: label.trim(),
        label: label.trim(),
        sort_order: maxOrder + 1,
        is_active: true,
      }])
      if (error) throw error
      toast.success('問題類型已新增')
      setLabel('')
      setShowForm(false)
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '新增失敗')
    } finally {
      setSubmitting(false)
    }
  }

  async function remove(id: string, code: string) {
    if (code === 'other') {
      toast.error('「其他」為系統預設類型，無法刪除')
      return
    }
    if (!confirm('確認刪除此問題類型？')) return
    try {
      // Soft-delete so historical incidents keep their label mapping.
      const { error } = await supabase
        .from('incident_types')
        .update({ is_active: false })
        .eq('id', id)
      if (error) throw error
      toast.success('已刪除')
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '刪除失敗')
    }
  }

  if (loading) return <div className="text-center text-gray-500 text-sm py-2">載入中...</div>

  return (
    <div className="space-y-4">
      {!showForm && (
        <Button onClick={() => setShowForm(true)} className="gap-2">
          <Plus className="w-4 h-4" /> 新增問題類型
        </Button>
      )}

      {showForm && (
        <div className="bg-gray-50 p-4 rounded-lg space-y-3">
          <div>
            <Label>問題類型名稱</Label>
            <Input
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="例如：🔥 火災風險（可加 emoji）"
              className="mt-1"
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={add} disabled={submitting}>
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              新增
            </Button>
            <Button variant="outline" onClick={() => { setShowForm(false); setLabel('') }}>
              取消
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {types.map(t => (
          <div key={t.id} className="flex items-center justify-between p-3 border rounded-lg">
            <p className="font-medium text-sm">{t.label}</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => remove(t.id, t.code)}
              disabled={t.code === 'other'}
            >
              <Trash2 className="w-4 h-4 text-red-600" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
