-- ============================================================
-- FAMMS — DIN (Denikin) real machine inventory
--
-- Background: seed_din_machines.sql only ever seeded four placeholder machines
-- (DIN-HMG-001, DIN-VFD-001, DIN-PMP-001, DIN-FAN-001) with generic English
-- names. Those are demo rows, not the factory floor. The real inventory lives
-- in DIN-FR-PRD-001-DAP (Daftar Alat dan Peralatan) and had already been
-- digitised on the QC side (FQMS db/44 + db/47) as zone_check_items, because QC
-- monitors these machines daily.
--
-- FAMMS is the agreed source of truth for machine master data, so the codes are
-- being brought over here. After this runs, FQMS binds its zone_check_items to
-- these machine_codes and stops carrying its own copy.
--
-- Areas: the DAP sheet records the room each machine sits in, so those rooms are
-- created as FAMMS areas rather than dumping all 40 machines into PROD. One
-- exception is called out inline: the vacuum sealers F1-F4 have no room recorded
-- in the DAP extract, so they land in PROD and are flagged in remarks for
-- confirmation on site.
--
-- Idempotent: areas use ON CONFLICT (factory_id, code) DO NOTHING; machines use
-- a NOT EXISTS guard on (factory_id, machine_code), matching seed_din_machines.
-- Existing rows are never overwritten — re-running will not clobber a status
-- that maintenance has since changed.
--
-- Rollback: see end of file.
-- ============================================================

-- ── 1. Areas from the DAP room column ────────────────────────
INSERT INTO areas (factory_id, name, code, description)
SELECT f.id, a.name, a.code, a.description
FROM factories f
CROSS JOIN (VALUES
  ('Ruang Pemotongan',            'POTONG',  'Mesin potong C1-C8'),
  ('Ruang Ayak dan Potong Baru',  'POTONG2', 'Area baru, mesin potong C10-C14'),
  ('Ruang Slice',                 'SLICE',   'Mesin slice A2-A5'),
  ('Area Slice dan Catok',        'CATOK',   'Mesin slice kulit ari A1, dan A6-A9'),
  ('Ruang Pasteurisasi',          'PASTEUR', 'Bak pasteurisasi D1-D8')
) AS a(name, code, description)
WHERE f.code = 'DIN'
ON CONFLICT (factory_id, code) DO NOTHING;

-- ── 2. Mesin potong (cutting) — C1-C8 in POTONG, C10-C14 in POTONG2 ──
-- C9 exists in the DAP but is annotated "di garasi, tidak terpakai"
-- (in the garage, not in use) and is deliberately not registered.
INSERT INTO machines (factory_id, area_id, machine_code, machine_name, status)
SELECT f.id, ar.id, m.machine_code, m.machine_name, 'running'
-- The VALUES list has to come before the areas join: ar.code = m.area_code
-- references m, and a FROM item can only reference ones already introduced to
-- its left.
FROM factories f
CROSS JOIN (VALUES
  ('C1',  'Mesin Potong C1',  'POTONG'),
  ('C2',  'Mesin Potong C2',  'POTONG'),
  ('C3',  'Mesin Potong C3',  'POTONG'),
  ('C4',  'Mesin Potong C4',  'POTONG'),
  ('C5',  'Mesin Potong C5',  'POTONG'),
  ('C6',  'Mesin Potong C6',  'POTONG'),
  ('C7',  'Mesin Potong C7',  'POTONG'),
  ('C8',  'Mesin Potong C8',  'POTONG'),
  ('C10', 'Mesin Potong C10', 'POTONG2'),
  ('C11', 'Mesin Potong C11', 'POTONG2'),
  ('C12', 'Mesin Potong C12', 'POTONG2'),
  ('C13', 'Mesin Potong C13', 'POTONG2'),
  ('C14', 'Mesin Potong C14', 'POTONG2')
) AS m(machine_code, machine_name, area_code)
JOIN areas ar ON ar.factory_id = f.id AND ar.code = m.area_code
WHERE f.code = 'DIN'
  AND NOT EXISTS (
    SELECT 1 FROM machines x WHERE x.factory_id = f.id AND x.machine_code = m.machine_code
  );

