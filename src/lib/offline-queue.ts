// Offline incident-report queue (IndexedDB).
//
// A technician standing next to a broken machine in a dead-signal corner of
// the plant must be able to finish the report and walk away — losing their
// typing (or having to remember to redo it later) is exactly how reports stop
// getting filed at all. So a submit that can't reach the server is stored on
// the device and sent automatically once signal returns.
//
// Why IndexedDB and not localStorage: photos. localStorage is strings only,
// so 5 site photos would have to be base64'd (+33% size, into a ~5MB cap).
// IndexedDB stores Blobs natively.
//
// Safe to send twice by design: each queued report carries the SAME
// clientRequestId the form generated, and submitIncidentReport short-circuits
// on a matching id — so a flush that succeeds server-side but dies before we
// delete the local copy re-sends harmlessly instead of duplicating the case.

const DB_NAME = 'famms-offline'
const DB_VERSION = 1
const STORE = 'pending_reports'

// Everything submitIncidentReport needs, minus the File[] (stored separately
// as Blobs — a File can't be relied on to survive a structured clone in every
// browser, but a Blob + its name/type can).
export interface QueuedReport {
  clientRequestId: string // keyPath — re-queuing the same form overwrites
  queuedAt: number
  factoryId: string
  incidentType: string
  machineId: string | null
  title: string
  description: string
  reporterName: string
  impactCode: 'A' | 'C' | 'D'
  dueDate: string
  locationNote: string
  userId: string | null
  photos: { name: string; type: string; blob: Blob }[]
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'clientRequestId' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(db => new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode)
    const req = run(t.objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    t.oncomplete = () => db.close()
  }))
}

export async function enqueueReport(report: QueuedReport): Promise<void> {
  await tx('readwrite', s => s.put(report))
}

export async function listQueuedReports(): Promise<QueuedReport[]> {
  const all = await tx<QueuedReport[]>('readonly', s => s.getAll() as IDBRequest<QueuedReport[]>)
  // Oldest first — reports should reach the board in the order they happened.
  return (all ?? []).sort((a, b) => a.queuedAt - b.queuedAt)
}

export async function removeQueuedReport(clientRequestId: string): Promise<void> {
  await tx('readwrite', s => s.delete(clientRequestId))
}

export async function countQueuedReports(): Promise<number> {
  try {
    return await tx<number>('readonly', s => s.count())
  } catch {
    return 0 // IndexedDB blocked (private mode / old browser) — report none
  }
}

// Rebuild the File objects submitIncidentReport's upload path expects.
export function filesFrom(report: QueuedReport): File[] {
  return report.photos.map(p => new File([p.blob], p.name, { type: p.type }))
}

// Whether a failed submit looks like "the network was the problem" (worth
// queueing) rather than "the server rejected this" (queueing would just retry
// a request that will keep failing). Offline fetch rejects with a TypeError;
// Supabase surfaces its own transport failures with a similar message.
export function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true
  if (err instanceof TypeError) return true
  const msg = err instanceof Error ? err.message : String(err ?? '')
  return /failed to fetch|network|load failed|timeout|networkerror/i.test(msg)
}
