-- ============================================================
-- FAMMS — one-time area import from FQMS, plus machine relocation
--
-- FAMMS started with 3 coarse areas per factory (Produksi / Packing / Gudang).
-- FQMS divides the same floor into the rooms QC actually walks. With the two
-- disagreeing about where a machine is, neither the QC round nor a fault report
-- can be located consistently. This adopts FQMS's rooms verbatim, once; from
-- here on FAMMS is the source and new areas are created in FAMMS Settings.
--
-- ⚠️ FQMS zones are NOT all areas — read this before assuming a 1:1 import.
--   A FQMS zone is a QC *check sheet*, not a place, and several describe the
--   same room: "DIN - 切割機監控" (cutting machine monitoring) is the machines
--   standing in Ruang Pemotongan, while "DIN - Ruang Pemotongan（清潔）" is
--   that room's cleaning sheet. Importing zones verbatim would create two
--   areas for one room, plus areas that aren't places at all
--   ("DIN - 濾網清潔" is a recurring filter-cleaning task).
--   So what follows is the physical rooms only: DIN 13, SJA 7.
--
-- OLT is deliberately absent. Its only FQMS zones are the four generic
-- placeholders seeded into every factory (Gudang Bahan Baku / Area Produksi /
-- Area Pengemasan / Ruang Ganti) — that is not a floor survey, nobody has
-- walked OLT and written its rooms down. Keep OLT's existing FAMMS areas.
--
-- The old coarse areas (PROD / PACK / WH) are NOT deleted: SJA and OLT machines
-- still live in them, and other records may reference them.
--
-- Idempotent: areas use ON CONFLICT (factory_id, code) DO NOTHING; the
-- relocation is an UPDATE keyed on machine_code, so re-running is a no-op.
-- Rollback: see end of file.
-- ============================================================

-- ── 1. DIN — 13 rooms ────────────────────────────────────────
-- Source: DIN-FR-PRD-002-CPP (11 cleaning sheets, one per room), plus
-- Ruang Ayak dan Potong Baru from the DIN-FR-PRD-001-DAP equipment list,
-- plus IPAL.
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
  -- DIN-IPAL duplicates an area DIN already had, coded IPAL. Left in the list
  -- so this file still records what was actually run against the live DB;
  -- migration_areas_dedupe.sql removes it again and must run after this.
  ('DIN', 'DIN-IPAL',     'IPAL (Instalasi Pengolahan Air Limbah)')
) AS a(factory_code, code, name) ON a.factory_code = f.code
ON CONFLICT (factory_id, code) DO NOTHING;

-- ── 2. SJA — 7 rooms ─────────────────────────────────────────
-- Source: FQMS db/36 cleaning checklist, one sheet per room. FQMS db/35's
-- three pre-operational zones are checks on rooms already listed here, not
-- extra rooms.
INSERT INTO areas (factory_id, code, name)
SELECT f.id, a.code, a.name
FROM factories f
JOIN (VALUES
  ('SJA', 'SJA-SNJ',     'R. Sirup, Nata, Jelly'),
  ('SJA', 'SJA-FORMSIR', 'R. Formulasi Sirup'),
  ('SJA', 'SJA-FORMBAW', 'R. Formulasi Bawah'),
  ('SJA', 'SJA-GDBAWAH', 'R. Gudang Bawah'),
  ('SJA', 'SJA-MUTIARA', 'R. Mutiara'),
  ('SJA', 'SJA-POWDER',  'R. Powder'),
  ('SJA', 'SJA-GDATAS',  'R. Gudang Atas')
) AS a(factory_code, code, name) ON a.factory_code = f.code
ON CONFLICT (factory_id, code) DO NOTHING;

