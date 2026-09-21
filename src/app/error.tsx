'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle, RefreshCw } from 'lucide-react'

// Route-level recovery keeps an intermittent data/API failure from becoming a
// blank dashboard. `reset` re-renders only the failed route segment instead of
// forcing a full browser reload and discarding the rest of the app shell.
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Route render failed', error)
  }, [error])

  return (
    <main className="min-h-[60vh] grid place-items-center px-4 py-10" role="alert" aria-live="assertive">
      <section className="w-full max-w-md rounded-2xl border border-amber-200 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-amber-50 text-amber-700">
          <AlertTriangle className="h-6 w-6" aria-hidden="true" />
        </div>
        <h1 className="text-lg font-semibold text-gray-900">頁面暫時無法載入</h1>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          可能是網路連線或資料暫時發生問題。重新嘗試不會遺失已儲存的資料。
        </p>
        {error.digest && <p className="mt-2 text-xs text-gray-400">參考碼：{error.digest}</p>}
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> 再試一次
          </button>
          <Link
            href="/dashboard"
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            回到儀表板
          </Link>
        </div>
      </section>
    </main>
  )
}
