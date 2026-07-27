import type { createAdminClient } from '@/lib/supabase/admin'
import { createIncidentServer } from '@/lib/incidents/createIncidentServer'
import { notifyFactory, esc } from '@/lib/telegram'
import { logAuditEvent } from '@/lib/audit'

type AdminClient = ReturnType<typeof createAdminClient>

// What happens when a QC tick says "not OK".
//
// QC does the daily round in FQMS, which posts the whole thing back to
// POST /api/external/qc-check — the only caller of reportMachineIssue()
// below. FAMMS has no ticking UI on purpose: signing the same machine off in
// both systems is double entry, and the two records would disagree the first
// time someone only did one of them. FAMMS's /qc page is read-only.

export type CheckResult = 'ok' | 'issue'

export interface ReportIssueInput {
  factoryId: string
  machineId: string
  machineName: string
  machineCode: string | null
  /** What QC saw. Becomes the incident description. */
  note: string
  /**
   * TRUE only when the machine actually stopped. This is the single input
   * that decides whether machines.status flips to 'repairing' — a fault that
   * doesn't stop production (odd noise, weeping seal) still opens a case but
   * leaves the machine 'running', so availability figures stay honest.
   */
  machineStopped: boolean
  reporterName: string | null
  reportedById: string | null
  /** Audit-trail suffix, e.g. "via QC 點檢" / "via FQMS". */
  via: string
}

export interface ReportedIssue {
  incidentId: string
  incidentNo: string
  machineStatusChanged: boolean
}

// A stopped machine is a production stop → Critical. A fault the machine is
// still running through is real but not an emergency → 中. QC never picks the
// urgency itself; one "did it stop?" tick is a question a QC walker can
// answer reliably, an A/C/D scale is not.
function impactFor(machineStopped: boolean): 'A' | 'C' {
  return machineStopped ? 'A' : 'C'
}

/**
 * Opens a FAMMS incident for a machine fault found by QC, and — only when the
 * machine actually stopped — moves the machine to 'repairing'.
 *
 * Everything after the incident insert is best-effort: the case is already
 * real, and a Telegram outage or a status-update failure must not lose it.
 */
export async function reportMachineIssue(
  admin: AdminClient,
  input: ReportIssueInput,
): Promise<ReportedIssue> {
  const machineLabel = `${input.machineCode ? `[${input.machineCode}] ` : ''}${input.machineName}`
  const trimmedNote = input.note.trim()
  const description = trimmedNote || `QC 點檢發現異常 / QC menemukan masalah — ${machineLabel}`
  // Title mirrors the report form's rule (first line, capped) so the board
  // reads the same whatever channel filed the case.
  const rawTitle = `${machineLabel} — ${description}`
  const title = rawTitle.length > 60 ? `${rawTitle.slice(0, 57)}...` : rawTitle

  const incident = await createIncidentServer(admin, {
    factoryId: input.factoryId,
    machineId: input.machineId,
    // 'machine' (not 'other'): repeat-failure detection and the RCA trigger
    // both key on (machine_id, incident_type), so typing these differently
    // from a web report of the same fault would stop them ever matching.
    incidentType: 'machine',
    title,
    description,
    reporterName: input.reporterName,
    reportedById: input.reportedById,
    impact: impactFor(input.machineStopped),
    via: input.via,
  })

  // ── Machine status ────────────────────────────────────────────────────────
  let machineStatusChanged = false
  if (input.machineStopped) {
    const { error } = await admin
      .from('machines')
      .update({ status: 'repairing', updated_at: new Date().toISOString() })
      .eq('id', input.machineId)
      // Don't resurrect a scrapped machine, and don't overwrite a status a
      // technician already set to something more specific.
      .eq('status', 'running')
    if (!error) {
      machineStatusChanged = true
      await logAuditEvent(admin, {
        userId: input.reportedById,
        userName: input.reporterName,
        actionType: 'status_change',
        resourceType: 'machine',
        resourceId: input.machineId,
        oldValue: 'running',
        newValue: 'repairing',
        changeSummary: `機器轉為維修中：${machineLabel}（${input.via}）`,
        factoryId: input.factoryId,
      }).catch(() => {})
    }
  }

  // ── Notify the factory, same as any other new report ──────────────────────
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  await notifyFactory(admin, {
    factoryId: input.factoryId,
    type: 'new_incident',
    html: [
      `🔍 <b>QC — Masalah Ditemukan</b> — ${esc(incident.incident_no)}`,
      `🔧 ${esc(machineLabel)}`,
      input.machineStopped ? '🛑 <b>Mesin BERHENTI</b>' : '⚠️ Mesin masih jalan',
      `📋 ${esc(description)}`,
      input.reporterName ? `👤 ${esc(input.reporterName)}` : '',
      `<a href="${appUrl}/incidents/${incident.id}">Lihat detail →</a>`,
    ].filter(Boolean).join('\n'),
  }).catch(() => {})

  return {
    incidentId: incident.id,
    incidentNo: incident.incident_no,
    machineStatusChanged,
  }
}

/**
 * Puts a machine back into production when its QC-opened case is closed.
 * Only ever moves 'repairing' → 'running', so it can't override a machine an
 * engineer has since marked 'standby' or 'scrapped'.
 */
export async function restoreMachineAfterClose(
  admin: AdminClient,
  machineId: string,
): Promise<void> {
  await admin
    .from('machines')
    .update({ status: 'running', updated_at: new Date().toISOString() })
    .eq('id', machineId)
    .eq('status', 'repairing')
}
