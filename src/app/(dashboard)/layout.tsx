import { createClient } from '@/lib/supabase/server'
import { getAuthClaims, getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import TopBar from '@/components/shared/TopBar'
import BottomNav from '@/components/shared/BottomNav'
import OfflineQueueFlusher from '@/components/shared/OfflineQueueFlusher'
import Sidebar from '@/components/shared/Sidebar'
import AccountDisabled from '@/components/shared/AccountDisabled'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Local JWT check — no auth server round-trip on every navigation. The
  // profile query below runs under the same JWT and is verified server-side
  // by PostgREST, so a forged token still yields nothing.
  const claims = await getAuthClaims()
  if (!claims?.sub) redirect('/login')
  const userId = claims.sub

  const supabase = await createClient()
  // My-open-case count + the profile/custom-role overlay in parallel.
  // getCurrentUser() already reads the profile row (name, role, is_active) and
  // is React-cache()'d per request, so the shell reuses whatever a page below
  // also asks for instead of issuing its own `profiles` select — that
  // duplicate query cost one extra Supabase round-trip on EVERY page load.
  const [{ count: myOpenCount }, currentUser] = await Promise.all([
    supabase
      .from('incidents')
      .select('id', { count: 'exact', head: true })
      .neq('status', 'closed')
      .contains('assigned_user_ids', [userId]),
    getCurrentUser(),
  ])

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
      {/* Desktop-only left sidebar */}
      <Sidebar profile={profile} incidentBadge={myOpenCount ?? 0} capabilities={capabilities} customRole={customRole} />

      <div className="flex-1 flex flex-col min-w-0">
        {/* TopBar only on mobile; the sidebar handles brand/lang/user on desktop */}
        <div className="lg:hidden">
          <TopBar profile={profile} customRole={customRole} />
        </div>
        <main className="flex-1 w-full mx-auto px-4 py-4 pb-24 max-w-lg lg:max-w-5xl xl:max-w-7xl xl:px-6 lg:pb-8">
          {children}
        </main>
      </div>

      <BottomNav userRole={profile?.role} incidentBadge={myOpenCount ?? 0} capabilities={capabilities} />
      {/* Sends reports filled in without signal, on every page — see
          lib/offline-queue.ts. Renders nothing when the queue is empty. */}
      <OfflineQueueFlusher />
    </div>
  )
}
