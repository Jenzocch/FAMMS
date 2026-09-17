-- ============================================================================
-- DIN (Denikin) — areas and machines, from the owner's own machine list
-- (run in Supabase SQL editor; idempotent, safe to re-run)
-- ============================================================================
--
-- 9 areas, 42 machines. Machine codes are EXACTLY as the owner listed them
-- (A1A-KA, C11-03S, HMG1, …) and are NOT prefixed with the factory: the unique
-- index is (factory_id, machine_code), so DIN's I1 and another factory's I1 can
-- coexist, and this is the code an operator reads off the machine and FQMS
-- sends back.
--
-- Two decisions, both confirmed with the owner before importing:
--
--   1. AREAS = machine type. The source list groups machines by type (Slice,
--      Potong, Ayak, …) with no room/Lokasi column, and the owner confirmed
--      DIN's floor is organised by machine station. Area names are prefixed
--      "Area " ("Area Slice", not "Mesin Slice") so a picker doesn't read
--      "Mesin Slice → Mesin Slice [A1A-KA]" — the area is the station, the
--      machine name is the machine. If DIN's real room names differ, correct
--      the names here and re-run; the area CODE is what machines hang off, so
--      renaming is safe.
--
--   2. The 4 placeholder machines from seed_din_machines.sql (DIN-HMG-001,
--      DIN-VFD-001, DIN-PMP-001, DIN-FAN-001) are LEFT ALONE — the owner chose
--      to keep them for now. They stay in the old "Produksi" area, so DIN will
--      list 46 machines (42 real + 4 placeholder). Note DIN-HMG-001
--      ("Horizontal Milling Gearbox") is fictional and unrelated to the real
--      HMG1 ("Mesin Homogenizer") below — see cleanup_sja_demo_data.sql for
--      the pattern if they should be removed later.
--
-- The source list's "Keterangan" (remarks) columns were empty, so remarks are
-- NULL throughout rather than invented. brand/model likewise unknown.
--
-- Machine status is only set on FIRST insert. Re-running this file updates
-- names, areas and remarks but never touches status: by then a technician may
-- have moved a machine to 'repairing', and a re-import must not undo that.

BEGIN;

-- ── Areas ───────────────────────────────────────────────────────────────────
INSERT INTO areas (factory_id, code, name)
SELECT f.id, v.code, v.name
FROM (VALUES
  ('SLICE',        'Area Slice'),
  ('POTONG',       'Area Potong'),
  ('AYAK',         'Area Ayak'),
  ('MIXER',        'Area Mixer'),
  ('PRESS',        'Area Press'),
  ('HOMOGENIZER',  'Area Homogenizer'),
  ('VAKUM',        'Area Vakum'),
  ('HAND-PALLET',  'Area Hand Pallet'),
  ('WATERJET',     'Area Waterjet')
) AS v(code, name)
CROSS JOIN factories f
WHERE f.code = 'DIN'
ON CONFLICT (factory_id, code) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW();

