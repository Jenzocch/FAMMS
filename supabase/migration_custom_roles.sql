-- ============================================================================
-- CUSTOM ROLES — admin-managed roles without a code change per role.
-- ============================================================================
-- Design: profiles.role STAYS constrained to the 5 built-in values
-- (technician/supervisor/manager/director/admin) — every DB security rule
-- that already keys off that column (RLS policies, migration_rls_5's field
-- guard trigger) is UNTOUCHED and carries zero migration risk.
--
-- A custom role is a NAMED OVERLAY on top of one of those 5 "base roles":
--   - profiles.custom_role_key points at a custom_roles row
--   - that row's base_role says which of the 5 tiers it inherits for every
--     DB-enforced rule (RCA gate, who can close/edit due date/delete, who
--     can manage machines/areas/factories/PM schedules) — unchanged by this
--     migration, still hardcoded, still safe
--   - role_capabilities only overrides a small, fixed allow-list of SOFT
--     capabilities that were already pure UI/app-layer switches with no RLS
--     backing (dashboard visibility, full-board visibility, equipment-master
--     page access) — toggling them can never grant access to data a role
--     couldn't already read, because the underlying incidents/machines SELECT
--     policies are factory-scoped, not role-scoped, for every role already
--     (e.g. turning viewMachines off only hides the /machines browse pages —
--     the machine picker in the incident report form is a separate query
--     path and stays available, since reporting needs it).
--
-- Idempotent — safe to run repeatedly.
-- ============================================================================

