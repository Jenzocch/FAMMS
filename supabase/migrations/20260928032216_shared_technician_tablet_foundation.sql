-- Phase A: schema foundation for the shared technician tablet.
-- Existing personal incident-update rows remain valid: the two new columns
-- are nullable, while tablet writes must provide both values through a
-- dedicated server-side route and transaction function.

DO $$
BEGIN
  IF to_regclass('public.factories') IS NULL
     OR to_regclass('public.profiles') IS NULL
     OR to_regclass('public.incidents') IS NULL
     OR to_regclass('public.incident_updates') IS NULL THEN
    RAISE EXCEPTION 'Shared technician tablet requires public.factories, public.profiles, public.incidents, and public.incident_updates';
  END IF;

  -- The app's login and account-management paths require this flag. Add it
  -- before the compatibility checks so existing installations are upgraded.
  ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS is_shared_device BOOLEAN NOT NULL DEFAULT FALSE;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'factories' AND column_name = 'id' AND data_type = 'uuid'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'id' AND data_type = 'uuid'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'incident_updates' AND column_name = 'id' AND data_type = 'uuid'
  ) THEN
    RAISE EXCEPTION 'Shared technician tablet requires UUID primary-key columns factories.id, profiles.id, and incident_updates.id';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'factory_id')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'full_name')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'is_active')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'is_shared_device')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'incidents' AND column_name = 'factory_id')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'incidents' AND column_name = 'status') THEN
    RAISE EXCEPTION 'Shared technician tablet requires profiles identity/status columns and incidents.factory_id/status';
  END IF;

  IF to_regclass('auth.users') IS NULL THEN
    RAISE EXCEPTION 'Shared technician tablet requires auth.users';
  END IF;
END;
$$;

CREATE TABLE public.shared_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE RESTRICT,
  factory_id UUID NOT NULL REFERENCES public.factories(id) ON DELETE RESTRICT,
  label TEXT NOT NULL CHECK (length(btrim(label)) > 0),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  disabled_at TIMESTAMPTZ,
  disabled_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT shared_devices_disabled_audit_pair_check CHECK (
    (enabled AND disabled_at IS NULL AND disabled_by_user_id IS NULL)
    OR (
      NOT enabled
      AND (
        (disabled_at IS NULL AND disabled_by_user_id IS NULL)
        OR (disabled_at IS NOT NULL AND disabled_by_user_id IS NOT NULL)
      )
    )
  )
);

CREATE TABLE public.shared_device_roster (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES public.shared_devices(id) ON DELETE CASCADE,
  technician_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (device_id, technician_profile_id)
);

CREATE TABLE public.incident_update_performers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  update_id UUID NOT NULL REFERENCES public.incident_updates(id) ON DELETE CASCADE,
  performer_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (update_id, performer_profile_id)
);

ALTER TABLE public.incident_updates
  ADD COLUMN shared_device_id UUID REFERENCES public.shared_devices(id) ON DELETE RESTRICT,
  ADD COLUMN request_id UUID,
  ADD CONSTRAINT incident_updates_device_request_pair_check CHECK (
    (shared_device_id IS NULL AND request_id IS NULL)
    OR (shared_device_id IS NOT NULL AND request_id IS NOT NULL)
  );

CREATE UNIQUE INDEX incident_updates_request_id_uidx
  ON public.incident_updates (request_id)
  WHERE request_id IS NOT NULL;

CREATE INDEX shared_device_roster_technician_idx
  ON public.shared_device_roster (technician_profile_id);

CREATE INDEX incident_update_performers_profile_idx
  ON public.incident_update_performers (performer_profile_id);

-- The existing personal progress form still uses authenticated direct writes,
-- and deployment RLS/grants have not yet been inspected. Do not let a shared
-- device JWT bypass the narrow server RPC, nor let an ordinary JWT modify a
-- shared-device progress event if its table policies are broader than hoped.
CREATE OR REPLACE FUNCTION public.prevent_direct_shared_tablet_update_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor_is_shared_device BOOLEAN := FALSE;
  v_jwt_role TEXT := auth.role();
BEGIN
  IF auth.uid() IS NOT NULL THEN
    SELECT coalesce(p.is_shared_device, FALSE)
    INTO v_actor_is_shared_device
    FROM public.profiles AS p
    WHERE p.id = auth.uid();
  END IF;

  IF coalesce(v_jwt_role, '') <> 'service_role' THEN
    IF v_actor_is_shared_device THEN
      RAISE EXCEPTION 'shared device progress writes require the server API'
        USING ERRCODE = '42501';
    END IF;
    IF TG_OP = 'INSERT' AND NEW.shared_device_id IS NOT NULL THEN
      RAISE EXCEPTION 'shared device progress writes require the server API'
        USING ERRCODE = '42501';
    ELSIF TG_OP = 'UPDATE' AND (OLD.shared_device_id IS NOT NULL OR NEW.shared_device_id IS NOT NULL) THEN
      RAISE EXCEPTION 'shared device progress events are immutable to authenticated clients'
        USING ERRCODE = '42501';
    ELSIF TG_OP = 'DELETE' AND OLD.shared_device_id IS NOT NULL THEN
      RAISE EXCEPTION 'shared device progress events are immutable to authenticated clients'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_direct_shared_tablet_update_writes() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS prevent_direct_shared_tablet_update_writes ON public.incident_updates;
CREATE TRIGGER prevent_direct_shared_tablet_update_writes
  BEFORE INSERT OR UPDATE OR DELETE ON public.incident_updates
  FOR EACH ROW EXECUTE FUNCTION public.prevent_direct_shared_tablet_update_writes();

