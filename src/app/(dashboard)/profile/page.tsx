import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import ProfileForm from '@/components/profile/ProfileForm'

export default async function ProfilePage() {
  // The dashboard layout has already requested this exact user in the same
  // render, so React cache() reuses its result. Passing this small DTO avoids
  // a second client-side auth.getUser() + profiles.select() waterfall.
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect('/login')

  return (
    <ProfileForm
      initialProfile={{
        id: currentUser.id,
        full_name: currentUser.full_name,
        factory_id: currentUser.factory_id,
        role: currentUser.role,
      }}
    />
  )
}
