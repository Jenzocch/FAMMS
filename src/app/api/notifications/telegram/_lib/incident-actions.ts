import {
  sendTelegramMessage, answerCallbackQuery, editMessageKeyboard, downloadTelegramFile,
  incidentActionButtons, incidentActionButtonsAfter, esc,
} from '@/lib/telegram'
import { logAuditEvent } from '@/lib/audit'
import type { IncidentStatus } from '@/types'
import { type AdminClient, type TelegramCallbackQuery, chatAndMessageFrom, resolveProfile } from './shared'

// Acting on an EXISTING case from Telegram: the status buttons on an
// assignment/reminder DM, the "add a note" prompt, the reply that becomes a
// progress note, and /tugas (pull my open cases back up).

// Forward-only status line, same as ProgressUpdate's. Buttons may only move a
// case forward; waiting side-states resume at 'analyzing'.
const MAIN_ORDER: IncidentStatus[] = [
  'reported', 'accepted', 'analyzing', 'repairing', 'testing', 'observation', 'closed',
]
const WAITING_STATES: IncidentStatus[] = [
  'waiting_parts', 'waiting_approval', 'waiting_vendor', 'waiting_shutdown',
]
// The only statuses a Telegram button may set. Closing stays in-app: it's
// supervisor-gated and runs the RCA check.
const BUTTON_TARGETS: IncidentStatus[] = ['repairing', 'testing']

const STATUS_LABEL_ID: Record<string, string> = {
  repairing: 'Sedang diperbaiki',
  testing: 'Selesai — menunggu pengecekan',
}

