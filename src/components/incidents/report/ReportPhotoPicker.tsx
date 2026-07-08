'use client'

import { Label } from '@/components/ui/label'
import { Camera, X, ZoomIn } from 'lucide-react'
import { useI18n } from '@/lib/i18n'

// Photo gallery + capture button for the incident report form. Purely
// presentational — compression and state live in usePhotoCapture.
export default function ReportPhotoPicker({
  photos, photoPreviews, compressing, maxPhotos, onAddPhotos, onRemovePhoto,
}: {
  photos: File[]
  photoPreviews: string[]
  compressing: boolean
  maxPhotos: number
  onAddPhotos: (files: File[]) => void
  onRemovePhoto: (index: number) => void
}) {
  const { t } = useI18n()

  return (
    <div>
      <Label className="text-base">{t('report.photos')}</Label>
      <div className="mt-1 space-y-2">
        {photos.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {photos.map((p, i) => (
              <div key={i} className="relative group">
                <img
                  src={photoPreviews[i]}
                  alt={`${t('report.photos')} ${i + 1}`}
                  className="w-24 h-24 object-cover rounded-lg border border-gray-200 group-hover:opacity-80 transition-opacity"
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/0 group-hover:bg-black/40 rounded-lg transition-all">
                  <ZoomIn className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                  <span className="text-xs text-white opacity-0 group-hover:opacity-100 mt-1 transition-opacity">
                    {(p.size / 1024).toFixed(0)} KB
                  </span>
                </div>
                <button
                  type="button"
                  aria-label={`${t('common.delete')} ${i + 1}`}
                  onClick={() => onRemovePhoto(i)}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center shadow-lg hover:bg-red-600 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        {photos.length < maxPhotos && (
          <label className={`flex items-center gap-2 border-2 border-dashed rounded-lg p-4 cursor-pointer transition-colors ${
            compressing ? 'border-blue-300 bg-blue-50' : 'border-gray-300 hover:border-blue-400'
          }`}>
            <Camera className="w-5 h-5 text-gray-400" />
            <div className="flex-1 text-sm">
              <span className="text-gray-500">
                {compressing ? t('report.compressing') : t('report.takePhoto')}
              </span>
            </div>
            <input
              type="file"
              accept="image/*"
              multiple
              capture="environment"
              onChange={e => onAddPhotos(Array.from(e.target.files ?? []))}
              disabled={compressing}
              className="hidden"
            />
          </label>
        )}
        {photos.length > 0 && (
          <p className="text-xs text-gray-400 mt-2">
            共 {photos.length} 張（{(photos.reduce((s, f) => s + f.size, 0) / 1024 / 1024).toFixed(1)} MB）
          </p>
        )}
      </div>
    </div>
  )
}
