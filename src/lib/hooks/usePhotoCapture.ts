'use client'

import { useEffect, useMemo, useState } from 'react'
import imageCompression from 'browser-image-compression'
import { toast } from 'sonner'
import { useI18n } from '@/lib/i18n'

// Client-side photo capture + compression shared by the report and
// progress-update forms. Individual files that fail to compress (e.g. very
// large images on low-end devices) are skipped rather than failing the whole
// batch. Preview URLs are revoked on change/unmount so nothing leaks.
export function usePhotoCapture(maxPhotos = 5) {
  const { t } = useI18n()
  const [photos, setPhotos] = useState<File[]>([])
  const [compressing, setCompressing] = useState(false)

  const photoPreviews = useMemo(() => photos.map(p => URL.createObjectURL(p)), [photos])
  useEffect(() => () => { photoPreviews.forEach(u => URL.revokeObjectURL(u)) }, [photoPreviews])

  async function addPhotos(files: File[]) {
    if (files.length === 0) return
    setCompressing(true)
    try {
      const compressed: File[] = []
      for (const file of files) {
        if (!file.type.startsWith('image/')) continue
        try {
          compressed.push(await imageCompression(file, { maxSizeMB: 0.8, maxWidthOrHeight: 1280, useWebWorker: true }))
        } catch (fileErr) {
          console.warn('Failed to compress individual file:', file.name, fileErr)
        }
      }
      if (compressed.length > 0) {
        // slice() silently drops anything past the cap — say so; users who
        // picked 6 assumed all 6 uploaded.
        const dropped = Math.max(0, photos.length + compressed.length - maxPhotos)
        setPhotos(prev => [...prev, ...compressed].slice(0, maxPhotos))
        toast.success(t('report.compressedToast', `壓縮 ${compressed.length} 張完成`).replace('{count}', String(compressed.length)))
        if (dropped > 0) {
          toast.warning(
            t('report.photoLimitDropped', '最多 {max} 張，已略過多出的 {n} 張')
              .replace('{max}', String(maxPhotos))
              .replace('{n}', String(dropped))
          )
        }
      }
      if (compressed.length < files.length) {
        toast.warning(`${files.length - compressed.length} ${t('report.compressSkipped', 'file(s) could not be compressed (too large for device)')}`)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('report.compressFailed'))
    } finally {
      setCompressing(false)
    }
  }

  function removePhoto(index: number) {
    setPhotos(prev => prev.filter((_, j) => j !== index))
  }

  function resetPhotos() {
    setPhotos([])
  }

  return { photos, photoPreviews, compressing, addPhotos, removePhoto, resetPhotos }
}
