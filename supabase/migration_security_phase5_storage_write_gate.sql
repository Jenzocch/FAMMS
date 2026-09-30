-- ============================================================================
-- SECURITY PHASE 5 — restrict incident-photos writes without breaking reads.
-- Run AFTER migration_security_phase4_active_account_gate.sql.
--
-- The bucket remains public for now because existing print, incident, area,
-- and knowledge-base screens still consume public URLs. This migration closes
-- the immediate integrity gap: an authenticated user can no longer upload,
-- overwrite, or delete an arbitrary object in this shared bucket.
-- ============================================================================

DO $$
BEGIN
  IF to_regprocedure('public.app_is_active()') IS NULL
     OR to_regprocedure('public.app_can_access_incident(uuid)') IS NULL THEN
    RAISE EXCEPTION
      'Run migration_security_phase4_active_account_gate.sql before this migration';
  END IF;
END $$;

-- A Storage object must be in one of the currently supported namespaces:
--   <incident-uuid>/...  — access follows the incident's RLS rule
--   knowledge-base/...   — shared learning; supervisor+ may publish media
--   areas/...            — factory master data; manager+ may manage media
--
-- Do not add a blanket authenticated fallback here. New namespaces must have
-- an explicit access model before a client-side upload is introduced.

DROP POLICY IF EXISTS "incident_photos_auth_insert" ON storage.objects;
CREATE POLICY "incident_photos_auth_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'incident-photos'
    AND app_is_active()
    AND CASE
      WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN app_can_access_incident(((storage.foldername(name))[1])::uuid)
      WHEN (storage.foldername(name))[1] = 'knowledge-base'
        THEN app_is_supervisor_plus()
      WHEN (storage.foldername(name))[1] = 'areas'
        THEN app_is_manager_plus()
      ELSE false
    END
  );

DROP POLICY IF EXISTS "incident_photos_auth_update" ON storage.objects;
CREATE POLICY "incident_photos_auth_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'incident-photos'
    AND app_is_active()
    AND CASE
      WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN app_can_access_incident(((storage.foldername(name))[1])::uuid)
      WHEN (storage.foldername(name))[1] = 'knowledge-base'
        THEN app_is_supervisor_plus()
      WHEN (storage.foldername(name))[1] = 'areas'
        THEN app_is_manager_plus()
      ELSE false
    END
  )
  WITH CHECK (
    bucket_id = 'incident-photos'
    AND app_is_active()
    AND CASE
      WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN app_can_access_incident(((storage.foldername(name))[1])::uuid)
      WHEN (storage.foldername(name))[1] = 'knowledge-base'
        THEN app_is_supervisor_plus()
      WHEN (storage.foldername(name))[1] = 'areas'
        THEN app_is_manager_plus()
      ELSE false
    END
  );

DROP POLICY IF EXISTS "incident_photos_auth_delete" ON storage.objects;
CREATE POLICY "incident_photos_auth_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'incident-photos'
    AND app_is_active()
    AND CASE
      WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN app_can_access_incident(((storage.foldername(name))[1])::uuid)
      WHEN (storage.foldername(name))[1] = 'knowledge-base'
        THEN app_is_supervisor_plus()
      WHEN (storage.foldername(name))[1] = 'areas'
        THEN app_is_manager_plus()
      ELSE false
    END
  );

-- Verification query (expect the three policies above and no permissive
-- incident-photos write policy):
-- SELECT policyname, cmd, roles, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'storage' AND tablename = 'objects'
--   AND (qual || with_check) LIKE '%incident-photos%';
