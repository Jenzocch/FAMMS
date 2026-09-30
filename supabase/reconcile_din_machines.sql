-- ============================================================================
-- DIN — reconcile the owner's machine list with what production already had
-- (run in Supabase SQL editor; idempotent, one transaction, aborts on surprise)
-- ============================================================================
--
-- WHY THIS EXISTS. seed_din_machines_real.sql assumed DIN held almost nothing
-- (the repo's seed files account for 3 areas / 4 placeholder machines). It
-- actually held 28 machines in real room-named areas — Ruang Pemotongan,
-- Ruang Pasteurisasi, Ruang Ayak dan Potong Baru, Production. Importing on top
-- of that created a SECOND row for machines that were already there (C1 and
-- C1-03S, DIN-MIX-001 and I1, DIN-HMG-001 and HMG1) and 9 invented areas
-- ("Area Potong" beside the real "Ruang Pemotongan"), so DIN read 26 areas /
-- 70 machines with the same physical machine listed twice on Cek QC.
--
-- WHAT THIS DOES, per machine in the owner's list:
--   • Already in the DB under its old code (C1→C1-03S, C2→C2-03S … C8→C8-03,
--     C10→C10-05, C11→C11-03S, DIN-MIX-001→I1, DIN-HMG-001→HMG1): the ORIGINAL
--     row is kept and given the new code, and the duplicate the import made is
--     merged into it. Every record hanging off the duplicate (incidents, QC
--     checks, PM schedules, QR codes, parts requests, …) is repointed to the
--     original first, so no history is lost and the original keeps its status.
--   • Not in the DB before (Slice ×15, AYK1, H1–H3, F1–F4, HPE/HPM, WJ1–4,
--     C9-06): the imported row is kept and moved into its real room.
--   • Then the 9 invented areas are deleted, but only if they ended up empty.
--
-- ROOMS (confirmed by the owner unless marked):
--   Slice ×15            → Ruang Slice
--   AYK1                 → Ruang Ayak dan Potong Baru
--   H1–H3                → Ruang Press
--   F1–F4 (Vakum)        → Packing            (owner: "Ruang Packing")
--   C1–C8, C10, C11, I1, HMG1 keep the room they are already in
--   C12–C14              untouched — not on the list, still in use
--   C9-06, HPE, HPM, WJ1–WJ4 → Other          (owner has not said where yet —
--       parked in the existing empty "Other" area, NOT a new invented one.
--       Tell me the room and move them with one UPDATE / an edit to this file.)
--
-- The children-of-machines repoint is discovered from the live catalog (every
-- uuid column named machine_id in public), not from schema.sql: production has
-- already been proven to differ from the repo (the partial-index/ON CONFLICT
-- failure), so a hard-coded table list could silently miss one.
-- The only row ever DELETED besides the duplicates themselves is a duplicate's
-- qc_daily_checks row when the original already has a check for that same day
-- (the unique key is machine+date) — the original's check wins. Any other
-- unique clash aborts the whole script.
--
-- Status is never written to an existing machine.

BEGIN;

-- ── The owner's list (final code, code it has now if any, name, room) ───────
-- target_area: a DIN area code OR name; NULL = keep the room it is already in.
CREATE TEMP TABLE _din_list (
  final_code  TEXT PRIMARY KEY,
  orig_code   TEXT,
  name        TEXT NOT NULL,
  target_area TEXT
) ON COMMIT DROP;

INSERT INTO _din_list (final_code, orig_code, name, target_area) VALUES
  ('A1A-KA', NULL, 'Mesin Slice', 'DIN-SLICE'), ('A1B-KA', NULL, 'Mesin Slice', 'DIN-SLICE'),
  ('A2A-03', NULL, 'Mesin Slice', 'DIN-SLICE'), ('A2B-03', NULL, 'Mesin Slice', 'DIN-SLICE'),
  ('A2C-03', NULL, 'Mesin Slice', 'DIN-SLICE'), ('A3A-06', NULL, 'Mesin Slice', 'DIN-SLICE'),
  ('A3B-06', NULL, 'Mesin Slice', 'DIN-SLICE'), ('A4A-03', NULL, 'Mesin Slice', 'DIN-SLICE'),
  ('A4B-03', NULL, 'Mesin Slice', 'DIN-SLICE'), ('A5A-03', NULL, 'Mesin Slice', 'DIN-SLICE'),
  ('A5B-03', NULL, 'Mesin Slice', 'DIN-SLICE'), ('A6-12',  NULL, 'Mesin Slice', 'DIN-SLICE'),
  ('A7-08',  NULL, 'Mesin Slice', 'DIN-SLICE'), ('A8-05',  NULL, 'Mesin Slice', 'DIN-SLICE'),
  ('A9-03',  NULL, 'Mesin Slice', 'DIN-SLICE'),
  ('C1-03S',  'C1',  'Mesin Potong', NULL), ('C2-03S',  'C2',  'Mesin Potong', NULL),
  ('C3-12',   'C3',  'Mesin Potong', NULL), ('C4-08',   'C4',  'Mesin Potong', NULL),
  ('C5-06',   'C5',  'Mesin Potong', NULL), ('C6-03',   'C6',  'Mesin Potong', NULL),
  ('C7-03',   'C7',  'Mesin Potong', NULL), ('C8-03',   'C8',  'Mesin Potong', NULL),
  ('C9-06',   NULL,  'Mesin Potong', 'O'),
  ('C10-05',  'C10', 'Mesin Potong', NULL), ('C11-03S', 'C11', 'Mesin Potong', NULL),
  ('AYK1', NULL, 'Mesin Ayak', 'Ruang Ayak dan Potong Baru'),
  ('I1',   'DIN-MIX-001', 'Mesin Mixer', NULL),
  ('H1', NULL, 'Mesin Press', 'DIN-PRESS'), ('H2', NULL, 'Mesin Press', 'DIN-PRESS'),
  ('H3', NULL, 'Mesin Press', 'DIN-PRESS'),
  ('HMG1', 'DIN-HMG-001', 'Mesin Homogenizer', NULL),
  ('F1', NULL, 'Mesin Vakum', 'PACK'), ('F2', NULL, 'Mesin Vakum', 'PACK'),
  ('F3', NULL, 'Mesin Vakum', 'PACK'), ('F4', NULL, 'Mesin Vakum', 'PACK'),
  ('HPE', NULL, 'Hand Pallet', 'O'), ('HPM', NULL, 'Hand Pallet', 'O'),
  ('WJ1', NULL, 'Waterjet', 'O'), ('WJ2', NULL, 'Waterjet', 'O'),
  ('WJ3', NULL, 'Waterjet', 'O'), ('WJ4', NULL, 'Waterjet', 'O');

-- ── Preflight: every target room must exist exactly once ────────────────────
DO $$
DECLARE bad TEXT;
BEGIN
  SELECT STRING_AGG(t.target_area || ' (' || n.c || ' found)', ', ') INTO bad
  FROM (SELECT DISTINCT target_area FROM _din_list WHERE target_area IS NOT NULL) t
  CROSS JOIN LATERAL (
    SELECT COUNT(*) AS c FROM areas a JOIN factories f ON f.id = a.factory_id AND f.code = 'DIN'
    WHERE a.code = t.target_area OR a.name = t.target_area
  ) n
  WHERE n.c <> 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'Aborting: these DIN rooms are missing or ambiguous: %. Fix the room list at the top of this file first.', bad;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM factories WHERE code = 'DIN') THEN
    RAISE EXCEPTION 'Aborting: no DIN factory.';
  END IF;
