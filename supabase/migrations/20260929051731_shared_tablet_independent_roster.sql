-- Phase B: independent, cross-factory performer roster for the shared tablet.
-- Login profiles authenticate the tablet only.  A performer is attribution data,
-- deliberately independent from auth.users/profiles so roster names do not create
-- or imply personal accounts.

ALTER TABLE public.shared_devices ALTER COLUMN factory_id DROP NOT NULL;

CREATE TABLE public.shared_technicians (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL CHECK (length(btrim(full_name)) BETWEEN 1 AND 120),
  full_name_normalized TEXT GENERATED ALWAYS AS (lower(btrim(full_name))) STORED UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.shared_device_factories (
  device_id UUID NOT NULL REFERENCES public.shared_devices(id) ON DELETE CASCADE,
  factory_id UUID NOT NULL REFERENCES public.factories(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (device_id, factory_id)
);

-- Preserve old profile UUIDs as the stable independent performer IDs.  There
-- is intentionally no FK: profile lifecycle must never delete attribution.
INSERT INTO public.shared_technicians (id, full_name, is_active)
SELECT p.id, coalesce(nullif(btrim(p.full_name), ''), 'Unnamed technician'), coalesce(p.is_active, TRUE)
FROM public.profiles p
WHERE EXISTS (SELECT 1 FROM public.shared_device_roster r WHERE r.technician_profile_id = p.id)
   OR EXISTS (SELECT 1 FROM public.incident_update_performers ip WHERE ip.performer_profile_id = p.id)
ON CONFLICT (full_name_normalized) DO NOTHING;

-- The settled initial roster.  These are names, not profiles or auth users.
INSERT INTO public.shared_technicians (id, full_name, is_active) VALUES
  ('8cbb9f4a-5d69-4a2c-9347-1e2204a66b01', 'Pak Dasir', TRUE),
  ('cd51ff50-04d5-4f07-8bd7-bf22cdcc0d02', 'Suwardi', TRUE),
  ('a9516691-1e2e-4f2f-8cf0-0bef9e090d03', 'Wiwit', TRUE),
  ('ba5ea211-4e97-4b62-9dae-f2bbee22bb04', 'Rudi', TRUE)
ON CONFLICT (full_name_normalized) DO UPDATE SET is_active = TRUE, updated_at = now();

ALTER TABLE public.shared_device_roster ADD COLUMN technician_id UUID;
UPDATE public.shared_device_roster r
SET technician_id = st.id
FROM public.profiles p
JOIN public.shared_technicians st ON st.full_name_normalized = lower(btrim(coalesce(p.full_name, 'Unnamed technician')))
WHERE r.technician_profile_id = p.id AND r.technician_id IS NULL;
ALTER TABLE public.shared_device_roster ALTER COLUMN technician_id SET NOT NULL;
ALTER TABLE public.shared_device_roster
  ADD CONSTRAINT shared_device_roster_technician_id_fkey
  FOREIGN KEY (technician_id) REFERENCES public.shared_technicians(id) ON DELETE RESTRICT;
ALTER TABLE public.shared_device_roster ALTER COLUMN technician_profile_id DROP NOT NULL;
ALTER TABLE public.shared_device_roster DROP CONSTRAINT shared_device_roster_device_id_technician_profile_id_key;
ALTER TABLE public.shared_device_roster ADD CONSTRAINT shared_device_roster_device_technician_key UNIQUE (device_id, technician_id);
CREATE INDEX shared_device_roster_technician_id_idx ON public.shared_device_roster (technician_id);

ALTER TABLE public.incident_update_performers ADD COLUMN performer_id UUID;
ALTER TABLE public.incident_update_performers ADD COLUMN performer_name_snapshot TEXT;
UPDATE public.incident_update_performers ip
SET performer_id = st.id,
    performer_name_snapshot = coalesce(st.full_name, p.full_name, 'Unnamed technician')
FROM public.profiles p
LEFT JOIN public.shared_technicians st ON st.full_name_normalized = lower(btrim(coalesce(p.full_name, 'Unnamed technician')))
WHERE ip.performer_profile_id = p.id AND ip.performer_id IS NULL;
ALTER TABLE public.incident_update_performers ALTER COLUMN performer_id SET NOT NULL;
ALTER TABLE public.incident_update_performers ALTER COLUMN performer_profile_id DROP NOT NULL;
ALTER TABLE public.incident_update_performers
  ADD CONSTRAINT incident_update_performers_performer_id_fkey
  FOREIGN KEY (performer_id) REFERENCES public.shared_technicians(id) ON DELETE RESTRICT;
ALTER TABLE public.incident_update_performers DROP CONSTRAINT incident_update_performers_update_id_performer_profile_id_key;
ALTER TABLE public.incident_update_performers ADD CONSTRAINT incident_update_performers_update_performer_key UNIQUE (update_id, performer_id);
CREATE INDEX incident_update_performers_performer_id_idx ON public.incident_update_performers (performer_id);

-- These profile references were legacy conversion aids only.  Keep the old
-- row IDs and snapshots, but remove the obsolete identity coupling now that
-- every record has an independent performer_id.
ALTER TABLE public.shared_device_roster DROP CONSTRAINT shared_device_roster_technician_profile_id_fkey;
ALTER TABLE public.shared_device_roster DROP COLUMN technician_profile_id;
DROP INDEX IF EXISTS public.shared_device_roster_technician_idx;
ALTER TABLE public.incident_update_performers DROP CONSTRAINT incident_update_performers_performer_profile_id_fkey;
ALTER TABLE public.incident_update_performers DROP COLUMN performer_profile_id;
DROP INDEX IF EXISTS public.incident_update_performers_profile_idx;

-- Migrate every legacy single-factory device into the explicit allowlist.
INSERT INTO public.shared_device_factories (device_id, factory_id)
SELECT id, factory_id FROM public.shared_devices WHERE factory_id IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE public.shared_technicians ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_device_factories ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.shared_technicians FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.shared_device_factories FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.shared_technicians TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.shared_device_factories TO service_role;

CREATE OR REPLACE FUNCTION public.configure_shared_device(
  p_actor_id UUID, p_auth_user_id UUID, p_label TEXT, p_factory_ids UUID[], p_performers JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_device_id UUID;
  v_value JSONB;
  v_technician_id UUID;
  v_name TEXT;
  v_roster UUID[] := ARRAY[]::UUID[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_actor_id AND p.is_active AND p.role = 'admin') THEN
    RAISE EXCEPTION 'system administrator required' USING ERRCODE = '42501';
  END IF;
  IF p_auth_user_id IS NULL OR p_label IS NULL OR length(btrim(p_label)) NOT BETWEEN 1 AND 100
     OR p_factory_ids IS NULL OR cardinality(p_factory_ids) NOT BETWEEN 1 AND 100
     OR p_performers IS NULL OR jsonb_typeof(p_performers) <> 'array' OR jsonb_array_length(p_performers) NOT BETWEEN 1 AND 20
     OR array_position(p_factory_ids, NULL) IS NOT NULL
     OR cardinality(ARRAY(SELECT DISTINCT x FROM unnest(p_factory_ids) x)) <> cardinality(p_factory_ids) THEN
    RAISE EXCEPTION 'invalid shared device configuration' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM public.factories f WHERE f.id = ANY(p_factory_ids)) <> cardinality(p_factory_ids) THEN
    RAISE EXCEPTION 'unknown factory' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_auth_user_id AND p.is_active AND p.is_shared_device AND p.role = 'technician') THEN
    RAISE EXCEPTION 'shared tablet account is invalid' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_performers) x WHERE jsonb_typeof(x) <> 'object') THEN
    RAISE EXCEPTION 'invalid performer' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.shared_devices (auth_user_id, factory_id, label, enabled, created_by_user_id, updated_at, disabled_at, disabled_by_user_id)
  VALUES (p_auth_user_id, NULL, btrim(p_label), FALSE, p_actor_id, now(), now(), p_actor_id)
  ON CONFLICT (auth_user_id) DO UPDATE SET label = EXCLUDED.label, enabled = FALSE, updated_at = now(), disabled_at = now(), disabled_by_user_id = p_actor_id
  RETURNING id INTO v_device_id;

  FOR v_value IN SELECT value FROM jsonb_array_elements(p_performers) LOOP
    v_name := btrim(coalesce(v_value->>'full_name', ''));
    IF length(v_name) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'invalid performer name' USING ERRCODE = '22023'; END IF;
    IF v_value ? 'id' THEN
      IF (v_value->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'invalid performer id' USING ERRCODE = '22023'; END IF;
      v_technician_id := (v_value->>'id')::UUID;
      IF NOT EXISTS (SELECT 1 FROM public.shared_technicians st WHERE st.id = v_technician_id AND st.is_active) THEN RAISE EXCEPTION 'unknown or inactive performer' USING ERRCODE = '42501'; END IF;
      -- A supplied ID is an explicit rename of the canonical performer.  Old
      -- event snapshots remain untouched, so historical reports never rename.
      UPDATE public.shared_technicians SET full_name = v_name, updated_at = now() WHERE id = v_technician_id;
    ELSE
      -- Canonical normalized names make the four default names and future
      -- name-only submissions stable across every device and retry.
      INSERT INTO public.shared_technicians (full_name) VALUES (v_name)
      ON CONFLICT (full_name_normalized) DO UPDATE SET updated_at = now()
      RETURNING id INTO v_technician_id;
    END IF;
    IF v_technician_id = ANY(v_roster) THEN RAISE EXCEPTION 'duplicate performer' USING ERRCODE = '22023'; END IF;
    v_roster := array_append(v_roster, v_technician_id);
  END LOOP;

  DELETE FROM public.shared_device_factories WHERE device_id = v_device_id;
  INSERT INTO public.shared_device_factories (device_id, factory_id)
  SELECT v_device_id, x FROM unnest(p_factory_ids) x;
  DELETE FROM public.shared_device_roster WHERE device_id = v_device_id;
  INSERT INTO public.shared_device_roster (device_id, technician_id)
  SELECT v_device_id, x FROM unnest(v_roster) x;
  UPDATE public.shared_devices SET enabled = TRUE, updated_at = now(), disabled_at = NULL, disabled_by_user_id = NULL WHERE id = v_device_id;
  RETURN v_device_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_shared_device_enabled(p_actor_id UUID, p_device_id UUID, p_enabled BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_actor_id AND p.is_active AND p.role = 'admin') THEN RAISE EXCEPTION 'system administrator required' USING ERRCODE = '42501'; END IF;
  IF p_enabled AND NOT EXISTS (
    SELECT 1 FROM public.shared_devices d JOIN public.profiles p ON p.id = d.auth_user_id
    WHERE d.id = p_device_id AND p.is_active AND p.is_shared_device AND p.role = 'technician'
      AND EXISTS (SELECT 1 FROM public.shared_device_factories df WHERE df.device_id = d.id)
      AND EXISTS (SELECT 1 FROM public.shared_device_roster r JOIN public.shared_technicians st ON st.id = r.technician_id AND st.is_active WHERE r.device_id = d.id)
  ) THEN RAISE EXCEPTION 'incomplete shared device' USING ERRCODE = '22023'; END IF;
  UPDATE public.shared_devices SET enabled = p_enabled, updated_at = now(), disabled_at = CASE WHEN p_enabled THEN NULL ELSE now() END, disabled_by_user_id = CASE WHEN p_enabled THEN NULL ELSE p_actor_id END WHERE id = p_device_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'shared device not found' USING ERRCODE = '22023'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_shared_tablet_update(
  p_device_id UUID, p_incident_id UUID, p_actor_id UUID, p_request_id UUID, p_note TEXT, p_performer_ids UUID[]
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_update_id UUID; v_status TEXT; v_factory_id UUID; v_existing RECORD; v_names TEXT; v_requested UUID[];
BEGIN
  IF p_request_id IS NULL OR p_note IS NULL OR length(btrim(p_note)) NOT BETWEEN 1 AND 5000 OR p_performer_ids IS NULL OR cardinality(p_performer_ids) NOT BETWEEN 1 AND 20 OR array_position(p_performer_ids, NULL) IS NOT NULL OR cardinality(ARRAY(SELECT DISTINCT x FROM unnest(p_performer_ids) x)) <> cardinality(p_performer_ids) THEN RAISE EXCEPTION 'invalid tablet progress input' USING ERRCODE = '22023'; END IF;
  SELECT i.factory_id, i.status INTO v_factory_id, v_status FROM public.incidents i WHERE i.id = p_incident_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'incident not found' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.shared_devices d JOIN public.profiles p ON p.id = d.auth_user_id WHERE d.id = p_device_id AND d.auth_user_id = p_actor_id AND d.enabled AND p.is_active AND p.is_shared_device AND p.role = 'technician' AND EXISTS (SELECT 1 FROM public.shared_device_factories df WHERE df.device_id = d.id AND df.factory_id = v_factory_id)) THEN RAISE EXCEPTION 'shared tablet is disabled or not allowed for factory' USING ERRCODE = '42501'; END IF;
  SELECT id, incident_id, note, shared_device_id INTO v_existing FROM public.incident_updates WHERE request_id = p_request_id;
  IF FOUND THEN
    SELECT id, incident_id, note, shared_device_id INTO v_existing FROM public.incident_updates WHERE request_id = p_request_id;
    SELECT coalesce(array_agg(x ORDER BY x), ARRAY[]::UUID[]) INTO v_requested FROM unnest(p_performer_ids) x;
    IF v_existing.incident_id IS DISTINCT FROM p_incident_id OR v_existing.shared_device_id IS DISTINCT FROM p_device_id OR v_existing.note IS DISTINCT FROM btrim(p_note) OR (SELECT coalesce(array_agg(ip.performer_id ORDER BY ip.performer_id), ARRAY[]::UUID[]) FROM public.incident_update_performers ip WHERE ip.update_id = v_existing.id) IS DISTINCT FROM v_requested THEN RAISE EXCEPTION 'request id already used for different content' USING ERRCODE = '23505'; END IF;
    RETURN v_existing.id;
  END IF;
  IF (SELECT count(*) FROM unnest(p_performer_ids) x JOIN public.shared_device_roster r ON r.device_id = p_device_id AND r.technician_id = x JOIN public.shared_technicians st ON st.id = x AND st.is_active) <> cardinality(p_performer_ids) THEN RAISE EXCEPTION 'performer is not in the active device roster' USING ERRCODE = '42501'; END IF;
  IF v_status = 'closed' THEN RAISE EXCEPTION 'incident is closed' USING ERRCODE = '55000'; END IF;
  SELECT string_agg(st.full_name, ', ' ORDER BY st.full_name, st.id) INTO v_names FROM public.shared_technicians st WHERE st.id = ANY(p_performer_ids);
  INSERT INTO public.incident_updates (incident_id, note, updated_by, updated_by_id, shared_device_id, request_id)
  VALUES (p_incident_id, btrim(p_note), v_names, p_actor_id, p_device_id, p_request_id)
  ON CONFLICT (request_id) WHERE request_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_update_id;
  IF v_update_id IS NULL THEN
    SELECT id, incident_id, note, shared_device_id INTO v_existing FROM public.incident_updates WHERE request_id = p_request_id;
    SELECT coalesce(array_agg(x ORDER BY x), ARRAY[]::UUID[]) INTO v_requested FROM unnest(p_performer_ids) x;
    IF v_existing.incident_id IS DISTINCT FROM p_incident_id OR v_existing.shared_device_id IS DISTINCT FROM p_device_id OR v_existing.note IS DISTINCT FROM btrim(p_note) OR (SELECT coalesce(array_agg(ip.performer_id ORDER BY ip.performer_id), ARRAY[]::UUID[]) FROM public.incident_update_performers ip WHERE ip.update_id = v_existing.id) IS DISTINCT FROM v_requested THEN RAISE EXCEPTION 'request id already used for different content' USING ERRCODE = '23505'; END IF;
    RETURN v_existing.id;
  END IF;
  INSERT INTO public.incident_update_performers (update_id, performer_id, performer_name_snapshot) SELECT v_update_id, st.id, st.full_name FROM public.shared_technicians st WHERE st.id = ANY(p_performer_ids);
  RETURN v_update_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_shared_tablet_incidents(p_device_id UUID, p_actor_id UUID, p_performer_id UUID, p_scope TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_result JSONB;
BEGIN
  IF p_scope NOT IN ('team', 'mine') THEN RAISE EXCEPTION 'invalid tablet scope' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.shared_devices d JOIN public.profiles p ON p.id=d.auth_user_id JOIN public.shared_device_roster r ON r.device_id=d.id JOIN public.shared_technicians st ON st.id=r.technician_id AND st.is_active WHERE d.id=p_device_id AND d.auth_user_id=p_actor_id AND d.enabled AND p.is_active AND p.is_shared_device AND p.role='technician' AND r.technician_id=p_performer_id AND EXISTS (SELECT 1 FROM public.shared_device_factories df WHERE df.device_id=d.id)) THEN RAISE EXCEPTION 'shared tablet is disabled or invalid' USING ERRCODE = '42501'; END IF;
  IF p_scope = 'team' THEN
    SELECT coalesce(jsonb_agg(row_data ORDER BY reported_at DESC), '[]'::jsonb) INTO v_result FROM (
      SELECT jsonb_build_object('id', i.id, 'incident_no', i.incident_no, 'title', i.title, 'status', i.status, 'reported_at', i.reported_at, 'machine', jsonb_build_object('machine_code', m.machine_code, 'machine_name', m.machine_name), 'factory', jsonb_build_object('name', f.name)) AS row_data, i.reported_at
      FROM public.incidents i JOIN public.factories f ON f.id=i.factory_id LEFT JOIN public.machines m ON m.id=i.machine_id
      WHERE i.status <> 'closed' AND EXISTS (SELECT 1 FROM public.shared_device_factories df WHERE df.device_id=p_device_id AND df.factory_id=i.factory_id)
      ORDER BY i.reported_at DESC LIMIT 200
    ) q;
  ELSE
    SELECT coalesce(jsonb_agg(row_data ORDER BY activity_at DESC), '[]'::jsonb) INTO v_result FROM (
      SELECT jsonb_build_object('id', i.id, 'incident_no', i.incident_no, 'title', i.title, 'status', i.status, 'reported_at', i.reported_at, 'machine', jsonb_build_object('machine_code', m.machine_code, 'machine_name', m.machine_name), 'factory', jsonb_build_object('name', f.name), 'performer_activity_count', count(ip.id)) AS row_data, max(u.created_at) AS activity_at
      FROM public.incident_update_performers ip JOIN public.incident_updates u ON u.id=ip.update_id JOIN public.incidents i ON i.id=u.incident_id JOIN public.factories f ON f.id=i.factory_id LEFT JOIN public.machines m ON m.id=i.machine_id
      WHERE ip.performer_id=p_performer_id AND u.shared_device_id=p_device_id AND EXISTS (SELECT 1 FROM public.shared_device_factories df WHERE df.device_id=p_device_id AND df.factory_id=i.factory_id)
      GROUP BY i.id, i.incident_no, i.title, i.status, i.reported_at, m.machine_code, m.machine_name, f.name
      ORDER BY max(u.created_at) DESC LIMIT 200
    ) q;
  END IF;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.configure_shared_device(UUID, UUID, TEXT, UUID[], JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_shared_device_enabled(UUID, UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_shared_tablet_update(UUID, UUID, UUID, UUID, TEXT, UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_shared_tablet_incidents(UUID, UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.configure_shared_device(UUID, UUID, TEXT, UUID[], JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_shared_device_enabled(UUID, UUID, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_shared_tablet_update(UUID, UUID, UUID, UUID, TEXT, UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_shared_tablet_incidents(UUID, UUID, UUID, TEXT) TO service_role;
