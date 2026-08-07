import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { extractTasksFromMeeting, matchAssignee } from '@/lib/meeting-tasks'

// POST /api/tasks/analyze — turn a pasted meeting note into editable task
// DRAFTS. This never writes to the tasks table itself: it's the "AI
// suggests" half of "AI suggests, human confirms" — the client shows the
// drafts in a preview and only /api/tasks (POST) actually creates anything.
//
// `{ ok: false, fallback: true }` is a 200, not an error — it just means no
// AI key is configured (or every provider failed), and the client's existing
// plain line-split path takes over.

interface AnalyzeBody {
  text?: unknown
}

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user || !user.is_active) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await req.json().catch(() => null)) as AnalyzeBody | null
  const text = typeof body?.text === 'string' ? body.text.trim() : ''
  if (!text) {
    return NextResponse.json({ error: 'Catatan rapat masih kosong' }, { status: 400 })
  }
  // Keep the prompt bounded — same cap meeting-tasks.ts applies on its side.
  const capped = text.slice(0, 6000)

  // Same roster shape as the tasks page: active profiles, scoped to the
  // viewer's factory unless the viewer is cross-factory (factory_id null).
  const supabase = await createClient()
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, factory_id, is_active')
    .eq('is_active', true)
  const roster = (profiles ?? []).filter(
    p => !user.factory_id || !p.factory_id || p.factory_id === user.factory_id,
  )
  const rosterNames = roster.map(p => p.full_name).filter((n): n is string => !!n)

  const extracted = await extractTasksFromMeeting(capped, rosterNames)
  if (extracted === null) {
    // No AI key set, or every provider failed — expected, not an error.
    return NextResponse.json({ ok: false, fallback: true })
  }

  const drafts = extracted.map(t => ({
    title: t.title,
    assigned_to_id: matchAssignee(t.assignee_hint, roster.map(p => ({ id: p.id, name: p.full_name }))),
    assignee_hint: t.assignee_hint,
    due_date: t.due_date,
    priority: t.priority,
  }))

  return NextResponse.json({ ok: true, drafts })
}
