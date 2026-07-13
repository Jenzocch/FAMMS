-- ============================================================================
-- DELETE PROTECTION — stop silent cascade-wipes of maintenance history
-- ============================================================================
-- Problem: schema.sql declared ON DELETE CASCADE along the whole chain
-- factory → area → machine → incidents/maintenance_logs. Deleting one area
-- from Settings silently and permanently erased every machine in it plus all
-- their incidents, PM records, and costs — with only a generic "確認刪除?"
-- confirm in the UI.
--
-- This migration converts the FKs that carry REAL HISTORY to ON DELETE
-- RESTRICT: a machine with incidents (or maintenance logs) can no longer be
-- hard-deleted — mark it status='scrapped' instead, which keeps the history.
-- Derived/auxiliary data (QR codes, health scores, notification logs…)
-- intentionally keeps CASCADE: it is recomputable and meaningless without
-- its parent.
--
-- Idempotent — safe to run repeatedly. Run AFTER schema.sql / SYNC_SCHEMA.
-- The UI performs the same checks with friendly messages; this is the
-- authoritative backstop for anything that bypasses the UI.
-- ============================================================================

DO $$
DECLARE
  fk RECORD;
BEGIN
  -- (table, column, referenced table) triples to convert to RESTRICT.
  FOR fk IN
    SELECT * FROM (VALUES
      ('incidents',        'machine_id', 'machines'),
      ('maintenance_logs', 'machine_id', 'machines'),
      ('machines',         'area_id',    'areas'),
      ('areas',            'factory_id', 'factories')
    ) AS t(tbl, col, reftbl)
  LOOP
    -- Skip if the table/column doesn't exist in this database.
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = fk.tbl AND column_name = fk.col
    ) THEN
      RAISE NOTICE 'skip %.% (not present)', fk.tbl, fk.col;
      CONTINUE;
    END IF;

    -- Drop whatever FK currently covers this column (name may vary).
    EXECUTE (
      SELECT string_agg(format('ALTER TABLE public.%I DROP CONSTRAINT %I', fk.tbl, con.conname), '; ')
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      JOIN unnest(con.conkey) WITH ORDINALITY AS ck(attnum, ord) ON true
      JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ck.attnum
      WHERE con.contype = 'f'
        AND nsp.nspname = 'public'
        AND rel.relname = fk.tbl
        AND att.attname = fk.col
    );

    -- Re-add as RESTRICT (NULLability of the column is unchanged).
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.%I(id) ON DELETE RESTRICT',
      fk.tbl, fk.tbl || '_' || fk.col || '_fkey', fk.col, fk.reftbl
    );
    RAISE NOTICE 'converted %.% -> ON DELETE RESTRICT', fk.tbl, fk.col;
  END LOOP;
END $$;

-- Verify
SELECT
  rel.relname  AS "table",
  att.attname  AS "column",
  CASE con.confdeltype WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'a' THEN 'NO ACTION' END AS on_delete
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
JOIN unnest(con.conkey) WITH ORDINALITY AS ck(attnum, ord) ON true
JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ck.attnum
WHERE con.contype = 'f' AND nsp.nspname = 'public'
  AND (rel.relname, att.attname) IN (('incidents','machine_id'), ('maintenance_logs','machine_id'), ('machines','area_id'), ('areas','factory_id'));
