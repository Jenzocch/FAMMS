# FQMS ↔ FAMMS integration

For the FQMS side. FAMMS is the maintenance system; FQMS is the QC system.

## Who owns what

```
FAMMS owns the equipment master:  factory → area → machine
FQMS  owns the QC process:        the daily round, the ticking
```

| | FAMMS | FQMS |
|---|---|---|
| Factories, areas, machines | ✅ source of truth | mirrors it |
| Daily QC ticking | shows it, read-only | ✅ where it happens |
| Work orders, repairs, PM | ✅ | — |

FAMMS owns the master data because it is the system that holds the equipment
lifecycle — machines, maintenance history, PM schedules, costs. FQMS mirrors
it so its operators inspect the same list of machines that maintenance
services.

**FAMMS has no QC ticking UI and deliberately never will.** Signing the same
machine off in both systems is double entry, and the two records would
disagree the first time someone only did one of them.

## Two endpoints

```
GET   /api/external/inspection-targets     ← what is there to inspect
POST  /api/external/qc-check               → here is today's round
```

Both authenticate with `Authorization: Bearer <QC_API_SECRET>` — the same
shared secret FQMS already uses for `GET /api/external/machine-status`. No new
credential.

Factory codes are **`SJA`**, **`DIN`**, **`OLT`** (Olentia).

---

## 1. Pull the inspection list

```
GET /api/external/inspection-targets            → all three factories
GET /api/external/inspection-targets?factory_code=DIN
Authorization: Bearer <QC_API_SECRET>
```

```json
{
  "generated_at": "2026-07-27T02:14:00.000Z",
  "factories": [{
    "id": "3f2a…", "code": "DIN", "name": "DIN",
    "areas": [{
      "id": "8c1b…", "code": "DIN-HMG-01", "name": "Homogenizer Bay",
      "description": null,
      "machines": [
        { "id": "0f8c…", "code": "DIN-HMG-001", "name": "Homogenizer 1",
          "status": "running", "brand": "GEA", "model": "Ariete" }
      ]
    }]
  }]
}
```

Pull once a shift. This changes when a machine is installed or moved, not
hourly.

Scrapped machines are excluded — they're off the floor. Machines on `standby`
are included: idle today is still a machine worth eyeballing.

### ⚠️ Key on `id`, display `code`

Every object carries both. `id` is a UUID that **never changes**. `code` is a
human label that someone **can rename** in FAMMS Settings.

If FQMS stores `code` as its foreign key, one rename silently breaks the
mapping with no error anywhere. **Store `id`.** Show `code` to operators.

---

## 2. Post the round back

```
POST /api/external/qc-check
Authorization: Bearer <QC_API_SECRET>
Content-Type: application/json
```

```json
{
  "factory_code": "DIN",
  "checked_by":   "Siti (QC)",
  "check_date":   "2026-07-27",
  "results": [
    { "machine_code": "DIN-HMG-001", "result": "ok" },
    { "machine_code": "DIN-MIX-002", "result": "ok" },
    { "machine_code": "DIN-FIL-003", "result": "issue",
      "note": "bearing bunyi kasar, getaran tinggi",
      "machine_stopped": true,
      "external_ref": "FQMS-2026-0142" }
  ]
}
```

**Send the whole round in one call**, not one call per machine. A round is
20-40 machines; per-machine calls are that many round trips from the shop
floor, and a half-finished round would be indistinguishable from a finished
one.

**Send the OK ticks too**, not just the problems. Without them FAMMS can't
tell "28 of 31 machines checked" from "28 checked, 3 don't exist" — the
completion rate is the point of receiving this at all.

| Field | Required | Notes |
|---|---|---|
| `factory_code` | ✅ | `SJA` / `DIN` / `OLT` |
| `checked_by` | — | Who did the round. Defaults to `FQMS (QC)` |
| `check_date` | — | `YYYY-MM-DD`. Defaults to today in WIB. Send it when a round finishes after midnight, so it files against the right shift |
| `results[].machine_id` | one of | The FAMMS UUID — preferred, immune to renames |
| `results[].machine_code` | these two | The code. Fine, but see the rename warning above |
| `results[].result` | ✅ | `"ok"` or `"issue"` |
| `results[].note` | — | What QC saw. Becomes the work-order description |
| `results[].machine_stopped` | — | See below. Only meaningful on `"issue"` |
| `results[].external_ref` | — | **Always send on an `issue`.** See idempotency |

### `machine_stopped` — the one judgement call

Deliberately the *only* severity input, because "did it stop?" is a question a
QC walker can answer reliably standing in front of the machine. An A/B/C/D
severity scale is not.

