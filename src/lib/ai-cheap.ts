// callAICheap — the "free / high-volume / non-personal-data" AI path, shared
// convention across the systems. For things like meeting-note task extraction
// (and later translation, interview scoring): work that is bulk and carries no
// personal data, so it can run on free public models.
//
// Provider fallback order (each layer skipped if its key isn't set):
//   1. OpenRouter · meta-llama/llama-3.3-70b-instruct:free   (primary, free)
//   2. OpenRouter · deepseek/deepseek-chat                   (when 1 fails / is rate-limited)
//   3. DeepSeek direct · deepseek-chat                       (last resort)
//
// All three are OpenAI-compatible /chat/completions endpoints, so one request
// shape serves all. Best-effort like qwen.ts: any failure (no key, network,
// timeout, bad body) falls through to the next provider, and null if they all
// miss — the caller must have a non-AI fallback and never block on this.
//
// NOT for personal data: these hit public model providers. Keep it to
// factory/operational text (meeting action items, machine notes), never
// employee PII, credentials, or anything that shouldn't leave the building.

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions'
const TIMEOUT_MS = 15_000

interface Provider {
  name: string
  url: string
  apiKey: string | undefined
  model: string
  // OpenRouter asks callers to identify themselves; harmless elsewhere.
  headers?: Record<string, string>
}

function providers(): Provider[] {
  const openrouter = process.env.OPENROUTER_API_KEY
  const deepseek = process.env.DEEPSEEK_API_KEY
  const orHeaders = {
    'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://famms.local',
    'X-Title': 'FAMMS',
  }
  return [
    { name: 'openrouter/llama-3.3-70b:free', url: OPENROUTER_URL, apiKey: openrouter, model: 'meta-llama/llama-3.3-70b-instruct:free', headers: orHeaders },
    { name: 'openrouter/deepseek-chat', url: OPENROUTER_URL, apiKey: openrouter, model: 'deepseek/deepseek-chat', headers: orHeaders },
    { name: 'deepseek/deepseek-chat', url: DEEPSEEK_URL, apiKey: deepseek, model: 'deepseek-chat' },
  ]
}

export interface CallAICheapInput {
  system: string
  user: string
  /** Ask for a JSON object back (response_format + defensive parsing). */
  json?: boolean
  temperature?: number
}

// Returns the assistant message content (string), or null if every configured
// provider failed. The caller parses/validates the content.
export async function callAICheap(input: CallAICheapInput): Promise<string | null> {
  const chain = providers().filter(p => p.apiKey)
  if (chain.length === 0) return null

  for (const p of chain) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      const res = await fetch(p.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${p.apiKey}`,
          ...(p.headers ?? {}),
        },
        body: JSON.stringify({
          model: p.model,
          messages: [
            { role: 'system', content: input.system },
            { role: 'user', content: input.user },
          ],
          ...(input.json ? { response_format: { type: 'json_object' } } : {}),
          temperature: input.temperature ?? 0.2,
        }),
        signal: controller.signal,
      })
      if (!res.ok) continue
      const data = await res.json()
      const content: string | undefined = data?.choices?.[0]?.message?.content
      if (content && content.trim()) return content
      // Empty/blocked completion — try the next provider.
    } catch {
      // Network error, timeout/abort, or malformed JSON — fall through.
    } finally {
      clearTimeout(timeout)
    }
  }
  return null
}

// Free models sometimes wrap JSON in ```fences``` or add a sentence around it,
// even in json mode. Pull out the first {...} object and parse it.
export function parseJsonLoose<T = unknown>(raw: string): T | null {
  const cleaned = raw.replace(/```(?:json)?/gi, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  const slice = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned
  try {
    return JSON.parse(slice) as T
  } catch {
    return null
  }
}
