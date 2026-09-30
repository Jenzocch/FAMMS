-- Run only against the verified FAMMS project after the containment migration.
-- No business data is read or changed. A failure aborts before the PASS result.
BEGIN;
SET LOCAL ROLE anon;
DO $$
DECLARE target TEXT;
BEGIN
  FOREACH target IN ARRAY ARRAY['audit_logs','incident_types','incident_updates','maintenance_logs'] LOOP
    BEGIN
      EXECUTE format('SELECT 1 FROM public.%I LIMIT 0', target);
      RAISE EXCEPTION 'FAIL: anonymous SELECT still allowed on %', target;
    EXCEPTION WHEN insufficient_privilege THEN
      NULL;
    END;
  END LOOP;
END;
$$;
ROLLBACK;
SELECT 'PASS: actual anon SELECT denied on all four tables; no business rows read or changed' AS containment_test;
