import type { createAdminClient } from '@/lib/supabase/admin'

// Pieces every webhook handler needs. Split out of route.ts, which now only
// verifies the request and dispatches; see the handler modules alongside this
// one for the actual flows.

// The service-role client, threaded through every handler. Telegram updates
// arrive with no Supabase session, so there is no user JWT to run under —
// each handler does its own authorization instead (see resolveProfile).
export type AdminClient = ReturnType<typeof createAdminClient>

// Shape of Telegram's callback_query object, as far as any handler reads it.
// Was independently redeclared inline on 5 handler functions.
export interface TelegramCallbackQuery {
  id: string
  from?: { id?: number }
  message?: { chat?: { id?: number }; message_id?: number }
  data?: string
}

// Every button handler starts by resolving who tapped it and which message
// to (maybe) rewrite — same two lines duplicated across all 5 handlers.
export function chatAndMessageFrom(cq: TelegramCallbackQuery) {
  return {
    chatId: cq.from?.id ?? cq.message?.chat?.id,
    messageId: cq.message?.message_id,
  }
}

// Prompt prefix Telegram echoes back verbatim in reply_to_message.text — used
// to tell "replying to a /lapor prompt" apart from "replying to an incident
// message" (FIT- number match) without any extra state lookup.
export const NEW_REPORT_PROMPT_PREFIX = '📋 Laporan baru'

// Resolve who this chat belongs to. Registration is the auth here: only
// chat_ids an admin registered in telegram_users can act, and only on cases
// they're assigned to.
export async function resolveProfile(admin: AdminClient, chatId: number) {
  const { data: reg } = await admin
    .from('telegram_users')
    .select('profile_id')
    .eq('telegram_chat_id', chatId)
    .limit(1)
    .maybeSingle()
  if (!reg) return null
  const { data: profile } = await admin
    .from('profiles')
    .select('id, full_name, factory_id, role')
    .eq('id', reg.profile_id)
    .maybeSingle()
  return profile
}
