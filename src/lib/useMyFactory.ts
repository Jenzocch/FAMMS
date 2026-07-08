'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// Module-level cache: the signed-in user's factory_id (null = cross-factory
// account). Shared by every page with a factory picker so each one can
// preselect the user's own factory without re-querying profiles on every mount.
let cache: string | null | undefined // undefined = not fetched yet
let inflight: Promise<string | null> | null = null

async function fetchMyFactoryId(): Promise<string | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('profiles')
    .select('factory_id')
    .eq('id', user.id)
    .single()
  return data?.factory_id ?? null
}

export function loadMyFactoryId(): Promise<string | null> {
  if (cache !== undefined) return Promise.resolve(cache)
  if (inflight) return inflight
  inflight = fetchMyFactoryId().then(id => {
    cache = id
    inflight = null
    return id
  })
  return inflight
}

/**
 * The signed-in user's factory_id (null when the profile has no factory —
 * e.g. cross-factory admins — or while signed out). `loading` is true only
 * on the first fetch; afterwards the value is served from cache.
 */
export function useMyFactory(): { factoryId: string | null; loading: boolean } {
  const [factoryId, setFactoryId] = useState<string | null>(cache === undefined ? null : cache)
  const [loading, setLoading] = useState(cache === undefined)

  useEffect(() => {
    let mounted = true
    loadMyFactoryId().then(id => {
      if (mounted) { setFactoryId(id); setLoading(false) }
    })
    return () => { mounted = false }
  }, [])

  return { factoryId, loading }
}
