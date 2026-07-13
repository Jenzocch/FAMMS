'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { Loader2, Trash2, Edit2, Plus, ChevronDown, ChevronRight, MapPin } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { invalidateFactories } from '@/lib/useFactories'

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

// One hierarchical manager for factories AND their areas. Areas used to live
// in a separate settings section with its own factory dropdown, which hid the
// parent-child relationship — e.g. "delete factory" failing because unseen
// areas still existed under it. Here each factory expands to show its areas,
// so adding an area lands under the factory you're looking at, and the
// delete-guard ("clear areas first") points at rows visible right below.
export default function FactoryManager() {
  const { t } = useI18n()
  const supabase = createClient()
  const [factories, setFactories] = useState<Factory[]>([])
  const [areas, setAreas] = useState<Area[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [submitting, setSubmitting] = useState(false)

  // Factory form (add at top, or edit in place)
  const [showFactoryForm, setShowFactoryForm] = useState(false)
  const [editingFactory, setEditingFactory] = useState<string | null>(null)
  const [factoryForm, setFactoryForm] = useState({ name: '', code: '' })

  // Area form — scoped to one factory card. areaFormFactoryId doubles as the
  // "which card has an open form" flag.
  const [areaFormFactoryId, setAreaFormFactoryId] = useState<string | null>(null)
  const [editingArea, setEditingArea] = useState<string | null>(null)
  const [areaForm, setAreaForm] = useState({ name: '', code: '', description: '' })

  useEffect(() => {
    loadAll()
  }, [])

  async function loadAll() {
    setLoading(true)
    try {
      const [{ data: facs }, { data: areaRows }] = await Promise.all([
        supabase.from('factories').select('*').order('code'),
        supabase.from('areas').select('*').order('name'),
      ])
      setFactories(facs ?? [])
      setAreas(areaRows ?? [])
    } catch {
      toast.error(t('settings.loadFactoriesFailed'))
    } finally {
      setLoading(false)
    }
  }

  function areasOf(factoryId: string) {
    return areas.filter(a => a.factory_id === factoryId)
  }

  // ----- factory CRUD -----

  async function submitFactory() {
    if (!factoryForm.name.trim() || !factoryForm.code.trim()) {
      toast.error(t('settings.nameCodeRequired'))
      return
    }
    setSubmitting(true)
    try {
      if (editingFactory) {
        const { error } = await supabase
          .from('factories')
          .update({ name: factoryForm.name, code: factoryForm.code })
          .eq('id', editingFactory)
        if (error) throw error
        toast.success(t('settings.factoryUpdated'))
      } else {
        const { error } = await supabase
          .from('factories')
          .insert([{ name: factoryForm.name, code: factoryForm.code }])
        if (error) throw error
        toast.success(t('settings.factoryAdded'))
      }
      resetFactoryForm()
      loadAll()
      invalidateFactories() // refresh the shared cache every picker reads
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('settings.operationFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  async function deleteFactory(f: Factory) {
    // A factory with areas still under it can't be deleted — that cascade
    // would take machines and their whole history with it. The blocking areas
    // are visible right below when expanded, so point the user there.
    const n = areasOf(f.id).length
    if (n > 0) {
      setExpanded(prev => ({ ...prev, [f.id]: true }))
      toast.error(t('settings.factoryHasAreas', '此工廠底下還有 {n} 個區域，請先清空區域與機器再刪除工廠。').replace('{n}', String(n)))
      return
    }
    if (!confirm(t('settings.confirmDeleteFactory'))) return
    try {
      const { error } = await supabase.from('factories').delete().eq('id', f.id)
      if (error) throw error
      toast.success(t('settings.factoryDeleted'))
      loadAll()
      invalidateFactories()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('settings.deleteFailed'))
    }
  }

  function editFactory(f: Factory) {
    setFactoryForm({ name: f.name, code: f.code })
    setEditingFactory(f.id)
    setShowFactoryForm(true)
  }

  function resetFactoryForm() {
    setShowFactoryForm(false)
    setEditingFactory(null)
    setFactoryForm({ name: '', code: '' })
  }

  // ----- area CRUD (inside a factory card) -----

  function startAddArea(factoryId: string) {
    setEditingArea(null)
    setAreaForm({ name: '', code: '', description: '' })
    setAreaFormFactoryId(factoryId)
  }

  function startEditArea(a: Area) {
    setEditingArea(a.id)
    setAreaForm({ name: a.name, code: a.code, description: a.description || '' })
    setAreaFormFactoryId(a.factory_id)
  }

  function resetAreaForm() {
    setAreaFormFactoryId(null)
    setEditingArea(null)
    setAreaForm({ name: '', code: '', description: '' })
  }

  async function submitArea() {
    if (!areaForm.name.trim() || !areaForm.code.trim()) {
      toast.error(t('settings.nameCodeRequired'))
      return
    }
    setSubmitting(true)
    try {
      if (editingArea) {
        const { error } = await supabase
          .from('areas')
          .update({
            name: areaForm.name,
            code: areaForm.code,
            description: areaForm.description || null,
          })
          .eq('id', editingArea)
        if (error) throw error
        toast.success(t('settings.areaUpdated'))
      } else {
        const { error } = await supabase
          .from('areas')
          .insert([{
            factory_id: areaFormFactoryId,
            name: areaForm.name,
            code: areaForm.code,
            description: areaForm.description || null,
          }])
        if (error) throw error
        toast.success(t('settings.areaAdded'))
      }
      resetAreaForm()
      loadAll()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('settings.operationFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  async function deleteArea(id: string) {
    // Deleting an area used to cascade-wipe every machine in it plus all
    // their history. Block it while machines remain — with a message that
    // says WHY, not a raw FK error.
    const { count } = await supabase
      .from('machines')
      .select('id', { count: 'exact', head: true })
      .eq('area_id', id)
    if ((count ?? 0) > 0) {
      toast.error(t('settings.areaHasMachines', '此區域還有 {n} 台機器，請先移除或搬移機器再刪除區域。').replace('{n}', String(count)))
      return
    }
    if (!confirm(t('settings.confirmDeleteArea'))) return
    try {
      const { error } = await supabase.from('areas').delete().eq('id', id)
      if (error) throw error
      toast.success(t('settings.areaDeleted'))
      loadAll()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('settings.deleteFailed'))
    }
  }

  if (loading) return <div className="text-center text-gray-500">{t('settings.loading')}</div>

  return (
    <div className="space-y-4">
      {!showFactoryForm && (
        <Button onClick={() => setShowFactoryForm(true)} className="gap-2">
          <Plus className="w-4 h-4" /> {t('settings.addFactory')}
        </Button>
      )}

      {showFactoryForm && (
        <div className="bg-gray-50 p-4 rounded-lg space-y-3">
          <div>
            <Label>{t('settings.name')}</Label>
            <Input
              value={factoryForm.name}
              onChange={e => setFactoryForm({ ...factoryForm, name: e.target.value })}
              placeholder="e.g., SJA"
              className="mt-1"
            />
          </div>
          <div>
            <Label>{t('settings.code')}</Label>
            <Input
              value={factoryForm.code}
              onChange={e => setFactoryForm({ ...factoryForm, code: e.target.value.toUpperCase() })}
              placeholder="e.g., SJA"
              maxLength={10}
              className="mt-1"
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={submitFactory} disabled={submitting}>
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingFactory ? t('settings.update') : t('settings.create')}
            </Button>
            <Button variant="outline" onClick={resetFactoryForm}>
              {t('settings.cancel')}
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {factories.map(f => {
          const factoryAreas = areasOf(f.id)
          const isOpen = !!expanded[f.id]
          return (
            <div key={f.id} className="border rounded-lg overflow-hidden">
              <div className="flex items-center justify-between p-3 bg-white">
                <button
                  type="button"
                  onClick={() => setExpanded(prev => ({ ...prev, [f.id]: !isOpen }))}
                  className="flex items-center gap-2 flex-1 min-w-0 text-left"
                  aria-expanded={isOpen}
                >
                  {isOpen
                    ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                    : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{f.name}</p>
                    <p className="text-xs text-gray-500">
                      {t('settings.codeLabel').replace('{code}', f.code)}
                      {' · '}
                      {t('settings.areaCount', '{n} 個區域').replace('{n}', String(factoryAreas.length))}
                    </p>
                  </div>
                </button>
                <div className="flex gap-2 shrink-0">
                  <Button
                    size="icon" className="h-10 w-10"
                    variant="outline"
                    onClick={() => editFactory(f)}
                    disabled={submitting}
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon" className="h-10 w-10"
                    variant="outline"
                    onClick={() => deleteFactory(f)}
                    disabled={submitting}
                  >
                    <Trash2 className="w-4 h-4 text-red-600" />
                  </Button>
                </div>
              </div>

              {isOpen && (
                <div className="border-t bg-gray-50 p-3 space-y-2">
                  {factoryAreas.length === 0 && areaFormFactoryId !== f.id && (
                    <p className="text-sm text-gray-400 text-center py-2">
                      {t('settings.noAreasYet', '尚無區域')}
                    </p>
                  )}

                  {factoryAreas.map(a => (
                    <div key={a.id} className="flex items-center justify-between p-2.5 border rounded-lg bg-white gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <MapPin className="w-4 h-4 text-gray-300 shrink-0" />
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{a.name}</p>
                          <p className="text-xs text-gray-500">{t('settings.codeLabel').replace('{code}', a.code)}</p>
                          {a.description && <p className="text-xs text-gray-600 truncate">{a.description}</p>}
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button
                          size="icon" className="h-10 w-10"
                          variant="outline"
                          onClick={() => startEditArea(a)}
                          disabled={submitting}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon" className="h-10 w-10"
                          variant="outline"
                          onClick={() => deleteArea(a.id)}
                          disabled={submitting}
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </Button>
                      </div>
                    </div>
                  ))}

                  {areaFormFactoryId === f.id ? (
                    <div className="bg-white border rounded-lg p-3 space-y-3">
                      <div>
                        <Label>{t('settings.name')}</Label>
                        <Input
                          value={areaForm.name}
                          onChange={e => setAreaForm({ ...areaForm, name: e.target.value })}
                          placeholder="e.g., 生產區"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label>{t('settings.code')}</Label>
                        <Input
                          value={areaForm.code}
                          onChange={e => setAreaForm({ ...areaForm, code: e.target.value.toUpperCase() })}
                          placeholder="e.g., PROD"
                          maxLength={10}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label>{t('settings.descriptionOptional')}</Label>
                        <Textarea
                          value={areaForm.description}
                          onChange={e => setAreaForm({ ...areaForm, description: e.target.value })}
                          placeholder={t('settings.areaDescPlaceholder')}
                          className="mt-1"
                          rows={2}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button onClick={submitArea} disabled={submitting}>
                          {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                          {editingArea ? t('settings.update') : t('settings.create')}
                        </Button>
                        <Button variant="outline" onClick={resetAreaForm}>
                          {t('settings.cancel')}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      onClick={() => startAddArea(f.id)}
                      className="gap-2 w-full"
                      disabled={submitting}
                    >
                      <Plus className="w-4 h-4" /> {t('settings.addArea')}
                    </Button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
