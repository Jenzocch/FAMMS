-- Emergency containment for the four production tables observed with RLS off.
-- Does not change data, authenticated/service_role grants, policies, or RLS.
-- Full RLS consolidation and tablet release remain separate deployment gates.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

DO $$
DECLARE
  target TEXT;
  permission TEXT;
  before_grants JSONB;
  after_grants JSONB;
BEGIN
  FOREACH target IN ARRAY ARRAY['audit_logs','incident_types','incident_updates','maintenance_logs'] LOOP
    IF to_regclass('public.' || target) IS NULL THEN
      RAISE EXCEPTION 'Required containment table missing: %', target;
    END IF;
    SELECT jsonb_object_agg(r || ':' || p, has_table_privilege(r, 'public.' || target, p))
      INTO before_grants
      FROM unnest(ARRAY['authenticated','service_role']) AS roles(r)
      CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) AS permissions(p);

    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon', target);

    FOREACH permission IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
      IF has_table_privilege('anon', 'public.' || target, permission) THEN
        RAISE EXCEPTION 'Inherited anon % grant remains on %; containment rolled back', permission, target;
      END IF;
    END LOOP;
    FOREACH permission IN ARRAY ARRAY['SELECT','INSERT','UPDATE','REFERENCES'] LOOP
      IF has_any_column_privilege('anon', 'public.' || target, permission) THEN
        RAISE EXCEPTION 'Column-level anon % grant remains on %; containment rolled back', permission, target;
      END IF;
    END LOOP;

    SELECT jsonb_object_agg(r || ':' || p, has_table_privilege(r, 'public.' || target, p))
      INTO after_grants
      FROM unnest(ARRAY['authenticated','service_role']) AS roles(r)
      CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) AS permissions(p);
    IF before_grants IS DISTINCT FROM after_grants THEN
      RAISE EXCEPTION 'Existing signed-in/server privileges changed on %; containment rolled back', target;
    END IF;
  END LOOP;
END;
$$;
COMMIT;

SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled,
       has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
       has_table_privilege('anon', c.oid, 'INSERT') AS anon_insert,
       has_table_privilege('anon', c.oid, 'UPDATE') AS anon_update,
       has_table_privilege('anon', c.oid, 'DELETE') AS anon_delete,
       has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_select,
       has_table_privilege('authenticated', c.oid, 'INSERT') AS authenticated_insert,
       has_table_privilege('authenticated', c.oid, 'UPDATE') AS authenticated_update,
       has_table_privilege('service_role', c.oid, 'SELECT') AS service_select
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('audit_logs','incident_types','incident_updates','maintenance_logs')
ORDER BY c.relname;
