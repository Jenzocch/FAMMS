'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface Factory {
  id: string
  name: string
  code: string | null
}

// Module-level cache of the factory list. Every page has a factory picker and
// each one used to fetch `factories` on mount — this shares one fetch across
// them all. Managers that mutate factories call invalidateFactories().
let cache: Factory[] | null = null
let inflight: Promise<Factory[]> | null = null
const listeners = new Set<(f: Factory[]) => void>()

async function fetchFactories(): Promise<Factory[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('factories')
    .select('id, name, code')
    .order('name')
  return (data ?? []) as Factory[]
}

export function loadFactories(force = false): Promise<Factory[]> {
  if (cache && !force) return Promise.resolve(cache)
  if (inflight && !force) return inflight
  inflight = fetchFactories().then(rows => {
    cache = rows
    inflight = null
    listeners.forEach(l => l(rows))
    return rows
  })
  return inflight
}

// Re-fetch and notify all mounted consumers. Call after add/edit/delete in the
// settings FactoryManager so every picker reflects the change without a reload.
export function invalidateFactories(): Promise<Factory[]> {
  cache = null
  inflight = null
  return loadFactories(true)
}

export function useFactories(): { factories: Factory[]; loading: boolean } {
  const [factories, setFactories] = useState<Factory[]>(cache ?? [])
  const [loading, setLoading] = useState(cache === null)

  useEffect(() => {
    let mounted = true
    const listener = (next: Factory[]) => {
      if (mounted) { setFactories(next); setLoading(false) }
    }
    listeners.add(listener)
    loadFactories().then(rows => {
      if (mounted) { setFactories(rows); setLoading(false) }
    })
    return () => { mounted = false; listeners.delete(listener) }
  }, [])

  return { factories, loading }
}
