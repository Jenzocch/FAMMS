-- ============================================================================
-- APAR 到期 → 自動向 Gudang One 送出叫料單（線路①的自動觸發版本）
--
-- 前置：migration_apar_expiry.sql（machines.expiry_date / last_expiry_alert_at）
-- 必須先跑過。這支只加一欄，用來記錄「這個到期週期已經送過叫料單了」，
-- 避免同一支滅火器每天 Telegram 重複提醒的同時，也每天重複送一張叫料單
-- 到 Gudang One。
--
-- Idempotent — safe to re-run.
-- ============================================================================

ALTER TABLE machines ADD COLUMN IF NOT EXISTS gudang_requested_for_expiry DATE;
-- 存的是「已經為了哪一個 expiry_date 送出過叫料單」。cron/sla-check 只在
-- 這欄跟目前的 expiry_date 不一樣時才會送新單——所以換新滅火器、改了
-- expiry_date 之後，下個週期會自動重新允許送單，不用手動清欄位。
