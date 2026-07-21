# FAMMS 開發教訓庫（LESSONS）

> 這份文件記錄開發過程中**真實踩過的坑**：症狀 → 根本原因 → 修法 → 以後怎麼避免。
> `CLAUDE.md` 講「系統怎麼運作」；這份講「哪裡炸過、為什麼」。
> 新增功能或修 bug 之前先掃一眼相關分類——這裡每一條都至少付過一次代價。

---

## 一、資料庫 / Supabase

### 1. 「快速修復腳本」是資安災難的入口
- **症狀**：遇到「送出失敗 / refresh 資料不見」，repo 裡有兩支「一鍵修好」腳本（`SETUP_RUN_ONCE.sql`、`fix_permissions_reset.sql`）。
- **根本原因**：兩支腳本的修法都是「對所有表 `DISABLE ROW LEVEL SECURITY` + `GRANT ALL ... TO anon`」——把整個資料庫對瀏覽器裡人人可見的 anon key 完全開放。而且其中一支被 README 推薦為日常故障排除手段。
- **修法**：兩支腳本已刪除；README 改為引導跑 `SYNC_SCHEMA_LATEST.sql`（欄位缺失才是那個症狀的真正原因）。
- **教訓**：**權限錯誤永遠不准用「全開權限」來修**。症狀是 INSERT 失敗 + SELECT 空 → 九成是欄位缺失或 RLS policy 沒覆蓋到，對症下藥。

### 2. `REVOKE ... FROM anon` 不等於關上洞
- **症狀**：跑完 phase1 revoke 後，production 檢查仍顯示 17 個函式可被 anon 執行。
- **根本原因**：Postgres 預設把每個新函式的 EXECUTE 授給 `PUBLIC` 偽角色，而**每個角色（含 anon）都隱含是 PUBLIC 的成員**。只 revoke anon 自己的授權，anon 仍能透過 PUBLIC 繼承執行。
- **修法**：`migration_security_phase3_function_execute.sql` — 先明確 GRANT 給 `authenticated`（RLS policy 內部要呼叫這些 helper），再 `REVOKE ... FROM PUBLIC`。
- **教訓**：查權限要查「**有效權限**」（含 PUBLIC / 角色繼承），不是只查直接授權。

### 3. RLS 佈署完成後，新建的表會靜默漏網
- **症狀**：production 檢查發現 `telegram_report_drafts` / `vendors` / `parts_requests` 三張表 RLS 全關——任何登入帳號都能跨廠直接讀寫。
- **根本原因**：三張表都是在 staged RLS 佈署（`migration_rls_2/3`）**之後**才建立的，佈署腳本當然不認識它們，而 `CREATE TABLE` 預設 RLS 是關的。
- **修法**：`migration_rls_7_missing_tables.sql`。
- **教訓**：**每張新表的 migration 必須自帶 `ENABLE ROW LEVEL SECURITY` + policy**（純 service-role 表就開 RLS 不給 policy）。另外定期跑 `pg_tables WHERE NOT rowsecurity` 檢查。

### 4. 一次性的佈署工具函式不要留在 production
- **症狀**：`rls_set(tables, on_off)` — 一個專門用來「開／關 RLS」的 helper — 留在 production 且 PUBLIC 可執行。
- **教訓**：rollout 完成後 `DROP` 掉工具函式。這次它剛好是 SECURITY INVOKER（呼叫者沒 ALTER TABLE 權限所以打不穿），但這是運氣不是設計。

### 5. schema 落後的 DB 不能把功能整個弄壞
- **症狀**：某環境沒跑最新 migration，缺一個欄位，整個結案／狀態更新功能直接報錯。
- **修法**：對「選配欄位」的寫入採**降級重試**：抓 `42703`（Postgres）或 `PGRST204`（PostgREST schema cache），把該欄位從 payload 拿掉重試一次。範例見 `close/route.ts` 的 `hygiene_confirmed_at`、`ProgressUpdate` 的 `estimated_completion_date`。
- **教訓**：新欄位上線 = 程式碼要能在「DB 還沒跟上」時活著；同時 `SYNC_SCHEMA_LATEST.sql` 保持冪等、每次 pull 後重跑。

### 6. 刪除連鎖（CASCADE）會靜默清掉整個歷史
- **症狀**：刪一台機器／區域／工廠，底下所有工單、PM、成本紀錄無聲蒸發。
- **修法**：`migration_delete_protection.sql` 把 CASCADE 改 RESTRICT。
- **教訓**：主檔（master data）的外鍵預設用 RESTRICT，想清資料就讓人明確地逐層刪。

