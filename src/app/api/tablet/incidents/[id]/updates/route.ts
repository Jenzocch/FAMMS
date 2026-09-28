import { NextResponse } from 'next/server'
import { getSharedTabletContext } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getSharedTabletContext()
  if (!context.ok) return NextResponse.json({ error: '此平板未啟用或尚未完成設定' }, { status: context.status })
  const { id: incidentId } = await params
  if (!UUID.test(incidentId)) return NextResponse.json({ error: '案件編號無效' }, { status: 400 })

  let body: { note?: unknown; performerIds?: unknown; requestId?: unknown }
  try { body = await request.json() } catch { return NextResponse.json({ error: '請求格式無效' }, { status: 400 }) }
  const note = typeof body.note === 'string' ? body.note.trim() : ''
  const requestId = typeof body.requestId === 'string' ? body.requestId : ''
  const performerIds = Array.isArray(body.performerIds) ? body.performerIds : []
  const rosterIds = new Set(context.roster.map(person => person.id))
  if (!note || note.length > 5000) return NextResponse.json({ error: '請輸入 1–5000 字的處理紀錄' }, { status: 400 })
  if (!UUID.test(requestId)) return NextResponse.json({ error: '送出識別碼無效，請重新送出' }, { status: 400 })
  if (!performerIds.length || performerIds.length > context.roster.length || performerIds.some(id => typeof id !== 'string' || !rosterIds.has(id)) || new Set(performerIds).size !== performerIds.length) {
    return NextResponse.json({ error: '處理人必須從本平板技師名單中選擇' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: incident, error: incidentError } = await admin.from('incidents')
    .select('id, factory_id, status').eq('id', incidentId).maybeSingle()
  if (incidentError) return NextResponse.json({ error: '案件驗證失敗' }, { status: 500 })
  if (!incident || incident.factory_id !== context.device.factory_id) return NextResponse.json({ error: '找不到此工廠的案件' }, { status: 404 })
  const { data: updateId, error: insertError } = await admin.rpc('create_shared_tablet_update', {
    p_device_id: context.device.id,
    p_incident_id: incidentId,
    p_actor_id: context.user.id,
    p_request_id: requestId,
    p_note: note,
    p_performer_ids: performerIds,
  })
  if (insertError) {
    if (insertError.code === '23505') return NextResponse.json({ error: '此送出識別碼已用於不同內容，請重新載入後再試' }, { status: 409 })
    if (insertError.code === '55000') return NextResponse.json({ error: '案件已結案，不能新增平板處理紀錄' }, { status: 409 })
    if (insertError.code === '42501') return NextResponse.json({ error: '案件、平板或處理人已失效，請重新載入' }, { status: 403 })
    return NextResponse.json({ error: '處理紀錄儲存失敗' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, updateId }, { status: 201 })
}
