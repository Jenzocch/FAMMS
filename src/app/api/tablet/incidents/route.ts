import { NextResponse } from 'next/server'
import { getSharedTabletContext } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { OPEN_STATUSES } from '@/lib/incident-display'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const context = await getSharedTabletContext()
  if (!context.ok) return NextResponse.json({ error: '此平板未啟用或尚未完成設定' }, { status: context.status })

  const params = new URL(request.url).searchParams
  const performerId = params.get('performerId') ?? ''
  const scope = params.get('scope')
  if (!context.roster.some(member => member.id === performerId) || !['mine', 'team'].includes(scope ?? '')) {
    return NextResponse.json({ error: '處理人或案件範圍無效' }, { status: 400 })
  }

  const admin = createAdminClient()
  let query = admin.from('incidents').select(`
    id, incident_no, title, status, reported_at, assigned_user_ids,
    machine:machines(machine_code, machine_name)
  `).eq('factory_id', context.device.factory_id).in('status', OPEN_STATUSES)
    .order('reported_at', { ascending: false }).limit(200)

  if (scope === 'mine') query = query.contains('assigned_user_ids', [performerId])
  const { data, error } = await query
  if (error) return NextResponse.json({ error: '案件載入失敗，請稍後重試' }, { status: 500 })
  const incidents = (data ?? []).map(({ assigned_user_ids: _ids, ...incident }) => incident)
  return NextResponse.json({ incidents }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
}
