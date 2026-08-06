-- ============================================================================
-- Lightweight tasks / to-dos (run in Supabase SQL editor; idempotent)
-- ============================================================================
--
-- WHAT: the action items that come out of meetings, and anyone's personal
-- to-dos. Deliberately NOT incidents: an incident is an equipment fault with a
-- heavy workflow (RCA, repeat-failure, hygiene sign-off, downtime, close type).
-- A meeting task like "chase the supplier on the sealing-film lead time" or
-- "buy 3 trolleys" needs none of that — forcing it through the incident form
-- is exactly why people don't bother filing them. This is the opposite: title
-- + assignee + due date, everything else optional.
--
-- VISIBILITY (the whole point of putting these in the system): a plain worker
-- sees ONLY the tasks they created or were assigned. Supervisors and up see
-- the whole factory's tasks. Enforced in RLS below, not just the UI.
--
-- VERIFY GATE: a task can be marked "needs verification" at creation. When it
-- is, the assignee marking it done moves it to 'verifying', and only a
-- supervisor+ can move 'verifying' -> 'done'. That last step is enforced by a
-- trigger (below), so a technician can't self-verify by writing status='done'
-- straight to the REST API.

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The factory this task belongs to (the creator's). NULL for a cross-factory
  -- creator (manager/director/admin with no single factory) — app_can_access
  -- treats NULL as visible to everyone, same as other shared rows.
  factory_id UUID REFERENCES factories(id) ON DELETE RESTRICT,

  title TEXT NOT NULL,
  note TEXT,

  -- Who owns doing it, and who raised it. SET NULL (not RESTRICT) so an
  -- offboarded person's account can still be removed without orphaning tasks —
  -- the task stays, just unassigned/unattributed.
  assigned_to_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_by_id  UUID REFERENCES profiles(id) ON DELETE SET NULL,

  due_date DATE,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  status   TEXT NOT NULL DEFAULT 'todo'   CHECK (status IN ('todo', 'doing', 'verifying', 'done')),

  -- TRUE = the assignee's "done" only moves it to 'verifying'; a supervisor
  -- must confirm. FALSE = the assignee's "done" closes it outright.
  needs_verification BOOLEAN NOT NULL DEFAULT FALSE,

  -- Free text marking where the task came from, e.g. 'meeting' for the ones
  -- pasted in from a meeting note. Just for filtering/reporting.
  source TEXT,

  completed_at   TIMESTAMPTZ,
  verified_by_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  verified_at    TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tasks_factory_status_idx ON tasks (factory_id, status);
CREATE INDEX IF NOT EXISTS tasks_assigned_idx       ON tasks (assigned_to_id);
CREATE INDEX IF NOT EXISTS tasks_created_by_idx      ON tasks (created_by_id);

-- ── Trigger: verify gate + timestamp stamping + updated_at ──────────────────
CREATE OR REPLACE FUNCTION tasks_before_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at := NOW();

  -- The verify gate: only a supervisor+ may move a task from 'verifying' to
  -- 'done'. auth.uid() IS NULL means the service-role client (server code that
  -- already did its own role check) — let it through.
  IF OLD.status = 'verifying' AND NEW.status = 'done' THEN
    IF auth.uid() IS NOT NULL AND NOT app_is_supervisor_plus() THEN
      RAISE EXCEPTION 'Only a supervisor can verify a task';
    END IF;
    IF NEW.verified_at IS NULL THEN
      NEW.verified_by_id := COALESCE(NEW.verified_by_id, auth.uid());
      NEW.verified_at := NOW();
    END IF;
  END IF;

  -- Stamp completed_at the first time it reaches 'done'; clear it if reopened.
  IF NEW.status = 'done' AND OLD.status <> 'done' THEN
    NEW.completed_at := COALESCE(NEW.completed_at, NOW());
  ELSIF NEW.status <> 'done' AND OLD.status = 'done' THEN
    NEW.completed_at := NULL;
    NEW.verified_by_id := NULL;
    NEW.verified_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_before_update_trg ON tasks;
CREATE TRIGGER tasks_before_update_trg
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION tasks_before_update();

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- SELECT: must be in the factory (app_can_access handles cross-factory roles
-- and NULL-factory rows). A plain worker additionally sees only their own
-- created/assigned tasks; a supervisor+ sees the whole factory's.
DROP POLICY IF EXISTS tasks_sel ON tasks;
CREATE POLICY tasks_sel ON tasks FOR SELECT TO authenticated
  USING (
    app_can_access(factory_id)
    AND (
      app_is_supervisor_plus()
      OR created_by_id = auth.uid()
      OR assigned_to_id = auth.uid()
    )
  );

-- INSERT: anyone may create a task in a factory they can access.
DROP POLICY IF EXISTS tasks_ins ON tasks;
CREATE POLICY tasks_ins ON tasks FOR INSERT TO authenticated
  WITH CHECK (app_can_access(factory_id));

-- UPDATE: the creator, the assignee, or a supervisor+ (all within the factory).
-- The verify-gate trigger above further restricts the one 'verifying'->'done'
-- transition to supervisors.
DROP POLICY IF EXISTS tasks_upd ON tasks;
CREATE POLICY tasks_upd ON tasks FOR UPDATE TO authenticated
  USING (
    app_can_access(factory_id)
    AND (app_is_supervisor_plus() OR created_by_id = auth.uid() OR assigned_to_id = auth.uid())
  )
  WITH CHECK (
    app_can_access(factory_id)
    AND (app_is_supervisor_plus() OR created_by_id = auth.uid() OR assigned_to_id = auth.uid())
  );

-- DELETE: the creator or a supervisor+.
DROP POLICY IF EXISTS tasks_del ON tasks;
CREATE POLICY tasks_del ON tasks FOR DELETE TO authenticated
  USING (
    app_can_access(factory_id)
    AND (app_is_supervisor_plus() OR created_by_id = auth.uid())
  );

-- Close the PUBLIC-execute gap on the trigger function (see
-- migration_security_phase3_function_execute.sql for why).
REVOKE ALL ON FUNCTION tasks_before_update() FROM PUBLIC;

-- ── Verify ──────────────────────────────────────────────────────────────────
SELECT 'tasks table' AS check,
       EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tasks') AS ok
UNION ALL SELECT 'RLS enabled',
       COALESCE((SELECT relrowsecurity FROM pg_class WHERE relname = 'tasks'), FALSE)
UNION ALL SELECT 'policies (expect 4)',
       (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'tasks') = 4
UNION ALL SELECT 'verify-gate trigger',
       EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tasks_before_update_trg');
