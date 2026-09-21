-- ============================================================================
-- SECURITY PHASE 6 — task creator and assignee integrity.
-- Run AFTER migration_tasks.sql and migration_security_phase4_active_account_gate.sql.
--
-- The API validates assignees for a good operator-facing error. This trigger
-- is the database backstop for direct PostgREST calls and future write paths.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.tasks') IS NULL THEN
    RAISE EXCEPTION 'Run migration_tasks.sql before this migration';
  END IF;
  IF to_regprocedure('public.app_is_active()') IS NULL THEN
    RAISE EXCEPTION
      'Run migration_security_phase4_active_account_gate.sql before this migration';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_task_identity_and_assignee()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id UUID := auth.uid();
  assignee_factory_id UUID;
  assignee_is_active BOOLEAN;
BEGIN
  -- Service-role work (trusted server / migration operations) has no auth.uid.
  IF caller_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT public.app_is_active() THEN
    RAISE EXCEPTION 'Inactive accounts cannot create or modify tasks';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.created_by_id IS DISTINCT FROM caller_id THEN
      RAISE EXCEPTION 'Tasks must be created by the authenticated user';
    END IF;
  ELSIF NEW.created_by_id IS DISTINCT FROM OLD.created_by_id THEN
    RAISE EXCEPTION 'Task creator cannot be changed';
  END IF;

  -- Check a task's ownership whenever it is introduced or changed. Existing
  -- historical rows are not frozen merely because a former assignee is now
  -- inactive; the check runs only when assignment/factory scope changes.
  IF TG_OP = 'INSERT'
     OR NEW.assigned_to_id IS DISTINCT FROM OLD.assigned_to_id
     OR NEW.factory_id IS DISTINCT FROM OLD.factory_id THEN
    IF NEW.assigned_to_id IS NOT NULL THEN
      SELECT p.factory_id, p.is_active
      INTO assignee_factory_id, assignee_is_active
      FROM public.profiles p
      WHERE p.id = NEW.assigned_to_id;

      IF NOT FOUND OR assignee_is_active IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'Task assignee must be an active profile';
      END IF;

      -- NULL on either side means an intentionally cross-factory/shared
      -- profile/task. Otherwise, task and assignee must be in the same plant.
      IF NEW.factory_id IS NOT NULL
         AND assignee_factory_id IS NOT NULL
         AND NEW.factory_id <> assignee_factory_id THEN
        RAISE EXCEPTION 'Task assignee must belong to the task factory';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_identity_assignee_guard ON public.tasks;
CREATE TRIGGER tasks_identity_assignee_guard
  BEFORE INSERT OR UPDATE OF created_by_id, assigned_to_id, factory_id ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_task_identity_and_assignee();

-- The trigger is invoked by table writes; it must not become a callable API.
REVOKE ALL ON FUNCTION public.enforce_task_identity_and_assignee() FROM PUBLIC, anon, authenticated;

-- Verification query:
-- SELECT tgname FROM pg_trigger WHERE tgname = 'tasks_identity_assignee_guard';
