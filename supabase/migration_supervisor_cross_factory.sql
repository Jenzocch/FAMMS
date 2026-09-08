-- ============================================================================
-- Supervisor 也能設成跨廠（例如：QA 巡多間工廠，不是只管一間）
--
-- 原本只有 manager/director/admin 是跨廠角色；supervisor 一律被綁在自己的
-- factory_id。這裡把規則放寬成：supervisor 的 factory_id 留空（NULL）＝跨廠，
-- 跟現有 manager/director/admin 一樣看得到全部工廠；supervisor 有填 factory_id
-- 的話，行為完全不變（只看自己那間）。
--
-- 這是 opt-in，不是把每個 supervisor 都變跨廠：只有刻意不掛工廠的帳號才會
-- 跨廠，現有掛了工廠的 supervisor（如果有）不受影響。
--
-- Idempotent — safe to re-run. Run any time after migration_rls_1_helpers.sql.
-- ============================================================================

CREATE OR REPLACE FUNCTION app_cross_factory() RETURNS BOOLEAN
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(app_role() IN ('manager','director','admin'), false)
     OR COALESCE(app_role() = 'supervisor' AND app_factory() IS NULL, false)
$$;
