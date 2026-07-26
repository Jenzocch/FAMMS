// Last-known-good cache for the report form's location dropdowns.
//
// Without this, the offline queue is useless for the case it exists for: the
// factory / area / machine lists come from Supabase, so with no signal every
// dropdown is empty, no factory can be picked, and the form can't be filled
// at all — let alone queued. Each successful online load overwrites the
// cached copy, so a technician who has used the app on this device before can
// still fill the form from memory of the last visit.
//
// localStorage (not IndexedDB): these are small, plain-JSON option lists and
// the synchronous read means the dropdown paints with data on first render
// instead of flashing empty. Photos are the only thing that needs IndexedDB
// (see offline-queue.ts).
//
// Deliberately NOT cached: anything a viewer shouldn't have seen. These lists
// are already scoped by RLS at fetch time, so what's cached is only what this
// device's user was allowed to load — but it IS readable by the next user of
// a shared tablet, which is why only option labels live here, never incident
// or personnel data.

const PREFIX = 'famms.cache.'

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null // corrupt / blocked storage — behave as a cache miss
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch { /* quota full or private mode — caching is best-effort */ }
}

// A non-empty result is cached and returned; an empty/failed load falls back
// to whatever was cached last. Empty is treated as "don't overwrite" on
// purpose: an offline fetch resolves to [] rather than throwing, and letting
// that wipe a good cache is how the dropdowns would end up permanently empty.
export function cacheList<T>(key: string, fresh: T[] | null | undefined): T[] {
  if (fresh && fresh.length > 0) {
    write(key, fresh)
    return fresh
  }
  return read<T[]>(key) ?? []
}

export const cacheKeys = {
  factories: 'factories',
  areas: (factoryId: string) => `areas.${factoryId}`,
  machines: (areaId: string) => `machines.${areaId}`,
}
