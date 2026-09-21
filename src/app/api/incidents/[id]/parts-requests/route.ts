import { NextResponse } from 'next/server'
import { requireActiveUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

// GET /api/incidents/[id]/parts-requests — narrowly refresh the Gudang status
// card. This deliberately uses the caller's RLS-scoped client, so knowing an
// incident id is never enough to read another factory's request history.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireActiveUser()
  if (!guard.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: guard.status })

  const { id } = await params
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('parts_requests')
    .select('id, items, urgency, status, requested_at')
    .eq('incident_id', id)
    .order('requested_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(
    { requests: data ?? [], nowMs: Date.now() },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}
