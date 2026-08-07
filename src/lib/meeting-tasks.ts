// Turn a raw meeting note into structured task drafts, using callAICheap (the
// free/bulk AI path). Best-effort: if no AI key is set or the call fails, the
// caller falls back to the plain one-line-per-task split.
//
// AI SUGGESTS, the human confirms. This never creates tasks — it returns
// drafts the user reviews and edits in a preview before anything is saved.

import { callAICheap, parseJsonLoose } from '@/lib/ai-cheap'
import { wibTodayStr } from '@/lib/pm'

export interface ExtractedTask {
  title: string
  /** A person's name the AI read off the note; matched to an account later. */
  assignee_hint: string
  /** 'YYYY-MM-DD' if the note implied a deadline, else ''. */
  due_date: string
  priority: 'low' | 'normal' | 'high'
}

// The roster of names is fed to the model so it picks real people rather than
// inventing them; today's WIB date lets it resolve "next Friday" etc.
const SYSTEM_PROMPT = `Kamu mengubah catatan rapat pabrik menjadi daftar TUGAS (action item) yang bisa ditindaklanjuti.

Aturan:
- Ambil HANYA hal yang benar-benar harus DIKERJAKAN seseorang. Abaikan diskusi umum, keputusan, info, basa-basi.
- JANGAN menerjemahkan judul tugas — pertahankan bahasa asli catatan (Indonesia, Inggris, Mandarin, atau campuran). Istilah teknis (bearing, VFD, sealing film, dll) tetap apa adanya.
- "assignee": jika catatan menyebut siapa yang bertanggung jawab, isi NAMA persis seperti tertulis. Pilih dari daftar nama yang diberikan jika cocok. Jika tidak jelas, kosongkan ("").
- "due_date": jika ada tenggat (mis. "sebelum Jumat", "minggu depan", "akhir bulan"), hitung tanggalnya dalam format YYYY-MM-DD berdasarkan TANGGAL HARI INI yang diberikan. Jika tidak ada, kosongkan ("").
- "priority": "high" kalau mendesak/segera, "low" kalau bisa nanti, selain itu "normal".
- Jangan mengarang tugas yang tidak ada di catatan.

Balas HANYA JSON, tanpa teks lain, bentuk persis:
{"tasks":[{"title":"...","assignee":"...","due_date":"...","priority":"normal"}]}`

export async function extractTasksFromMeeting(
  text: string,
  rosterNames: string[],
): Promise<ExtractedTask[] | null> {
  const trimmed = text.trim()
  if (!trimmed) return []

  const userPrompt = [
    `TANGGAL HARI INI: ${wibTodayStr()}`,
    rosterNames.length ? `NAMA ORANG YANG ADA (pilih dari sini jika cocok): ${rosterNames.join(', ')}` : '',
    '',
    'CATATAN RAPAT:',
    trimmed.slice(0, 6000), // keep the prompt bounded
  ].filter(Boolean).join('\n')

  const raw = await callAICheap({ system: SYSTEM_PROMPT, user: userPrompt, json: true })
  if (!raw) return null // no AI configured or all providers failed → caller falls back

  const parsed = parseJsonLoose<{ tasks?: unknown }>(raw)
  if (!parsed || !Array.isArray(parsed.tasks)) return null

  const out: ExtractedTask[] = []
  for (const t of parsed.tasks as Record<string, unknown>[]) {
    const title = typeof t?.title === 'string' ? t.title.trim() : ''
    if (!title) continue
    const due = typeof t?.due_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.due_date) ? t.due_date : ''
    const pr = t?.priority
    const priority = pr === 'high' || pr === 'low' ? pr : 'normal'
    out.push({
      title: title.slice(0, 200),
      assignee_hint: typeof t?.assignee === 'string' ? t.assignee.trim() : '',
      due_date: due,
      priority,
    })
  }
  return out
}

// Match an AI-read name to a real account id. Conservative: exact or clear
// containment only, so we never silently assign to the wrong person — an
// ambiguous or no match returns null and the user picks in the preview.
export function matchAssignee(
  hint: string,
  roster: { id: string; name: string | null }[],
): string | null {
  const h = hint.trim().toLowerCase()
  if (!h) return null
  const named = roster.filter(r => r.name)
  // Exact (case-insensitive) first.
  const exact = named.find(r => r.name!.trim().toLowerCase() === h)
  if (exact) return exact.id
  // Then containment either way (e.g. "Budi" vs "Budi Santoso") — but only if
  // it's unambiguous (exactly one match), else give up and let the user choose.
  const contains = named.filter(r => {
    const n = r.name!.trim().toLowerCase()
    return n.includes(h) || h.includes(n)
  })
  return contains.length === 1 ? contains[0].id : null
}
