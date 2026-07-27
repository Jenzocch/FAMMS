'use client'

import { Label } from '@/components/ui/label'
import { Camera, Images, X, ZoomIn } from 'lucide-react'
import { useI18n } from '@/lib/i18n'

// Photo gallery + capture buttons. Purely presentational — compression and
// state live in usePhotoCapture.
//
// Two variants, because the same widget carries different weight in the two
// places it appears, and ProgressUpdate previously kept its own near-identical
// copy rather than reuse this one:
//
//  'report' — the report form and the case-edit form. Big, unmistakable tap
//             targets: taking a photo is the primary action there, usually
//             done one-handed while standing at the fault.
//  'update' — the progress-update card. Compact, because it sits below a
//             status picker, an ETA and a note field that matter more.
//
// The variant also selects the i18n key namespace, since the two contexts word
// these labels differently ("拍照" vs "加照片").
type Variant = 'report' | 'update'

const KEYS: Record<Variant, {
  photos: string; compressing: string; take: string; gallery: string; count: string
}> = {
  report: {
    photos: 'report.photos',
    compressing: 'report.compressing',
    take: 'report.takePhoto',
    gallery: 'report.chooseFromGallery',
    count: 'report.photoCount',
  },
  update: {
    photos: 'progressUpdate.photos',
    compressing: 'progressUpdate.compressing',
    take: 'progressUpdate.takePhoto',
    gallery: 'progressUpdate.addPhoto',
    count: 'progressUpdate.photoCount',
  },
}

export default function PhotoPicker({
  photos, photoPreviews, compressing, maxPhotos, onAddPhotos, onRemovePhoto,
  variant = 'report',
}: {
  photos: File[]
  photoPreviews: string[]
  compressing: boolean
  maxPhotos: number
  onAddPhotos: (files: File[]) => void
  onRemovePhoto: (index: number) => void
  variant?: Variant
}) {
  const { t } = useI18n()
  const k = KEYS[variant]
  const big = variant === 'report'

  const photosLabel = t(k.photos)
  const totalMb = (photos.reduce((s, f) => s + f.size, 0) / 1024 / 1024).toFixed(1)

  // One <label>-wrapped file input per source. Two explicit buttons instead of
  // one merged picker: on some Android builds a single
  // <input type="file" accept="image/*"> without `capture` opens a chooser
  // that's missing the gallery entry — the merged "let the OS decide" chooser
  // is unreliable across devices, a dedicated gallery-only input always works.
  const sourceButton = (
    kind: 'camera' | 'gallery',
    icon: React.ReactNode,
    label: string,
  ) => (
    <label
      key={kind}
      className={
        big
          ? `flex-1 flex flex-col items-center justify-center gap-1.5 border-2 border-dashed rounded-xl h-28 cursor-pointer transition-colors ${
              compressing ? 'border-blue-300 bg-blue-50' : 'border-blue-300 bg-blue-50/60 active:bg-blue-100 hover:border-blue-400'
            }`
          : `flex-1 flex items-center justify-center gap-2 border-2 border-dashed rounded-lg p-2.5 cursor-pointer transition-colors ${
              compressing ? 'border-blue-300 bg-blue-50' : 'border-gray-300 hover:border-blue-400'
            }`
      }
    >
      {icon}
      <span className={big ? 'text-sm font-semibold text-blue-700' : 'text-sm text-gray-500'}>
        {compressing ? t(k.compressing) : label}
      </span>
      <input
        type="file"
        accept="image/*"
        {...(kind === 'camera' ? { capture: 'environment' as const } : { multiple: true })}
        onChange={e => onAddPhotos(Array.from(e.target.files ?? []))}
        disabled={compressing}
        className="hidden"
      />
    </label>
  )

  const iconCls = big ? 'w-7 h-7 text-blue-500' : 'w-5 h-5 text-gray-400'

  return (
    <div>
      <Label className={big ? 'text-base' : undefined}>{photosLabel}</Label>
      <div className="mt-1 space-y-2">
        {photos.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {photos.map((p, i) => (
              <div key={i} className="relative group">
                {/* eslint-disable-next-line @next/next/no-img-element -- local
                    blob: preview of a File the user just picked, not a static
                    or remote asset next/image can optimize */}
                <img
                  src={photoPreviews[i]}
                  alt={`${photosLabel} ${i + 1}`}
                  className={`${big ? 'w-24 h-24' : 'w-20 h-20'} object-cover rounded-lg border border-gray-200 group-hover:opacity-80 transition-opacity`}
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/0 group-hover:bg-black/40 rounded-lg transition-all">
                  <ZoomIn className={`${big ? 'w-5 h-5' : 'w-4 h-4'} text-white opacity-0 group-hover:opacity-100 transition-opacity`} />
                  <span className={`text-xs text-white opacity-0 group-hover:opacity-100 ${big ? 'mt-1' : 'mt-0.5'} transition-opacity`}>
                    {(p.size / 1024).toFixed(0)} KB
                  </span>
                </div>
                <button
                  type="button"
                  aria-label={`${t('common.delete')} ${i + 1}`}
                  onClick={() => onRemovePhoto(i)}
                  className={`absolute ${big ? '-top-2 -right-2 w-6 h-6' : '-top-1 -right-1 w-5 h-5'} bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-red-600 transition-colors`}
                >
                  <X className={big ? 'w-3.5 h-3.5' : 'w-3 h-3'} />
                </button>
              </div>
            ))}
          </div>
        )}

        {photos.length < maxPhotos && (
          <div className="flex gap-2">
            {sourceButton('camera', <Camera className={iconCls} />, t(k.take))}
            {sourceButton('gallery', <Images className={iconCls} />, t(k.gallery))}
          </div>
        )}

        {photos.length > 0 && (
          <p className={`text-xs text-gray-400 ${big ? 'mt-2' : ''}`}>
            {t(k.count).replace('{count}', String(photos.length)).replace('{mb}', totalMb)}
          </p>
        )}
      </div>
    </div>
  )
}
