-- ============================================================================
-- RLS PHASE 3 — Step 3 of 3: ENABLE RLS, ONE STAGE AT A TIME.
--
-- ⚠️  DO NOT paste this whole file at once. Run ONE stage, then TEST the live
--     app with a non-admin account. If anything breaks, run that stage's
--     ROLLBACK line and tell me what broke. Only move to the next stage once the
--     current one is verified.
--
-- Prereqs: step 1 (helpers) and step 2 (policies) already run.
-- service_role (admin API) bypasses RLS, so user management keeps working.
-- ============================================================================


-- ─── STAGE A — reference / global tables (lowest risk) ──────────────────────
-- Test after: open the "report incident" form → fault-tree dropdowns still load;
-- settings → incident types still list.
ALTER TABLE failure_categories        ENABLE ROW LEVEL SECURITY;
ALTER TABLE failure_codes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE facility_issue_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident_types            ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_logs         ENABLE ROW LEVEL SECURITY;
-- ROLLBACK STAGE A:
-- ALTER TABLE failure_categories DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE failure_codes DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE facility_issue_categories DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE incident_types DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE notification_logs DISABLE ROW LEVEL SECURITY;


-- ─── STAGE B — tenant master data ───────────────────────────────────────────
-- Test after: machines list, areas, factories, PM schedules, spare parts,
-- Telegram settings all still load for a normal user of that factory; a user of
-- factory DIN should NOT see SJA machines.
ALTER TABLE factories        ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE areas            ENABLE ROW LEVEL SECURITY;
ALTER TABLE machines         ENABLE ROW LEVEL SECURITY;
ALTER TABLE facilities       ENABLE ROW LEVEL SECURITY;
ALTER TABLE spare_parts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_groups  ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_users   ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm_schedules     ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects         ENABLE ROW LEVEL SECURITY;
-- ROLLBACK STAGE B: (repeat DISABLE ROW LEVEL SECURITY for each table above)


-- ─── STAGE C — incidents + their children ───────────────────────────────────
-- Test after: incident board loads, report a new incident, add an action,
-- assign, comment, close. A DIN user must not see SJA incidents.
ALTER TABLE incidents          ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident_actions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident_comments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_order_blocks  ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident_updates   ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_logs      ENABLE ROW LEVEL SECURITY;
-- ROLLBACK STAGE C: (DISABLE ROW LEVEL SECURITY for each table above)


-- ─── STAGE D — machine/PM/knowledge children + audit ────────────────────────
-- Test after: machine detail health trend, PM records, knowledge base search,
-- RCA, audit trail all load.
ALTER TABLE machine_qr_codes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_health_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_logs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm_records              ENABLE ROW LEVEL SECURITY;
ALTER TABLE spare_part_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base          ENABLE ROW LEVEL SECURITY;
ALTER TABLE rca_records             ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs              ENABLE ROW LEVEL SECURITY;
-- ROLLBACK STAGE D: (DISABLE ROW LEVEL SECURITY for each table above)


-- ─── STAGE E — profiles (LAST, most delicate) ───────────────────────────────
-- ⚠️  Before running: make sure you can still log in in a SECOND browser as a
--     non-admin. After enabling, immediately verify: (1) you can still load the
--     dashboard as a normal user, (2) /profile shows your name and lets you save
--     a name change, (3) a technician can NOT change their role/factory.
--     If login breaks → run the ROLLBACK line below immediately.
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
-- ROLLBACK STAGE E:
-- ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
