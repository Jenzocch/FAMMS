// Qwen (Alibaba Cloud DashScope, OpenAI-compatible endpoint) — used to turn a
// technician's raw close-time notes into a clean, searchable knowledge-base
// entry. Free-tier API, chosen over OpenAI (the vestigial OPENAI_API_KEY this
// app never actually called) for cost and for decent Bahasa Indonesia +
// English-technical-term handling, matching this app's language mix.
//
// Every caller MUST treat this as best-effort: if QWEN_API_KEY is unset, the
// network call fails, the response times out, or the model returns something
// unparseable, this returns null and the caller falls back to the raw
// technician-entered text. A knowledge-base entry must never be lost or
// blocked because an LLM call had a bad day.

const API_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
const MODEL = process.env.QWEN_MODEL || 'qwen-flash'
const TIMEOUT_MS = 10_000

export interface KBSummaryInput {
  problem: string // original reported issue (title/description)
  rootCause: string // technician's raw root-cause note
  repairMethod: string // technician's raw repair note
  machineName?: string | null
  incidentType?: string
}

export interface KBSummaryResult {
  problem: string
  rootCause: string
  repairMethod: string
  lessonsLearned: string // '' when there's nothing worth flagging
  keywords: string
}

const SYSTEM_PROMPT = `Kamu membantu merapikan catatan perbaikan mesin pabrik menjadi entri knowledge base yang mudah dicari oleh teknisi lain di kemudian hari.

Aturan:
- JANGAN menerjemahkan — pertahankan bahasa asli catatan teknisi (Indonesia, Inggris, atau campuran). Tugasmu merapikan struktur & kejelasan, bukan menerjemahkan.
- Istilah teknis komponen (bearing, VFD, PLC, motor, gearbox, sensor, dll.) tetap dalam bahasa aslinya, jangan diterjemahkan.
- "lessons_learned" HANYA diisi jika ada wawasan pencegahan yang benar-benar berguna (misal: jadwal pelumasan perlu diperpendek, part ini sering rusak, dll). Jika tidak ada insight jelas, kosongkan ("").
- "keywords" berisi kata kunci pencarian yang relevan (nama part, gejala kerusakan, kode mesin) dipisah spasi — untuk memaksimalkan hasil pencarian nanti.
- Jangan mengarang informasi yang tidak ada di catatan asli. Jika catatan singkat, ringkasan boleh singkat juga.

Balas HANYA dengan JSON, tanpa teks lain, dengan bentuk persis:
{"problem": "...", "root_cause": "...", "repair_method": "...", "lessons_learned": "...", "keywords": "..."}`

export async function summarizeForKnowledgeBase(input: KBSummaryInput): Promise<KBSummaryResult | null> {
  const apiKey = process.env.QWEN_API_KEY
  if (!apiKey) return null

  const userPrompt = [
    input.machineName ? `Mesin: ${input.machineName}` : null,
    input.incidentType ? `Jenis: ${input.incidentType}` : null,
    `Masalah yang dilaporkan: ${input.problem || '-'}`,
    `Root cause (catatan teknisi): ${input.rootCause || '-'}`,
    `Cara perbaikan (catatan teknisi): ${input.repairMethod || '-'}`,
  ].filter(Boolean).join('\n')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      }),
      signal: controller.signal,
    })
    if (!res.ok) return null

    const json = await res.json()
    const content: string | undefined = json?.choices?.[0]?.message?.content
    if (!content) return null

    const parsed = JSON.parse(content) as {
      problem?: unknown; root_cause?: unknown; repair_method?: unknown
      lessons_learned?: unknown; keywords?: unknown
    }
    // Every field must be a non-empty string for problem/root_cause/repair_method —
    // an empty/garbled result is worse than the raw fallback, so reject it.
    if (
      typeof parsed.problem !== 'string' || !parsed.problem.trim() ||
      typeof parsed.root_cause !== 'string' || !parsed.root_cause.trim() ||
      typeof parsed.repair_method !== 'string' || !parsed.repair_method.trim()
    ) return null

    return {
      problem: parsed.problem.trim(),
      rootCause: parsed.root_cause.trim(),
      repairMethod: parsed.repair_method.trim(),
      lessonsLearned: typeof parsed.lessons_learned === 'string' ? parsed.lessons_learned.trim() : '',
      keywords: typeof parsed.keywords === 'string' ? parsed.keywords.trim() : '',
    }
  } catch {
    // Network error, timeout/abort, or malformed JSON — all fall back silently.
    return null
  } finally {
    clearTimeout(timeout)
  }
}
