import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (!guard.ok) return NextResponse.json({ error: '無權限' }, { status: guard.status })
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: '平板編號無效' }, { status: 400 })
  let body: { enabled?: unknown }
  try { body = await request.json() } catch { return NextResponse.json({ error: '請求格式無效' }, { status: 400 }) }
  if (typeof body.enabled !== 'boolean') return NextResponse.json({ error: '狀態無效' }, { status: 400 })
  const { error } = await createAdminClient().rpc('set_shared_device_enabled', { p_actor_id: guard.user.id, p_device_id: id, p_enabled: body.enabled })
  if (error) return NextResponse.json({ error: error.code === '42501' ? '無權限' : '帳號、工廠或處理人名單不完整' }, { status: error.code === '42501' ? 403 : 400 })
  return NextResponse.json({ ok: true })
}
