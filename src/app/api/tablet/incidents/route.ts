import { NextResponse } from 'next/server'
import { getSharedTabletContext } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const context = await getSharedTabletContext()
  if (!context.ok) return NextResponse.json({ error: '此平板未啟用或尚未完成設定' }, { status: context.status })
  const params = new URL(request.url).searchParams
  const performerId = params.get('performerId') ?? ''
  const scope = params.get('scope')
  if (!context.roster.some(member => member.id === performerId) || !['mine', 'team'].includes(scope ?? '')) return NextResponse.json({ error: '處理人或案件範圍無效' }, { status: 400 })

  // The service-only RPC repeats device/profile/roster/factory checks and
  // filters factory scope before projecting any incident payload.
  const { data, error } = await createAdminClient().rpc('get_shared_tablet_incidents', {
    p_device_id: context.device.id, p_actor_id: context.user.id, p_performer_id: performerId, p_scope: scope,
  })
  if (error) return NextResponse.json({ error: error.code === '42501' ? '平板設定已失效，請重新登入' : '案件載入失敗，請稍後重試' }, { status: error.code === '42501' ? 403 : 500 })
  return NextResponse.json({ incidents: data ?? [] }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
}
