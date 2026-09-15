-- ============================================================================
-- 滅火器（APAR）到期追蹤 — 加在既有的 machines/asset 架構上，不建新表
--
-- machines.asset_category 早就不只是「機器」了（machine/item/pipe/electrical/
-- facility，見 AssetManager.tsx）——APAR 只是再加一種 category: 'safety'。
-- 一樣掛區域（area_id 本來就有）、一樣能報事件，只多兩個欄位：到期日、上次
-- 提醒時間（避免每天洗版）。
--
-- Idempotent — safe to re-run.
-- ============================================================================

ALTER TABLE machines ADD COLUMN IF NOT EXISTS expiry_date DATE;
-- 用途不限 APAR——任何有「到期日/該換了」概念的資產（滅火器、消防栓壓力
-- 檢驗、其他有效期物品）都可以填這欄，asset_category 目前只有 'safety' 會
-- 在 UI 顯示這個欄位。

ALTER TABLE machines ADD COLUMN IF NOT EXISTS last_expiry_alert_at TIMESTAMPTZ;
-- cron/sla-check 的到期掃描拿來做「大約一天內不重複提醒同一項」的節流用，
-- 跟 incidents.last_sla_alert_at 是同一個模式。