### 7. supabase-js 的 `.or()` 配陣列 contains 不可靠
- **症狀**：多人指派的工單在看板上時有時無。
- **根本原因**：`.or('assigned_user_ids.cs.{uuid},...')` 在 supabase-js 裡對 array-contains 的行為不穩定，會靜默漏資料。
- **修法**：拆成多個獨立查詢（assigned / reported 各自查），程式端用 Map 去重合併。看板與搜尋頁都要用同一套。

### 8. 併發寫入用「重算」不用「累加」，用「唯一約束」不用「先查再寫」
- 兩人同時完成同一筆投影 PM → `pm_records(pm_schedule_id, scheduled_date)` 唯一約束（`migration_pm_records_unique.sql`），不是先 SELECT 再 INSERT。
- 照片數量 `photo_count` → 每次從 storage **重新清點**寫回，不是 `count + n` 累加（props 可能是舊值）。
- 弱網重送表單 → 表單實例產生一次 `clientRequestId`，後端據此判重（同一 id = 同一單）。

---

## 二、安全（應用層）

### 9. UI 藏起來 ≠ 權限控管
- **症狀**：技師不能改截止日／結案——但只在 React 元件裡擋，開 devtools 直接打 REST 就繞過。
- **修法**：三層都要有——UI 隱藏（體驗）、API route 檢查（`PERMISSIONS.*`）、DB 層強制（RLS policy + `migration_rls_5` 的欄位守門 trigger）。
- **教訓**：**每一條角色規則寫完，問一句：「直接打 API 能不能繞過？」**

### 10. 授權欄位「查表核發」，不信 client 傳來的值
- **症狀**：建帳號 API 若直接信 body 的 `role`，一個帳號管理員就能發 admin 帳號給自己（提權）。
- **修法**：client 只傳 `custom_role_key`，後端查 `custom_roles.base_role` 決定實際 tier；直接傳 `role: 'admin'` 的路徑加 `isTrueAdmin` 檢查（POST/PATCH/DELETE 三個 handler 都要）。
- **教訓**：任何「等級／角色／價格」類欄位一律 look-up-don't-trust。

### 11. Secret 比對用 constant-time
- 所有 bearer token / webhook secret 比對改用 `timingSafeEqualString`（`src/lib/timing-safe-equal.ts`，含長度補齊），不用 `===`。共四處：QC/FQMS、Gudang 回寫、cron、Telegram webhook。

### 12. 匯出使用者輸入的文字要防公式注入
- **症狀**：回報者姓名若填 `=cmd|...`，匯出的檔案在 Excel 打開時會被當公式執行。
- **修法**：`src/lib/csv-export.ts` — 開頭是 `= + - @ \t \r` 的儲存格前置單引號；同時 RFC 4180 跳脫、CRLF、UTF-8 BOM（Windows Excel 中文）。
- **相關**：`xlsx` 套件本身有無修補的 high 級漏洞（Prototype Pollution + ReDoS），已整包移除改 CSV。**`npm audit fix --force` 的建議不能盲跑**——它當時的「修法」是把 Next 16 降到 Next 9。

---

## 三、前端 / React / Next.js

### 13. 這個專案是 Base UI，不是 Radix
- **沒有 `asChild`**。`<Link asChild>` 直接壞。用 `onClick={() => router.push(...)}`、className 直接放在 trigger 上。

### 14. `createClient()` 每次呼叫都是新實例
- **絕不能**把 `supabase` 放進 `useEffect` 依賴陣列——每次 render 都是新物件，效果會無限重跑。mount-only 載入用 `[]` + 一行說明註解 + scoped eslint-disable。

### 15. 未生成型別的 Supabase client 會把 to-one 關聯推斷成陣列
- `machine:machines(...)` 實際回單一物件，型別卻是陣列。在查詢邊界宣告本地 row interface 一次轉型，不要在使用處到處 `as any`。

### 16. WIB 時區日期 bug——同一個坑踩了三次
- **症狀**：`new Date().toISOString().split('T')[0]` 取的是 UTC 日期，在印尼（UTC+7）凌晨 0-7 點會晚一天：逾期的保養顯示成「今天到期」、日報少算。
- **修法**：一律用 `wibTodayStr()`（`src/lib/pm.ts`）。
- **教訓**：**任何「今天」的字串**都不准手寫 `toISOString().split`，先搜有沒有現成 helper。這 bug 在 cron、FQMS route、PMDueList 各自出現過一次——重複出現本身就是教訓：修 bug 時要 grep 同 pattern 的其他實例。

