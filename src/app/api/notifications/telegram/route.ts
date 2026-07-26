import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendTelegramMessage, isTelegramConfigured } from '@/lib/telegram'
import { timingSafeEqualString } from '@/lib/timing-safe-equal'
import { NEW_REPORT_PROMPT_PREFIX } from './_lib/shared'
import {
  handleStatusButton, handleNoteButton, handleReplyNote, handleTaskList,
} from './_lib/incident-actions'
import {
  handleNewReportStart, handleNewReportFactoryPick,
  handleNewReportDescription, handleNewReportUrgency,
} from './_lib/new-report'
import { handleRepeatFailureConfirm } from './_lib/repeat-failure'

// POST /api/notifications/telegram — Telegram bot webhook.
//
// This file verifies the request and routes it; the handlers live in ./_lib
// (a Next private folder, so it never becomes a route of its own):
//
//  - _lib/shared.ts           auth + the bits every handler needs
//  - _lib/incident-actions.ts acting on an EXISTING case: status buttons,
//                             note prompt, reply-as-note, /tugas
//  - _lib/new-report.ts       /lapor — filing a brand-new incident
//  - _lib/repeat-failure.ts   supervisor Ya/Bukan on a repeat-failure prompt
//
// Handled inline below because they need no database access: /start and
// /chatid, which just echo the chat_id an admin needs in order to register
// this chat.

export async function POST(req: Request) {
  if (!isTelegramConfigured()) {
    return NextResponse.json({ ok: true }) // silently accept; bot not configured
  }

  // Verify the request really came from Telegram: it echoes
  // TELEGRAM_WEBHOOK_SECRET in this header on every webhook call (configured
  // via setWebhook's secret_token). Fail closed — an unset secret must reject,
  // not accept, or anyone can POST forged updates and make the bot message
  // arbitrary chat_ids on the company's behalf.
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET
  const incomingSecret = req.headers.get('x-telegram-bot-api-secret-token')
  if (!secret || !incomingSecret || !timingSafeEqualString(incomingSecret, secret)) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const update = await req.json().catch(() => null)

  // Button tapped on an assignment/reminder DM — dispatch by callback_data prefix
  if (update?.callback_query) {
    const admin = createAdminClient()
    const data: string = update.callback_query.data ?? ''
    if (data.startsWith('note|')) {
      await handleNoteButton(admin, update.callback_query)
    } else if (data.startsWith('newrptfac|')) {
      await handleNewReportFactoryPick(admin, update.callback_query)
    } else if (data.startsWith('newrpt|')) {
      await handleNewReportUrgency(admin, update.callback_query)
    } else if (data.startsWith('reprpt|')) {
      await handleRepeatFailureConfirm(admin, update.callback_query)
    } else {
      await handleStatusButton(admin, update.callback_query)
    }
    return NextResponse.json({ ok: true })
  }

  const message = update?.message
  const chat = message?.chat
  const text: string = message?.text ?? ''
  if (!chat) return NextResponse.json({ ok: true })

  const chatId = chat.id
  const isGroup = chat.type === 'group' || chat.type === 'supergroup'

  if (text.startsWith('/start') || text.startsWith('/chatid')) {
    const reply = isGroup
      ? [
          '👋 <b>FAMMS Bot</b>',
          `Group ID: <code>${chatId}</code>`,
          '',
          'Berikan ID ini ke admin untuk mendaftarkan group ke notifikasi pabrik.',
        ].join('\n')
      : [
          '👋 <b>FAMMS Bot</b>',
          `Chat ID Anda: <code>${chatId}</code>`,
          '',
          'Berikan ID ini ke admin untuk mengaktifkan notifikasi insiden.',
        ].join('\n')
    await sendTelegramMessage(chatId, reply)
    return NextResponse.json({ ok: true })
  }

  // /lapor — start a brand-new incident report (see _lib/new-report.ts).
  if (!isGroup && (text.startsWith('/lapor') || text.startsWith('/report'))) {
    await handleNewReportStart(createAdminClient(), chatId)
    return NextResponse.json({ ok: true })
  }

  // /tugas — re-send the technician's open assigned cases.
  if (!isGroup && (text.startsWith('/tugas') || text.startsWith('/tasks'))) {
    await handleTaskList(createAdminClient(), chatId)
    return NextResponse.json({ ok: true })
  }

  // Reply to a bot message (private chats only — group replies would be
  // ambiguous): either continuing a /lapor draft, or a note/photo on an
  // existing incident. Distinguished by the quoted prompt's own text, no
  // extra lookup needed.
  if (!isGroup && message?.reply_to_message?.from?.is_bot) {
    const admin = createAdminClient()
    const quotedText = message.reply_to_message.text ?? message.reply_to_message.caption ?? ''
    if (quotedText.startsWith(NEW_REPORT_PROMPT_PREFIX)) {
      await handleNewReportDescription(admin, message)
    } else {
      await handleReplyNote(admin, message)
    }
  }

  return NextResponse.json({ ok: true })
}

// GET — health check / setup hint
export async function GET() {
  return NextResponse.json({
    configured: isTelegramConfigured(),
    hint: 'Set TELEGRAM_BOT_TOKEN and register this URL as the bot webhook via setWebhook.',
  })
}
