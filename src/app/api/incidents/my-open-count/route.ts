import { NextResponse } from 'next/server'
import { requireActiveUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

// A deliberately narrow, post-shell read. The dashboard layout must not wait
// for a badge count before every navigation; the persistent client shell asks
// for it once after it has rendered instead.
export async function GET() {
  const guard = await requireActiveUser()
  if (!guard.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: guard.status })

  const supabase = await createClient()
  const { count, error } = await supabase
    .from('incidents')
    .select('id', { count: 'exact', head: true })
    .neq('status', 'closed')
    .contains('assigned_user_ids', [guard.user.id])

  if (error) return NextResponse.json({ error: 'Failed to load incident badge' }, { status: 500 })

  return NextResponse.json(
    { count: count ?? 0 },
    // The count is user-specific and changes after writes. Keep it out of
    // shared/CDN caches; NavigationChrome owns its in-memory lifetime.
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}
