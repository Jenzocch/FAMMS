'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import PhotoUpload from '@/components/shared/PhotoUpload'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { useI18n } from '@/lib/i18n'

interface Props {
  incidentId?: string
  defaultProblem?: string
  defaultRootCause?: string
}

export default function KBForm({ incidentId, defaultProblem = '', defaultRootCause = '' }: Props) {
  const router = useRouter()
  const { t } = useI18n()
  const [problem, setProblem] = useState(defaultProblem)
  const [rootCause, setRootCause] = useState(defaultRootCause)
  const [repairMethod, setRepairMethod] = useState('')
  const [lessons, setLessons] = useState('')
  const [keywords, setKeywords] = useState('')
  const [partsUsed, setPartsUsed] = useState('')
  const [photos, setPhotos] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)

  async function submit() {
    if (!problem || !rootCause || !repairMethod) {
      toast.error(t('kb.required', '問題、根本原因、修復方法為必填'))
      return
    }
    setSubmitting(true)
    try {
      const parts = partsUsed
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
      const res = await fetch('/api/knowledge-base', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          incident_id: incidentId || undefined,
          problem,
          root_cause: rootCause,
          repair_method: repairMethod,
          lessons_learned: lessons || undefined,
          keywords: keywords || undefined,
          parts_used: parts.length ? parts : undefined,
          photos: photos.length ? photos : undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t('kb.saveFailed', '儲存失敗'))
      toast.success(t('kb.saved', '知識庫已儲存'))
      router.push(`/knowledge-base/${json.entry.id}`)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('kb.saveFailed', '儲存失敗'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
      <div>
        <Label>{t('kb.problem', '問題 (Problem)')} <span className="text-red-500">*</span></Label>
        <Textarea
          value={problem}
          onChange={e => setProblem(e.target.value)}
          placeholder={t('kb.problemPlaceholder', '發生了什麼症狀／問題？')}
          rows={2}
          className="mt-1"
        />
      </div>

      <div>
        <Label>{t('kb.rootCause', '根本原因 (Root Cause)')} <span className="text-red-500">*</span></Label>
        <Textarea
          value={rootCause}
          onChange={e => setRootCause(e.target.value)}
          placeholder={t('kb.rootCausePlaceholder', '真正的原因是什麼？')}
          rows={2}
          className="mt-1"
        />
      </div>

      <div>
        <Label>{t('kb.repairMethod', '修復方法 (Repair Method)')} <span className="text-red-500">*</span></Label>
        <Textarea
          value={repairMethod}
          onChange={e => setRepairMethod(e.target.value)}
          placeholder={t('kb.repairMethodPlaceholder', '執行了哪些修復步驟...')}
          rows={3}
          className="mt-1"
        />
      </div>

      <div>
        <Label>{t('kb.lessons', '經驗教訓 (Lessons Learned)')}</Label>
        <Textarea
          value={lessons}
          onChange={e => setLessons(e.target.value)}
          placeholder={t('kb.lessonsPlaceholder', '學到什麼？如何預防再發生？')}
          rows={2}
          className="mt-1"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>{t('kb.partsUsed', '使用的 Parts')}</Label>
          <Input
            value={partsUsed}
            onChange={e => setPartsUsed(e.target.value)}
            placeholder={t('kb.partsPlaceholder', 'bearing 6205, seal, ...（逗號分隔）')}
            className="mt-1"
          />
        </div>
        <div>
          <Label>{t('kb.keywords', '關鍵字（供搜尋）')}</Label>
          <Input
            value={keywords}
            onChange={e => setKeywords(e.target.value)}
            placeholder={t('kb.keywordsPlaceholder', 'bearing, overheat, VFD, ...')}
            className="mt-1"
          />
        </div>
      </div>

      <div className="border-t border-gray-100 pt-4">
        <PhotoUpload label={t('kb.photos', '照片')} value={photos} onChange={setPhotos} folder="knowledge-base" />
      </div>

      <Button onClick={submit} disabled={submitting} className="w-full">
        {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        {t('kb.save', '儲存知識庫')}
      </Button>
    </div>
  )
}
