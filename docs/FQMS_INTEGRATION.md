# FQMS → FAMMS integration

For the FQMS side. FAMMS is the maintenance system; FQMS is the QC system.

## What this does

When QC marks a machine **not OK** in FQMS, FQMS calls one endpoint on FAMMS.
FAMMS then:

1. opens a work order (`FIT-YYYYMMDD-NNN`),
2. flips the machine to **維修中 / Perbaikan** — but only if QC says the
   machine actually stopped,
3. notifies the factory's maintenance Telegram group immediately,
4. returns the work-order number and a link.

QC never leaves FQMS. They don't need a FAMMS account.

## Why an API call and not a link

The alternative was "show the QC operator a link that opens the FAMMS report
form". We're not doing that, because it means the same fault gets typed twice —
once in FQMS to fail the check, once in FAMMS to open the case — by someone who
mostly has no FAMMS login. In practice the second one doesn't get filled in.

The link still exists, it's just an **output**: FAMMS returns a `url`, FQMS
renders it as a normal clickable link next to the failed check. Anyone who
wants to follow the repair clicks it. Nobody is forced through it.

## The endpoint

```
POST  https://<famms-host>/api/external/qc-report
Authorization: Bearer <QC_API_SECRET>
Content-Type: application/json
```

`QC_API_SECRET` is the same shared secret FQMS already uses for the read-only
`GET /api/external/machine-status`. No new credential.

### Request

```json
{
  "factory_code":    "DIN",
  "machine_code":    "DIN-HMG-001",
  "note":            "bearing bunyi kasar, getaran tinggi",
  "machine_stopped": true,
  "reporter_name":   "Siti (QC)",
  "external_ref":    "FQMS-2026-0142"
}
```

| Field | Required | Notes |
|---|---|---|
| `factory_code` | ✅ | `DIN` / `SJA` / `OLENTIA` — the code, not the name |
| `machine_code` | ✅ | Exactly as it appears on the machine and in FAMMS |
| `note` | — | What QC saw. Becomes the case description. Free text, any language |
| `machine_stopped` | — | See below. Anything other than literal `true` means "still running" |
| `reporter_name` | — | Shown on the case. Defaults to `FQMS (QC)` |
| `external_ref` | — | **Please always send this.** See idempotency below |

No UUIDs, no FAMMS-internal ids, no incident schema. FQMS sends the codes its
own operators already read off the machine.

### `machine_stopped` — the one judgement call

This is deliberately the *only* severity input, because "did it stop?" is a
question a QC walker can answer reliably while standing in front of the
machine. An A/B/C/D severity scale is not.

| Value | Work order | Machine status |
|---|---|---|
| `true` | 🔴 Critical, same-day deadline | → **Perbaikan** (維修中) |
| `false` / omitted | 🟡 中 | stays **Beroperasi** — case still opens |

A fault the line is still running through (odd noise, weeping seal) is real
and gets a case, but marking that machine as "under repair" would make FAMMS
under-report equipment availability. Only send `true` when production
genuinely stopped.

The machine goes back to **Beroperasi** automatically when maintenance closes
the case. FQMS doesn't need to send anything to un-stop it.

### Response

```json
{
  "ok": true,
  "incident_id":    "0f8c…",
  "incident_no":    "FIT-20260727-003",
  "url":            "https://<famms-host>/incidents/0f8c…",
  "machine_status": "repairing"
}
```

Store `incident_no` and `url` against the failed QC check. Render `url` as a
link; show `incident_no` as the text.

### Idempotency — please send `external_ref`

A network timeout on your side is not proof the call failed. If FQMS retries
without `external_ref`, FAMMS opens a **second work order** for the same
fault, and a technician gets dispatched twice.

With `external_ref` set to something stable and unique on your side (your own
check id is ideal), a retry returns the original work order instead:

```json
{ "ok": true, "duplicate": true, "incident_id": "…", "incident_no": "…", "url": "…" }
```

`duplicate: true` means "this was already filed" — treat it as success, not an
error.

### Errors

| Status | Meaning | What to do |
|---|---|---|
| `401` | Bad or missing `Authorization` header | Check `QC_API_SECRET` |
| `400` | Missing `factory_code` / `machine_code`, or bad JSON | Fix the payload |
| `404` | That factory or machine isn't in FAMMS | See "machines must exist" below |
| `500` | FAMMS failed to create the case | Safe to retry **if** you sent `external_ref` |

### Check your setup before wiring the POST

```
GET /api/external/qc-report
Authorization: Bearer <QC_API_SECRET>
→ 200 { "ok": true, "hint": "..." }
```

Confirms the URL and the secret without creating anything.

## Machines must exist in FAMMS first

A `404` means FAMMS has no machine with that `machine_code` in that factory.
FAMMS can only open a work order against a machine it knows about.

## Areas: FAMMS is adopting FQMS's codes

FAMMS originally had 3 coarse areas per factory (Produksi / Packing / Gudang)
against FQMS's ~21 sub-areas, so the two systems disagreed about where a
machine physically is. FAMMS is being re-cut to use **FQMS's area codes
verbatim** (`supabase/migration_areas_match_fqms.sql`).

This is why `areas.code` matters: once both sides use the same codes, an FQMS
payload can name an area and FAMMS resolves it with no translation table for
anyone to maintain. **We need the authoritative list of the 21 area codes +
names, and which factory each belongs to.**

The report endpoint does not take an area today — the machine already implies
it. This is groundwork for later.

## Still to confirm on the FQMS side

1. **The 21 area codes + names, per factory** — needed before FAMMS can
   re-cut its areas (above).
2. **Will you send `external_ref`?** If not, say so, and we'll agree on a
   different retry rule.
3. **The FAMMS host URL and `QC_API_SECRET`** need to be configured on your
   side — Jenzo has both.
4. **Does FQMS want to know when the case is closed?** Not built. Today FQMS
   is write-only (report a fault) plus the existing read-only status pull. If
   you want a callback on close, tell us and we'll add it the way Gudang One's
   write-back works.