| Value | Work order | Machine status in FAMMS |
|---|---|---|
| `true` | 🔴 Critical, same-day deadline | → **Perbaikan** (維修中) |
| `false` / omitted | 🟡 中 | stays **Beroperasi** — case still opens |

A fault the line is still running through (odd noise, weeping seal) is real
and gets a case, but marking that machine "under repair" would make FAMMS
under-report equipment availability. Only send `true` when production actually
stopped.

The machine returns to **Beroperasi** automatically when maintenance closes
the case. FQMS sends nothing to un-stop it.

### Response

```json
{
  "ok": true,
  "check_date": "2026-07-27",
  "saved": 3,
  "failed": 0,
  "results": [
    { "machine": "DIN-HMG-001", "ok": true, "result": "ok", "machine_status": "running" },
    { "machine": "DIN-MIX-002", "ok": true, "result": "ok", "machine_status": "running" },
    { "machine": "DIN-FIL-003", "ok": true, "result": "issue",
      "incident_id": "0f8c…", "incident_no": "FIT-20260727-003",
      "machine_status": "repairing" }
  ]
}
```

**Not atomic, on purpose.** One unknown machine code must not throw away the
other 29 good ticks. Every entry gets its own outcome; `ok: false` entries
carry an `error`. Top-level `ok` is `true` only when nothing failed.

For each `issue`, store `incident_no` and build the link
`https://<famms-host>/incidents/<incident_id>` — show it next to the failed
check so QC (or their supervisor) can follow the repair. It's an output, not a
required step: nobody has to open FAMMS.

### Idempotency — always send `external_ref` on an issue

A timeout on your side is not proof the call failed.

- **OK ticks** are always safe to re-send — they upsert on
  (machine, check_date).
- **Issues** are only safe with `external_ref`. Without it, a re-send opens a
  **second work order** and dispatches a technician twice.

Set it to something stable and unique on your side — your own check id is
ideal. A re-send then returns the original work order instead of opening a new
one.

### Errors

| Status | Meaning | What to do |
|---|---|---|
| `401` | Bad or missing `Authorization` | Check `QC_API_SECRET` |
| `400` | Missing `factory_code`, empty `results`, bad JSON | Fix the payload |
| `404` | Unknown `factory_code` | Check the code — `SJA` / `DIN` / `OLT` |
| `500` | The ticks didn't save | Work orders may already exist. Safe to re-send **if** every issue carried `external_ref` |

A machine that doesn't exist in FAMMS is **not** a 404 for the whole call — it
comes back as a per-entry `ok: false`. Re-pull the inspection list; the
machine may have been added, renamed or scrapped in FAMMS.

### Check your setup first

```
GET /api/external/qc-check
Authorization: Bearer <QC_API_SECRET>
→ 200 { "ok": true, "hint": "..." }
```

Confirms URL and secret without writing anything.

---

## Areas: FAMMS is adopting FQMS's codes, once

FAMMS started with 3 coarse areas per factory (Produksi / Packing / Gudang);
FQMS divides the same floor into ~21 sub-areas by machine type and room. With
the two disagreeing about where a machine is, neither the QC round nor a fault
report can be located consistently.

The plan:

1. **One-time:** FAMMS imports FQMS's sub-areas, using **FQMS's area codes
   verbatim** (`supabase/migration_areas_match_fqms.sql`), and moves every
   machine to its new area.
2. **From then on:** FAMMS is the source. New areas are created in FAMMS
   Settings and FQMS picks them up from `GET /api/external/inspection-targets`.

FQMS's granularity is the starting point because it reflects how QC actually
walks the floor. FAMMS holds it afterwards because it owns the equipment
lifecycle — a new production line is a maintenance event, and FAMMS shouldn't
have to wait on the QC system to register it.

**What we need from FQMS to do step 1:** the authoritative list of sub-areas —
`area_code`, `area_name`, and which factory (`SJA` / `DIN` / `OLT`) each
belongs to.

## Machine codes must match

Confirmed: FQMS will use the same machine codes as FAMMS. Pull them from
`/api/external/inspection-targets` and align once.

If a code ever doesn't match, `qc-check` returns that entry as
`ok: false, error: "machine not found in this factory"` — the rest of the
round still saves.

---

## Still to confirm on the FQMS side

1. **The sub-area list** — `area_code` + `area_name` + factory, for the
   one-time import above.
2. **Will you send `external_ref` on every issue?** If not, say so and we'll
   agree a different retry rule — as it stands a retry dispatches a technician
   twice.
3. **The FAMMS host URL and `QC_API_SECRET`** need configuring on your side.
   Jenzo has both.
4. **Do you want to know when a case is closed?** Not built. FQMS is currently
   write-only for faults, plus the two reads. If you want a callback on close,
   say so and we'll add it the way Gudang One's write-back works.
