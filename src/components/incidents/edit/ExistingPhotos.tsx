'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { Label } from '@/components/ui/label'
import { Loader2, X } from 'lucide-react'
import { useI18n } from '@/lib/i18n'

// The report photos already on an incident. Supervisor+ can remove a
// wrong/blurry one (audit-logged, via the API); everyone else just sees them
// for context — photos are field evidence, so deleting is not open to the
// reporter even though ADDING is (a bad shot gets fixed by a clearer one).
export default function ExistingPhotos({
  incidentId, paths, supabaseUrl, canDelete,
}: {
  incidentId: string
  paths: string[]
  supabaseUrl: string
  canDelete: boolean
}) {
  const { t } = useI18n()
  const router = useRouter()
  const [deleting, setDeleting] = useState<string | null>(null)

  if (paths.length === 0) return null

  async function deletePhoto(path: string) {
    if (!confirm(t('caseEdit.confirmDeletePhoto', '確定刪除這張照片？'))) return
    setDeleting(path)
    try {
      const res = await fetch(`/api/incidents/${incidentId}/photos`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t('caseEdit.deletePhotoFailed', '刪除照片失敗'))
      toast.success(t('caseEdit.photoDeleted', '照片已刪除'))
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('caseEdit.deletePhotoFailed', '刪除照片失敗'))
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div>
      <Label>{t('caseEdit.existingPhotos', '已上傳的照片')}</Label>
      <div className="mt-1 flex flex-wrap gap-2">
        {paths.map(path => (
          <div key={path} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${supabaseUrl}/storage/v1/object/public/incident-photos/${path}`}
              alt=""
              className="w-20 h-20 object-cover rounded-lg border border-gray-200"
            />
            {canDelete && (
              <button
                type="button"
                aria-label={t('caseEdit.deletePhoto', '刪除照片')}
                onClick={() => deletePhoto(path)}
                disabled={deleting === path}
                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center shadow-lg hover:bg-red-600 disabled:opacity-50"
              >
                {deleting === path
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <X className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
