import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (!guard.ok) return NextResponse.json({ error: '無權限' }, { status: guard.status })
  const { id } = await params
  let body: { enabled?: unknown }
  try { body = await request.json() } catch { return NextResponse.json({ error: '請求格式無效' }, { status: 400 }) }
  if (typeof body.enabled !== 'boolean') return NextResponse.json({ error: '狀態無效' }, { status: 400 })

  const admin = createAdminClient()
  const { data: device } = await admin.from('shared_devices').select('id, auth_user_id, factory_id').eq('id', id).maybeSingle()
  if (!device) return NextResponse.json({ error: '找不到平板' }, { status: 404 })
  if (body.enabled) {
    const [{ data: account }, { data: roster }] = await Promise.all([
      admin.from('profiles').select('id, role, factory_id, is_active, is_shared_device').eq('id', device.auth_user_id).maybeSingle(),
      admin.from('shared_device_roster').select('technician_profile_id').eq('device_id', id),
    ])
    if (!account || account.role !== 'technician' || account.is_active !== true || !account.is_shared_device || account.factory_id !== device.factory_id || !roster?.length) {
      return NextResponse.json({ error: '帳號或技師名單不完整，無法啟用' }, { status: 400 })
    }
    const { data: members } = await admin.from('profiles').select('id, role, factory_id, is_active')
      .in('id', roster.map(row => row.technician_profile_id))
    if (!members || members.length !== roster.length || members.some(member => member.role !== 'technician' || member.is_active !== true || member.factory_id !== device.factory_id)) {
      return NextResponse.json({ error: '名單中有已停用或跨工廠的技師，請先更新名單' }, { status: 400 })
    }
  }
  const { error } = await admin.from('shared_devices').update({
    enabled: body.enabled,
    updated_at: new Date().toISOString(),
    disabled_at: body.enabled ? null : new Date().toISOString(),
    disabled_by_user_id: body.enabled ? null : guard.user.id,
  }).eq('id', id)
  if (error) return NextResponse.json({ error: '平板狀態更新失敗' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
