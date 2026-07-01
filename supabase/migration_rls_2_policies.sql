-- ============================================================================
-- RLS PHASE 3 — Step 2 of 3: create policies (STILL INERT).
--
-- Creating a policy does NOTHING until RLS is ENABLED on the table (step 3).
-- So running this whole file is safe — the app behaves exactly as before.
-- Run step 1 (helpers) first.
--
-- Policy model:
--   SELECT  : app_can_access(factory) — own factory, or all for manager+/dir/admin
--   INSERT  : same access scope (+ role gate where the app gates it)
--   UPDATE  : same access scope
--   DELETE  : access scope + role gate (master data: manager+; incidents: supervisor+)
--   service_role (admin API) bypasses ALL of this automatically.
--
-- Reference/global + naturally-shared tables (fault tree, KB, RCA) are readable
-- by any authenticated user and only role-gated on write.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helper: a table scoped by its OWN factory_id column
--   (factories, departments, areas, machines, facilities, spare_parts,
--    telegram_groups, telegram_users, maintenance_costs, projects, pm_schedules)
-- ---------------------------------------------------------------------------

-- === factories (row's own id IS the factory) ===
DROP POLICY IF EXISTS factories_sel ON factories;
DROP POLICY IF EXISTS factories_wr  ON factories;
CREATE POLICY factories_sel ON factories FOR SELECT USING (app_can_access(id));
CREATE POLICY factories_wr  ON factories FOR ALL
  USING (app_is_manager_plus() AND app_can_access(id))
  WITH CHECK (app_is_manager_plus() AND app_can_access(id));

-- === generic factory_id-scoped master tables, manager+ to write ===
DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['departments','areas','machines','facilities','spare_parts','telegram_groups','telegram_users','projects'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_sel ON %I', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I_wr  ON %I', tbl, tbl);
    EXECUTE format('CREATE POLICY %I_sel ON %I FOR SELECT USING (app_can_access(factory_id))', tbl, tbl);
    EXECUTE format('CREATE POLICY %I_wr ON %I FOR ALL USING (app_is_manager_plus() AND app_can_access(factory_id)) WITH CHECK (app_is_manager_plus() AND app_can_access(factory_id))', tbl, tbl);
  END LOOP;
END $$;

-- === pm_schedules: read by anyone in factory; write manager+ ===
DROP POLICY IF EXISTS pm_schedules_sel ON pm_schedules;
DROP POLICY IF EXISTS pm_schedules_wr  ON pm_schedules;
CREATE POLICY pm_schedules_sel ON pm_schedules FOR SELECT USING (app_can_access(factory_id));
CREATE POLICY pm_schedules_wr  ON pm_schedules FOR ALL
  USING (app_is_manager_plus() AND app_can_access(factory_id))
  WITH CHECK (app_is_manager_plus() AND app_can_access(factory_id));

-- === maintenance_costs: read in factory; write supervisor+ ===
DROP POLICY IF EXISTS maintenance_costs_sel ON maintenance_costs;
DROP POLICY IF EXISTS maintenance_costs_wr  ON maintenance_costs;
CREATE POLICY maintenance_costs_sel ON maintenance_costs FOR SELECT USING (app_can_access(factory_id));
CREATE POLICY maintenance_costs_wr  ON maintenance_costs FOR ALL
  USING (app_is_supervisor_plus() AND app_can_access(factory_id))
  WITH CHECK (app_is_supervisor_plus() AND app_can_access(factory_id));

-- ---------------------------------------------------------------------------
-- incidents + everyone who reports (all roles) / deletes (supervisor+)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS incidents_sel ON incidents;
DROP POLICY IF EXISTS incidents_ins ON incidents;
DROP POLICY IF EXISTS incidents_upd ON incidents;
DROP POLICY IF EXISTS incidents_del ON incidents;
CREATE POLICY incidents_sel ON incidents FOR SELECT USING (app_can_access(factory_id));
CREATE POLICY incidents_ins ON incidents FOR INSERT WITH CHECK (app_can_access(factory_id));
CREATE POLICY incidents_upd ON incidents FOR UPDATE
  USING (app_can_access(factory_id)) WITH CHECK (app_can_access(factory_id));
CREATE POLICY incidents_del ON incidents FOR DELETE
  USING (app_is_supervisor_plus() AND app_can_access(factory_id));

-- === incident children scoped via their parent incident's factory ===
DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['incident_actions','incident_relations','incident_comments','work_order_blocks','incident_updates'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_sel ON %I', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I_wr  ON %I', tbl, tbl);
    EXECUTE format($f$CREATE POLICY %I_sel ON %I FOR SELECT
      USING (app_can_access((SELECT factory_id FROM incidents i WHERE i.id = %I.incident_id)))$f$, tbl, tbl, tbl);
    EXECUTE format($f$CREATE POLICY %I_wr ON %I FOR ALL
      USING (app_can_access((SELECT factory_id FROM incidents i WHERE i.id = %I.incident_id)))
      WITH CHECK (app_can_access((SELECT factory_id FROM incidents i WHERE i.id = %I.incident_id)))$f$, tbl, tbl, tbl, tbl);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- machine / PM / spare children scoped via their parent's factory
-- ---------------------------------------------------------------------------
-- machine_qr_codes, equipment_health_scores, maintenance_logs  -> machines.factory_id
DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['machine_qr_codes','equipment_health_scores','maintenance_logs'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_sel ON %I', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I_wr  ON %I', tbl, tbl);
    EXECUTE format($f$CREATE POLICY %I_sel ON %I FOR SELECT
      USING (app_can_access((SELECT factory_id FROM machines m WHERE m.id = %I.machine_id)))$f$, tbl, tbl, tbl);
    EXECUTE format($f$CREATE POLICY %I_wr ON %I FOR ALL
      USING (app_can_access((SELECT factory_id FROM machines m WHERE m.id = %I.machine_id)))
      WITH CHECK (app_can_access((SELECT factory_id FROM machines m WHERE m.id = %I.machine_id)))$f$, tbl, tbl, tbl, tbl);
  END LOOP;
END $$;

-- pm_records -> pm_schedules.factory_id (technicians execute PM; delete manager+)
DROP POLICY IF EXISTS pm_records_sel ON pm_records;
DROP POLICY IF EXISTS pm_records_ins ON pm_records;
DROP POLICY IF EXISTS pm_records_upd ON pm_records;
DROP POLICY IF EXISTS pm_records_del ON pm_records;
CREATE POLICY pm_records_sel ON pm_records FOR SELECT
  USING (app_can_access((SELECT factory_id FROM pm_schedules s WHERE s.id = pm_records.pm_schedule_id)));
CREATE POLICY pm_records_ins ON pm_records FOR INSERT
  WITH CHECK (app_can_access((SELECT factory_id FROM pm_schedules s WHERE s.id = pm_records.pm_schedule_id)));
CREATE POLICY pm_records_upd ON pm_records FOR UPDATE
  USING (app_can_access((SELECT factory_id FROM pm_schedules s WHERE s.id = pm_records.pm_schedule_id)));
CREATE POLICY pm_records_del ON pm_records FOR DELETE
  USING (app_is_manager_plus() AND app_can_access((SELECT factory_id FROM pm_schedules s WHERE s.id = pm_records.pm_schedule_id)));

-- spare_part_transactions -> spare_parts.factory_id
DROP POLICY IF EXISTS spare_part_transactions_sel ON spare_part_transactions;
DROP POLICY IF EXISTS spare_part_transactions_wr  ON spare_part_transactions;
CREATE POLICY spare_part_transactions_sel ON spare_part_transactions FOR SELECT
  USING (app_can_access((SELECT factory_id FROM spare_parts p WHERE p.id = spare_part_transactions.spare_part_id)));
CREATE POLICY spare_part_transactions_wr ON spare_part_transactions FOR ALL
  USING (app_can_access((SELECT factory_id FROM spare_parts p WHERE p.id = spare_part_transactions.spare_part_id)))
  WITH CHECK (app_can_access((SELECT factory_id FROM spare_parts p WHERE p.id = spare_part_transactions.spare_part_id)));

-- ---------------------------------------------------------------------------
-- Reference / global tables — read: any authenticated; write: role-gated
-- ---------------------------------------------------------------------------
-- fault tree (managed by manager+); incident_types (admin only per app)
DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['failure_categories','failure_codes','facility_issue_categories'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_sel ON %I', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I_wr  ON %I', tbl, tbl);
    EXECUTE format('CREATE POLICY %I_sel ON %I FOR SELECT USING (auth.uid() IS NOT NULL)', tbl, tbl);
    EXECUTE format('CREATE POLICY %I_wr ON %I FOR ALL USING (app_is_manager_plus()) WITH CHECK (app_is_manager_plus())', tbl, tbl);
  END LOOP;
END $$;

DROP POLICY IF EXISTS incident_types_sel ON incident_types;
DROP POLICY IF EXISTS incident_types_wr  ON incident_types;
CREATE POLICY incident_types_sel ON incident_types FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY incident_types_wr  ON incident_types FOR ALL
  USING (app_is_admin()) WITH CHECK (app_is_admin());

-- notification_logs: written by the acting user via API; readable by manager+
DROP POLICY IF EXISTS notification_logs_sel ON notification_logs;
DROP POLICY IF EXISTS notification_logs_ins ON notification_logs;
CREATE POLICY notification_logs_sel ON notification_logs FOR SELECT USING (app_is_manager_plus());
CREATE POLICY notification_logs_ins ON notification_logs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- knowledge_base + rca_records: shared learning — any authenticated reads;
-- write by supervisor+ (KB captured post-incident) / role as app gates.
DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['knowledge_base','rca_records'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_sel ON %I', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I_wr  ON %I', tbl, tbl);
    EXECUTE format('CREATE POLICY %I_sel ON %I FOR SELECT USING (auth.uid() IS NOT NULL)', tbl, tbl);
    EXECUTE format('CREATE POLICY %I_wr ON %I FOR ALL USING (app_is_supervisor_plus()) WITH CHECK (app_is_supervisor_plus())', tbl, tbl);
  END LOOP;
END $$;

-- approval_logs: audit trail of approvals — read manager+, insert authenticated
DROP POLICY IF EXISTS approval_logs_sel ON approval_logs;
DROP POLICY IF EXISTS approval_logs_ins ON approval_logs;
CREATE POLICY approval_logs_sel ON approval_logs FOR SELECT USING (app_is_supervisor_plus());
CREATE POLICY approval_logs_ins ON approval_logs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- audit_logs: read supervisor+ (own factory or global rows), insert authenticated,
-- delete admin only.
DROP POLICY IF EXISTS audit_logs_sel ON audit_logs;
DROP POLICY IF EXISTS audit_logs_ins ON audit_logs;
DROP POLICY IF EXISTS audit_logs_del ON audit_logs;
CREATE POLICY audit_logs_sel ON audit_logs FOR SELECT
  USING (app_is_supervisor_plus() AND (app_can_access(factory_id)));
CREATE POLICY audit_logs_ins ON audit_logs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY audit_logs_del ON audit_logs FOR DELETE USING (app_is_admin());

-- ---------------------------------------------------------------------------
-- profiles — MOST DELICATE. The SELECT policy MUST let a user read their own
-- row or getCurrentUser() breaks and everyone gets logged out. Field-level
-- limits (role/is_active/factory) are enforced by the trigger from step 1.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS profiles_sel ON profiles;
DROP POLICY IF EXISTS profiles_ins ON profiles;
DROP POLICY IF EXISTS profiles_upd ON profiles;
DROP POLICY IF EXISTS profiles_del ON profiles;
CREATE POLICY profiles_sel ON profiles FOR SELECT
  USING (id = auth.uid() OR app_can_access(factory_id));
CREATE POLICY profiles_ins ON profiles FOR INSERT WITH CHECK (app_is_admin());
CREATE POLICY profiles_upd ON profiles FOR UPDATE
  USING (id = auth.uid() OR app_is_admin())
  WITH CHECK (id = auth.uid() OR app_is_admin());
CREATE POLICY profiles_del ON profiles FOR DELETE USING (app_is_admin());
