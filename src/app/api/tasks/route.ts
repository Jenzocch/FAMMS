import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyAssignees, esc } from '@/lib/telegram'

// POST /api/tasks — create one or more tasks in a single call.
//
// Batch, because the primary way tasks get in is pasting a whole meeting note
// (one action item per line) and firing them off at once. A single manual add
// is just a batch of one.
//
// The insert runs under the caller's own session (RLS enforces they can only
// write into a factory they belong to); factory_id is taken from the creator's
// profile, never trusted from the client. Telegram notify to each assignee is
// best-effort and uses the service-role client.

interface TaskInput {
  title?: unknown
  note?: unknown
  assigned_to_id?: unknown
  due_date?: unknown
  priority?: unknown
  needs_verification?: unknown
  source?: unknown
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const PRIORITIES = ['low', 'normal', 'high']

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user || !user.is_active) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await req.json().catch(() => null)) as { tasks?: TaskInput[] } | null
  const rawTasks = Array.isArray(body?.tasks) ? body!.tasks : []
  if (rawTasks.length === 0) {
    return NextResponse.json({ error: 'Minimal satu tugas (judul wajib diisi)' }, { status: 400 })
  }
  // Guard against a runaway paste dumping thousands of rows.
  if (rawTasks.length > 100) {
    return NextResponse.json({ error: 'Terlalu banyak tugas sekaligus (maks 100)' }, { status: 400 })
  }

  const rows = rawTasks
    .map(t => {
      const title = str(t.title)
      if (!title) return null
      const priority = PRIORITIES.includes(str(t.priority)) ? str(t.priority) : 'normal'
      const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(str(t.due_date)) ? str(t.due_date) : null
      return {
        factory_id: user.factory_id,
        title: title.slice(0, 200),
        note: str(t.note).slice(0, 2000) || null,
        assigned_to_id: str(t.assigned_to_id) || null,
        created_by_id: user.id,
        due_date: dueDate,
        priority,
        needs_verification: t.needs_verification === true,
        source: str(t.source).slice(0, 40) || null,
        status: 'todo',
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)

  if (rows.length === 0) {
    return NextResponse.json({ error: 'Setiap tugas harus punya judul' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: inserted, error } = await supabase
    .from('tasks')
    .insert(rows)
    .select('*')
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  // Notify each assignee once — best-effort, never blocks task creation.
  // Group titles per assignee so a 10-line paste is one message, not ten.
  try {
    const byAssignee = new Map<string, string[]>()
    for (const t of inserted ?? []) {
      if (!t.assigned_to_id || t.assigned_to_id === user.id) continue
      const list = byAssignee.get(t.assigned_to_id) ?? []
      list.push(t.title)
      byAssignee.set(t.assigned_to_id, list)
    }
    if (byAssignee.size > 0) {
      const admin = createAdminClient()
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
      for (const [assigneeId, titles] of byAssignee) {
        const lines = [
          `📋 <b>Tugas Baru</b> — dari ${esc(user.full_name || 'FAMMS')}`,
          ...titles.slice(0, 10).map(tt => `• ${esc(tt)}`),
          titles.length > 10 ? `… +${titles.length - 10}` : '',
          `<a href="${appUrl}/tasks">Lihat tugas →</a>`,
        ].filter(Boolean)
        await notifyAssignees(admin, {
          profileIds: [assigneeId],
          type: 'assignment',
          html: lines.join('\n'),
        }).catch(() => {})
      }
    }
  } catch { /* notify is best-effort */ }

  return NextResponse.json({ ok: true, count: inserted?.length ?? 0, tasks: inserted ?? [] })
}