-- ── Machines ────────────────────────────────────────────────────────────────
--
-- Deliberately NOT using ON CONFLICT (factory_id, machine_code): schema.sql
-- creates that unique index as a PARTIAL one (… WHERE machine_code IS NOT
-- NULL), and Postgres refuses to infer a partial index from a bare
-- ON CONFLICT (a, b) — it fails with "no unique or exclusion constraint
-- matching the ON CONFLICT specification" before touching a single row.
-- (seed_sja_machines.sql hit exactly this on a fresh schema.sql database.)
-- Insert-what's-missing + update-what's-there works whether that index is
-- partial or not, so this file can't break on a schema difference.
WITH src(area_code, code, name, brand, model, status, remarks) AS (
  VALUES
  -- Mesin Slice ×15
  ('SLICE', 'A1A-KA', 'Mesin Slice', NULL, NULL, 'running', NULL),
  ('SLICE', 'A1B-KA', 'Mesin Slice', NULL, NULL, 'running', NULL),
  ('SLICE', 'A2A-03', 'Mesin Slice', NULL, NULL, 'running', NULL),
  ('SLICE', 'A2B-03', 'Mesin Slice', NULL, NULL, 'running', NULL),
  ('SLICE', 'A2C-03', 'Mesin Slice', NULL, NULL, 'running', NULL),
  ('SLICE', 'A3A-06', 'Mesin Slice', NULL, NULL, 'running', NULL),
  ('SLICE', 'A3B-06', 'Mesin Slice', NULL, NULL, 'running', NULL),
  ('SLICE', 'A4A-03', 'Mesin Slice', NULL, NULL, 'running', NULL),
  ('SLICE', 'A4B-03', 'Mesin Slice', NULL, NULL, 'running', NULL),
  ('SLICE', 'A5A-03', 'Mesin Slice', NULL, NULL, 'running', NULL),
  ('SLICE', 'A5B-03', 'Mesin Slice', NULL, NULL, 'running', NULL),
  ('SLICE', 'A6-12',  'Mesin Slice', NULL, NULL, 'running', NULL),
  ('SLICE', 'A7-08',  'Mesin Slice', NULL, NULL, 'running', NULL),
  ('SLICE', 'A8-05',  'Mesin Slice', NULL, NULL, 'running', NULL),
  ('SLICE', 'A9-03',  'Mesin Slice', NULL, NULL, 'running', NULL),
  -- Mesin Potong ×11
  ('POTONG', 'C1-03S',  'Mesin Potong', NULL, NULL, 'running', NULL),
  ('POTONG', 'C2-03S',  'Mesin Potong', NULL, NULL, 'running', NULL),
  ('POTONG', 'C3-12',   'Mesin Potong', NULL, NULL, 'running', NULL),
  ('POTONG', 'C4-08',   'Mesin Potong', NULL, NULL, 'running', NULL),
  ('POTONG', 'C5-06',   'Mesin Potong', NULL, NULL, 'running', NULL),
  ('POTONG', 'C6-03',   'Mesin Potong', NULL, NULL, 'running', NULL),
  ('POTONG', 'C7-03',   'Mesin Potong', NULL, NULL, 'running', NULL),
  ('POTONG', 'C8-03',   'Mesin Potong', NULL, NULL, 'running', NULL),
  ('POTONG', 'C9-06',   'Mesin Potong', NULL, NULL, 'running', NULL),
  ('POTONG', 'C10-05',  'Mesin Potong', NULL, NULL, 'running', NULL),
  ('POTONG', 'C11-03S', 'Mesin Potong', NULL, NULL, 'running', NULL),
  -- Mesin Ayak ×1
  ('AYAK', 'AYK1', 'Mesin Ayak', NULL, NULL, 'running', NULL),
  -- Mesin Mixer ×1
  ('MIXER', 'I1', 'Mesin Mixer', NULL, NULL, 'running', NULL),
  -- Mesin Press ×3
  ('PRESS', 'H1', 'Mesin Press', NULL, NULL, 'running', NULL),
  ('PRESS', 'H2', 'Mesin Press', NULL, NULL, 'running', NULL),
  ('PRESS', 'H3', 'Mesin Press', NULL, NULL, 'running', NULL),
  -- Mesin Homogenizer ×1
  ('HOMOGENIZER', 'HMG1', 'Mesin Homogenizer', NULL, NULL, 'running', NULL),
  -- Mesin Vakum ×4
  ('VAKUM', 'F1', 'Mesin Vakum', NULL, NULL, 'running', NULL),
  ('VAKUM', 'F2', 'Mesin Vakum', NULL, NULL, 'running', NULL),
  ('VAKUM', 'F3', 'Mesin Vakum', NULL, NULL, 'running', NULL),
  ('VAKUM', 'F4', 'Mesin Vakum', NULL, NULL, 'running', NULL),
  -- Hand Pallet ×2
  ('HAND-PALLET', 'HPE', 'Hand Pallet', NULL, NULL, 'running', NULL),
  ('HAND-PALLET', 'HPM', 'Hand Pallet', NULL, NULL, 'running', NULL),
  -- Waterjet ×4
  ('WATERJET', 'WJ1', 'Waterjet', NULL, NULL, 'running', NULL),
  ('WATERJET', 'WJ2', 'Waterjet', NULL, NULL, 'running', NULL),
  ('WATERJET', 'WJ3', 'Waterjet', NULL, NULL, 'running', NULL),
  ('WATERJET', 'WJ4', 'Waterjet', NULL, NULL, 'running', NULL)
),
-- Resolve each row's factory + area once, so the list above is written once.
resolved AS (
  SELECT f.id AS factory_id, a.id AS area_id, s.*
  FROM src s
  JOIN areas a ON a.code = s.area_code
  JOIN factories f ON f.id = a.factory_id AND f.code = 'DIN'
),
-- New machines: this is the only place status is written.
inserted AS (
  INSERT INTO machines (factory_id, area_id, machine_code, machine_name, brand, model, status, remarks)
  SELECT r.factory_id, r.area_id, r.code, r.name, r.brand, r.model, r.status, r.remarks
  FROM resolved r
  WHERE NOT EXISTS (
    SELECT 1 FROM machines m
    WHERE m.factory_id = r.factory_id AND m.machine_code = r.code
  )
  RETURNING 1
)
-- Already-imported machines: refresh the descriptive columns, never status.
-- (This UPDATE runs against the pre-statement snapshot, so the rows `inserted`
-- just created are correctly left alone.)
UPDATE machines m
SET area_id      = r.area_id,
    machine_name = r.name,
    brand        = r.brand,
    model        = r.model,
    remarks      = r.remarks,
    updated_at   = NOW()
FROM resolved r
WHERE m.factory_id = r.factory_id AND m.machine_code = r.code;

COMMIT;

-- ── Verify ──────────────────────────────────────────────────────────────────
SELECT a.code AS area_code, a.name AS area_name,
       COUNT(m.id) AS machines,
       COUNT(*) FILTER (WHERE m.status <> 'running') AS not_running
FROM areas a
JOIN factories f ON f.id = a.factory_id AND f.code = 'DIN'
LEFT JOIN machines m ON m.area_id = a.id
GROUP BY a.code, a.name
ORDER BY a.code;

-- Expect the 9 new areas with 15/11/1/1/3/1/4/2/4 machines, plus the older
-- PROD (4 placeholder machines) / PACK / WH areas — 12 areas, 46 machines.
-- PACK and WH stay empty until DIN lists machines for them.
SELECT COUNT(DISTINCT a.id) AS areas, COUNT(m.id) AS machines
FROM areas a
JOIN factories f ON f.id = a.factory_id AND f.code = 'DIN'
LEFT JOIN machines m ON m.area_id = a.id;
