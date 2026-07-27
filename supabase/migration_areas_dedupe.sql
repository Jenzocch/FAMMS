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
-- ── DIN-GUDANG: also a duplicate, confirmed against the live DB ──
-- The names were read out of the live database and settle it:
--   GBB = "Gudang Bahan Baku"   GPJ = "Gudang Produk Jadi"
--   IPAL = "IPAL" (description: "Bak Pembuangan Limbah")
-- So DIN-GUDANG is a third row over floor that GBB and GPJ already cover.
--
-- The reason to drop it is not just overlap, it is that DIN-GUDANG was never a
-- place: it is the name of a FQMS *cleaning sheet* that happens to walk the
-- whole warehouse in one pass ("Bahan Baku, Bahan Kemas, dan Produk Jadi").
-- FAMMS models where equipment physically lives, and it already splits that
-- floor into the two stores that matter for maintenance. A cleaning sheet does
-- not need a FAMMS area — that is the same rule that kept 切割機潮墊清潔 and
-- 濾網清潔 out of the import.
--
-- Bahan kemas genuinely has no area of its own, and that is left as is rather
-- than fixed here. No machine or facility is filed under DIN-GUDANG today
-- (the guard below enforces that), so nothing becomes unlocatable by removing
-- it. If packaging ever needs equipment located in it, FAMMS creates the area
-- in Settings and FQMS picks it up from inspection-targets — which is exactly
-- how new areas are supposed to arrive from here on.
--
-- Safety: `areas` is referenced by machines.area_id and facilities.area_id,
-- and by nothing else in the schema. machines.area_id is ON DELETE CASCADE in
-- schema.sql and only becomes RESTRICT once migration_delete_protection.sql
-- has run; facilities.area_id is CASCADE either way. On a database where the
-- protection migration has not been applied a bare DELETE would therefore not
-- error — it would silently take the machines and facilities with it. Both
-- deletes below are guarded by NOT EXISTS, so an area that has acquired
-- anything since the import is skipped, not emptied.
--
-- The facilities guard is applied only when that table exists. `facilities` is
-- in schema.sql but is absent from databases built up migration-by-migration,
-- and nothing in src/ queries it — referencing it unconditionally fails the
-- whole file with 42P01 on exactly those databases.
--
-- Idempotent: re-running finds nothing left to delete and is a no-op.
-- Rollback: see end of file.
-- ============================================================

-- ── The deletes ──────────────────────────────────────────────
-- Wrapped in a DO block because the facilities guard has to be conditional:
-- `facilities` is declared in schema.sql but does not exist on databases that
-- were built up migration-by-migration rather than from setup_all.sql, and no
-- application code queries it. Referencing it unconditionally fails the whole
-- file with 42P01 on exactly those databases. Where the table is absent there
-- are no facilities to protect, so the guard is simply omitted.
DO $dedupe$
DECLARE
  -- One fragment, interpolated into both deletes, so the two can never drift.
  facility_guard TEXT := CASE
    WHEN to_regclass('public.facilities') IS NULL THEN ''
    ELSE ' AND NOT EXISTS (SELECT 1 FROM facilities f WHERE f.area_id = a.id)'
  END;
BEGIN
  -- 1. DIN-IPAL — duplicate of the pre-existing IPAL.
  --    Scoped to "an area coded IPAL exists in the SAME factory", so if that
  --    assumption is ever untrue this quietly does nothing rather than
  --    destroying the only record of the place.
  EXECUTE '
    DELETE FROM areas a
    WHERE a.code = ''DIN-IPAL''
      AND EXISTS (
        SELECT 1 FROM areas keep
        WHERE keep.factory_id = a.factory_id AND keep.code = ''IPAL''
      )
      AND NOT EXISTS (SELECT 1 FROM machines m WHERE m.area_id = a.id)' || facility_guard;

  -- 2. DIN-GUDANG — duplicate of GBB + GPJ.
  --    Only fires when BOTH replacements exist in the same factory; if either
  --    is missing this does nothing rather than leaving the warehouse with no
  --    area at all.
  EXECUTE '
    DELETE FROM areas a
    WHERE a.code = ''DIN-GUDANG''
      AND EXISTS (
        SELECT 1 FROM areas keep
        WHERE keep.factory_id = a.factory_id AND keep.code = ''GBB''
      )
      AND EXISTS (
        SELECT 1 FROM areas keep
        WHERE keep.factory_id = a.factory_id AND keep.code = ''GPJ''
      )
      AND NOT EXISTS (SELECT 1 FROM machines m WHERE m.area_id = a.id)' || facility_guard;
END
$dedupe$;

NOTIFY pgrst, 'reload schema';

-- Verify: DIN should list IPAL, GBB and GPJ, and neither DIN-IPAL nor
-- DIN-GUDANG. Exactly three rows.
--
-- A surviving DIN-IPAL / DIN-GUDANG is not a failed statement — it is a guard
-- doing its job, and the `machines` count says which one. Note that count can
-- be non-zero while FQMS's inspection-targets shows the area as empty: that
-- endpoint filters out `scrapped` machines, the guard here does not. A
-- decommissioned machine still filed under the area is enough to hold the
-- delete back, and rightly so — deleting the area would take its only
-- location record with it (machines.area_id is ON DELETE CASCADE until
-- migration_delete_protection.sql has run).
--
-- `facilities` is deliberately not counted here. It is in schema.sql but
-- absent from databases built up migration-by-migration — including this one,
-- which is why the guard above is built conditionally. Selecting from it
-- unconditionally fails the verify with 42P01 on exactly the databases that
-- need to run this file.
--   SELECT f.code AS factory, a.code, a.name,
--          (SELECT count(*) FROM machines m WHERE m.area_id = a.id) AS machines
--   FROM areas a JOIN factories f ON f.id = a.factory_id
--   WHERE a.code IN ('IPAL', 'DIN-IPAL', 'GBB', 'GPJ', 'DIN-GUDANG')
--   ORDER BY f.code, a.code;
--
-- Rollback — recreate whichever area you want back. Neither carried machines
-- or facilities (the guards enforced that before deleting), so the row itself
-- is the whole of what was lost. Only run this if you decide DIN wants its
-- own row after all:
--   INSERT INTO areas (factory_id, code, name)
--   SELECT f.id, v.code, v.name
--   FROM factories f
--   CROSS JOIN (VALUES
--     ('DIN-IPAL',   'IPAL (Instalasi Pengolahan Air Limbah)'),
--     ('DIN-GUDANG', 'Gudang Bahan Baku, Bahan Kemas, dan Produk Jadi')
--   ) AS v(code, name)
--   WHERE f.code = 'DIN'
--   ON CONFLICT (factory_id, code) DO NOTHING;