ALTER TABLE public.shared_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_device_roster ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_update_performers ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.shared_devices FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.shared_device_roster FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.incident_update_performers FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE public.shared_devices TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.shared_device_roster TO service_role;
GRANT SELECT, INSERT ON TABLE public.incident_update_performers TO service_role;

-- Keep verified actor identity in the existing updated_by_id column. These
-- privileges support server-side routes only; do not grant tablet clients
-- direct access to the new columns or relation tables.
GRANT SELECT, INSERT ON TABLE public.incident_updates TO service_role;

-- The application validates input before calling this transaction boundary;
-- the function repeats the device/factory/roster checks so a retry or future
-- route refactor cannot create a partial progress row or spoof its actor.
CREATE OR REPLACE FUNCTION public.create_shared_tablet_update(
  p_device_id UUID,
  p_incident_id UUID,
  p_actor_id UUID,
  p_request_id UUID,
  p_note TEXT,
  p_performer_ids UUID[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_factory_id UUID;
  v_status TEXT;
  v_update_id UUID;
  v_updated_by TEXT;
  v_existing_note TEXT;
  v_existing_device UUID;
  v_existing_incident UUID;
  v_existing_performers UUID[];
  v_requested_performers UUID[];
BEGIN
  IF p_request_id IS NULL OR p_note IS NULL OR length(btrim(p_note)) = 0 OR length(p_note) > 5000
     OR p_performer_ids IS NULL OR cardinality(p_performer_ids) < 1 OR cardinality(p_performer_ids) > 20
     OR array_position(p_performer_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'invalid tablet progress input' USING ERRCODE = '22023';
  END IF;
  IF cardinality(ARRAY(SELECT DISTINCT x FROM unnest(p_performer_ids) AS x)) <> cardinality(p_performer_ids) THEN
    RAISE EXCEPTION 'duplicate performers' USING ERRCODE = '22023';
  END IF;

  SELECT d.factory_id INTO v_factory_id
  FROM public.shared_devices AS d
  JOIN public.profiles AS device_profile ON device_profile.id = d.auth_user_id
  WHERE d.id = p_device_id AND d.auth_user_id = p_actor_id AND d.enabled
    AND device_profile.is_active AND device_profile.is_shared_device
    AND device_profile.role = 'technician' AND device_profile.factory_id = d.factory_id;
  IF v_factory_id IS NULL THEN
    RAISE EXCEPTION 'shared tablet is disabled or invalid' USING ERRCODE = '42501';
  END IF;

  SELECT i.status INTO v_status
  FROM public.incidents AS i
  WHERE i.id = p_incident_id AND i.factory_id = v_factory_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'incident not found for tablet factory' USING ERRCODE = '42501';
  END IF;
  IF (SELECT count(*) FROM unnest(p_performer_ids) AS requested(id)
      JOIN public.shared_device_roster AS r ON r.device_id = p_device_id AND r.technician_profile_id = requested.id
      JOIN public.profiles AS p ON p.id = requested.id
      WHERE p.is_active AND p.role = 'technician' AND p.factory_id = v_factory_id) <> cardinality(p_performer_ids) THEN
    RAISE EXCEPTION 'performer is not an active roster technician' USING ERRCODE = '42501';
  END IF;

  SELECT string_agg(coalesce(p.full_name, ''), ', ' ORDER BY p.full_name, p.id)
  INTO v_updated_by
  FROM public.profiles AS p WHERE p.id = ANY(p_performer_ids);

  INSERT INTO public.incident_updates (
    incident_id, note, updated_by, updated_by_id, shared_device_id, request_id
  ) VALUES (
    p_incident_id, btrim(p_note), v_updated_by, p_actor_id, p_device_id, p_request_id
  ) ON CONFLICT (request_id) WHERE request_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_update_id;

  IF v_update_id IS NULL THEN
    SELECT u.id, u.note, u.shared_device_id, u.incident_id
    INTO v_update_id, v_existing_note, v_existing_device, v_existing_incident
    FROM public.incident_updates AS u WHERE u.request_id = p_request_id;
    SELECT coalesce(array_agg(x ORDER BY x), ARRAY[]::UUID[]) INTO v_requested_performers
    FROM unnest(p_performer_ids) AS x;
    SELECT coalesce(array_agg(ip.performer_profile_id ORDER BY ip.performer_profile_id), ARRAY[]::UUID[])
    INTO v_existing_performers FROM public.incident_update_performers AS ip WHERE ip.update_id = v_update_id;
    IF v_existing_device IS DISTINCT FROM p_device_id OR v_existing_incident IS DISTINCT FROM p_incident_id
       OR v_existing_note IS DISTINCT FROM btrim(p_note) OR v_existing_performers IS DISTINCT FROM v_requested_performers THEN
      RAISE EXCEPTION 'request id already used for different content' USING ERRCODE = '23505';
    END IF;
    RETURN v_update_id;
  END IF;

  IF v_status = 'closed' THEN
    RAISE EXCEPTION 'incident is closed' USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.incident_update_performers (update_id, performer_profile_id)
  SELECT v_update_id, requested.id FROM unnest(p_performer_ids) AS requested(id);
  RETURN v_update_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_shared_tablet_update(UUID, UUID, UUID, UUID, TEXT, UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_shared_tablet_update(UUID, UUID, UUID, UUID, TEXT, UUID[]) TO service_role;
