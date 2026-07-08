'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface Vendor {
  id: string
  name: string
  factory_id: string | null  // NULL = available to every factory
  is_active: boolean
}

// Module-level cache shared across AssignForm (per incident) and the settings
// VendorManager, so adding/removing a vendor is immediately reflected in any
// mounted assignment form without a page reload.
let cache: Vendor[] | null = null
let inflight: Promise<Vendor[]> | null = null
const listeners = new Set<(vendors: Vendor[]) => void>()

async function fetchVendors(): Promise<Vendor[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('vendors')
    .select('id, name, factory_id, is_active')
    .eq('is_active', true)
    .order('name')
  return (data ?? []) as Vendor[]
}

export function loadVendors(force = false): Promise<Vendor[]> {
  if (cache && !force) return Promise.resolve(cache)
  if (inflight && !force) return inflight
  inflight = fetchVendors().then(rows => {
    cache = rows
    inflight = null
    listeners.forEach(l => l(rows))
    return rows
  })
  return inflight
}

// Drop the cache and re-fetch, notifying all mounted consumers. Call after a
// mutation (add / soft-delete) in the settings manager.
export function invalidateVendors(): Promise<Vendor[]> {
  cache = null
  inflight = null
  return loadVendors(true)
}

export function useVendors(): { vendors: Vendor[]; loading: boolean } {
  const [vendors, setVendors] = useState<Vendor[]>(cache ?? [])
  const [loading, setLoading] = useState(cache === null)

  useEffect(() => {
    let mounted = true
    const listener = (next: Vendor[]) => {
      if (mounted) { setVendors(next); setLoading(false) }
    }
    listeners.add(listener)
    loadVendors().then(rows => {
      if (mounted) { setVendors(rows); setLoading(false) }
    })
    return () => { mounted = false; listeners.delete(listener) }
  }, [])

  return { vendors, loading }
}
