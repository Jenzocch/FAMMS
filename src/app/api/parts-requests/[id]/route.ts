import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getCurrentUser, PERMISSIONS } from '@/lib/auth'

// PATCH /api/parts-requests/[id] — advance a request's status
// (requested -> ordered -> received, or rejected). Supervisor+ only: this is
// the warehouse-facing side, not something a technician self-confirms.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!PERMISSIONS.managePartsRequests(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const { status, external_ref } = body as { status?: string; external_ref?: string }

  if (!status || !['requested', 'ordered', 'received', 'rejected'].includes(status)) {
    return NextResponse.json({ error: 'status tidak valid' }, { status: 400 })
  }

  const supabase = await createClient()
  const resolved = status === 'received' || status === 'rejected'
  const { data, error } = await supabase
    .from('parts_requests')
    .update({
      status,
      external_ref: external_ref?.trim() || undefined,
      resolved_at: resolved ? new Date().toISOString() : null,
    })
    .eq('id', id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ request: data })
}