-- ── 3. Relocate DIN machines to their rooms ──────────────────
-- Only touches machines that already exist; machines created later by
-- seed_din_machines_real.sql land in the right area directly.
-- The mapping is matched in WHERE, not in a JOIN's ON: in UPDATE ... FROM, the
-- target table (m) cannot be referenced from the FROM list's join conditions.
UPDATE machines m
SET area_id = ar.id, updated_at = NOW()
FROM factories f
CROSS JOIN (VALUES
  -- Mesin potong. C9 is absent on purpose: the DAP annotates it
  -- "di garasi, tidak terpakai" (in the garage, not in use).
  ('C1', 'DIN-POTONG'), ('C2', 'DIN-POTONG'), ('C3', 'DIN-POTONG'),
  ('C4', 'DIN-POTONG'), ('C5', 'DIN-POTONG'), ('C6', 'DIN-POTONG'),
  ('C7', 'DIN-POTONG'), ('C8', 'DIN-POTONG'),
  ('C10', 'DIN-AYAK'), ('C11', 'DIN-AYAK'), ('C12', 'DIN-AYAK'),
  ('C13', 'DIN-AYAK'), ('C14', 'DIN-AYAK'),
  -- Mesin slice
  ('A1A-KA', 'DIN-CATOK'), ('A1B-KA', 'DIN-CATOK'),
  ('A2A-03', 'DIN-SLICE'), ('A2B-03', 'DIN-SLICE'), ('A2C-03', 'DIN-SLICE'),
  ('A3A-06', 'DIN-SLICE'), ('A3B-06', 'DIN-SLICE'),
  ('A4A-03', 'DIN-SLICE'), ('A4B-03', 'DIN-SLICE'),
  ('A5A-03', 'DIN-SLICE'), ('A5B-03', 'DIN-SLICE'),
  ('A6-12', 'DIN-CATOK'), ('A7-08', 'DIN-CATOK'),
  ('A8-05', 'DIN-CATOK'), ('A9-03', 'DIN-CATOK'),
  -- Bak pasteurisasi
  ('D1', 'DIN-PASTEUR'), ('D2', 'DIN-PASTEUR'), ('D3', 'DIN-PASTEUR'),
  ('D4', 'DIN-PASTEUR'), ('D5', 'DIN-PASTEUR'), ('D6', 'DIN-PASTEUR'),
  ('D7', 'DIN-PASTEUR'), ('D8', 'DIN-PASTEUR')
) AS map(machine_code, area_code)
JOIN areas ar ON ar.factory_id = f.id AND ar.code = map.area_code
WHERE f.code = 'DIN'
  AND m.factory_id = f.id
  AND m.machine_code = map.machine_code
  AND m.area_id IS DISTINCT FROM ar.id;

-- Not relocated, on purpose:
--
--   F1-F4 (Mesin Vacuum Sealer) — the DAP confirms the four machines exist but
--   does not record which room they stand in. Best guesses are DIN-PRESS or
--   DIN-BTP; neither is verified. Leaving them put beats filing them somewhere
--   wrong, since a fault report would then dispatch to the wrong room. Move
--   them once someone confirms on site.
--
--   DIN-HMG-001, DIN-VFD-001, DIN-PMP-001, DIN-FAN-001 — the original demo
--   machines. They are not on the DAP, so there is nothing to map them to.
--   Decide whether they are real before giving them a room.
--
--   SJA and OLT machines — SJA's equipment list has not been digitised on the
--   QC side yet, and OLT has no survey at all. The SJA rooms above are ready
--   for whenever it is.

NOTIFY pgrst, 'reload schema';

-- Verify:
--   SELECT f.code, a.code, a.name, count(m.id) AS machines
--   FROM factories f
--   JOIN areas a ON a.factory_id = f.id
--   LEFT JOIN machines m ON m.area_id = a.id
--   GROUP BY f.code, a.code, a.name ORDER BY f.code, a.code;
--   -- after seed_din_machines_real.sql: DIN-CATOK 6, DIN-PASTEUR 8,
--   --   DIN-POTONG 8, DIN-AYAK 5, DIN-SLICE 9; the DIN rooms with no machines
--   --   listed above are expected to be empty for now.
--
-- Rollback (areas only; the machines' previous area_id is not recorded, so
-- restore from a backup if you need the exact prior placement):
--   DELETE FROM areas WHERE code LIKE 'DIN-%' OR code LIKE 'SJA-%';
--   -- will fail if machines still reference them — move those out first.
