-- Make incidents.incident_no unique so two reports filed at the same moment can
-- never end up with the same number. The app computes the number as
-- "today's count + 1", which has a read-then-write race; this constraint is the
-- backstop, and the client retries (bumps the sequence) on a unique violation.
--
-- Safe to run more than once. Run in the Supabase SQL editor.

-- 1) Renumber any pre-existing duplicates: keep the earliest row per number,
--    suffix the rest with -dupN, so the unique constraint can be added.
WITH dups AS (
  SELECT id,
         incident_no,
         ROW_NUMBER() OVER (PARTITION BY incident_no ORDER BY created_at) AS rn
  FROM incidents
  WHERE incident_no IS NOT NULL
)
UPDATE incidents i
SET incident_no = i.incident_no || '-dup' || d.rn
FROM dups d
WHERE i.id = d.id
  AND d.rn > 1;

-- 2) Add the unique constraint if it isn't there yet.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'incidents_incident_no_key'
  ) THEN
    ALTER TABLE incidents
      ADD CONSTRAINT incidents_incident_no_key UNIQUE (incident_no);
  END IF;
END $$;
