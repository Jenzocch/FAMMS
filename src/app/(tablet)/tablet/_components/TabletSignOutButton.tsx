'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signOutAndClearCaches } from '@/lib/sign-out'

export default function TabletSignOutButton() {
  const router = useRouter()
  const [signingOut, setSigningOut] = useState(false)

  async function signOut() {
    if (signingOut) return
    setSigningOut(true)
    await signOutAndClearCaches()
    router.replace('/login')
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={signingOut}
      className="min-h-12 rounded-xl border border-slate-200 px-5 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
    >
      {signingOut ? 'Keluar…' : 'Keluar ke akun pribadi'}
    </button>
  )
}
