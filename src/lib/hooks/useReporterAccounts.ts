'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface ReporterAccount { id: string; full_name: string | null }

// Active accounts for the reporter picker, defaulted to the logged-in user
// (most reports are self-reports) while still allowing manual entry or
// picking someone else for on-behalf reporting.
export function useReporterAccounts() {
  const supabase = createClient()
  const [accounts, setAccounts] = useState<ReporterAccount[]>([])
  const [reporterName, setReporterName] = useState('')
  const [reporterAccountId, setReporterAccountId] = useState('')

  useEffect(() => {
    supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name')
      .then(({ data }) => setAccounts((data ?? []) as ReporterAccount[]))

    // getSession = local read, keeps the form opening instantly.
    supabase.auth.getSession().then(({ data: { session } }) => {
      const uid = session?.user.id
      if (!uid) return
      supabase.from('profiles').select('id, full_name').eq('id', uid).single()
        .then(({ data }) => {
          if (!data) return
          setReporterAccountId(prev => prev || data.id)
          setReporterName(prev => prev || data.full_name || '')
        })
    })
  }, [])

  return { accounts, reporterName, setReporterName, reporterAccountId, setReporterAccountId }
}
