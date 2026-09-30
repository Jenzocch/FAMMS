import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { notifyFactory, isTelegramConfigured } from '@/lib/telegram'
import { requireActiveUser } from '@/lib/auth'
import { PERMISSIONS } from '@/lib/permissions'

// POST /api/notifications/test — send a test message to the current user's
// factory groups/users to verify Telegram wiring.
export async function POST() {
  const guard = await requireActiveUser()
  if (!guard.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: guard.status })
  if (!PERMISSIONS.manageTelegram(guard.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = await createClient()

  if (!isTelegramConfigured()) {
    return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN belum dikonfigurasi di server' }, { status: 400 })
  }

  if (!guard.user.factory_id) {
    return NextResponse.json({ error: 'Factory tidak ditemukan' }, { status: 400 })
  }

  const html = '✅ <b>Tes Notifikasi FAMMS</b>\nKoneksi Telegram berfungsi dengan baik.'
  const r = await notifyFactory(supabase, {
    factoryId: guard.user.factory_id,
    type: 'status_update',
    html,
  })

  if (r.sent === 0 && r.failed === 0) {
    return NextResponse.json({
      error: 'Tidak ada penerima terdaftar. Tambahkan group atau user dulu.',
    }, { status: 400 })
  }

  return NextResponse.json(r)
}
