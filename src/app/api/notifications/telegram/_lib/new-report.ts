import {
  sendTelegramMessage, answerCallbackQuery, editMessageKeyboard, downloadTelegramFile,
  newReportUrgencyButtons, newReportUrgencyButtonsAfter,
  newReportFactoryButtons, newReportFactoryButtonAfter, repeatFailureButtons,
  notifyFactory, notifyAssignees, esc,
} from '@/lib/telegram'
import { logAuditEvent } from '@/lib/audit'
import { deadlineFromUrgency } from '@/lib/incident-display'
import { checkPotentialRepeatFailure } from '@/lib/repeat-failure'
import { type AdminClient, type TelegramCallbackQuery, chatAndMessageFrom, resolveProfile, NEW_REPORT_PROMPT_PREFIX } from './shared'

// /lapor — filing a brand-new incident without opening the app.
//
// Steps (optional pick factory → describe → pick urgency) because a chat can
// only carry state across separate updates via telegram_report_drafts (no
// in-memory state on a serverless webhook). Deliberately minimal: no
// area/machine picker — a single-factory account's factory comes from its own
// profile, a cross-factory account picks one of the (few) plants via buttons,
// and if the description happens to contain a machine code (e.g.
// "[DIN-HMG-001]") it's matched automatically so repeat-failure detection
// still works.

const URGENCY_LABEL_FULL: Record<string, string> = {
  A: '🔴 Mendesak', C: '🟡 Sedang', D: '🟢 Biasa',
}

// Second half of /lapor's start: the "describe the problem" force_reply
// prompt. Split out because it fires from two places — immediately for a
// single-factory account, or after the factory-pick tap for a cross-factory
// one — and must behave identically either way.
async function sendDescriptionPrompt(chatId: number) {
  await sendTelegramMessage(
    chatId,
    [
      `${NEW_REPORT_PROMPT_PREFIX}`,
      '',
      'Jelaskan masalahnya (boleh sertakan foto). Kalau tahu kode mesinnya, sertakan juga — mis. "[DIN-HMG-001] bocor di pipa bawah".',
    ].join('\n'),
    { force_reply: true, input_field_placeholder: 'Jelaskan masalahnya…' }
  )
}

// /lapor — start a new-incident report. A single-factory account goes
// straight to the description prompt; a cross-factory account (no
// profiles.factory_id — e.g. a technician who moves between plants) picks a
// factory first via 3-ish buttons, since there's no other way to know which
// plant the report belongs to. Overwrites any stale draft for this chat so a
// second /lapor is always a fresh start, never a stuck one.
export async function handleNewReportStart(admin: AdminClient, chatId: number) {
  const profile = await resolveProfile(admin, chatId)
  if (!profile) {
    await sendTelegramMessage(chatId, 'Chat ID Anda belum terdaftar di FAMMS — hubungi admin.')
    return
  }

  await admin.from('telegram_report_drafts').delete().eq('chat_id', chatId)

  if (profile.factory_id) {
    await admin.from('telegram_report_drafts').insert({
      chat_id: chatId, profile_id: profile.id, factory_id: profile.factory_id,
    })
    await sendDescriptionPrompt(chatId)
    return
  }

  // Cross-factory account: ask which plant this report is for.
  const { data: factories } = await admin.from('factories').select('id, name').order('name')
  if (!factories || factories.length === 0) {
    await sendTelegramMessage(chatId, 'Tidak ada data pabrik — silakan lapor lewat aplikasi.')
    return
  }
  await admin.from('telegram_report_drafts').insert({ chat_id: chatId, profile_id: profile.id })
  await sendTelegramMessage(chatId, 'Laporan untuk pabrik mana?', newReportFactoryButtons(factories))
}

// Factory tapped (cross-factory accounts only) → save the pick, then
// continue exactly like a single-factory /lapor from here on.
export async function handleNewReportFactoryPick(admin: AdminClient, cq: TelegramCallbackQuery) {
  const { chatId, messageId } = chatAndMessageFrom(cq)
  const factoryId = (cq.data ?? '').split('|')[1]
  if (!chatId || !factoryId) { await answerCallbackQuery(cq.id); return }

  const { data: draft } = await admin
    .from('telegram_report_drafts')
    .select('chat_id')
    .eq('chat_id', chatId)
    .maybeSingle()
  if (!draft) {
    await answerCallbackQuery(cq.id, 'Sesi laporan sudah kedaluwarsa — ketik /lapor untuk mulai lagi.')
    return
  }
  const { data: factory } = await admin.from('factories').select('id, name').eq('id', factoryId).maybeSingle()
  if (!factory) { await answerCallbackQuery(cq.id, 'Pabrik tidak ditemukan.'); return }

  await admin.from('telegram_report_drafts').update({ factory_id: factory.id }).eq('chat_id', chatId)
  await answerCallbackQuery(cq.id)
  if (messageId) await editMessageKeyboard(chatId, messageId, newReportFactoryButtonAfter(factory.name))
  await sendDescriptionPrompt(chatId)
}