### 17. PM 週期日期絕不能鏈式累加
- **症狀**：1/31 的月保養 → addMonths 夾成 2/28 → 從 2/28 再加一個月 → 3/28…原始的「31 號」永遠回不來；閏年 2/29 的年保養永久退化成 2/28。
- **修法**：每一期都用 **anchor + n×interval** 從錨點原始日期重新計算（`src/lib/pm.ts` 檔頭有完整規則），且全程 UTC（混用本地時間函式會讓結果隨 server 時區漂移）。

### 18. 手機拍照用兩個獨立 input
- 單一 `<input type="file" accept="image/*">` 交給 OS 決定選單內容，Android 各機型行為不一致（有的沒相機、有的沒相簿）。一個帶 `capture` 一個不帶，兩顆明確的按鈕。

### 19. 語音輸入只進可編輯欄位，永不自動送出
- 工廠噪音下辨識會錯。`SpeechMicButton` 把文字 append 進 textarea 讓人先改再送。瀏覽器不支援時整顆按鈕自我隱藏。

### 20. 加 blur / 動畫要同時給降級
- `backdrop-filter` 要配 `prefers-reduced-transparency` 與不支援時的純色 fallback；動畫要配 `prefers-reduced-motion`。彈簧參數集中在 `src/lib/motion.ts`，不要每個元件自己發明數字。

---

## 四、業務邏輯設計

### 21. 功能「從來沒觸發過」時，先查它依賴的欄位有沒有人在寫
- **症狀**：RCA 強制門檻與重複故障偵測上線以來一次都沒觸發過。
- **根本原因**：兩者都 key 在 `failure_code_id`（100+ 碼故障樹），但**沒有任何回報路徑寫入這個欄位**——它是死欄位。功能邏輯完全正確，餵它的資料不存在。
- **修法**：改 key 在每張單都真的有的 `(machine_id, incident_type)`。
- **教訓**：寫「偵測／統計」類功能時，先確認 key 欄位在真實資料流裡**有被寫入**；上線後拿真資料驗一次「會觸發」。

### 22. 每個強制門檻都必須自帶解鎖路徑
- **症狀**：RCA 門檻擋住結案,但整個 app 沒有任何地方可以填 RCA——工單永久卡死。
- **教訓**：做 gate 的同一批工作裡必須包含滿足 gate 的表單／流程,而且解鎖入口要出現在被擋住的當下（inline 表單），不是叫使用者自己去找。

### 23. 跨管道的行為要共用同一條規則
- 標題自動產生（描述前 60 字）web 表單與 Telegram `/lapor` 用同一條截斷公式；重複故障偵測兩邊共用 `checkPotentialRepeatFailure()`；PM checklist 驗證兩條 API 路徑共用 `checklistIncompleteError()`。
- **教訓**：同一條業務規則出現第二個入口時，先抽 shared lib，不然兩邊必然漂移。

### 24. 給誰看、在哪看，跟做什麼一樣重要
- 重複故障的確認提示只給 supervisor+ 看、出現在新工單自己的詳情頁；技師 ETA 與主管 due date 是兩個欄位（被考核的人不能自己移動考核基準）。

---

## 五、i18n

### 25. 三語言檔葉節點數必須永遠相等
- zh / en / id 三份 locale 檔每次改完都跑 leaf-count 檢查（Python 遞迴數葉子）。少一個 key = 該語言使用者看到 raw key（如 `dash.stale`）或中文。
- 硬編中文字串會直接漏給印尼技師看。所有 label 走 `t(key, 'zh fallback')`。
- 技術名詞（bearing、VFD、PLC…）**不翻譯**，維持英文——這是產品慣例不是疏忽。

---

## 六、流程 / 協作

### 26. 別人（或另一個 AI）的稽核報告要獨立驗證再動手
- 這輪兩份外部稽核（Codex、本機 session）的結論都先在 repo 裡重新驗過（`npm audit`、`jscpd`、grep 實際碼）才動手——數字對過，但「哪些值得修」的判斷常常要修正（例如 44 個 clone 裡只有 4 組真的值得抽）。

### 27. PR 會在你不知情時被 merge——每次推送前先對 git 實況
- **症狀**：一個 commit 推上去的瞬間 PR 剛好被 merge,結果它不在 main 裡,差點丟失（`migration_rls_7` 事件）。
- **教訓**：每次要開 PR 或推送前先 `git fetch origin main && git log origin/main..HEAD` 對實況；merge 後追加的工作開**新** PR,不重用已 merge 的。

### 28. 給非工程師跑的 SQL：直接貼全文 + 自帶驗證查詢
- 使用者從 GitHub 複製檔案常拿到未 merge 的舊版（發生過三次以上）。改為：SQL 直接貼在對話裡、每份腳本結尾附 sanity-check SELECT、請對方把結果表格貼回來核對。
