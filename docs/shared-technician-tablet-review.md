# 共用技師平板：實作前唯讀複核

日期：2026-09-28。範圍是目前 checkout 的程式與 SQL 檔；未連線正式 Supabase，故 RLS、grants、migration 是否已部署均屬**未驗證**。本檔不表示可上線。

## 結論

設計文件的身份分離是正確的：

| 資料 | 不可混用的意義 |
| --- | --- |
| verified actor | 實際驗證過的 JWT 主體；共用模式中必須是設備帳號。 |
| declared performer(s) | 值班人自述實際處理者；可多人，但不是個人身分驗證。 |
| assigned users | 既有 `incidents.assigned_user_ids` 的派工/可見性資料；不能因回報 performer 而改寫。 |

目前程式只有「共用裝置帳號建立報修時必填實際回報人」這個局部行為，不能安全地延伸為本功能。第一版必須新增受限的設備工作流與伺服器端寫入邊界；不能用選姓名去替換 JWT、`updated_by_id`、角色或 RLS。

## 阻擋正式上線的具體缺口（已由源碼確認）

1. **現有 shared-device 管理不足以成為設備授權模型。** `profiles.is_shared_device` 僅由 `src/app/api/admin/users/route.ts:22,79,159` 及 `src/app/api/admin/users/[id]/route.ts:30,87` 作普通 profile 布林欄位管理；沒有 factory-bound roster、enabled device 狀態或 server-side device binding。任何具 `manageUsers` capability 的人目前可建立/勾選任意 shared-device profile，且 API 不強制該帳號為 technician。它可作 MVP 的設備帳號標記/管理入口，不能單獨保證「僅 admin 啟用、同廠 roster、停用設備即拒絕」。

2. **登入與 proxy 沒有平板入口/隔離。** `src/app/login/page.tsx:19-31` 只做密碼登入並一律導向 `/dashboard`；`src/proxy.ts:55-76` 對所有 authenticated login page 一律導向 dashboard，且沒有 `/tablet/*` 的 pairing 起點、設備 route guard 或 session type 檢查。設備 JWT 若沿用 dashboard，即可進到個人登入所能操作的 UI。

3. **`getCurrentUser` 不傳回、也不驗證 shared-device 身分。** `src/lib/auth.ts:61-89` 僅讀 profile factory/name/role/active；`requireActiveUser` (`:96-109`) 只能拒絕 inactive profile，不能證實此 JWT 對應 enabled device、該 factory 或 roster。因此僅以 client storage 選人必然可被偽造/過期資料繞過。

4. **現有進度寫入會把可編輯姓名偽裝成審計姓名。** `src/components/incidents/ProgressUpdate.tsx:61` 用 `userName` 預填，但 `:161-162` 直接寫 client editable `updated_by` 與 JWT `updated_by_id` 到 `incident_updates`。此表只有這兩欄（`supabase/SYNC_SCHEMA_LATEST.sql:259-269`；基礎 schema 還明示 RLS disabled，`supabase/schema.sql:764-775`），沒有 device id、verified actor 與多位 performer 關聯。不可重用它作平板提交端點。

5. **直寫 incidents 的 RLS 不是設備最小權限。** 目前 board 與 ProgressUpdate 使用 browser Supabase client；`src/app/(dashboard)/incidents/page.tsx:76-116` 是普通個人帳號的 assigned/reported query。可見的 migration `supabase/migration_security_phase4_active_account_gate.sql:116-129` 以 active + same-factory 或 `assigned_user_ids` 放行 incidents SELECT/UPDATE，未檢查 device enabled、roster、declared performer 或窄欄位。`migration_rls_5_incident_field_guard.sql:36-74` 雖阻止 technician close/reopen/受保護欄位，但仍允許其餘 direct update；不能由 UI 隱藏取代 server/DB policy。

