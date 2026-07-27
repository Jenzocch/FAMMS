import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { timingSafeEqualString } from '@/lib/timing-safe-equal'

// GET /api/external/machines?factory_code=DIN[&area_code=PROD][&status=standby]
//
// Read-only machine inventory for external systems (QC/FQMS). Answers the
// question "which machines are in this area?" — the data has always existed
// (machines.area_id), there just was no endpoint for it, so QC had to hard-code
// machine codes on their side.
//
// Two consumers on the FQMS side:
//   1. Binding a QC zone-check item to a real machine (needs the full list).
//   2. Picking a substitute machine when one goes into repair — that call
//      passes status=standby to get only machines that can actually take over.
//
// Auth: Authorization: Bearer ${QC_API_SECRET}, same secret as machine-status.
// Runs with the service-role client — no user session on a server-to-server call.
export async function GET(req: Request) {
  const secret = process.env.QC_API_SECRET
  const auth = req.headers.get('authorization')
  if (!secret || !auth || !timingSafeEqualString(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const factoryCode = searchParams.get('factory_code')
  const areaCode = searchParams.get('area_code')
  const status = searchParams.get('status')
  if (!factoryCode) {
    return NextResponse.json({ error: 'factory_code required' }, { status: 400 })
  }
  // Whitelist status rather than passing it through: an unknown value would
  // silently return an empty list, which QC would read as "this area has no
  // machines" instead of "you asked the wrong question".
  const VALID_STATUS = ['running', 'repairing', 'standby', 'scrapped']
  if (status && !VALID_STATUS.includes(status)) {
    return NextResponse.json(
      { error: `status must be one of ${VALID_STATUS.join(', ')}` },
      { status: 400 },
    )
  }

  const supabase = createAdminClient()

  const { data: factory } = await supabase
    .from('factories')
    .select('id, code')
    .eq('code', factoryCode)
    .single()
  if (!factory) {
    return NextResponse.json({ error: 'factory not found' }, { status: 404 })
  }

  let areaId: string | null = null
  if (areaCode) {
    const { data: area } = await supabase
      .from('areas')
      .select('id')
      .eq('factory_id', factory.id)
      .eq('code', areaCode)
      .single()
    if (!area) {
      return NextResponse.json({ error: 'area not found' }, { status: 404 })
    }
    areaId = area.id
  }

  let query = supabase
    .from('machines')
    .select('machine_code, machine_name, status, area_id')
    .eq('factory_id', factory.id)
    .order('machine_code', { ascending: true })
  if (areaId) query = query.eq('area_id', areaId)
  if (status) query = query.eq('status', status)

  const { data: machines, error } = await query
  if (error) {
    return NextResponse.json({ error: 'query failed' }, { status: 500 })
  }

  // Resolve area names with a second query + Map rather than a PostgREST embed:
  // machines has more than one FK reachable to the same target in places, and
  // an ambiguous embed fails the whole request (PGRST201) instead of degrading.
  const areaIds = Array.from(
    new Set((machines ?? []).map(m => m.area_id).filter((id): id is string => !!id)),
  )
  const { data: areas } = areaIds.length
    ? await supabase.from('areas').select('id, code, name').in('id', areaIds)
    : { data: [] as { id: string; code: string; name: string }[] }
  const areaById = new Map((areas ?? []).map(a => [a.id, a]))

  return NextResponse.json({
    factory_code: factory.code,
    count: machines?.length ?? 0,
    machines: (machines ?? []).map(m => {
      const area = m.area_id ? areaById.get(m.area_id) : undefined
      return {
        machine_code: m.machine_code,
        machine_name: m.machine_name,
        area_code: area?.code ?? null,
        area_name: area?.name ?? null,
        status: m.status,
      }
    }),
  })
}
