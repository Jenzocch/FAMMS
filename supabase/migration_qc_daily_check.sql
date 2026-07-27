-- ============================================================================
-- Daily QC machine check (run in Supabase SQL editor; idempotent)
-- ============================================================================
--
-- WHAT: one tick per machine per day. QC walks the area in FQMS and marks
-- each machine OK or not; FQMS posts the whole round back to FAMMS
-- (POST /api/external/qc-check). A "not OK" opens a normal FAMMS incident
-- and — only when QC says the machine actually stopped — flips the machine
-- to 'repairing'.
--
-- WHY a separate table instead of reusing pm_records: a PM record is a
-- scheduled maintenance TASK with a checklist, a due date and a compliance
-- rate. This is a daily attendance-style sweep of every machine in the area —
-- no schedule, no due date, and "not checked today" is itself the thing
-- supervisors need to see. Folding it into pm_records would wreck PM
-- compliance stats with thousands of synthetic daily tasks.
--
-- ONE writer: FQMS, through POST /api/external/qc-check. FAMMS has no UI for
-- ticking and deliberately never will — QC signing off the same machine in
-- both systems is double entry, and the two records would disagree the first
-- time someone only did one of them. FAMMS's /qc page is read-only: it shows
-- what arrived, which machines got flagged, and which nobody looked at.
--
-- FQMS sends OK ticks as well as problems. That matters: with only the
-- problems, the completion rate ("28 of 31 machines checked") would be
-- unknowable.

CREATE TABLE IF NOT EXISTS qc_daily_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id UUID NOT NULL REFERENCES factories(id) ON DELETE RESTRICT,
  area_id UUID REFERENCES areas(id) ON DELETE RESTRICT,
  machine_id UUID NOT NULL REFERENCES machines(id) ON DELETE RESTRICT,

  -- Local factory date (WIB), not a timestamp: "was this machine checked
  -- today" is a calendar question, and a timestamp would make the answer
  -- depend on the reader's timezone.
  check_date DATE NOT NULL,

  result TEXT NOT NULL CHECK (result IN ('ok', 'issue')),
  note TEXT,

  -- Only meaningful when result='issue'. TRUE means QC saw the machine
  -- actually stop, which is what flips machines.status to 'repairing'. A
  -- problem that doesn't stop production (odd noise, slight leak) still opens
  -- an incident but leaves the machine 'running', so equipment availability
  -- stats stay honest.
  machine_stopped BOOLEAN NOT NULL DEFAULT FALSE,

  -- The incident this check opened, when result='issue'.
  incident_id UUID REFERENCES incidents(id) ON DELETE SET NULL,

  -- Normally NULL: the QC operator signs off in FQMS and has no FAMMS
  -- account. Kept for a future in-app path rather than assumed away.
  checked_by_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  -- Who FQMS says did the round. Free text for the same reason.
  checked_by_name TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One row per machine per day. Re-ticking (fixing a mis-tap) UPDATEs this row
-- rather than stacking duplicates — the API route upserts on this constraint.
CREATE UNIQUE INDEX IF NOT EXISTS qc_daily_checks_machine_date_key
  ON qc_daily_checks (machine_id, check_date);

-- The QC page's own query: today's rows for one factory.
CREATE INDEX IF NOT EXISTS qc_daily_checks_factory_date_idx
  ON qc_daily_checks (factory_id, check_date DESC);

-- ── Keep updated_at honest on re-ticks ──────────────────────────────────────
CREATE OR REPLACE FUNCTION qc_daily_checks_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS qc_daily_checks_touch ON qc_daily_checks;
CREATE TRIGGER qc_daily_checks_touch
  BEFORE UPDATE ON qc_daily_checks
  FOR EACH ROW EXECUTE FUNCTION qc_daily_checks_touch_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Read-only for every browser session: rows arrive from FQMS through the
-- service-role client, which bypasses RLS entirely. SELECT is factory-scoped
-- the same way as everything else (app_can_access); there is no INSERT or
-- UPDATE policy, so no logged-in account can forge or alter a QC sign-off
-- through the REST API.
ALTER TABLE qc_daily_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS qc_daily_checks_select ON qc_daily_checks;
CREATE POLICY qc_daily_checks_select ON qc_daily_checks FOR SELECT TO authenticated
  USING (app_can_access(factory_id));

-- Dropped if an earlier version of this file created them: the in-app write
-- path they existed for is gone.
DROP POLICY IF EXISTS qc_daily_checks_insert ON qc_daily_checks;
DROP POLICY IF EXISTS qc_daily_checks_update ON qc_daily_checks;

-- No INSERT/UPDATE/DELETE policy at all. A sign-off is a record; correcting
-- one means FQMS re-sending the round (which upserts the same row), not
-- anybody editing it here.

-- Same PUBLIC-execute gap closed for every other SECURITY DEFINER helper —
-- see migration_security_phase3_function_execute.sql for why REVOKE FROM anon
-- alone is not enough.
REVOKE ALL ON FUNCTION qc_daily_checks_touch_updated_at() FROM PUBLIC;

-- ── Verify ──────────────────────────────────────────────────────────────────
SELECT 'qc_daily_checks table' AS check,
       EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'qc_daily_checks') AS ok
UNION ALL SELECT 'unique (machine_id, check_date)',
       EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'qc_daily_checks_machine_date_key')
UNION ALL SELECT 'RLS enabled',
       COALESCE((SELECT relrowsecurity FROM pg_class WHERE relname = 'qc_daily_checks'), FALSE)
UNION ALL SELECT 'policies (expect 1 — SELECT only)',
       (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'qc_daily_checks') = 1;
