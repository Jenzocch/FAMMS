import OfflineMessage from '@/components/shared/OfflineMessage'

// Last-resort fallback: shown only when the service worker's navigation
// fetch fails AND there's no cached copy of the requested page either (e.g.
// first-ever visit to that URL while offline). Static, no data fetching —
// it must never itself depend on the network.
export const metadata = { title: 'Offline | FAMMS' }

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <OfflineMessage />
    </div>
  )
}
