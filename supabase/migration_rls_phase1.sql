-- ============================================================================
-- RLS — PHASE 1: close the public "anon" hole (safe, non-breaking)
-- ============================================================================
-- Problem: RLS is disabled on every table and `anon` (the PUBLIC key baked into
-- the browser) has GRANT ALL — so anyone can read/write all data directly via
-- the Supabase REST API, bypassing the app entirely.
--
-- Phase 1 keeps the app working exactly as today (any logged-in user can do
-- anything) but blocks the anonymous public key:
--   * RLS ON for every public table
--   * one policy per table: role `authenticated` = full access
--   * `anon` gets NO policy + its table GRANT revoked → fully blocked
--   * `service_role` (admin API routes) bypasses RLS automatically → unaffected
--
-- This does NOT yet enforce per-role rules (e.g. "technician can only edit their
-- own cases") — that is Phase 2. Phase 1 removes the "no login required at all"
-- catastrophe, which is the real hole.
--
-- Safe to re-run. Rollback script at the bottom (commented out).
-- ============================================================================

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
    EXECUTE format('DROP POLICY IF EXISTS authenticated_all ON public.%I', r.tablename);
    EXECUTE format(
      'CREATE POLICY authenticated_all ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      r.tablename
    );
  END LOOP;
END $$;

-- Remove the blanket grant to the public anon key (Auth/login is unaffected —
-- it does not touch public tables).
REVOKE ALL ON ALL TABLES     IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES  IN SCHEMA public FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;

-- authenticated + service_role keep their existing GRANTs (needed on top of RLS).
GRANT ALL ON ALL TABLES    IN SCHEMA public TO authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- ROLLBACK (only if something breaks) — uncomment and run:
-- ============================================================================
-- DO $$ DECLARE r RECORD; BEGIN
--   FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
--     EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', r.tablename);
--   END LOOP;
-- END $$;
-- GRANT ALL ON ALL TABLES IN SCHEMA public TO anon;
-- NOTIFY pgrst, 'reload schema';
