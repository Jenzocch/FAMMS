-- ============================================================
-- FAMMS — undo the two areas the FQMS import duplicated
--
-- migration_areas_match_fqms.sql imported FQMS's physical rooms into DIN.
-- Two of the 13 landed on top of areas DIN already had, so DIN now holds two
-- rows for one physical place — the exact failure the import was meant to end,
-- just moved one level up: a QC round would file against DIN-IPAL while a
-- fault report goes to IPAL, and the two never reconcile.
--
-- Neither pre-existing area came from this repo. Nothing in supabase/*.sql
-- creates GBB, GPJ or IPAL (the seeds define only PROD / PACK / WH / UTIL),
-- and nothing in src/ mentions an area code as a string literal — the app
-- reads areas by id and only ever displays `name`. So they were typed into
-- FAMMS Settings by hand and the code cannot tell us what they stand for.
-- That is why the two cases below are treated differently.
--
-- ── DIN-IPAL: removed ──
-- IPAL is not an abbreviation with room for interpretation in an Indonesian
-- factory — it is the effluent plant, which is what we named DIN-IPAL after.
-- DIN already had an `IPAL` row, so ours is the newer duplicate and the one
-- that goes. The delete is scoped to "an area coded IPAL exists in the SAME
-- factory", so if that assumption is ever untrue the statement quietly does
-- nothing rather than destroying the only record of the place.
-- FQMS must now map its `DIN - IPAL 污水處理清潔` zone to `IPAL`, not
-- `DIN-IPAL` (docs/FQMS_AREA_CODES.md is updated to match).
--
-- ── DIN-GUDANG: kept, deliberately ──
-- The suspicion is that DIN's `GBB` and `GPJ` mean Gudang Bahan Baku and
-- Gudang Produk Jadi, which would make DIN-GUDANG a third row over the same
-- floor. We cannot confirm that from the codebase, and two things argue
-- against acting on it:
--   1. The names live only in the live database. GBB/GPJ are plausible
--      initialisms, not verified ones — deleting a real area on a guess is
--      not recoverable from this repo.
--   2. Even if the guess is right the areas do not line up. DIN-GUDANG is
--      "Gudang Bahan Baku, Bahan Kemas, dan Produk Jadi" — three stocks in
--      one room, because that is how FQMS cleans it. GBB + GPJ covers raw
--      material and finished goods but leaves bahan kemas (packaging)
--      homeless. Dropping DIN-GUDANG would make packaging unlocatable.
-- The delete is therefore written out but left commented at the bottom of
-- section 2. Read the names GBB and GPJ actually carry (the SELECT there
-- prints them), decide where bahan kemas belongs, then uncomment if the
-- answer is that DIN-GUDANG is redundant.
--
-- Safety: `areas` is referenced by machines.area_id and facilities.area_id,
-- and by nothing else in the schema. machines.area_id is ON DELETE CASCADE in
-- schema.sql and only becomes RESTRICT once migration_delete_protection.sql
-- has run; facilities.area_id is CASCADE either way. On a database where the
-- protection migration has not been applied a bare DELETE would therefore not
-- error — it would silently take the machines and facilities with it. Every
-- delete below is guarded by NOT EXISTS against both tables, so an area that
-- has acquired anything since the import is skipped, not emptied.
--
-- Idempotent: re-running finds nothing left to delete and is a no-op.
-- Rollback: see end of file.
-- ============================================================

-- ── 1. DIN-IPAL — duplicate of the pre-existing IPAL ─────────
DELETE FROM areas a
WHERE a.code = 'DIN-IPAL'
  -- Only where the area it duplicates really is present in the same factory.
  AND EXISTS (
    SELECT 1 FROM areas keep
    WHERE keep.factory_id = a.factory_id
      AND keep.code = 'IPAL'
  )
  -- Never take anything down with it.
  AND NOT EXISTS (SELECT 1 FROM machines   m WHERE m.area_id = a.id)
  AND NOT EXISTS (SELECT 1 FROM facilities f WHERE f.area_id = a.id);

-- ── 2. DIN-GUDANG — left in place pending confirmation ───────
-- What do GBB and GPJ actually say they are? Run this first:
--   SELECT f.code AS factory, a.code, a.name, a.description
--   FROM areas a JOIN factories f ON f.id = a.factory_id
--   WHERE a.code IN ('GBB', 'GPJ', 'DIN-GUDANG')
--   ORDER BY f.code, a.code;
--
-- If they are the raw-material and finished-goods warehouses AND bahan kemas
-- has somewhere to live, uncomment the statement below. Same guards: it only
-- fires when both replacements exist in the factory and nothing points at the
-- row being removed.
--
-- DELETE FROM areas a
-- WHERE a.code = 'DIN-GUDANG'
--   AND EXISTS (
--     SELECT 1 FROM areas keep
--     WHERE keep.factory_id = a.factory_id AND keep.code = 'GBB'
--   )
--   AND EXISTS (
--     SELECT 1 FROM areas keep
--     WHERE keep.factory_id = a.factory_id AND keep.code = 'GPJ'
--   )
--   AND NOT EXISTS (SELECT 1 FROM machines   m WHERE m.area_id = a.id)
--   AND NOT EXISTS (SELECT 1 FROM facilities f WHERE f.area_id = a.id);

NOTIFY pgrst, 'reload schema';

-- Verify: DIN should list IPAL but no DIN-IPAL, and DIN-GUDANG should still
-- be there. An unexpected surviving DIN-IPAL means something is attached to
-- it — the `machines` count says what.
--   SELECT f.code AS factory, a.code, a.name,
--          (SELECT count(*) FROM machines   m WHERE m.area_id = a.id) AS machines,
--          (SELECT count(*) FROM facilities x WHERE x.area_id = a.id) AS facilities
--   FROM areas a JOIN factories f ON f.id = a.factory_id
--   WHERE a.code IN ('IPAL', 'DIN-IPAL', 'GBB', 'GPJ', 'DIN-GUDANG')
--   ORDER BY f.code, a.code;
--
-- Rollback — recreate the removed area (it carried no machines, so there is
-- nothing else to restore). Only re-run this if you decide DIN wants its own
-- IPAL row after all:
--   INSERT INTO areas (factory_id, code, name)
--   SELECT f.id, 'DIN-IPAL', 'IPAL (Instalasi Pengolahan Air Limbah)'
--   FROM factories f WHERE f.code = 'DIN'
--   ON CONFLICT (factory_id, code) DO NOTHING;