END $$;

-- ── Reconcile ───────────────────────────────────────────────────────────────
DO $$
DECLARE
  din UUID;
  e   RECORD;
  keep UUID; cur UUID; dest UUID;
  child RECORD; r RECORD;
  merged INT := 0; renamed INT := 0; created INT := 0; repointed INT := 0; dropped_checks INT := 0;
BEGIN
  SELECT id INTO din FROM factories WHERE code = 'DIN';

  FOR e IN SELECT * FROM _din_list ORDER BY final_code LOOP
    keep := NULL; cur := NULL; dest := NULL;

    IF e.orig_code IS NOT NULL THEN
      SELECT id INTO keep FROM machines WHERE factory_id = din AND machine_code = e.orig_code;
    END IF;
    SELECT id INTO cur FROM machines WHERE factory_id = din AND machine_code = e.final_code;

    IF e.target_area IS NOT NULL THEN
      SELECT a.id INTO dest FROM areas a
      WHERE a.factory_id = din AND (a.code = e.target_area OR a.name = e.target_area);
    END IF;

    IF keep IS NOT NULL AND cur IS NOT NULL AND keep <> cur THEN
      -- The import made a second row for a machine that was already there.
      -- Move everything that points at the duplicate onto the original.
      FOR child IN
        SELECT c.table_name, c.column_name
        FROM information_schema.columns c
        JOIN information_schema.tables t
          ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
        WHERE c.table_schema = 'public' AND c.column_name = 'machine_id' AND c.udt_name = 'uuid'
          AND c.table_name <> 'machines'
      LOOP
        FOR r IN EXECUTE format('SELECT ctid AS row_id FROM public.%I WHERE %I = $1', child.table_name, child.column_name) USING cur
        LOOP
          BEGIN
            EXECUTE format('UPDATE public.%I SET %I = $1 WHERE ctid = $2', child.table_name, child.column_name) USING keep, r.row_id;
            repointed := repointed + 1;
          EXCEPTION WHEN unique_violation THEN
            IF child.table_name = 'qc_daily_checks' THEN
              -- Original already has a check that day; its result wins.
              EXECUTE format('DELETE FROM public.%I WHERE ctid = $1', child.table_name) USING r.row_id;
              dropped_checks := dropped_checks + 1;
            ELSE
              RAISE EXCEPTION 'Aborting: % clashes on a unique key while merging % into %. Resolve by hand.', child.table_name, e.final_code, e.orig_code;
            END IF;
          END;
        END LOOP;
      END LOOP;

      DELETE FROM machines WHERE id = cur;          -- RESTRICT FKs abort here if any child was missed
      UPDATE machines SET machine_code = e.final_code WHERE id = keep;
      cur := keep; merged := merged + 1;

    ELSIF keep IS NOT NULL AND cur IS NULL THEN
      UPDATE machines SET machine_code = e.final_code WHERE id = keep;   -- not imported yet: just re-code it
      cur := keep; renamed := renamed + 1;

    ELSIF cur IS NULL THEN
      IF dest IS NULL THEN
        RAISE EXCEPTION 'Aborting: % is not in the DB and has no target room.', e.final_code;
      END IF;
      INSERT INTO machines (factory_id, area_id, machine_code, machine_name, status)
      VALUES (din, dest, e.final_code, e.name, 'running') RETURNING id INTO cur;
      created := created + 1;
    END IF;

    -- cur is now THE machine for this list entry. Name from the list; room only
    -- when the owner named one; status untouched.
    UPDATE machines
    SET machine_name = e.name,
        area_id      = COALESCE(dest, area_id),
        updated_at   = NOW()
    WHERE id = cur;
  END LOOP;

  RAISE NOTICE 'merged % duplicates | re-coded % | created % | repointed % child rows | dropped % same-day QC clashes',
    merged, renamed, created, repointed, dropped_checks;
