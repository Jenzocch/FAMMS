'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// Personal reports use the authenticated profile by default. A shared-device
// session stays blank so the real person at the device must identify themself.
export function useReporterAccounts() {
  const supabase = createClient()
  const [defaultReporterName, setDefaultReporterName] = useState('')
  const [reporterName, setReporterName] = useState('')
  // Exposed so the form asks for a real person's name on shared-device
  // sessions while ordinary personal sessions use the authenticated profile.
  const [isSharedDevice, setIsSharedDevice] = useState(false)
  const [identityStatus, setIdentityStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    let active = true
    // getSession is a local read. Do not allow submit until the identity flag
    // is checked: otherwise a fast tap on a shared device could bypass the
    // actual-person-required rule during this request.
    void (async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        if (sessionError || !session?.user.id) throw sessionError ?? new Error('Missing session')
        const { data, error } = await supabase.from('profiles')
          .select('id, full_name, is_shared_device').eq('id', session.user.id).single()
        if (error || !data) throw error ?? new Error('Missing profile')
        if (!active) return
        if (data.is_shared_device) {
          setIsSharedDevice(true)
        } else {
          const name = data.full_name || ''
          setDefaultReporterName(name)
          setReporterName(name)
        }
        setIdentityStatus('ready')
      } catch {
        if (active) setIdentityStatus('error')
      }
    })()
    return () => { active = false }
    // Mount-only load. `supabase` is intentionally omitted: createClient()
    // returns a new client instance every call (not memoized), so adding it
    // here would re-run this effect on every render instead of once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    defaultReporterName, reporterName, setReporterName, isSharedDevice, identityStatus,
  }
}
