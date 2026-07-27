-- ============================================================================
-- Re-cut FAMMS areas to match FQMS's sub-areas
-- (run in Supabase SQL editor; idempotent — safe to re-run after editing)
-- ============================================================================
--
-- ⚠️ THIS FILE IS A TEMPLATE. The two marked sections are placeholders. Fill
-- them in with the real FQMS area list and machine mapping BEFORE running it.
-- As shipped, section 1 inserts nothing and section 2 moves nothing, so
-- running it unedited is a harmless no-op.
--
-- WHY: FAMMS started with 3 coarse areas per factory (Produksi / Packing /
-- Gudang). FQMS divides the same floor into ~21 sub-areas by machine type and
-- room. With the two systems disagreeing about where a machine is, an FQMS
-- fault report can't be located in FAMMS and the QC daily sweep can't be
-- organized the way QC actually walks the floor.
--
-- The fix is to make FAMMS use FQMS's area codes verbatim. Codes, not just
-- names: `areas.code` becomes the shared key between the two systems, so a
-- future FQMS payload can name an area and FAMMS will resolve it without a
-- translation table anybody has to maintain.
--
-- ORDER MATTERS. Machines cannot be left behind: machines.area_id is NOT NULL,
-- and migration_delete_protection.sql made the areas → machines FK RESTRICT,
-- so an old area with machines still on it CANNOT be deleted. That is the
-- safety net — step 3 will simply fail rather than cascade-delete anything.

BEGIN;

-- ── 1. The FQMS areas ───────────────────────────────────────────────────────
-- One row per FQMS sub-area. `code` must be EXACTLY the code FQMS uses.
-- ON CONFLICT keeps this re-runnable and lets you correct a name later.
--
-- Replace the example rows below with the real 21.

INSERT INTO areas (factory_id, code, name, description)
SELECT f.id, v.code, v.name, v.description
FROM (VALUES
  -- (factory_code, area_code, area_name, description)
  -- ('DIN', 'DIN-MIX-01', 'Mixing Room 1', 'FQMS sub-area'),
  -- ('DIN', 'DIN-HMG-01', 'Homogenizer Bay', 'FQMS sub-area'),
  -- ('DIN', 'DIN-FIL-01', 'Filling Line 1', 'FQMS sub-area'),
  (NULL, NULL, NULL, NULL)  -- ← delete this line once you add real rows
) AS v(factory_code, code, name, description)
JOIN factories f ON f.code = v.factory_code
WHERE v.code IS NOT NULL
ON CONFLICT (factory_id, code) DO UPDATE
  SET name = EXCLUDED.name,
      description = EXCLUDED.description,
      updated_at = NOW();

-- ── 2. Move each machine to its FQMS area ───────────────────────────────────
-- Keyed on machine_code, which is what both systems already print on the
-- machine itself. A machine_code not listed here simply stays where it is.
--
-- factory_id is updated alongside area_id. They must not disagree: an
-- incident whose machine belongs to another factory is rejected by the
-- incidents_machine_factory_guard trigger (see SYNC_SCHEMA_LATEST.sql).

UPDATE machines m
SET area_id = a.id,
    factory_id = a.factory_id,
    updated_at = NOW()
FROM (VALUES
  -- (machine_code, target_area_code)
  -- ('DIN-HMG-001', 'DIN-HMG-01'),
  -- ('DIN-MIX-002', 'DIN-MIX-01'),
  (NULL, NULL)  -- ← delete this line once you add real rows
) AS v(machine_code, area_code)
JOIN areas a ON a.code = v.area_code
WHERE m.machine_code = v.machine_code
  AND v.machine_code IS NOT NULL
  AND m.area_id IS DISTINCT FROM a.id;

-- ── 3. Retire the old coarse areas ──────────────────────────────────────────
-- Only deletes areas that are now EMPTY. Any area still holding a machine is
-- left alone (and the RESTRICT FK would block it anyway) — that is the signal
-- that section 2 missed a machine, not something to force past.
--
-- Commented out by default: check the report in step 4 first, then run this
-- part on its own once you're satisfied nothing was left behind.

-- DELETE FROM areas a
-- WHERE NOT EXISTS (SELECT 1 FROM machines m WHERE m.area_id = a.id)
--   AND NOT EXISTS (SELECT 1 FROM pm_schedules s WHERE s.machine_id IN
--                   (SELECT id FROM machines WHERE area_id = a.id))
--   AND a.code IN ('PROD', 'PACK', 'GUDANG');  -- ← the old coarse codes

COMMIT;

-- ── 4. Report: where did every machine end up? ──────────────────────────────
-- Run this after. Anything still sitting in a coarse area is a machine
-- section 2 didn't cover.
SELECT f.code AS factory,
       a.code AS area_code,
       a.name AS area_name,
       COUNT(m.id) AS machines,
       STRING_AGG(COALESCE(m.machine_code, m.machine_name), ', ' ORDER BY m.machine_code) AS machine_list
FROM areas a
JOIN factories f ON f.id = a.factory_id
LEFT JOIN machines m ON m.area_id = a.id AND m.status <> 'scrapped'
GROUP BY f.code, a.code, a.name
ORDER BY f.code, a.code;