6. **現有 offline queue 會跨使用者錯送，且會遺失被拒絕資料。** `src/lib/offline-queue.ts:18-58` 的資料模型只有 report + `userId`，無 device/original performer/incident version/state；`src/components/shared/OfflineQueueFlusher.tsx:38-60` 在連線後使用「當時瀏覽器的」Supabase session 重送，server rejection 就刪除。若 A 留草稿、B 接手平板，這會把 A 的內容以 B/設備 session 寫入或直接丟失。這個 queue 目前只服務 **新報修**，不支援進度更新，不能直接共用。

7. **`is_shared_device` 現況僅處理報修人，且名單未依工廠界限。** `src/lib/hooks/useReporterAccounts.ts:18-45` 對所有 active profiles 讀取姓名，並僅在 login profile 有 flag 時要求挑選 reporter；`src/lib/incidents/submitIncidentReport.ts:49-57` 也只拒絕空 reporter name。這不提供受限 roster，也不能保證 selected person 同廠、active 或被此設備允許。

8. **正式 DB 防線尚未證實。** repository SQL 有多份可重跑、歷史/聚合 schema；本次沒有 `pg_policies`、`relrowsecurity`、grants、trigger/function 或 production migration-history 證據。尤其 `incident_updates` 的 deployed RLS 必須先確認，否則不能聲稱 browser direct insert 安全。

## 最小第一版（刻意不過度設計）

- 保留既有個人密碼登入、dashboard 與 supervisor close/RCA/accept 行為。新增一個 `technician` 專用設備帳號，**絕不**把 admin 或個人 JWT 留在平板；不新增角色。
- **MVP 可沿用現有 UserManager / `profiles.is_shared_device` 建立帳號。** 真 admin 建立一個固定 factory 的 `technician + is_shared_device=true` 帳號，人工在平板輸入其專用密碼；此為已授權的低摩擦首次啟用，不需要先做 pairing code。另新增最小 device-binding/roster 記錄與 server validation；不要把 checkbox 或空 roster 解釋成「所有同廠人員」。配對碼可作第二階段，解決免輸密碼的自助安裝與換機，不是安全驗證的替代品。
- 僅做 `/tablet/pilih-teknisi`、`/tablet/incidents`、進度「記錄工作」：選 1+ 位 roster performer、寫 note/合法 technician status。平板不可接受、RCA、正式 close、變更派工或改 due date。
- 新增單一 server route/action/RPC：由 device JWT 推導 verified actor/device/factory，驗證 device enabled、profile active、performer 皆仍 active 且在 roster、incident 在 device factory 且可更新；交易內寫 progress event 與 performer relation，帶 `request_id` 冪等鍵。
- 第一版只做**本機草稿**，不自動送離線進度、也不離線上傳照片。切人/idle 時保存 `original_performer_id`，新選人不得送出或重新署名；重連必須讓原人重新選回後再驗證和提交。這比把現行 report queue 擴充到背景同步更安全。
- 管理員停用 device 或 technician 後，下一次 tablet read/write 立即拒絕並回選人/disabled 畫面；profile `is_active` 同時維持既有 ban 的防線。

## 按檔案分組實作 checklist

### DB、RLS 與安全契約（先完成，未完成不得開寫入）