-- ── 3. Mesin slice — A1A/A1B and A6-A9 in CATOK, A2-A5 in SLICE ──
INSERT INTO machines (factory_id, area_id, machine_code, machine_name, status)
SELECT f.id, ar.id, m.machine_code, m.machine_name, 'running'
FROM factories f
CROSS JOIN (VALUES
  ('A1A-KA', 'Mesin Slice Kulit Ari A1A-KA', 'CATOK'),
  ('A1B-KA', 'Mesin Slice Kulit Ari A1B-KA', 'CATOK'),
  ('A2A-03', 'Mesin Slice A2A-03',           'SLICE'),
  ('A2B-03', 'Mesin Slice A2B-03',           'SLICE'),
  ('A2C-03', 'Mesin Slice A2C-03',           'SLICE'),
  ('A3A-06', 'Mesin Slice A3A-06',           'SLICE'),
  ('A3B-06', 'Mesin Slice A3B-06',           'SLICE'),
  ('A4A-03', 'Mesin Slice A4A-03',           'SLICE'),
  ('A4B-03', 'Mesin Slice A4B-03',           'SLICE'),
  ('A5A-03', 'Mesin Slice A5A-03',           'SLICE'),
  ('A5B-03', 'Mesin Slice A5B-03',           'SLICE'),
  ('A6-12',  'Mesin Slice A6-12',            'CATOK'),
  ('A7-08',  'Mesin Slice A7-08',            'CATOK'),
  ('A8-05',  'Mesin Slice A8-05',            'CATOK'),
  ('A9-03',  'Mesin Slice A9-03',            'CATOK')
) AS m(machine_code, machine_name, area_code)
JOIN areas ar ON ar.factory_id = f.id AND ar.code = m.area_code
WHERE f.code = 'DIN'
  AND NOT EXISTS (
    SELECT 1 FROM machines x WHERE x.factory_id = f.id AND x.machine_code = m.machine_code
  );

-- ── 4. Bak pasteurisasi — D1-D8 ──
INSERT INTO machines (factory_id, area_id, machine_code, machine_name, status)
SELECT f.id, ar.id, m.machine_code, m.machine_name, 'running'
FROM factories f
JOIN areas ar ON ar.factory_id = f.id AND ar.code = 'PASTEUR'
CROSS JOIN (VALUES
  ('D1', 'Bak Pasteurisasi D1'),
  ('D2', 'Bak Pasteurisasi D2'),
  ('D3', 'Bak Pasteurisasi D3'),
  ('D4', 'Bak Pasteurisasi D4'),
  ('D5', 'Bak Pasteurisasi D5'),
  ('D6', 'Bak Pasteurisasi D6'),
  ('D7', 'Bak Pasteurisasi D7'),
  ('D8', 'Bak Pasteurisasi D8')
) AS m(machine_code, machine_name)
WHERE f.code = 'DIN'
  AND NOT EXISTS (
    SELECT 1 FROM machines x WHERE x.factory_id = f.id AND x.machine_code = m.machine_code
  );

-- ── 5. Mesin vacuum sealer — F1-F4 ──
-- ⚠️ The DAP extract confirms these four machines exist but does not record
-- which room they are in. They are parked in PROD with a remark; move them to
-- the correct area once someone confirms on site.
INSERT INTO machines (factory_id, area_id, machine_code, machine_name, status, remarks)
SELECT f.id, ar.id, m.machine_code, m.machine_name, 'running',
       'Area belum dikonfirmasi — sementara ditempatkan di PROD (sumber: DIN-FR-PRD-001-DAP)'
FROM factories f
JOIN areas ar ON ar.factory_id = f.id AND ar.code = 'PROD'
CROSS JOIN (VALUES
  ('F1', 'Mesin Vacuum Sealer F1'),
  ('F2', 'Mesin Vacuum Sealer F2'),
  ('F3', 'Mesin Vacuum Sealer F3'),
  ('F4', 'Mesin Vacuum Sealer F4')
) AS m(machine_code, machine_name)
WHERE f.code = 'DIN'
  AND NOT EXISTS (
    SELECT 1 FROM machines x WHERE x.factory_id = f.id AND x.machine_code = m.machine_code
  );

-- Not registered here, on purpose: QC also monitors "熱封機" (heat sealer),
-- "包裝製程" (packing process) and "磁力捕集器" (magnetic trap). The DAP extract
-- has no machine codes for these, so FQMS carries them as generic checklist
-- items with no machine binding. Add them here once real codes exist.

NOTIFY pgrst, 'reload schema';

-- Verify:
--   SELECT a.code AS area, count(*) FROM machines m
--   JOIN areas a ON a.id = m.area_id
--   JOIN factories f ON f.id = m.factory_id
--   WHERE f.code = 'DIN' GROUP BY a.code ORDER BY a.code;
--   -- expect CATOK 6, PASTEUR 8, POTONG 8, POTONG2 5, PROD 4+4(demo), SLICE 9
--
-- Rollback (removes only the machines this file adds; areas are left in place
-- because other records may already reference them):
--   DELETE FROM machines
--   WHERE factory_id = (SELECT id FROM factories WHERE code = 'DIN')
--     AND machine_code IN (
--       'C1','C2','C3','C4','C5','C6','C7','C8','C10','C11','C12','C13','C14',
--       'A1A-KA','A1B-KA','A2A-03','A2B-03','A2C-03','A3A-06','A3B-06',
--       'A4A-03','A4B-03','A5A-03','A5B-03','A6-12','A7-08','A8-05','A9-03',
--       'D1','D2','D3','D4','D5','D6','D7','D8','F1','F2','F3','F4');