// Reply to the /lapor prompt → save description/photo into the draft, then
// ask for urgency. The photo itself is NOT downloaded yet — only its
// file_id is kept — so an abandoned draft never uploads a stray file to
// storage; the actual download happens once the incident is really created.
export async function handleNewReportDescription(admin: AdminClient, message: {
  chat?: { id?: number }
  text?: string
  caption?: string
  photo?: { file_id: string }[]
}) {
  const chatId = message.chat?.id
  const description = (message.text ?? message.caption ?? '').trim()
  const photoFileId = Array.isArray(message.photo) && message.photo.length > 0
    ? message.photo[message.photo.length - 1].file_id
    : null
  if (!chatId || (!description && !photoFileId)) return

  const { data: draft } = await admin
    .from('telegram_report_drafts')
    .select('chat_id, factory_id')
    .eq('chat_id', chatId)
    .maybeSingle()
  // No factory_id yet means either a stale draft or a reply sent before the
  // factory-pick tap resolved — either way there's nowhere to attach the
  // report yet, so treat it the same as an expired session.
  if (!draft || !draft.factory_id) {
    await sendTelegramMessage(chatId, 'Sesi laporan sudah kedaluwarsa — ketik /lapor untuk mulai lagi.')
    return
  }

  await admin.from('telegram_report_drafts')
    .update({ description: description || null, photo_file_id: photoFileId })
    .eq('chat_id', chatId)

  await sendTelegramMessage(chatId, 'Seberapa mendesak?', newReportUrgencyButtons())
}