END $$;

-- ── Remove the 9 areas the first import invented — only if now empty ────────
DELETE FROM areas a
USING factories f
WHERE f.id = a.factory_id AND f.code = 'DIN'
  AND a.code IN ('SLICE','POTONG','AYAK','MIXER','PRESS','HOMOGENIZER','VAKUM','HAND-PALLET','WATERJET')
  AND NOT EXISTS (SELECT 1 FROM machines m WHERE m.area_id = a.id);

COMMIT;

-- ── Verify ──────────────────────────────────────────────────────────────────
-- Expect: Ruang Slice 15 · Ruang Pemotongan 8 · Ruang Ayak dan Potong Baru 6
-- (C10-05, C11-03S, C12, C13, C14, AYK1) · Ruang Press 3 · Packing 4 ·
-- Other 7 · Production 7 · Ruang Pasteurisasi 8.
SELECT a.code, a.name, COUNT(m.id) AS machines
FROM areas a
JOIN factories f ON f.id = a.factory_id AND f.code = 'DIN'
LEFT JOIN machines m ON m.area_id = a.id
GROUP BY a.code, a.name
HAVING COUNT(m.id) > 0
ORDER BY COUNT(m.id) DESC, a.name;

-- Expect 17 areas / 58 machines (was 26 / 70), and zero rows here:
SELECT COUNT(DISTINCT a.id) AS areas, COUNT(m.id) AS machines
FROM areas a JOIN factories f ON f.id = a.factory_id AND f.code = 'DIN'
LEFT JOIN machines m ON m.area_id = a.id;

SELECT 'STILL DUPLICATED' AS problem, machine_name, COUNT(*) AS n, STRING_AGG(machine_code, ', ') AS codes
FROM machines m JOIN factories f ON f.id = m.factory_id AND f.code = 'DIN'
WHERE machine_code IN (SELECT final_code FROM (VALUES
  ('C1'),('C2'),('C3'),('C4'),('C5'),('C6'),('C7'),('C8'),('C10'),('C11'),('DIN-MIX-001'),('DIN-HMG-001')) v(final_code))
GROUP BY machine_name HAVING COUNT(*) > 0;
