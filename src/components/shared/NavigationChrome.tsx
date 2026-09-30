'use client'

import { useEffect, useState } from 'react'
import Sidebar, { type ShellUser } from '@/components/shared/Sidebar'
import BottomNav from '@/components/shared/BottomNav'
import type { CustomRole, EffectiveCapabilities } from '@/lib/roles'

interface NavigationChromeProps {
  profile: ShellUser | null
  capabilities: EffectiveCapabilities | null
  customRole: CustomRole | null
}

// Sidebar and BottomNav are both mounted for responsive CSS, so owning this
// state one level above them is important: it turns two potential requests
// into one and survives normal App Router page transitions.
export default function NavigationChrome({ profile, capabilities, customRole }: NavigationChromeProps) {
  const [incidentBadge, setIncidentBadge] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    async function loadIncidentBadge() {
      try {
        const response = await fetch('/api/incidents/my-open-count', {
          cache: 'no-store',
          signal: controller.signal,
        })
        if (!response.ok) return
        const body = await response.json() as { count?: unknown }
        if (typeof body.count === 'number' && Number.isFinite(body.count) && body.count >= 0) {
          setIncidentBadge(body.count)
        }
      } catch (error) {
        // Navigation remains usable offline or during a transient failure; a
        // badge is an enhancement, not a reason to block the whole shell.
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setIncidentBadge(0)
        }
      }
    }

    void loadIncidentBadge()
    return () => controller.abort()
  }, [])

  return (
    <>
      <Sidebar
        profile={profile}
        incidentBadge={incidentBadge}
        capabilities={capabilities}
        customRole={customRole}
      />
      <BottomNav
        userRole={profile?.role}
        incidentBadge={incidentBadge}
        capabilities={capabilities}
      />
    </>
  )
}
