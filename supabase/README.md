# Supabase SQL — 怎麼跑這些檔案

這個資料夾裡的 `.sql` 都是貼進 **Supabase → SQL Editor → New query → Run** 執行的。

> ⚠️ **最重要的一件事**：貼的是「**檔案打開後裡面的 SQL 文字**」，不是檔名／路徑。
>
> - ❌ 錯：`supabase/migration_pm_assignee.sql` ← 這是路徑，SQL Editor 會報 `syntax error`
> - ✅ 對：`ALTER TABLE pm_schedules ADD COLUMN ...` ← 打開檔案後真正的內容
>
> 幾乎所有檔案都用 `IF NOT EXISTS` / `ON CONFLICT DO NOTHING` 寫成，**重複跑也不會壞**。不確定時再跑一次是安全的。

---

## 情境一：全新環境（新的 Supabase 專案）

照順序各跑**一次**，schema 就一次到位：

| 順序 | 檔案 | 做什麼 |
|---|---|---|
| 1 | `schema.sql` | 建立所有表 + 3 個工廠 + 5 大故障分類 |
| 2 | `seed_fault_tree.sql` | 100+ 標準故障代碼（中英對照） |
| 3 | `setup_all.sql` | 補齊所有後加的欄位、權限、storage bucket、incident types（**已含 PM 負責人欄位**） |
| 4（可選） | `seed_demo.sql` | 範例工作區 + 機台，方便測試 |
| 5（可選） | `seed_din_machines.sql`、`seed_sja_olt_machines.sql` | 各廠初始機台 |
| 6（可選） | `seed_demo_incidents.sql` | 跑過一輪流程的範例工單 |

`setup_all.sql` 跑完最後會印出 ✅ 檢查結果，看到表名、admin、demo 工單就代表成功。

> `SETUP_RUN_ONCE.sql` 是 `setup_all.sql` 的精簡修復版（補欄位 + 權限 + bucket + demo），
> 兩者擇一即可；現有資料庫想「一鍵修好」用它最快。

---

## 情境二：現有環境，之後又加了新功能

每次新增功能我會給你一個 **新的 `migration_*.sql`**。你只要：

1. Supabase → **SQL Editor** → New query
2. 打開那個檔案，**整個內容**全選複製貼進去
3. 按 **Run**

需要的話我會把完整 SQL **直接貼在對話裡**，你連檔案都不用開，直接複製即可。

---

## 檔案速查

### 核心
- `schema.sql` — 完整資料表結構（從零建置用）
- `setup_all.sql` — 累積所有後續變更的「一次到位」腳本
- `SETUP_RUN_ONCE.sql` — 精簡修復腳本（補欄位 + 權限 + bucket + demo）
- `storage_setup.sql` — 只建 storage buckets（incident-photos 等）
- `bootstrap_admin.sql` — 建立第一個 admin 帳號（註冊在 app 內關閉）

### Seed（範例 / 初始資料）
- `seed_fault_tree.sql` — 故障代碼樹
- `seed_demo.sql` — 範例工作區 + 機台
- `seed_din_machines.sql` / `seed_sja_olt_machines.sql` — 各廠初始機台
- `seed_demo_incidents.sql` — 範例工單（FIT-DEMO-*，可重跑）

### Migration（後加的 schema 變更，皆 idempotent）
- `migration_pm_assignee.sql` — PM 保養負責人（assigned_user_ids / assigned_to）
- `migration_multi_assignee.sql` — 工單多人指派 + 技師只看自己的案件
- `migration_incident_type_i18n.sql` — 問題類別多語（zh / en / id）
- `migration_nullable_factory.sql` — 允許跨廠帳號 / 工單
- `migration_nullable_machine.sql` — 允許沒有指定機台的工單
- `migration_accepted_at.sql` — incidents 加 accepted_at / accepted_by_id
- `migration_incident_location_note.sql` — 工單自由填寫地點
- `migration_missing_tables.sql` — 補 incident_updates / audit_logs / maintenance_logs

> 註：`migration_*` 的變更大多已併入 `setup_all.sql`，所以**全新環境只跑情境一即可**，
> 不必逐個 migration 再跑一遍。這些單檔保留是給「只想補某一項」的舊資料庫用。

### Fix（修特定問題）
- `fix_permissions_reset.sql` — 修「送出失敗 / refresh 資料不見」（RLS / 權限）
- `fix_incident_types_dedupe.sql` — 修問題類別重複的舊資料
