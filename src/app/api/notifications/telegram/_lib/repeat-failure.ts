import { answerCallbackQuery, editMessageKeyboard, repeatFailureButtonsAfter } from '@/lib/telegram'
import { PERMISSIONS } from '@/lib/permissions'
import type { UserRole } from '@/types'
import { type AdminClient, type TelegramCallbackQuery, chatAndMessageFrom, resolveProfile } from './shared'

// Supervisor tapped Ya/Bukan on the repeat-failure confirm prompt sent
// alongside a /lapor report. Same underlying action as the web confirm
// dialog (POST /api/incidents/[id]/relations) — insert into
// incident_relations — done directly here since this already runs with the
// admin client server-side and there's no clean way to share a route handler
// between a browser fetch and this webhook's own request shape.
export async function handleRepeatFailureConfirm(admin: AdminClient, cq: TelegramCallbackQuery) {
  const { chatId, messageId } = chatAndMessageFrom(cq)
  const [, newIncidentId, priorIncidentId, decision] = (cq.data ?? '').split('|')
  if (!chatId || !newIncidentId || !priorIncidentId || (decision !== 'yes' && decision !== 'no')) {
    await answerCallbackQuery(cq.id)
    return
  }

  const profile = await resolveProfile(admin, chatId)
  if (!profile) {
    await answerCallbackQuery(cq.id, 'Chat ID Anda belum terdaftar di FAMMS.')
    return
  }
  // Same tier as the web confirm route — a technician tapping this DM
  // (e.g. forwarded to them) must not be able to self-certify a repeat.
  if (!PERMISSIONS.remindProgress((profile.role ?? 'technician') as UserRole)) {
    await answerCallbackQuery(cq.id, 'Hanya supervisor yang bisa mengonfirmasi.')
    return
  }

  await answerCallbackQuery(cq.id, decision === 'yes' ? '⏳ Mengonfirmasi…' : 'Oke, ditandai berbeda')

  if (decision === 'yes') {
    const [{ data: newIncident }, { data: prior }] = await Promise.all([
      admin.from('incidents').select('id, factory_id, machine_id').eq('id', newIncidentId).maybeSingle(),
      admin.from('incidents').select('id, factory_id, machine_id').eq('id', priorIncidentId).maybeSingle(),
    ])
    // Same factory + machine guard as POST /api/incidents/[id]/relations.
    if (newIncident && prior && newIncident.factory_id === prior.factory_id
        && newIncident.machine_id && newIncident.machine_id === prior.machine_id) {
      const { error } = await admin.from('incident_relations').insert({
        incident_id: newIncident.id,
        related_incident_id: prior.id,
        relation_type: 'repeat_failure',
        confirmed_by_id: profile.id,
        confirmed_at: new Date().toISOString(),
      })
      if (error && error.code !== '23505') {
        console.error('Failed to insert incident_relations from Telegram:', error)
      }
    }
  }

  if (messageId) {
    await editMessageKeyboard(chatId, messageId, repeatFailureButtonsAfter(decision === 'yes'))
  }
}
