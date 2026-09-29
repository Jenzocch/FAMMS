import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET() {
  const guard = await requireAdmin()
  if (!guard.ok) return NextResponse.json({ error: '無權限' }, { status: guard.status })
  const admin = createAdminClient()
  const [{ data: devices, error: devicesError }, { data: factories, error: factoriesError }, { data: technicians, error: techniciansError }, { data: performers, error: performersError }] = await Promise.all([
    admin.from('shared_devices').select('id, auth_user_id, label, enabled, updated_at').order('created_at', { ascending: false }),
    admin.from('factories').select('id, name').order('name'),
    admin.from('profiles').select('id, full_name, factory_id, is_shared_device').eq('role', 'technician').eq('is_active', true).order('full_name'),
    // Include inactive performers so an existing device can be edited without silently dropping history/roster IDs.
    admin.from('shared_technicians').select('id, full_name, is_active').order('full_name'),
  ])
  if (devicesError || factoriesError || techniciansError || performersError) return NextResponse.json({ error: '平板設定載入失敗，請稍後重試' }, { status: 500 })
  const deviceIds = (devices ?? []).map(device => device.id)
  const [{ data: deviceFactories, error: deviceFactoriesError }, { data: roster, error: rosterError }] = deviceIds.length ? await Promise.all([
    admin.from('shared_device_factories').select('device_id, factory_id').in('device_id', deviceIds),
    admin.from('shared_device_roster').select('device_id, technician_id').in('device_id', deviceIds),
  ]) : [{ data: [], error: null }, { data: [], error: null }]
  if (deviceFactoriesError || rosterError) return NextResponse.json({ error: '平板設定載入失敗，請稍後重試' }, { status: 500 })
  return NextResponse.json({ factories: factories ?? [], technicians: technicians ?? [], performers: performers ?? [], devices: (devices ?? []).map(device => ({ ...device, factory_ids: (deviceFactories ?? []).filter(row => row.device_id === device.id).map(row => row.factory_id), roster: (roster ?? []).filter(row => row.device_id === device.id).map(row => row.technician_id) })) }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
}

export async function POST(request: Request) {
  const guard = await requireAdmin()
  if (!guard.ok) return NextResponse.json({ error: '無權限' }, { status: guard.status })
  let body: { auth_user_id?: unknown; label?: unknown; factory_ids?: unknown; performers?: unknown }
  try { body = await request.json() } catch { return NextResponse.json({ error: '請求格式無效' }, { status: 400 }) }
  const authUserId = typeof body.auth_user_id === 'string' ? body.auth_user_id : ''
  const label = typeof body.label === 'string' ? body.label.trim() : ''
  const factoryIds = Array.isArray(body.factory_ids) ? body.factory_ids : []
  const performers = Array.isArray(body.performers) ? body.performers : []
  if (!UUID.test(authUserId) || !label || label.length > 100 || factoryIds.length < 1 || factoryIds.length > 100 || factoryIds.some(id => typeof id !== 'string' || !UUID.test(id)) || new Set(factoryIds).size !== factoryIds.length || performers.length < 1 || performers.length > 20 || performers.some(person => !person || typeof person !== 'object' || (typeof (person as { id?: unknown }).id !== 'undefined' && (typeof (person as { id?: unknown }).id !== 'string' || !UUID.test((person as { id: string }).id))) || typeof (person as { full_name?: unknown }).full_name !== 'string' || !(person as { full_name: string }).full_name.trim() || (person as { full_name: string }).full_name.trim().length > 120)) return NextResponse.json({ error: '請設定平板帳號、名稱、至少一個工廠與 1–20 位處理人' }, { status: 400 })
  const { data: deviceId, error } = await createAdminClient().rpc('configure_shared_device', { p_actor_id: guard.user.id, p_auth_user_id: authUserId, p_label: label, p_factory_ids: factoryIds, p_performers: performers.map(person => ({ id: (person as { id?: string }).id, full_name: (person as { full_name: string }).full_name.trim() })) })
  if (error) return NextResponse.json({ error: error.code === '42501' ? '平板登入帳號或處理人已失效' : '平板設定無效或儲存失敗' }, { status: error.code === '42501' ? 403 : 400 })
  return NextResponse.json({ ok: true, deviceId }, { status: 201 })
}
