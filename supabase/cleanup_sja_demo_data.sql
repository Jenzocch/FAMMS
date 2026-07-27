-- ============================================================================
-- SJA — remove the demo/test data left over from before the real import
-- (run in Supabase SQL editor, ONCE, after seed_sja_machines.sql)
-- ============================================================================
--
-- After importing the 109 real machines from SJA-FR-PRD-001-DAP, SJA held
-- 30 areas and 119 machines. The extra 15 areas and 10 machines are pre-import
-- leftovers:
--
--   6 machines from seed_demo.sql — fictional kit (Tetra Pak R-200, Krones
--     Modulfill, Atlas Copco GA 75) that only ever existed to test the
--     reporting flow.
--   3 machines added by hand (SJA-BLR-001 / CNV-001 / INJ-001) and confirmed
--     with the owner as test data — they are not on the official form.
--   1 machine, PD10, which is the SAME physical Tangki Pendingin as the
--     TPD10 just imported. Someone had created it earlier using the typo
--     printed on the form. Keeping both would show one tank twice, and QC
--     would be asked to check a machine that doesn't separately exist.
--
--   15 areas, of which 11 were already empty. They are two abandoned naming
--     attempts layered on top of each other — GDG 1 and SJA-GDATAS are both
--     "Gudang Atas", GDG 2 and SJA-GDBAWAH are both "Gudang Bawah", and
--     SJA-MUTIARA / SJA-POWDER / SJA-FORMBAW duplicate areas the import just
--     created properly.
--
-- SAFETY: verified before writing this that none of the 10 machines has a
-- single incident. What they do have is 3 PM schedules and 3 maintenance
-- logs, all on fictional equipment. Those FKs are ON DELETE RESTRICT
-- (migration_delete_protection.sql), so the children must go first — the
-- order below is deliberate, and a machine that has acquired a real incident
-- since this file was written will simply refuse to delete rather than take
-- the incident with it.

BEGIN;

-- The machines to remove, resolved once and reused throughout.
CREATE TEMP TABLE _doomed_machines ON COMMIT DROP AS
SELECT m.id, m.machine_code
FROM machines m
JOIN factories f ON f.id = m.factory_id AND f.code = 'SJA'
WHERE m.machine_code IN (
  'PD10',                                       -- duplicate of TPD10
  'SJA-MIX-001','SJA-MIX-002','SJA-FIL-001',    -- seed_demo fiction
  'SJA-FIL-002','SJA-CMP-001','SJA-CMP-002',
  'SJA-BLR-001','SJA-CNV-001','SJA-INJ-001'     -- hand-added test data
);

-- Refuse to run at all if any of them turns out to have a real incident.
-- Better a clear abort than a half-finished cleanup.
DO $$
DECLARE n INT;
BEGIN
  SELECT COUNT(*) INTO n FROM incidents i
  WHERE i.machine_id IN (SELECT id FROM _doomed_machines);
  IF n > 0 THEN
    RAISE EXCEPTION 'Aborted: % incident(s) exist on these machines — review before deleting', n;
  END IF;
END $$;

-- ── Children first (all FKs are RESTRICT) ───────────────────────────────────
DELETE FROM pm_records
WHERE pm_schedule_id IN (
  SELECT id FROM pm_schedules WHERE machine_id IN (SELECT id FROM _doomed_machines)
);

DELETE FROM pm_schedules      WHERE machine_id IN (SELECT id FROM _doomed_machines);
DELETE FROM maintenance_logs  WHERE machine_id IN (SELECT id FROM _doomed_machines);
DELETE FROM maintenance_costs WHERE machine_id IN (SELECT id FROM _doomed_machines);
DELETE FROM qc_daily_checks   WHERE machine_id IN (SELECT id FROM _doomed_machines);
DELETE FROM machine_qr_codes  WHERE machine_id IN (SELECT id FROM _doomed_machines);
DELETE FROM equipment_health_scores WHERE machine_id IN (SELECT id FROM _doomed_machines);

DELETE FROM machines WHERE id IN (SELECT id FROM _doomed_machines);

-- ── Then the old areas, but ONLY the ones now standing empty ────────────────
-- Anything still holding a machine is left alone: that would mean a machine
-- this file didn't account for, which is a thing to look at, not to force
-- past. (The RESTRICT FK would block it regardless.)
DELETE FROM areas a
USING factories f
WHERE a.factory_id = f.id
  AND f.code = 'SJA'
  AND a.code IN (
    'GDG 1','GDG 2','PACK 1','PACK 2','PROD 1','PROD 2','PROD 3',
    'SJA-FORMBAW','SJA-FORMSIR','SJA-GDATAS','SJA-GDBAWAH',
    'SJA-MUTIARA','SJA-POWDER','SJA-SNJ','UTIL'
  )
  AND NOT EXISTS (SELECT 1 FROM machines m WHERE m.area_id = a.id);

COMMIT;

-- ── Verify: expect 15 areas / 109 machines ──────────────────────────────────
SELECT COUNT(DISTINCT a.id) AS areas, COUNT(m.id) AS machines
FROM areas a
JOIN factories f ON f.id = a.factory_id AND f.code = 'SJA'
LEFT JOIN machines m ON m.area_id = a.id;

-- Anything listed here was NOT removed and needs a look.
SELECT a.code, a.name, COUNT(m.id) AS machines
FROM areas a
JOIN factories f ON f.id = a.factory_id AND f.code = 'SJA'
LEFT JOIN machines m ON m.area_id = a.id
WHERE a.code NOT IN (
  'FILLING-POWDER','FORMULASI-BAWAH','FORMULASI-POWDER','GUDANG-ATAS',
  'GUDANG-BAWAH','KEMAS-POWDER','MIXING-MUTIARA','MUTIARA','NATA','POWDER',
  'PROD-POWDER','PROD-SIRUP','SISA-SIRUP','SYRUP-DAN-JELLY','TIMBANG-WARNA'
)
GROUP BY a.code, a.name;