CREATE TABLE IF NOT EXISTS custom_roles (
  key TEXT PRIMARY KEY,               -- stable id, e.g. 'qc', 'warehouse_staff'
  label_zh TEXT NOT NULL,
  label_en TEXT NOT NULL,
  label_id TEXT NOT NULL,
  base_role TEXT NOT NULL CHECK (base_role IN ('technician','supervisor','manager')),
  is_system BOOLEAN NOT NULL DEFAULT false,  -- built-in roles we ship; can't be deleted
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- admin ('director'/'admin' base_role deliberately excluded from the CHECK
-- above — a custom role can be an operational or management overlay, but
-- never a shortcut to full admin. True admin stays a direct role assignment.

CREATE TABLE IF NOT EXISTS role_capabilities (
  role_key TEXT NOT NULL REFERENCES custom_roles(key) ON DELETE CASCADE,
  capability TEXT NOT NULL,          -- must be one of lib/roles.ts CAPABILITY_KEYS
  allowed BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (role_key, capability)
);

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS custom_role_key TEXT REFERENCES custom_roles(key) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_custom_role_key ON profiles(custom_role_key);

-- ---------------------------------------------------------------------------
-- RLS: everyone logged in needs to read role labels/capabilities (nav, badges
-- on other people's profiles); only admin may write.
-- ---------------------------------------------------------------------------
ALTER TABLE custom_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_capabilities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS custom_roles_sel ON custom_roles;
CREATE POLICY custom_roles_sel ON custom_roles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS custom_roles_wr ON custom_roles;
CREATE POLICY custom_roles_wr ON custom_roles FOR ALL TO authenticated
  USING (app_is_admin()) WITH CHECK (app_is_admin());

DROP POLICY IF EXISTS role_capabilities_sel ON role_capabilities;
CREATE POLICY role_capabilities_sel ON role_capabilities FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS role_capabilities_wr ON role_capabilities;
CREATE POLICY role_capabilities_wr ON role_capabilities FOR ALL TO authenticated
  USING (app_is_admin()) WITH CHECK (app_is_admin());

-- ---------------------------------------------------------------------------
-- Seed QC as a system role (it shipped as a real profiles.role value before
-- this migration existed) and migrate any accounts that already carry it.
-- ---------------------------------------------------------------------------
INSERT INTO custom_roles (key, label_zh, label_en, label_id, base_role, is_system)
VALUES ('qc', '品管', 'QC', 'QC', 'technician', true)
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_capabilities (role_key, capability, allowed) VALUES
  ('qc', 'dashboard', true),
  ('qc', 'boardFull', true),
  ('qc', 'viewMachines', true)
ON CONFLICT (role_key, capability) DO UPDATE SET allowed = EXCLUDED.allowed;

-- Any profile with the legacy role='qc' becomes role='technician' (the tier
-- it always behaved as at the DB layer) + custom_role_key='qc' (the label
-- and soft-capability overlay). No-op if none exist yet.
UPDATE profiles SET role = 'technician', custom_role_key = 'qc' WHERE role = 'qc';

-- ---------------------------------------------------------------------------
-- Seed 一般員工 (General Staff) as a second system role: technician-tier
-- (report incidents, do assigned PM tasks — nothing DB-enforced beyond that),
-- with every soft capability OFF — including viewMachines, so casual/temp
-- staff can't browse the equipment master (they can still pick a machine
-- when filing a report; that dropdown reads factory-scoped RLS directly and
-- isn't gated by this capability).
-- ---------------------------------------------------------------------------
INSERT INTO custom_roles (key, label_zh, label_en, label_id, base_role, is_system)
VALUES ('general_staff', '一般員工', 'General Staff', 'Staf Umum', 'technician', true)
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_capabilities (role_key, capability, allowed) VALUES
  ('general_staff', 'dashboard', false),
  ('general_staff', 'boardFull', false),
  ('general_staff', 'viewMachines', false)
ON CONFLICT (role_key, capability) DO UPDATE SET allowed = EXCLUDED.allowed;

-- ---------------------------------------------------------------------------
-- Seed 帳號管理員 (Account Admin) — splits the old all-or-nothing 系統管理員
-- into a narrower, assignable role: manages user accounts ONLY (create/edit/
-- deactivate/reset password/assign roles via Settings → 使用者管理), nothing
-- else. Base tier is 'technician' — the lowest tier — because the manageUsers
-- capability is what actually unlocks the Settings page + user-management API
-- routes (see requireUserManager() in lib/auth.ts and the extended
-- viewSettings check in app/(dashboard)/settings/page.tsx); technician's own
-- DB-enforced permissions (no manage-machines/factories/vendors/PM, no
-- close/RCA beyond what a technician can already do) are exactly the "nothing
-- else" this role is supposed to have. dashboard/boardFull/viewMachines stay
-- off by default, same as general_staff — an Account Admin's job is the users
-- list, not the incident board.
-- ---------------------------------------------------------------------------
INSERT INTO custom_roles (key, label_zh, label_en, label_id, base_role, is_system)
VALUES ('account_admin', '帳號管理員', 'Account Admin', 'Admin Akun', 'technician', true)
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_capabilities (role_key, capability, allowed) VALUES
  ('account_admin', 'dashboard', false),
  ('account_admin', 'boardFull', false),
  ('account_admin', 'viewMachines', false),
  ('account_admin', 'manageUsers', true)
ON CONFLICT (role_key, capability) DO UPDATE SET allowed = EXCLUDED.allowed;

-- ---------------------------------------------------------------------------
-- Seed 工廠管理員 (Factory Admin) — the other half of the admin split: manages
-- their OWN factory's machines/areas/incident-types... actually incident
-- types stay admin-only (PERMISSIONS.manageIncidentTypes is role === 'admin'
-- and 'manager' doesn't get it — deliberately, so Factory Admin can't do
-- anything admin-only), but machines/areas/factories/PM schedules/vendors,
-- exactly what 'manager' already does. No extra capability grants needed —
-- 'manager' already has manageMachines/manageFactories/manageVendors/
-- managePMSchedules, and the existing app-layer "if (user.factory_id &&
-- role !== 'admin') scope to factory_id" convention (used throughout, e.g.
-- app/(dashboard)/machines/page.tsx, app/(dashboard)/incidents/page.tsx)
-- already confines any manager-tier account with a factory_id set to their
-- own factory. This row exists so the owner can pick "工廠管理員" by name in
-- the role picker instead of the more abstract "經理 (manager)" label — it is
-- otherwise behaviorally identical to assigning the manager base role
-- directly (a real custom_roles row was still used, matching the existing
-- QC-role seeding pattern, rather than silently overloading the base-tier
-- label — see the task write-up for the reasoning).
-- ---------------------------------------------------------------------------
INSERT INTO custom_roles (key, label_zh, label_en, label_id, base_role, is_system)
VALUES ('factory_admin', '工廠管理員', 'Factory Admin', 'Admin Pabrik', 'manager', true)
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_capabilities (role_key, capability, allowed) VALUES
  ('factory_admin', 'dashboard', true),
  ('factory_admin', 'boardFull', true),
  ('factory_admin', 'viewMachines', true),
  ('factory_admin', 'manageUsers', false)
ON CONFLICT (role_key, capability) DO UPDATE SET allowed = EXCLUDED.allowed;

-- Verify
SELECT 'custom_roles table' AS check, to_regclass('public.custom_roles') IS NOT NULL AS ok
UNION ALL
SELECT 'role_capabilities table', to_regclass('public.role_capabilities') IS NOT NULL
UNION ALL
SELECT 'profiles.custom_role_key column', EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'profiles' AND column_name = 'custom_role_key'
)
UNION ALL
SELECT 'qc seeded', EXISTS (SELECT 1 FROM custom_roles WHERE key = 'qc')
UNION ALL
SELECT 'account_admin seeded', EXISTS (SELECT 1 FROM custom_roles WHERE key = 'account_admin')
UNION ALL
SELECT 'factory_admin seeded', EXISTS (SELECT 1 FROM custom_roles WHERE key = 'factory_admin');
