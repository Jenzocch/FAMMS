# FQMS sub-areas for the FAMMS one-time import

Answers "**What we need from FQMS to do step 1**" in the FAMMS integration spec:
the authoritative list of sub-areas — `area_code`, `area_name`, factory.

---

## ⚠️ Read this before importing: FQMS zones are not all areas

FQMS has ~30 `zones`, but **a zone is a QC check sheet, not a place.** Several
zones describe the *same physical room* through different checks:

| FQMS zone | What it actually is |
|---|---|
| `DIN - 切割機監控` (cutting machine monitoring) | the machines standing in **Ruang Pemotongan** |
| `DIN - Ruang Pemotongan（清潔）` (cleaning) | **Ruang Pemotongan** itself |
| `DIN - 切片機監控` | the machines in **Ruang Slice** + **Area Slice dan Catok** |
| `DIN - Ruang slice（清潔）` | **Ruang Slice** itself |
| `DIN - 巴氏殺菌監控` | the tanks in **Ruang Pasteurisasi** |
| `DIN - 濾網清潔` (filter cleaning) | a recurring task, no room at all |

Importing all zones verbatim would give FAMMS two areas for one room
(`切割機監控` *and* `Ruang Pemotongan`) plus areas that aren't places
(`濾網清潔`). Machines would then be locatable in FAMMS but the QC round and a
fault report would still disagree about where they are — exactly the problem
the import is meant to fix.

**So the list below is the physical rooms only.** FQMS keeps its own zone→room
mapping; that's a FQMS concern and doesn't need to exist in FAMMS.

Codes are prefixed with the factory code so they stay unambiguous if areas are
ever listed across factories.

---

## DIN (Denikin) — 13 areas

Sources: `DIN-FR-PRD-002-CPP` (11 cleaning sheets, one per room), plus
`Ruang Ayak dan Potong Baru` from the `DIN-FR-PRD-001-DAP` equipment list,
plus IPAL.

| `area_code` | `area_name` | Machines that belong here |
|---|---|---|
| `DIN-GANTI` | Ruang Ganti Karyawan | — |
| `DIN-REHID` | Area Rehidrasi dan Trimming | — |
| `DIN-CATOK` | Area Slice dan Catok | A1A-KA, A1B-KA, A6-12, A7-08, A8-05, A9-03 |
| `DIN-SLICE` | Ruang Slice | A2A-03, A2B-03, A2C-03, A3A-06, A3B-06, A4A-03, A4B-03, A5A-03, A5B-03 |
| `DIN-TRANS` | Ruang Transit dan Pemotongan 1 | — |
| `DIN-POTONG` | Ruang Pemotongan | C1–C8 |
| `DIN-AYAK` | Ruang Ayak dan Potong Baru | C10–C14 |
| `DIN-PASTEUR` | Ruang Pasteurisasi | D1–D8 |
| `DIN-BTP` | Ruang BTP Ekspor, Penirisan, dan Penimbangan | — |
| `DIN-PRESS` | Ruang Press | — |
| `DIN-PACKNATA` | Ruang Packing Nata Lokal dan Inspeksi Partikel Asing | — |
| `DIN-GUDANG` | Gudang Bahan Baku, Bahan Kemas, dan Produk Jadi | — |
| `DIN-IPAL` | IPAL (Instalasi Pengolahan Air Limbah) | — |

**C9 is deliberately absent** — the DAP annotates it *"di garasi, tidak
terpakai."*

**F1–F4 (Mesin Vacuum Sealer) have no room.** The DAP confirms the four
machines exist but doesn't record where they stand. Best guesses are
`DIN-PRESS` or `DIN-BTP`; neither is verified, so **please leave them where
they are and let us confirm on site** rather than assigning a room now.

**Not areas** (FQMS zones that are recurring tasks, not places — do not
import): `DIN - 切割機潮墊清潔`, `DIN - 濾網清潔`.
`DIN - IPAL 污水處理清潔` maps to `DIN-IPAL` above.

## SJA — 7 areas

Source: `db/36` cleaning checklist, one sheet per room. `db/35`'s three
pre-operational zones are checks on rooms already in this list, not extra
rooms.

| `area_code` | `area_name` | Machines |
|---|---|---|
| `SJA-SNJ` | R. Sirup, Nata, Jelly | 32 |
| `SJA-FORMSIR` | R. Formulasi Sirup | 0 — the DAP records no machines here |
| `SJA-FORMBAW` | R. Formulasi Bawah | 3 |
| `SJA-GDBAWAH` | R. Gudang Bawah | 6 |
| `SJA-MUTIARA` | R. Mutiara | 55 |
| `SJA-POWDER` | R. Powder | 11 |
| `SJA-GDATAS` | R. Gudang Atas | 2 |

**SJA machines: 109, now available.** `SJA-FR-PRD-001-DAP` (Rev 02,
13 Des 2025) came through after the first version of this doc. Generated as
`supabase/seed_sja_machines_real.sql` — codes, names, area, and status all
derived from the sheet, nothing invented.

Per-area counts: `SJA-MUTIARA` 55, `SJA-SNJ` 32, `SJA-POWDER` 11,
`SJA-GDBAWAH` 6, `SJA-FORMBAW` 3, `SJA-GDATAS` 2.
Status from the sheet's own notes: 98 running, 10 standby
(*tidak/belum/jarang dipakai*, *cadangan*), 1 repairing (CST1
*sedang diperbaiki*). Nothing marked scrapped — "not used" isn't "off the
floor", and scrapped machines drop out of the inspection list entirely.

