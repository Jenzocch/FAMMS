-- Emergency containment only, NOT full policy consolidation.
-- Production catalog confirmed this definer view exposes audit_logs to anon.
-- Preserve existing authenticated/service_role privileges; read no business rows.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
DO $$
DECLARE
  before_auth text;
  before_service text;
BEGIN
  IF to_regclass('public.incident_audit_trail') IS NULL THEN
    RAISE EXCEPTION 'Expected incident_audit_trail view is missing';
  END IF;
  SELECT string_agg(has_table_privilege('authenticated', 'public.incident_audit_trail', p)::text, ',' ORDER BY p),
         string_agg(has_table_privilege('service_role', 'public.incident_audit_trail', p)::text, ',' ORDER BY p)
  INTO before_auth, before_service
  FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) AS p;
  REVOKE ALL PRIVILEGES ON TABLE public.incident_audit_trail FROM anon;
  IF has_table_privilege('anon', 'public.incident_audit_trail', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     OR has_any_column_privilege('anon', 'public.incident_audit_trail', 'SELECT,INSERT,UPDATE,REFERENCES') THEN
    RAISE EXCEPTION 'Inherited or column anon privileges remain';
  END IF;
  IF before_auth IS DISTINCT FROM (
    SELECT string_agg(has_table_privilege('authenticated', 'public.incident_audit_trail', p)::text, ',' ORDER BY p)
    FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) AS p
  ) OR before_service IS DISTINCT FROM (
    SELECT string_agg(has_table_privilege('service_role', 'public.incident_audit_trail', p)::text, ',' ORDER BY p)
    FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) AS p
  ) THEN
    RAISE EXCEPTION 'Non-anonymous privileges changed';
  END IF;
END $$;
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM 1 FROM public.incident_audit_trail LIMIT 0;
    RAISE EXCEPTION 'FAIL: anon can still SELECT the view';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END $$;
RESET ROLE;
COMMIT;
SELECT 'PASS: actual anon SELECT denied; authenticated/service_role privileges unchanged' AS result,
       has_table_privilege('anon', 'public.incident_audit_trail', 'SELECT') AS anon_select,
       has_table_privilege('authenticated', 'public.incident_audit_trail', 'SELECT') AS authenticated_select;
