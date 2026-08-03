'use client'

import { WifiOff } from 'lucide-react'
import { useI18n } from '@/lib/i18n'

// Content for app/offline/page.tsx — split into its own client component so
// the page itself can stay a Server Component and keep exporting `metadata`
// (a client-marked page can't). Purely static text via useI18n(); no data
// fetching, so this still satisfies the page's own "must never depend on the
// network" rule.
export default function OfflineMessage() {
  const { t } = useI18n()
  return (
    <div className="text-center max-w-sm">
      <div className="inline-flex items-center justify-center w-14 h-14 bg-gray-200 rounded-2xl mb-4">
        <WifiOff className="w-7 h-7 text-gray-500" />
      </div>
      <h1 className="text-lg font-bold text-gray-900">{t('offline.pageTitle', 'Tidak ada koneksi saat ini')}</h1>
      <p className="text-sm text-gray-500 mt-2">
        {t('offline.pageBody', 'Belum ada salinan offline untuk halaman ini. Muat ulang setelah sinyal kembali.')}
      </p>
    </div>
  )
}