The DAP's `Lokasi` column is **finer than these seven rooms** — it separates
*Mixing mutiara* from *Mutiara*, *Filling powder* from *Powder*, *Nata* from
*Syrup dan Jelly*. Machines are filed into the seven rooms and the DAP's own
location string is kept verbatim in `remarks`, so if maintenance wants those
finer rooms as real areas later, nothing has to be re-derived.

Three to confirm on site: **PD10** (every other cooling tank is TPD1..TPD9 —
looks like a source typo for TPD10, transcribed verbatim rather than guessed
at); **P1** (only single-letter code in the sheet); and *Timbang warna* /
*Sisa sirup*, which are stations rather than rooms — their scales are filed
under `SJA-SNJ`.

## OLT (Olentia) — nothing authoritative yet

OLT's only FQMS zones are the four generic placeholders `db/24` seeded into
every factory (Gudang Bahan Baku / Area Produksi / Area Pengemasan / Ruang
Ganti). **Those are not a floor survey** — nobody has walked OLT and written
its rooms down.

Please **keep OLT's existing FAMMS areas as-is.** Handing over placeholders as
if they were authoritative is worse than handing over nothing. When OLT gets
surveyed the rooms get created in FAMMS Settings, and FQMS picks them up from
`inspection-targets` like any other new area.

---

## Ready-to-run insert

Idempotent; assumes `areas UNIQUE (factory_id, code)`.

```sql
INSERT INTO areas (factory_id, code, name)
SELECT f.id, a.code, a.name
FROM factories f
JOIN (VALUES
  ('DIN', 'DIN-GANTI',    'Ruang Ganti Karyawan'),
  ('DIN', 'DIN-REHID',    'Area Rehidrasi dan Trimming'),
  ('DIN', 'DIN-CATOK',    'Area Slice dan Catok'),
  ('DIN', 'DIN-SLICE',    'Ruang Slice'),
  ('DIN', 'DIN-TRANS',    'Ruang Transit dan Pemotongan 1'),
  ('DIN', 'DIN-POTONG',   'Ruang Pemotongan'),
  ('DIN', 'DIN-AYAK',     'Ruang Ayak dan Potong Baru'),
  ('DIN', 'DIN-PASTEUR',  'Ruang Pasteurisasi'),
  ('DIN', 'DIN-BTP',      'Ruang BTP Ekspor, Penirisan, dan Penimbangan'),
  ('DIN', 'DIN-PRESS',    'Ruang Press'),
  ('DIN', 'DIN-PACKNATA', 'Ruang Packing Nata Lokal dan Inspeksi Partikel Asing'),
  ('DIN', 'DIN-GUDANG',   'Gudang Bahan Baku, Bahan Kemas, dan Produk Jadi'),
  ('DIN', 'DIN-IPAL',     'IPAL (Instalasi Pengolahan Air Limbah)'),
  ('SJA', 'SJA-SNJ',      'R. Sirup, Nata, Jelly'),
  ('SJA', 'SJA-FORMSIR',  'R. Formulasi Sirup'),
  ('SJA', 'SJA-FORMBAW',  'R. Formulasi Bawah'),
  ('SJA', 'SJA-GDBAWAH',  'R. Gudang Bawah'),
  ('SJA', 'SJA-MUTIARA',  'R. Mutiara'),
  ('SJA', 'SJA-POWDER',   'R. Powder'),
  ('SJA', 'SJA-GDATAS',   'R. Gudang Atas')
) AS a(factory_code, code, name) ON a.factory_code = f.code
ON CONFLICT (factory_id, code) DO NOTHING;
```

Everything above is already written as runnable SQL on the FAMMS branch
`claude/fqms-machine-link`, in dependency order:

| File | What it does |
|---|---|
| `supabase/migration_areas_match_fqms.sql` | creates the 20 areas **and relocates existing DIN machines** into them |
| `supabase/seed_din_machines_real.sql` | the 40 DIN machines from `DIN-FR-PRD-001-DAP` |
| `supabase/seed_sja_machines_real.sql` | the 109 SJA machines from `SJA-FR-PRD-001-DAP` |

All three verified against PostgreSQL 16: run twice, identical result, no
duplicate machine codes, and machines pre-existing in the wrong area do get
moved.

---

## Answers to the other three open questions

**2. Will FQMS send `external_ref` on every issue?**
**Yes, always.** It's the primary key of the FQMS outbox row that owns the
send, so it exists before the first attempt and stays identical across every
retry. Format is a UUID. FQMS never retries an issue without it.

**3. FAMMS host URL and `QC_API_SECRET`** — with Jenzo, being configured as
`FAMMS_STATUS_URL` / `FAMMS_STATUS_SECRET` on the FQMS side.

⚠️ Worth knowing: whether those two secrets currently match **has never been
verified**, because FQMS was sending `x-fqms-secret` instead of
`Authorization: Bearer` and the request never reached your auth check. Now
fixed on our side, but treat the shared secret as untested until
`GET /api/external/qc-check` returns 200 from FQMS.

**4. Do we want a close callback?**
**Yes, but not blocking** — please don't build it for v1. Useful because QC
currently has no way to know a fault they raised was fixed, so the same
machine gets re-reported. Not urgent because QC can follow the
`incidents/<id>` link. When you do add it, the Gudang One write-back shape is
the right model, and FQMS will consume it the same way.