export async function handleStatusButton(admin: AdminClient, cq: TelegramCallbackQuery) {
  const { chatId, messageId } = chatAndMessageFrom(cq)

  // The already-done button on a rewritten keyboard is inert by design
  // (callback_data 'noop') — just clear the spinner, no state change.
  if (cq.data === 'noop') {
    await answerCallbackQuery(cq.id)
    return
  }

  const [, incidentId, target] = (cq.data ?? '').split('|')
  if (!chatId || !incidentId || !BUTTON_TARGETS.includes(target as IncidentStatus)) {
    await answerCallbackQuery(cq.id)
    return
  }

  const profile = await resolveProfile(admin, chatId)
  if (!profile) {
    await answerCallbackQuery(cq.id, 'Chat ID Anda belum terdaftar di FAMMS.')
    return
  }

  const { data: incident } = await admin
    .from('incidents')
    .select('id, incident_no, status, assigned_user_ids, factory_id')
    .eq('id', incidentId)
    .maybeSingle()
  if (!incident) {
    await answerCallbackQuery(cq.id, 'Kasus tidak ditemukan.')
    return
  }

  const assigned: string[] = Array.isArray(incident.assigned_user_ids) ? incident.assigned_user_ids : []
  if (!assigned.includes(profile.id)) {
    await answerCallbackQuery(cq.id, 'Anda bukan penanggung jawab kasus ini.')
    return
  }

  const current = incident.status as IncidentStatus
  if (current === 'closed') {
    await answerCallbackQuery(cq.id, 'Kasus sudah ditutup.')
    return
  }
  if (current === (target as IncidentStatus)) {
    await answerCallbackQuery(cq.id, 'Status sudah sama.')
    return
  }
  const effective = WAITING_STATES.includes(current) ? 'analyzing' : current
  if (MAIN_ORDER.indexOf(target as IncidentStatus) < MAIN_ORDER.indexOf(effective)) {
    await answerCallbackQuery(cq.id, 'Status tidak bisa mundur — perbarui lewat aplikasi.')
    return
  }

  const patch: Record<string, unknown> = { status: target, updated_at: new Date().toISOString() }
  if (current === 'reported') {
    patch.accepted_at = new Date().toISOString()
    patch.accepted_by_id = profile.id
  }
  const { error: updErr } = await admin.from('incidents').update(patch).eq('id', incidentId)
  if (updErr) {
    await answerCallbackQuery(cq.id, 'Gagal memperbarui — coba lewat aplikasi.')
    return
  }

  // Timeline + audit, so a Telegram report looks identical to an in-app one.
  await admin.from('incident_updates').insert({
    incident_id: incidentId,
    new_status: target,
    note: null,
    updated_by: profile.full_name || null,
    updated_by_id: profile.id,
  })
  await logAuditEvent(admin, {
    userId: profile.id,
    userName: profile.full_name || null,
    actionType: 'status_change',
    resourceType: 'incident',
    resourceId: incidentId,
    oldValue: current,
    newValue: target,
    changeSummary: `狀態變更為 "${target}"（via Telegram）`,
    factoryId: incident.factory_id ?? undefined,
  })

  await answerCallbackQuery(cq.id, '✅ Status diperbarui')

  // Rewrite the ORIGINAL message's buttons so the tap is visibly registered
  // there — without this, the buttons look untouched and a technician can't
  // tell from the message itself whether their tap went through.
  if (messageId) {
    await editMessageKeyboard(chatId, messageId, incidentActionButtonsAfter(incidentId, target as 'repairing' | 'testing'))
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  await sendTelegramMessage(chatId, [
    `✅ <b>${esc(incident.incident_no)}</b> → ${esc(STATUS_LABEL_ID[target] ?? target)}`,
    'Balas pesan ini untuk menambah catatan pekerjaan (opsional).',
    `<a href="${appUrl}/incidents/${incidentId}">Lihat kasus →</a>`,
  ].join('\n'))
}

// "📝 Tambah catatan / foto" tapped: send a force_reply prompt so the client
// auto-opens the keyboard pinned to THIS message — the user just types/sends
// a photo, no need to know Telegram's long-press-to-reply gesture. The
// prompt's own text carries the FIT- number so handleReplyNote's regex match
// keeps working on it exactly like a reply to the original assignment DM.
export async function handleNoteButton(admin: AdminClient, cq: TelegramCallbackQuery) {
  const { chatId } = chatAndMessageFrom(cq)
  const [, incidentId] = (cq.data ?? '').split('|')
  if (!chatId || !incidentId) { await answerCallbackQuery(cq.id); return }

  const { data: incident } = await admin
    .from('incidents')
    .select('incident_no')
    .eq('id', incidentId)
    .maybeSingle()
  await answerCallbackQuery(cq.id)
  if (!incident) return

  await sendTelegramMessage(
    chatId,
    `📝 Ketik catatan untuk <b>${esc(incident.incident_no)}</b> di bawah ini (boleh sertakan foto):`,
    { force_reply: true, input_field_placeholder: 'Catatan pekerjaan…' }
  )
}

// A reply to one of the bot's incident messages → progress note, with photos
// supported: a photo reply (with optional caption) is downloaded from
// Telegram and stored alongside app-uploaded work photos. The quoted message
// text carries the FIT- number, which identifies the case.
export async function handleReplyNote(admin: AdminClient, message: {
  chat?: { id?: number }
  text?: string
  caption?: string
  photo?: { file_id: string }[]
  reply_to_message?: { text?: string; caption?: string; from?: { is_bot?: boolean } }
}) {
  const chatId = message.chat?.id
  const note = (message.text ?? message.caption ?? '').trim()
  const hasPhoto = Array.isArray(message.photo) && message.photo.length > 0
  const quoted = message.reply_to_message
  if (!chatId || (!note && !hasPhoto) || !quoted?.from?.is_bot) return

  const m = (quoted.text ?? quoted.caption ?? '').match(/FIT-\d{8}-\d{3}(?:-dup\d+)?/)
  if (!m) return

  const profile = await resolveProfile(admin, chatId)
  if (!profile) {
    await sendTelegramMessage(chatId, 'Chat ID Anda belum terdaftar di FAMMS — hubungi admin.')
    return
  }

  const { data: incident } = await admin
    .from('incidents')
    .select('id, incident_no, status, assigned_user_ids')
    .eq('incident_no', m[0])
    .maybeSingle()
  if (!incident) return

  const assigned: string[] = Array.isArray(incident.assigned_user_ids) ? incident.assigned_user_ids : []
  if (!assigned.includes(profile.id)) {
    await sendTelegramMessage(chatId, `Anda bukan penanggung jawab ${esc(incident.incident_no)}.`)
    return
  }
  if (incident.status === 'closed') {
    await sendTelegramMessage(chatId, `${esc(incident.incident_no)} sudah ditutup — catatan tidak disimpan.`)
    return
  }

  // Photo reply: Telegram offers several sizes per photo — take the largest
  // (Telegram pre-compresses "photo" sends to ≈1280px, matching the app's own
  // upload compression), store it with the app's work photos.
  const photoPaths: string[] = []
  if (hasPhoto) {
    const largest = message.photo![message.photo!.length - 1]
    const file = await downloadTelegramFile(largest.file_id)
    if (file) {
      const path = `${incident.id}/updates/tg-${Date.now()}.${file.ext}`
      const { error: upErr } = await admin.storage
        .from('incident-photos')
        .upload(path, file.bytes, { contentType: `image/${file.ext === 'jpg' ? 'jpeg' : file.ext}` })
      if (!upErr) photoPaths.push(path)
    }
  }

  const { error } = await admin.from('incident_updates').insert({
    incident_id: incident.id,
    new_status: null,
    note: note || (photoPaths.length > 0 ? '📷 (foto via Telegram)' : null),
    updated_by: profile.full_name || null,
    updated_by_id: profile.id,
    photos: photoPaths.length > 0 ? JSON.stringify(photoPaths) : null,
  })
  if (!error) {
    await admin.from('incidents').update({ updated_at: new Date().toISOString() }).eq('id', incident.id)
    const what = photoPaths.length > 0 && note ? 'Catatan + foto' : photoPaths.length > 0 ? 'Foto' : 'Catatan'
    await sendTelegramMessage(chatId, `📝 ${what} tersimpan di <b>${esc(incident.incident_no)}</b>.`)
  }
}

// /tugas — re-send the technician's open assigned cases, one message per case
// with its own status buttons. The answer to "the assignment message scrolled
// away, which one do I tap?": pull them all up fresh.
export async function handleTaskList(admin: AdminClient, chatId: number) {
  const profile = await resolveProfile(admin, chatId)
  if (!profile) {
    await sendTelegramMessage(chatId, 'Chat ID Anda belum terdaftar di FAMMS — hubungi admin.')
    return
  }

  const { data: cases } = await admin
    .from('incidents')
    .select('id, incident_no, title, incident_type, status, due_date')
    .contains('assigned_user_ids', [profile.id])
    .neq('status', 'closed')
    .order('updated_at', { ascending: false })
    .limit(5)
  if (!cases || cases.length === 0) {
    await sendTelegramMessage(chatId, '✅ Tidak ada tugas aktif saat ini.')
    return
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  for (const c of cases) {
    await sendTelegramMessage(chatId, [
      `🔧 <b>${esc(c.incident_no)}</b> — ${esc(c.title || c.incident_type)}`,
      `Status: ${esc(c.status)}${c.due_date ? ` · Target: ${esc(c.due_date)}` : ''}`,
      `<a href="${appUrl}/incidents/${c.id}">Lihat kasus →</a>`,
    ].join('\n'), incidentActionButtons(c.id))
  }
}
