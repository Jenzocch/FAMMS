import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Teknisi | FAMMS',
}

export default function TabletLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto min-h-screen w-full max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
        {children}
      </div>
    </div>
  )
}
