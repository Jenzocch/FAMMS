-- ============================================================================
-- SECURITY PHASE 4 — active-account RLS gate (run AFTER the existing RLS
-- phases). Idempotent. Apply in staging before production.
--
-- A valid Supabase Auth JWT can outlive an administrator setting
-- profiles.is_active = false. Every browser-accessible policy therefore must
-- require an active profile, including direct-assignee exceptions that would
-- otherwise bypass app_can_access(). This file assumes the policy names from
-- migration_rls_2_policies.sql, migration_rls_4_assignee_access.sql, and
-- migration_rls_6_pm_assignee_access.sql are the deployed policy set.
-- ============================================================================

CREATE OR REPLACE FUNCTION app_is_active() RETURNS BOOLEAN
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND is_active IS TRUE
  )
$$;

CREATE OR REPLACE FUNCTION app_role() RETURNS TEXT
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM profiles WHERE id = auth.uid() AND is_active IS TRUE
$$;

CREATE OR REPLACE FUNCTION app_factory() RETURNS UUID
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT factory_id FROM profiles WHERE id = auth.uid() AND is_active IS TRUE
$$;

CREATE OR REPLACE FUNCTION app_can_access(f UUID) RETURNS BOOLEAN
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT app_is_active()
     AND (app_cross_factory() OR f IS NOT DISTINCT FROM app_factory() OR f IS NULL)
$$;

CREATE OR REPLACE FUNCTION app_can_access_incident(inc UUID) RETURNS BOOLEAN
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT app_is_active() AND EXISTS (
    SELECT 1 FROM incidents i
    WHERE i.id = inc
      AND (app_can_access(i.factory_id) OR auth.uid() = ANY(i.assigned_user_ids))
  )
$$;

CREATE OR REPLACE FUNCTION app_can_access_pm_schedule(sched UUID) RETURNS BOOLEAN
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT app_is_active() AND EXISTS (
    SELECT 1 FROM pm_schedules s
    WHERE s.id = sched
      AND (app_can_access(s.factory_id) OR auth.uid() = ANY(s.assigned_user_ids))
  )
$$;

-- New SECURITY DEFINER helpers must never retain Postgres's PUBLIC EXECUTE.
GRANT EXECUTE ON FUNCTION app_is_active() TO authenticated;
REVOKE ALL ON FUNCTION app_is_active() FROM PUBLIC, anon;

-- Reference/shared data and append-only logs previously had direct
-- auth.uid() checks. Replace them with the active-account predicate.
DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['failure_categories','failure_codes','facility_issue_categories'] LOOP
    IF to_regclass('public.' || tbl) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('DROP POLICY IF EXISTS %I_sel ON %I', tbl, tbl);
    EXECUTE format('CREATE POLICY %I_sel ON %I FOR SELECT TO authenticated USING (app_is_active())', tbl, tbl);
  END LOOP;

  FOREACH tbl IN ARRAY ARRAY['knowledge_base','rca_records'] LOOP
    IF to_regclass('public.' || tbl) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('DROP POLICY IF EXISTS %I_sel ON %I', tbl, tbl);
    EXECUTE format('CREATE POLICY %I_sel ON %I FOR SELECT TO authenticated USING (app_is_active())', tbl, tbl);
  END LOOP;
END $$;

DO $$ BEGIN
  IF to_regclass('public.incident_types') IS NOT NULL THEN
    DROP POLICY IF EXISTS incident_types_sel ON incident_types;
    CREATE POLICY incident_types_sel ON incident_types FOR SELECT TO authenticated
      USING (app_is_active());
  END IF;

  IF to_regclass('public.notification_logs') IS NOT NULL THEN
    DROP POLICY IF EXISTS notification_logs_ins ON notification_logs;
    CREATE POLICY notification_logs_ins ON notification_logs FOR INSERT TO authenticated
      WITH CHECK (app_is_active());
  END IF;

  IF to_regclass('public.approval_logs') IS NOT NULL THEN
    DROP POLICY IF EXISTS approval_logs_ins ON approval_logs;
    CREATE POLICY approval_logs_ins ON approval_logs FOR INSERT TO authenticated
      WITH CHECK (app_is_active());
  END IF;

  IF to_regclass('public.audit_logs') IS NOT NULL THEN
    DROP POLICY IF EXISTS audit_logs_ins ON audit_logs;
    CREATE POLICY audit_logs_ins ON audit_logs FOR INSERT TO authenticated
      WITH CHECK (app_is_active());
  END IF;
END $$;

-- A disabled account must not retain direct profile REST access merely because
-- it is reading its own row. Server routes use a checked server session and
-- fail closed when this returns no row.
DO $$ BEGIN
  IF to_regclass('public.profiles') IS NOT NULL THEN
    DROP POLICY IF EXISTS profiles_sel ON profiles;
    DROP POLICY IF EXISTS profiles_upd ON profiles;
    CREATE POLICY profiles_sel ON profiles FOR SELECT TO authenticated
      USING (app_is_active() AND (id = auth.uid() OR app_can_access(factory_id)));
    CREATE POLICY profiles_upd ON profiles FOR UPDATE TO authenticated
      USING (app_is_active() AND (id = auth.uid() OR app_is_admin()))
      WITH CHECK (app_is_active() AND (id = auth.uid() OR app_is_admin()));
  END IF;
END $$;

-- Assignee visibility is intentional, but only for an active assignee.
DO $$ BEGIN
  IF to_regclass('public.incidents') IS NOT NULL THEN
    DROP POLICY IF EXISTS incidents_sel ON incidents;
    DROP POLICY IF EXISTS incidents_upd ON incidents;
    CREATE POLICY incidents_sel ON incidents FOR SELECT TO authenticated
      USING (app_is_active() AND (app_can_access(factory_id) OR auth.uid() = ANY(assigned_user_ids)));
    CREATE POLICY incidents_upd ON incidents FOR UPDATE TO authenticated
      USING (app_is_active() AND (app_can_access(factory_id) OR auth.uid() = ANY(assigned_user_ids)))
      WITH CHECK (app_is_active() AND (app_can_access(factory_id) OR auth.uid() = ANY(assigned_user_ids)));
  END IF;

  IF to_regclass('public.machines') IS NOT NULL THEN
    DROP POLICY IF EXISTS machines_sel ON machines;
    CREATE POLICY machines_sel ON machines FOR SELECT TO authenticated
      USING (app_is_active() AND (
        app_can_access(factory_id)
        OR EXISTS (SELECT 1 FROM incidents i WHERE i.machine_id = machines.id AND auth.uid() = ANY(i.assigned_user_ids))
      ));
  END IF;

  IF to_regclass('public.pm_schedules') IS NOT NULL THEN
    DROP POLICY IF EXISTS pm_schedules_sel ON pm_schedules;
    CREATE POLICY pm_schedules_sel ON pm_schedules FOR SELECT TO authenticated
      USING (app_is_active() AND (app_can_access(factory_id) OR auth.uid() = ANY(assigned_user_ids)));
  END IF;
END $$;

-- Pre-deploy inspection: this should return zero rows after this migration.
-- Any row means the database has policy names from an older rollout and needs
-- an explicit policy-by-policy migration before production deployment.
SELECT schemaname, tablename, policyname, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND (
    COALESCE(qual, '') ~ 'auth\\.uid\\(\\) IS NOT NULL'
    OR COALESCE(with_check, '') ~ 'auth\\.uid\\(\\) IS NOT NULL'
  );