- [ ] MVP 新 migration：最小 `shared_devices`（auth user、factory、label、enabled、created/disabled audit）與 roster 關聯表；外鍵及 unique constraint，禁止 device factory 改寫造成歷史混亂。可在第二期加 pairing-code table；它不是本版寫入安全的前置條件。
- [ ] 新 migration：`incident_update_performers(update_id, performer_profile_id)`；在 `incident_updates` 增 `shared_device_id`、`verified_actor_user_id`、`request_id`（unique）。`updated_by_id` 保留為 JWT verified actor，不能塞 performer。
- [ ] 若第二期加入免密碼配對：pairing code 要 hash、expiry、single-use/atomic redemption；不可儲存 plaintext code，不能由 client 帶入 factory/role/device id。MVP 則使用 admin 已建立的專用設備帳密，仍不可讓 admin session 留在平板。
- [ ] 建受限 RPC 或 server route 所需 DB function/trigger；從 `auth.uid()` 推導 actor，驗 device enabled、same factory、roster/active、incident state/version、allowed technician status，並原子寫 event + performers。拒絕 client supplied actor/role/factory。
- [ ] 盤點並收斂 `incident_updates` RLS/grants；移除平板對它的 generic direct insert。針對 `incidents` 的 UPDATE 加 DB 層 status transition/actor policy，不能只依 `ProgressUpdate` UI。
- [ ] staging 以真實 JWT 測試：跨廠、非 roster、停用人、停用設備、偽造 performer、直呼叫 close/RCA/accept、重複 request；保存 `pg_policies`、RLS flags、grants、function definitions 和測試輸出。

### Auth、admin 與 routes

- [ ] `src/lib/auth.ts`：新增 `requireActiveSharedDevice()`（或相等 server-only guard），同時檢查 JWT profile active、technician role、`is_shared_device`、one-to-one enabled device 和 factory；不要把 client 的 selected name 變成 CurrentUser。
- [ ] `src/app/login/page.tsx`、`src/proxy.ts`：加平板入口與 `/tablet/*` routing。MVP 可用既有專用設備帳密登入，但成功後必須從 server profile/device binding 判斷並導向 tablet route；個人登入仍到 `/dashboard`，不可在 client 只靠 checkbox 分流。第二期 pairing start 可匿名但只能兌換短碼。
- [ ] 新 `src/app/api/admin/shared-devices/*`：真 admin gate、roster update、enable-disable，並把既有 `is_shared_device` profile 原子綁定為一台 device。MVP 可復用通用 users POST 建帳號，但新增 server guard 必須強制 technician + single factory + device binding；不要把通用 users PATCH 當作完整設備 API。
- [ ] 新 `src/app/api/tablet/*`：roster、team/my incident query、progress submit；每一個 endpoint 都用 shared-device guard 和 server-side factory restriction。admin disable 後 API 即拒絕；如要立即斷現有 Auth session，呼叫 Auth admin revoke/ban 或在每 request 強制 enabled check，兩者的行為需被測試。

### Tablet UI、工單與審計顯示

- [ ] 新 `/tablet` layout/pages：大觸控 roster buttons、目前人、`Ganti pengguna`、`Tugas saya`/`Tugas tim`。team query 僅 server-enforced device factory；my query 以 **selected performer ID** 對 `assigned_user_ids` 做 array contains。多指派查詢依 `src/app/(dashboard)/incidents/page.tsx:76-116` 的分 query + merge 語義，不用不可靠 `.or()`。
- [ ] 新 tablet-only progress form；不要 import/reuse `src/components/incidents/ProgressUpdate.tsx` 的 direct Supabase insert。UI 明示「自述處理人」，不稱「登入者」或「已驗證本人」。
- [ ] progress timeline/print/audit query 增加兩列：設備 verified actor 與 declared performer(s)；assigned users 仍只在派工區顯示。
- [ ] `src/lib/permissions.ts` 與 close/RCA/accept APIs 保持 verified role gate；平板 technician 不顯示亦不可直呼叫 privileged endpoints。

### 草稿、idle、offline

- [ ] 新 tablet 專用 IndexedDB namespace/schema，不碰 `src/lib/offline-queue.ts` 的 `pending_reports`。草稿含 device id、incident id、original performer id、payload、created/updated time、state；避免預設持久保存照片。
- [ ] 選人閒置约 10 分鐘只清 selected performer context，不登出 device session。切換使用者如有 dirty draft，提供保留/回草稿/明確丟棄；保留者 immutable owner，只有原人重新選回且仍 active/roster 才能提交。
- [ ] 無網路時只顯示 `Belum terkirim`、保存草稿；不能顯示成功、背景重送或繞過 server revalidation。日後要同步時另設 queue item lifecycle、idempotency、incident version/conflict/disable handling，並先安全處理 photo。

