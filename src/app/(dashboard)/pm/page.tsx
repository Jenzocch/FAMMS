import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import PMPage from '@/components/pm/PMPage'
import type { UserRole } from '@/types'

export const metadata = { title: 'PM | FAMMS' }

export default async function PMRoutePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  // Pass role (gates the schedule manager) and the user's own factory so the
  // PM calendar loads without an extra pick — no extra queries: getCurrentUser
  // already carries both.
  return (
    <PMPage
      role={(user.role ?? 'technician') as UserRole}
      defaultFactoryId={user.factory_id}
    />
  )
}
