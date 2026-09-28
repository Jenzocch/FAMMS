import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const guard = await requireAdmin()
  if (!guard.ok) return NextResponse.json({ error: '無權限' }, { status: guard.status })
  const admin = createAdminClient()
  const [{ data: devices, error: devicesError }, { data: factories, error: factoriesError }, { data: profiles, error: profilesError }] = await Promise.all([
    admin.from('shared_devices').select('id, auth_user_id, factory_id, label, enabled, updated_at').order('created_at', { ascending: false }),
    admin.from('factories').select('id, name').order('name'),
    admin.from('profiles').select('id, full_name, role, factory_id, is_active, is_shared_device').eq('role', 'technician').eq('is_active', true).order('full_name'),
  ])
  if (devicesError || factoriesError || profilesError) return NextResponse.json({ error: '平板設定載入失敗，請稍後重試' }, { status: 500 })
  const ids = (devices ?? []).map(device => device.id)
  const { data: roster, error: rosterError } = ids.length
    ? await admin.from('shared_device_roster').select('device_id, technician_profile_id').in('device_id', ids)
    : { data: [], error: null }
  if (rosterError) return NextResponse.json({ error: '技師名單載入失敗，請稍後重試' }, { status: 500 })
  return NextResponse.json({ devices: (devices ?? []).map(device => ({
    ...device,
    roster: (roster ?? []).filter(member => member.device_id === device.id).map(member => member.technician_profile_id),
  })), factories: factories ?? [], technicians: profiles ?? [] }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
}

export async function POST(request: Request) {
  const guard = await requireAdmin()
  if (!guard.ok) return NextResponse.json({ error: '無權限' }, { status: guard.status })
  let body: { auth_user_id?: unknown; factory_id?: unknown; label?: unknown; technician_ids?: unknown }
  try { body = await request.json() } catch { return NextResponse.json({ error: '請求格式無效' }, { status: 400 }) }
  const authUserId = typeof body.auth_user_id === 'string' ? body.auth_user_id : ''
  const factoryId = typeof body.factory_id === 'string' ? body.factory_id : ''
  const label = typeof body.label === 'string' ? body.label.trim().slice(0, 100) : ''
  const technicianIds = Array.isArray(body.technician_ids) ? body.technician_ids : []
  if (!authUserId || !factoryId || !label || technicianIds.length < 1 || technicianIds.length > 20 || technicianIds.some(id => typeof id !== 'string') || new Set(technicianIds).size !== technicianIds.length) {
    return NextResponse.json({ error: '請設定平板帳號、工廠、名稱及 1–20 位技師' }, { status: 400 })
  }
  const admin = createAdminClient()
  const [{ data: account, error: accountError }, { data: members, error: membersError }] = await Promise.all([
    admin.from('profiles').select('id, role, factory_id, is_active, is_shared_device').eq('id', authUserId).maybeSingle(),
    admin.from('profiles').select('id').in('id', technicianIds).eq('role', 'technician').eq('factory_id', factoryId).eq('is_active', true),
  ])
  if (accountError || membersError) return NextResponse.json({ error: '帳號或技師名單驗證失敗，請稍後重試' }, { status: 500 })
  if (!account || account.role !== 'technician' || account.is_active !== true || account.is_shared_device !== true || account.factory_id !== factoryId) {
    return NextResponse.json({ error: '平板登入帳號必須是同工廠、啟用中的共用技師帳號' }, { status: 400 })
  }
  if ((members ?? []).length !== technicianIds.length || technicianIds.includes(authUserId)) {
    return NextResponse.json({ error: '技師名單必須全部是同工廠啟用中的個人技師帳號' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const { data: existingDevice, error: existingDeviceError } = await admin.from('shared_devices').select('id').eq('auth_user_id', authUserId).maybeSingle()
  if (existingDeviceError) return NextResponse.json({ error: '平板設定讀取失敗，請稍後重試' }, { status: 500 })
  const { data: device, error } = existingDevice
    ? await admin.from('shared_devices').update({
        factory_id: factoryId, label, enabled: false, updated_at: now,
        disabled_at: now, disabled_by_user_id: guard.user.id,
      }).eq('id', existingDevice.id).select('id').single()
    : await admin.from('shared_devices').insert({
        auth_user_id: authUserId, factory_id: factoryId, label, enabled: false,
        updated_at: now, created_by_user_id: guard.user.id,
      }).select('id').single()
  if (error || !device) return NextResponse.json({ error: '平板資料儲存失敗' }, { status: 500 })

  const { error: clearError } = await admin.from('shared_device_roster').delete().eq('device_id', device.id)
  if (clearError) return NextResponse.json({ error: '名單更新失敗；平板目前維持停用' }, { status: 500 })
  const { error: rosterError } = await admin.from('shared_device_roster').insert(technicianIds.map(technician_profile_id => ({ device_id: device.id, technician_profile_id })))
  if (rosterError) return NextResponse.json({ error: '名單更新失敗；平板目前維持停用' }, { status: 500 })
  const { error: enableError } = await admin.from('shared_devices').update({ enabled: true, updated_at: new Date().toISOString(), disabled_at: null, disabled_by_user_id: null }).eq('id', device.id)
  if (enableError) return NextResponse.json({ error: '平板設定尚未啟用' }, { status: 500 })
  return NextResponse.json({ ok: true, deviceId: device.id }, { status: 201 })
}
