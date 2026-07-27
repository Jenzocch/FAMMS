import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { timingSafeEqualString } from '@/lib/timing-safe-equal'

// GET /api/external/inspection-targets?factory_code=DIN
//
// "What is there to inspect?" — the factory → area → machine tree, for FQMS
// to mirror. FAMMS owns this master data; FQMS pulls it and drives its daily
// QC round from it, then posts the results back to /api/external/qc-check.
//
// PULL, not push. FAMMS does not notify FQMS when an area or machine changes:
// a pull has no delivery ordering to get wrong, no retry queue to drain when
// FQMS is down, and is idempotent by construction. FQMS decides how often to
// refresh (once a shift is plenty — this data changes when a machine is
// installed or moved, not hourly).
//
// Auth: Authorization: Bearer ${QC_API_SECRET} — the same secret as the other
// two external QC routes, no new credential.
//
//   → 200 {
//        generated_at,
//        factories: [{
//          id, code, name,
//          areas: [{
//            id, code, name, description,
//            machines: [{ id, code, name, status, brand, model }]
//          }]
//        }]
//      }
//
// ⚠️ KEY ON `id`, DISPLAY `code`.
//
// Every object carries both. `id` is a UUID that never changes. `code` is a
// human label that someone CAN rename in FAMMS Settings (areas and machines
// are both editable there) — if FQMS stores the code as its foreign key, one
// rename silently breaks the mapping, with no error anywhere. Store the id.

export async function GET(req: Request) {
  const secret = process.env.QC_API_SECRET
  const auth = req.headers.get('authorization')
  if (!secret || !auth || !timingSafeEqualString(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  // Optional: narrow to one factory. Omitted returns all three (SJA/DIN/OLT).
  const factoryCode = searchParams.get('factory_code')

  const admin = createAdminClient()

  let factoryQuery = admin.from('factories').select('id, code, name').order('code')
  if (factoryCode) factoryQuery = factoryQuery.eq('code', factoryCode)
  const { data: factories, error: facErr } = await factoryQuery
  if (facErr) {
    console.error('inspection-targets: factory read failed', facErr)
    return NextResponse.json({ error: 'failed to read factories' }, { status: 500 })
  }
  if (factoryCode && (!factories || factories.length === 0)) {
    return NextResponse.json({ error: `factory not found: ${factoryCode}` }, { status: 404 })
  }

  const factoryIds = (factories ?? []).map(f => f.id)
  if (factoryIds.length === 0) {
    return NextResponse.json({ generated_at: new Date().toISOString(), factories: [] })
  }

  const [areasRes, machinesRes] = await Promise.all([
    admin
      .from('areas')
      .select('id, factory_id, code, name, description')
      .in('factory_id', factoryIds)
      .order('code'),
    admin
      .from('machines')
      .select('id, factory_id, area_id, machine_code, machine_name, status, brand, model')
      .in('factory_id', factoryIds)
      // Scrapped machines are off the floor — nothing for QC to walk up to.
      // Standby ones stay: idle today is still a machine to eyeball.
      .neq('status', 'scrapped')
      .order('machine_code', { nullsFirst: false }),
  ])

  if (areasRes.error || machinesRes.error) {
    console.error('inspection-targets: read failed', areasRes.error ?? machinesRes.error)
    return NextResponse.json({ error: 'failed to read areas/machines' }, { status: 500 })
  }

  const machinesByArea = new Map<string, typeof machinesRes.data>()
  for (const m of machinesRes.data ?? []) {
    const list = machinesByArea.get(m.area_id) ?? []
    list.push(m)
    machinesByArea.set(m.area_id, list)
  }

  const body = {
    generated_at: new Date().toISOString(),
    factories: (factories ?? []).map(f => ({
      id: f.id,
      code: f.code,
      name: f.name,
      areas: (areasRes.data ?? [])
        .filter(a => a.factory_id === f.id)
        .map(a => ({
          id: a.id,
          code: a.code,
          name: a.name,
          description: a.description,
          machines: (machinesByArea.get(a.id) ?? []).map(m => ({
            id: m.id,
            code: m.machine_code,
            name: m.machine_name,
            status: m.status,
            brand: m.brand,
            model: m.model,
          })),
        })),
    })),
  }

  return NextResponse.json(body)
}