## 行為驗收（12 項）

1. 個人 technician/supervisor 密碼登入仍到 `/dashboard`；tablet pairing 不會留下 admin cookie/session。
2. MVP 中只有 verified true admin 能把既有 `is_shared_device` technician profile 綁定/啟用為設備並管理 roster；非 admin、Account Admin 與 client 偽造 factory/role 均被拒絕。
3. MVP 設備帳密登入成功後只到 tablet route，且永遠不保留 admin session。若第二期加入 pairing code，再驗收一次、過期、重放、跨 factory 都失敗，且錯誤不列出其他 factory/person roster。
4. 設備 JWT 的 profile 永遠是 active technician + enabled shared device；selected name 不會改 JWT `sub`、role 或任何 RLS scope。
5. tablet roster 只顯示該設備 factory 的 active、explicitly allowed technicians；沒有「其他姓名」自由輸入 fallback。
6. 選 A 時 `Tugas saya` 正確含 A 在 `assigned_user_ids` 的多指派案件；`Tugas tim` 不洩漏別廠；assigned users 不因選 A 或提交而變動。
7. tablet 提交單人/多人 performer 後，event 的 verified actor 是設備帳號，performers 是分開 relation；timeline 清楚並列兩者，不稱 performer 已驗證。
8. 用 client payload 偽造 actor、B performer、non-roster person、inactive person、不同 factory incident 或 closed/stale incident，server/RPC 都拒絕且不寫任何部分資料。
9. technician device 無法透過 UI 或直接 HTTP 呼叫 accept、RCA、正式 close、改 due date/assignment；個人 supervisor 的既有正式 close 流程仍可用。
10. A 留有草稿後切至 B：B 不可提交/改署名 A 的草稿；A 重選且仍 roster 才能恢復。10 分鐘 idle 也遵守同一規則。
11. 離線只保留標示未送的草稿；重連需由原 performer 重新走 server validation。停用 device/person 或 incident 有衝突時不自動覆寫、提供明確人工處理。
12. admin 停用 device 或 roster 中的 technician 後，既有 tablet session 的下一次讀/寫即 403/disabled；停用者不再可選，歷史 performer/actor 審計保留。

## 原型檢查

已唯讀檢查 `docs/prototypes/shared-technician-tablet.html`。它清楚標為 demo、無真實 token/session（`:145,161,175`），並正確呈現 self-declared 選名（`:180-184`）、`Tugas saya` 多指派語義（`:304-306`）、actor/performer/assignment 分離（`:203-215,341-353`）、非 close 的進度表單（`:203-210`）、以及原人綁定 draft/idle（`:287-302,358-383`）。這些是可保留的 UX 方向，不可當成後端安全已完成。

實作前應回補的兩項具體原型缺口：

1. **MVP 首次啟用不應把 demo pairing code 變成必要產品流程。** 原型 `:166-175,395-400` 的第一條 shared path 是 `DEMO-1234` 配對；目前較小的可交付範圍是 admin 先在既有 UserManager 建立專用設備帳號、平板以該帳密登入。實作/原型應將 pairing 視為第二期 optional flow，或明確改成「已由 admin 啟用的設備登入」，以免需求方誤以為 code infrastructure 是第一版阻擋項。
2. **尚未呈現 offline/disabled 的 fail-closed 結果。** 原型提交永遠直接把 update push 入記憶體並顯示 saved（`:385-393`），沒有 `Offline · belum terkirim`、重新驗證、device/person disabled 或 incident conflict 的狀態。第一版至少在提交區和選人頁有明確 disabled/offline 草稿畫面；不得以該成功 toast 暗示離線資料已保存或已同步。
