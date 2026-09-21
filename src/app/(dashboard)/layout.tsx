import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import TopBar from '@/components/shared/TopBar'
import OfflineQueueFlusher from '@/components/shared/OfflineQueueFlusher'
import AccountDisabled from '@/components/shared/AccountDisabled'
import NavigationChrome from '@/components/shared/NavigationChrome'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // getCurrentUser() begins with a locally verified JWT check and its profile
  // lookup is React-cached per render. Do not make navigation wait on the
  // non-essential incident-badge count here; NavigationChrome reads it once
  // after the persistent shell is interactive.
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect('/login')

  // Admin-disabled accounts are blocked from the app entirely
  if (currentUser && currentUser.is_active === false) {
    return <AccountDisabled />
  }

  const capabilities = currentUser?.capabilities ?? null
  const customRole = currentUser?.customRole ?? null
  // Only the name + role reach the shell; see ShellUser in Sidebar.tsx.
  const profile = currentUser
    ? { full_name: currentUser.full_name, role: currentUser.role }
    : null

  return (
    <div className="min-h-screen bg-gray-50 lg:flex">
      <NavigationChrome profile={profile} capabilities={capabilities} customRole={customRole} />

      <div className="flex-1 flex flex-col min-w-0">
        {/* TopBar only on mobile; the sidebar handles brand/lang/user on desktop */}
        <div className="lg:hidden">
          <TopBar profile={profile} customRole={customRole} />
        </div>
        <main className="flex-1 w-full mx-auto px-4 py-4 pb-24 max-w-lg md:max-w-3xl md:px-6 lg:max-w-5xl lg:pb-8 xl:max-w-7xl xl:px-6">
          {children}
        </main>
      </div>

      {/* Sends reports filled in without signal, on every page — see
          lib/offline-queue.ts. Renders nothing when the queue is empty. */}
      <OfflineQueueFlusher />
    </div>
  )
}
