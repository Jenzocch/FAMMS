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
import { Loader2, Trash2, Edit2, Plus } from 'lucide-react'

interface Factory {
  id: string
  name: string
  code: string
}

interface Area {
  id: string
  factory_id: string
  name: string
  code: string
  description: string | null
}

export default function AreaManager() {
  const supabase = createClient()
  const [factories, setFactories] = useState<Factory[]>([])
  const [areas, setAreas] = useState<Area[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedFactoryId, setSelectedFactoryId] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [formData, setFormData] = useState({ name: '', code: '', description: '' })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    loadFactories()
  }, [])

  useEffect(() => {
    if (selectedFactoryId) loadAreas()
  }, [selectedFactoryId])

  async function loadFactories() {
    setLoading(true)
    try {
      const { data } = await supabase.from('factories').select('*').order('code')
      setFactories(data ?? [])
      if (data && data.length > 0) {
        setSelectedFactoryId(data[0].id)
      }
    } catch (err) {
      toast.error('載入工廠失敗')
    } finally {
      setLoading(false)
    }
  }

  async function loadAreas() {
    try {
      const { data } = await supabase
        .from('areas')
        .select('*')
        .eq('factory_id', selectedFactoryId)
        .order('name')
      setAreas(data ?? [])
    } catch (err) {
      toast.error('載入區域失敗')
    }
  }

  async function submit() {
    if (!formData.name.trim() || !formData.code.trim()) {
      toast.error('名稱和代碼必填')
      return
    }

    setSubmitting(true)
    try {
      if (editing) {
        const { error } = await supabase
          .from('areas')
          .update({
            name: formData.name,
            code: formData.code,
            description: formData.description || null,
          })
          .eq('id', editing)
        if (error) throw error
        toast.success('區域已更新')
      } else {
        const { error } = await supabase
          .from('areas')
          .insert([{
            factory_id: selectedFactoryId,
            name: formData.name,
            code: formData.code,
            description: formData.description || null,
          }])
        if (error) throw error
        toast.success('區域已新增')
      }
      setFormData({ name: '', code: '', description: '' })
      setEditing(null)
      setShowForm(false)
      loadAreas()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '操作失敗')
    } finally {
      setSubmitting(false)
    }
  }

  async function deleteArea(id: string) {
    if (!confirm('確認刪除此區域？')) return
    try {
      const { error } = await supabase.from('areas').delete().eq('id', id)
      if (error) throw error
      toast.success('區域已刪除')
      loadAreas()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '刪除失敗')
    }
  }

  function editArea(a: Area) {
    setFormData({
      name: a.name,
      code: a.code,
      description: a.description || '',
    })
    setEditing(a.id)
    setShowForm(true)
  }

  if (loading) return <div className="text-center text-gray-500">載入中...</div>

  return (
    <div className="space-y-4">
      <div>
        <Label>選擇工廠</Label>
        <Select value={selectedFactoryId} onValueChange={(v) => setSelectedFactoryId(v ?? '')}>
          <SelectTrigger className="mt-1">
            <SelectValue placeholder="選擇工廠" />
          </SelectTrigger>
          <SelectContent>
            {factories.map(f => (
              <SelectItem key={f.id} value={f.id}>
                {f.name} ({f.code})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!showForm && (
        <Button onClick={() => setShowForm(true)} className="gap-2">
          <Plus className="w-4 h-4" /> 新增區域
        </Button>
      )}

      {showForm && (
        <div className="bg-gray-50 p-4 rounded-lg space-y-3">
          <div>
            <Label>名稱</Label>
            <Input
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., 生產區"
              className="mt-1"
            />
          </div>
          <div>
            <Label>代碼</Label>
            <Input
              value={formData.code}
              onChange={e => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
              placeholder="e.g., PROD"
              maxLength={10}
              className="mt-1"
            />
          </div>
          <div>
            <Label>描述 (可選)</Label>
            <Textarea
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              placeholder="區域描述..."
              className="mt-1"
              rows={2}
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={submit} disabled={submitting}>
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editing ? '更新' : '新增'}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setShowForm(false)
                setEditing(null)
                setFormData({ name: '', code: '', description: '' })
              }}
            >
              取消
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {areas.map(a => (
          <div key={a.id} className="flex items-center justify-between p-3 border rounded-lg">
            <div>
              <p className="font-semibold">{a.name}</p>
              <p className="text-xs text-gray-500">代碼: {a.code}</p>
              {a.description && <p className="text-xs text-gray-600">{a.description}</p>}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => editArea(a)}
                disabled={submitting}
              >
                <Edit2 className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => deleteArea(a.id)}
                disabled={submitting}
              >
                <Trash2 className="w-4 h-4 text-red-600" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
