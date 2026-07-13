import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { notifyFactory, formatDailySummary, isTelegramConfigured } from '@/lib/telegram'
import { wibTodayStr } from '@/lib/pm'

// POST /api/notifications/daily-summary — compute and send a daily summary to
// each factory's subscribed Telegram groups/users. Admin-only: it broadcasts to
// every factory, so a regular user shouldn't be able to trigger the blast.
export async function POST() {
  const guard = await requireAdmin()
  if (!guard.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: guard.status })

  const supabase = await createClient()

  if (!isTelegramConfigured()) {
    return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN belum dikonfigurasi' }, { status: 400 })
  }

  // Factory-local "today" (WIB, UTC+7) — same convention as cron/sla-check.
  // Plain toISOString() is UTC: for the first 7 hours of every WIB day this
  // route counted "yesterday", and disagreed with the cron's numbers.
  const today = wibTodayStr()
  // The WIB day [00:00, 24:00) expressed as a UTC timestamp range, for
  // filtering UTC timestamptz columns. startsWith(date) on a UTC timestamp
  // matches the UTC day, not the WIB day.
  const wibDayStartUtc = new Date(new Date(`${today}T00:00:00Z`).getTime() - 7 * 3_600_000).toISOString()
  const wibDayEndUtc = new Date(new Date(`${today}T00:00:00Z`).getTime() + 17 * 3_600_000).toISOString()
  const inWibToday = (ts: string | null | undefined) => !!ts && ts >= wibDayStartUtc && ts < wibDayEndUtc

  const { data: factories } = await supabase.from('factories').select('id, name')

  const results: { factory: string; sent: number; failed: number }[] = []

  for (const f of factories ?? []) {
    // reported_at, matching cron/sla-check — created_at can differ.
    const { data: incidents } = await supabase
      .from('incidents')
      .select('status, reported_at, closed_at')
      .eq('factory_id', f.id)

    const open = (incidents ?? []).filter(i => i.status !== 'closed').length
    const newToday = (incidents ?? []).filter(i => inWibToday(i.reported_at)).length
    const closedToday = (incidents ?? []).filter(i => inWibToday(i.closed_at)).length

    // Overdue PM for this factory
    const { data: schedules } = await supabase
      .from('pm_schedules')
      .select('id')
      .eq('factory_id', f.id)
    const scheduleIds = (schedules ?? []).map(s => s.id)
    let overduePM = 0
    if (scheduleIds.length) {
      const { count } = await supabase
        .from('pm_records')
        .select('id', { count: 'exact', head: true })
        .in('pm_schedule_id', scheduleIds)
        .eq('status', 'pending')
        .lt('scheduled_date', today)
      overduePM = count ?? 0
    }

    const html = formatDailySummary({
      factoryName: f.name,
      open,
      newToday,
      closedToday,
      overduePM,
    })
    const r = await notifyFactory(supabase, { factoryId: f.id, type: 'daily_summary', html })
    results.push({ factory: f.name, sent: r.sent, failed: r.failed })
  }

  return NextResponse.json({ results })
}
