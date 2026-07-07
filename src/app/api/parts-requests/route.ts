import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getCurrentUser, PERMISSIONS } from '@/lib/auth'

// GET /api/parts-requests?incidentId=... — list parts requests for a case.
export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const incidentId = searchParams.get('incidentId')
  if (!incidentId) {
    return NextResponse.json({ error: 'incidentId required' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('parts_requests')
    .select('*, requested_by:profiles(full_name)')
    .eq('incident_id', incidentId)
    .order('requested_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ requests: data ?? [] })
}

// POST /api/parts-requests — request a part/material against an incident.
export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!PERMISSIONS.requestParts(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const { incident_id, part_name, part_code, quantity, unit, warehouse, urgency, note } = body as {
    incident_id?: string
    part_name?: string
    part_code?: string
    quantity?: number
    unit?: string
    warehouse?: string
    urgency?: string
    note?: string
  }

  if (!incident_id || !part_name?.trim()) {
    return NextResponse.json({ error: 'incident_id dan part_name wajib diisi' }, { status: 400 })
  }

  const supabase = await createClient()

  // Derive factory/machine from the incident so requests stay scoped even
  // though this endpoint is deliberately decoupled from the spare_parts table.
  const { data: incident, error: incErr } = await supabase
    .from('incidents')
    .select('id, factory_id, machine_id')
    .eq('id', incident_id)
    .single()
  if (incErr || !incident) {
    return NextResponse.json({ error: 'Incident tidak ditemukan' }, { status: 404 })
  }

  const { data, error } = await supabase
    .from('parts_requests')
    .insert({
      incident_id,
      factory_id: incident.factory_id,
      machine_id: incident.machine_id,
      part_name: part_name.trim(),
      part_code: part_code?.trim() || null,
      quantity: quantity && quantity > 0 ? Math.floor(quantity) : 1,
      unit: unit?.trim() || null,
      warehouse: warehouse?.trim() || null,
      urgency: urgency === 'urgent' ? 'urgent' : 'normal',
      note: note?.trim() || null,
      requested_by_id: user.id,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ request: data }, { status: 201 })
}
