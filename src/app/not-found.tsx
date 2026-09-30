import Link from 'next/link'
import { FileQuestion } from 'lucide-react'

// A deliberate recovery path for stale links, deleted incidents, and manual
// URL entry. It remains server-rendered and does not fetch user data.
export default function NotFound() {
  return (
    <main className="min-h-[60vh] grid place-items-center px-4 py-10">
      <section className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-gray-100 text-gray-600">
          <FileQuestion className="h-6 w-6" aria-hidden="true" />
        </div>
        <p className="text-sm font-medium text-blue-700">404</p>
        <h1 className="mt-1 text-lg font-semibold text-gray-900">找不到這個頁面或工單</h1>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          連結可能已過期、資料已移除，或您目前沒有查看權限。
        </p>
        <Link
          href="/dashboard"
          className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          回到儀表板
        </Link>
      </section>
    </main>
  )
}