// Urgency tapped → actually create the incident: same incident_no scheme as
// the app's report form (today's sequence, retried on collision), same
// due-date calculation, same audit trail and factory notification. Runs as
// service_role so it doesn't go through the incidents RLS field-guard
// trigger — fine here since this whole path only ever writes fields a
// technician is already allowed to set (never due_date after creation,
// never status other than 'reported').
export async function handleNewReportUrgency(admin: AdminClient, cq: TelegramCallbackQuery) {
  const { chatId, messageId } = chatAndMessageFrom(cq)
  const impact = (cq.data ?? '').split('|')[1] as 'A' | 'C' | 'D' | undefined
  if (!chatId || !impact) { await answerCallbackQuery(cq.id); return }

  const profile = await resolveProfile(admin, chatId)
  const { data: draft } = await admin
    .from('telegram_report_drafts')
    .select('*')
    .eq('chat_id', chatId)
    .maybeSingle()
  if (!profile || !draft || !draft.factory_id || !draft.description) {
    await answerCallbackQuery(cq.id, 'Sesi laporan sudah kedaluwarsa — ketik /lapor untuk mulai lagi.')
    return
  }

  await answerCallbackQuery(cq.id, '⏳ Membuat laporan…')

  // Best-effort machine-code match: a bracketed or bare token in the
  // description compared against this factory's machine codes. No match is
  // completely normal — the report just goes in without a machine link,
  // same as leaving that field blank in the app form. Scoped to the draft's
  // chosen factory (not profile.factory_id — a cross-factory account has
  // none of its own; the pick made moments ago is the source of truth).
  let machineId: string | null = null
  const codeMatch = draft.description.match(/\[?([A-Z]{2,}-[A-Z0-9-]+)\]?/i)
  if (codeMatch) {
    const { data: machine } = await admin
      .from('machines')
      .select('id')
      .eq('factory_id', draft.factory_id)
      .ilike('machine_code', codeMatch[1])
      .maybeSingle()
    machineId = machine?.id ?? null
  }

  const now = new Date()
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  const { count } = await admin
    .from('incidents')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString())

  const title = draft.description.length > 60 ? `${draft.description.slice(0, 57)}...` : draft.description
  // A matched machine code means this is a machine issue — typing it 'other'
  // (as this used to unconditionally) broke type stats AND cross-channel
  // repeat-failure matching: the web form types the same fault 'machine', and
  // detection keys on same machine + same incident_type, so a Telegram report
  // could never match a web report of the identical fault.
  const incidentType = machineId ? 'machine' : 'other'
  const basePayload = {
    factory_id: draft.factory_id,
    machine_id: machineId,
    incident_type: incidentType,
    title,
    description: draft.description,
    reporter_name: profile.full_name || null,
    downtime_impact: impact,
    due_date: deadlineFromUrgency(impact),
    status: 'reported' as const,
    reported_by_id: profile.id,
  }

  let incident: { id: string; incident_no: string } | null = null
  let seq = (count ?? 0) + 1
  for (let attempt = 0; attempt < 6; attempt++) {
    const incident_no = `FIT-${ym}-${String(seq).padStart(3, '0')}`
    const { data, error } = await admin
      .from('incidents')
      .insert({ ...basePayload, incident_no })
      .select('id, incident_no')
      .single()
    if (!error) { incident = data; break }
    if (error.code === '23505') { seq++; continue }
    break
  }
  if (!incident) {
    await sendTelegramMessage(chatId, 'Gagal membuat laporan — coba lagi lewat /lapor, atau lewat aplikasi.')
    return
  }

  // Photo, if the description reply included one — downloaded now for the
  // first time (see handleNewReportDescription).
  if (draft.photo_file_id) {
    try {
      const file = await downloadTelegramFile(draft.photo_file_id)
      if (file) {
        const path = `${incident.id}/${Date.now()}-0.${file.ext}`
        const { error: upErr } = await admin.storage.from('incident-photos')
          .upload(path, file.bytes, { contentType: `image/${file.ext === 'jpg' ? 'jpeg' : file.ext}` })
        // Board 📷 badge — only counted once the upload actually landed, same
        // as the app form. Best-effort: tolerates a pre-photo_count database.
        if (!upErr) {
          await admin.from('incidents').update({ photo_count: 1 }).eq('id', incident.id)
        }
      }
    } catch { /* photo is best-effort — the incident itself is already saved */ }
  }

  await logAuditEvent(admin, {
    userId: profile.id,
    userName: profile.full_name || null,
    actionType: 'create',
    resourceType: 'incident',
    resourceId: incident.id,
    newValue: { incident_no: incident.incident_no, title, incident_type: incidentType },
    changeSummary: `工單已建立：${incident.incident_no}（via Telegram）`,
    factoryId: draft.factory_id,
  })

  await admin.from('telegram_report_drafts').delete().eq('chat_id', chatId)

  if (messageId) {
    await editMessageKeyboard(chatId, messageId, newReportUrgencyButtonsAfter(impact))
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  await sendTelegramMessage(chatId, [
    `✅ <b>${esc(incident.incident_no)}</b> berhasil dibuat.`,
    machineId ? '🔧 Mesin terdeteksi otomatis dari kode di deskripsi.' : '',
    `<a href="${appUrl}/incidents/${incident.id}">Lihat kasus →</a>`,
  ].filter(Boolean).join('\n'))

  // Best-effort: notify the factory's Telegram groups/opted-in users, same
  // as a report filed through the app.
  await notifyFactory(admin, {
    factoryId: draft.factory_id,
    type: 'new_incident',
    html: [
      `🚨 <b>Laporan Baru</b> — ${esc(incident.incident_no)}`,
      `📋 ${esc(title)}`,
      `📉 Dampak: ${esc(URGENCY_LABEL_FULL[impact])}`,
      profile.full_name ? `👤 ${esc(profile.full_name)}` : '',
      `<a href="${appUrl}/incidents/${incident.id}">Lihat detail →</a>`,
    ].filter(Boolean).join('\n'),
  }).catch(() => {})

  // Best-effort repeat-failure candidate check — same rule as the web report
  // form (see src/lib/repeat-failure.ts), matched on the same incidentType
  // written to basePayload above ('machine' when a machine code was detected).
  // Never blocks the report itself: any failure here is swallowed.
  try {
    const potentialRepeat = machineId
      ? await checkPotentialRepeatFailure(admin, {
          machineId, incidentType, excludeIncidentId: incident.id,
        })
      : null
    if (potentialRepeat) {
      await sendTelegramMessage(chatId, [
        `⚠️ Mirip dengan laporan sebelumnya: <b>${esc(potentialRepeat.incident_no)}</b> — ${esc(potentialRepeat.title)}`,
      ].join('\n'))

      // Notify the factory's supervisors+ with a confirm/reject prompt —
      // best-effort, mirrors the app's own repeat-failure confirm dialog.
      const { data: supervisors } = await admin
        .from('profiles')
        .select('id')
        .eq('factory_id', draft.factory_id)
        .in('role', ['supervisor', 'manager', 'director', 'admin'])
      const supervisorIds = (supervisors ?? []).map(s => s.id)
      if (supervisorIds.length > 0) {
        await notifyAssignees(admin, {
          profileIds: supervisorIds,
          type: 'new_incident',
          html: [
            `⚠️ <b>Kemungkinan Kerusakan Berulang</b>`,
            `Laporan baru: <b>${esc(incident.incident_no)}</b>`,
            `Mirip: <b>${esc(potentialRepeat.incident_no)}</b> — ${esc(potentialRepeat.title)}`,
            `Apakah ini masalah yang sama?`,
          ].join('\n'),
          replyMarkup: repeatFailureButtons(incident.id, potentialRepeat.id),
        }).catch(() => {})
      }
    }
  } catch (err) {
    console.error('Repeat-failure check failed (Telegram):', err)
  }
}
