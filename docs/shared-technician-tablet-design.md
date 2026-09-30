# FAMMS 共用技師平板模式設計

> 2026-09-29 修訂：四人跨廠、沒有個人登入帳號。下列同廠/profile 名單內容為前版設計紀錄，不再是啟用前提；最新需求與執行/驗收計畫以 [姓名名冊修訂](shared-tablet-name-roster-plan-20260929.md) 為準。技師使用獨立姓名名冊，設備使用管理員明確勾選的廠區允許名單。尚未上線。

狀態：第一版已在本機實作；migration 尚未套用、Supabase staging/API/實機測試仍未驗收，因此尚未上線。介面主要使用印尼文；本文件以繁體中文記錄設計與安全界線。

## 目標與現況

四位技師 Pak Dasir、Suwardi、Wiwit、Rudi 輪流使用同一台平板，操作要快，只需記錄「大概由誰實際處理」；原有個人帳號登入流程完全保留。共用模式是設備使用方式，不是新增技師角色，也不增加任何權限。正式 roster 仍以系統內同工廠、啟用中的技師 profile 為準，不以本文件的文字名單建立身份或權限。

目前 `/login` 以 `signInWithPassword` 登入後前往 `/dashboard`；`proxy.ts` 保護登入後頁面/API。工單列表在 `src/app/(dashboard)/incidents/page.tsx`，依登入者角色及其 ID 查詢；指派人存在 `incidents.assigned_user_ids`。進度表單在 `ProgressUpdate.tsx`，目前從登入者 `userName` 預填操作者，但欄位在沒有姓名時可編輯；提交時直接以目前 Supabase JWT 寫 `incident_updates`，`updated_by` 是輸入文字、`updated_by_id` 是 JWT 的 `user.id`。因此文字姓名只是自述，不能充作經驗證身份或覆寫 `user.id`。

權限界線：`acceptIncident`、`closeIncident`、`submitRCA` 僅 supervisor+；technician 可指派。技師「完成維修／回報已處理」必須是可由技師執行的進度回報，與主管「正式結案」是不同動作、不同權限。任何被選中的技師姓名都不能解鎖接受、RCA、正式結案或其他角色權限。

另有 `profiles.is_shared_device` 欄位的 schema/admin 管理程式碼，目前僅供報修人欄位避免預設設備名；這不是共用人員認證或授權。Repo 內 migration 文字記載 RLS 政策，但本次未連正式資料庫，無法確認部署版本、實際政策與 grants。

## 建議認證／授權方案

採用「專用共用設備帳號 + 登記設備 + 可選自述處理人」：管理員透過自己的已登入帳號授權平板，系統為該設備綁定一個專用 Supabase Auth 帳號／profile（`role=technician`、`is_shared_device=true`，一設備一帳號；不新增 role）。平板持有的是設備帳號自己的 session，不是管理員或個別技師的 JWT。不要把個人 JWT 借給平板、模擬 `auth.uid()`、在 localStorage 偽造身份，或讓前端持有 service-role key。

MVP 在 Settings → 使用者管理先由系統管理員建立工廠綁定的 technician 專用共用裝置帳號，再設定平板名稱與允許選取的 active 技師名單；目前名單為 Pak Dasir、Suwardi、Wiwit、Rudi，但儲存時必須逐一選取實際 profile。尚未建置一次性 pairing code，不應在介面或說明中宣稱支援。登入/更新寫入由設備 JWT 作為 verified authenticated actor；選取的技師只作 declared performer(s)，需由伺服器驗證仍在此設備 roster/工廠且 active。服務端不可接受客戶端提供角色、工廠、actor id 或任意 roster。

如此保留 Supabase JWT/RLS 的真實 actor 身份，並可讓裝置停用撤銷 session。共用帳號不得以管理員或 supervisor role 建立；重要主管操作需要主管以個人帳號重新驗證/切回個人登入。若希望 actor 必須是實際技師本人，就必須要求每人登入或輸入個人 PIN/憑證做額外驗證；單按姓名不符合該保證。

**self-declared performer 不是身份驗證。** 名稱表示當班同事自述「誰實際處理」，不能證明本人按了按鈕。審計畫面須並列「登入身份（設備帳號）」與「自述處理人」，不得把後者標成已驗證使用者、更新 `updated_by_id`，或與 `assigned_user_ids` 混為一談。

RLS/DB 需先審核再定案：目前 migration 4/安全 phase 4 的 incidents SELECT/UPDATE policy 以 active 帳號加 `app_can_access(factory_id)` 或指派 user ID 放行；incident 子表依 parent factory 授權。僅新增一個平板 UI 不足以安全寫入。設備帳號若直接用現有前端 Supabase client，會得到其實際 role/factory 可做的資料庫操作；故建議共用平板寫入改走只接受允許欄位的 server action/API 或窄權限 RPC，伺服器由 JWT 解析設備帳號、驗證設備/工廠/名單，並在交易內寫進度與 performer 關聯。DB/RLS 要以該設備身分限制可見工廠、開放工單範圍及僅允許技師進度欄位；結案、接受、RCA 等 server/API/RPC/trigger 仍須以 verified actor role 檢查 supervisor+。不要只在 UI 隱藏按鈕。

正式政策是否需要修改：很可能需要；現有 factory-scope policy 對同工廠資料的放行比「僅我的工單」寬，且 `incident_updates` 在部分 schema/migration 起始檔為 RLS disabled，後續 migration 是否已套用未知。上線前需盤點部署資料庫的 `pg_policies`、RLS enable 狀態、grants、security-definer 函式及 close API；不可根據 SQL 檔存在就宣稱正式環境安全或已套用。

## 文字 wireframes

### 登入頁（印尼文）

```text
FAMMS                         [Bahasa]
Masuk
[Nama akun / Email____________]
[Kata sandi___________________]
[ Masuk ]
──────── atau ────────
[ Tablet Bersama Teknisi ]
Login pribadi tetap tersedia seperti biasa.
```

已登入個人帳號仍照常進 dashboard。共用入口只建立/恢復設備 session，完成後明確前往 `/tablet/pilih-teknisi`，不可落到未經此模式授權的 dashboard。未註冊設備顯示初次配對流程。

### 首次管理員授權

```text
Pengaturan oleh admin sistem
Nama perangkat [Tablet Teknisi Bersama]
Pabrik         [Pilih pabrik            v]
Akun perangkat [Pilih akun khusus tablet v]
Teknisi yang boleh dipilih
  [ ] Pak Dasir  [ ] Suwardi
  [ ] Wiwit      [ ] Rudi
[Simpan dan aktifkan tablet]
```

共用裝置帳號本身必須由系統管理員在使用者管理預先建立（role=technician、is_shared_device=true、已綁工廠），再由此設定明確選人。名單留空不得默認全工廠技師；啟用前必須選取至少一人。不在平板保存管理員權杖。

### 平日選人

```text
Tablet Bersama Teknisi · Pabrik Bandung
Pilih nama Anda untuk mulai
[ Pak Dasir ]  [ Suwardi ]  [ Wiwit ]  [ Rudi ]
Tidak ada nama? Hubungi admin.
```

不得提供「其他姓名」任意輸入以繞過 roster。選人後只建立短期 UI 工作階段 `selected_performer_id`；除 roster 驗證結果外不改變資料庫權限。

### 工單

```text
FAMMS · Pabrik Bandung           Anda: Pak Dasir  [Ganti pengguna]
[Tugas saya] [Tugas tim]
Tugas saya: 指派清單中含 Pak Dasir 的未結工單（可多指派）
Tugas tim: 此設備授權工廠可見的團隊工單
[WO-104 · Pompa bocor · Dalam perbaikan]

WO-104 · Pompa bocor
Status: Dalam perbaikan
[Catat pekerjaan]
Catatan [____________________________]
Yang menangani [Pak Dasir ✓] [Suwardi +] [Wiwit +] [Rudi +]
[Simpan pembaruan]
工單動作另區：技師可回報「維修完成」；正式結案只顯示給具權限的主管帳號。
```

`Tugas saya` 是依目前所選 roster 技師 ID 對 `assigned_user_ids` 做 client/server 過濾；`Tugas tim` 則由設備帳號在核准工廠內取得團隊清單。伺服器/RLS 仍決定設備可見範圍，切換標籤不等於授權。保留現有 board 多指派和跨工廠例外語義，不能用不可靠的 `.or()` 取代多個查詢合併。

## 操作與失效情境

目前 MVP 本機版：切換使用者時可選保留／丟棄尚未送出的表單；草稿只在目前頁面記憶體，不會離線存續，也沒有閒置逾時登出。平板不提供照片及離線提交。以下 idle timeout / durable draft 是未來要求，不代表現有功能。

- 正常：登入共用入口 → 選一位 roster 技師 → 看「我的／團隊」工單 → 更新進度並選 1 位以上自述處理人 → 伺服器驗證設備 session、工廠與每位 performer → 同一交易保存進度、設備 actor 與 performer 關聯 → 回清單。
- 閒置（未來需求）：閒置 timeout 應清除目前選人但保留設備認證；若加入可跨重新整理恢復的草稿，需保存原填寫人/device/incident 關聯，並避免切人後改綁或代送。敏感照片不得自動離線持久保存。
- 更換使用者：按 `Ganti pengguna` 先檢查 dirty draft；有草稿就選「Simpan draf dan ganti / Kembali ke draf / Buang draf」，前者以原 performer 綁定並返回選人頁。新使用者不得提交舊人的草稿，也不能藉換人改署名。
- 停用帳號或設備：平板回選人或顯示「Perangkat dinonaktifkan — hubungi admin」；伺服器每次讀寫檢查 active profile、設備 enabled、roster active。管理員撤銷設備須撤銷/過期 session，API 即刻拒絕。名單中被停用技師不顯示且提交時再驗證。
- 無效/過期：未知配對碼、過期碼、錯誤工廠/非 roster 技師均拒絕，不透露其他工廠名單；提供重試或聯絡管理員。驗證失敗不降級成任意姓名或一般 Supabase 寫入。
- 離線：目前不支援離線保存或提交；網路請求失敗時留在當前頁並可重試，不會加入既有背景離線佇列。未來若加入離線草稿，必須明確標 `Offline · belum terkirim`，回線後重新驗設備、roster、工單狀態；若已停用/結案則轉人工處理，不自動覆寫。照片離線提交仍不支援。
- 自述限制：可由他人代選名字，系統只能記錄為自述。若稽核要求「本人確認」，另加個人 PIN 或個人帳號再驗證；不得以本設計的選名步驟冒充該保證。

## 最小資料契約（提案）

| 資料 | 最小欄位 | 語義／驗證 |
| --- | --- | --- |
| 設備 | `id`, `auth_user_id`, `factory_id`, `label`, `enabled`, `performer_ids[]`, `updated_at` | 一台設備對一個專用 authenticated account；管理員管理；名單成員須同工廠、active、允許作 performer。`profiles.is_shared_device` 可做提示旗標，不足以取代此綁定。 |
| 進度事件 | `id`, `incident_id`, `note`, `new_status`, `device_id`, `verified_actor_user_id`, `declared_performer_ids[]`, `created_at`, `request_id` | `verified_actor_user_id` 永遠由驗證過的 JWT 得出設備帳號；performer IDs 是經設備 roster 驗證的自述人，可多人；禁止客戶端傳入 `updated_by_id`/role。`request_id` 唯一以便重試冪等。 |
| 草稿 | `draft_id`, `device_id`, `incident_id`, `original_performer_id`, `payload`, `created_at`, `updated_at`, `state` | 本機暫存即可；提交時再次驗證原 performer/設備/工單，不能因切換使用者而重綁。 |
| 指派 | 現有 `incidents.assigned_user_ids[]` | 表示被指派者，不代表實際做事者；不以 performer 更新自動修改指派。 |

現有 `incident_updates.updated_by`（文字）與 `updated_by_id`（登入 profile FK）不足以正規化多位自述處理人。建議新增關聯表 `incident_update_performers(update_id, performer_profile_id)` 或等價 JSON/欄位，另在更新事件保存設備 ID；保留 `updated_by_id` 為 verified actor，不塞入 self-declared performer。此契約須跟現有 audit trigger/schema 對齊後才能遷移。

## 程式整合現況

- `/login` 保留個人登入，增加共用平板模式入口；平板專用 technician account 被 dashboard layout 導向 `/tablet`。
- `(tablet)` route group 及 `/tablet` 使用 server-side device/factory/active-roster 驗證，獨立於一般 dashboard；管理員 UserManager 可綁帳號、工廠、技師清單並啟用/停用。
- `/api/tablet/incidents` 伺服器限定 factory 與 open status；「我的」以 selected performer 對 `assigned_user_ids` 過濾，「團隊」為設備授權工廠範圍。
- `/api/tablet/incidents/[id]/updates` + `create_shared_tablet_update` 僅存處理紀錄；DB 交易驗證設備、actor、工廠、未結案工單、active roster，原子寫入 self-declared performers 並按 request ID 冪等。不得改成 client direct Supabase insert。
- migration / app 仍僅在本機：尚未套用 staging，RLS/grants 及實際 Supabase API 寫入尚未驗證。正式使用前必須先完成下一節驗收。
- `src/lib/permissions.ts` 仍為角色權限硬底線；設備平板永遠 technician 行為。它不提供接受、RCA 或正式結案，不呼叫 `/api/incidents/[id]/close`。檢查所有 API/DB gate，不只 UI。

## 分批實作與驗收清單

1. **DB/權限盤點**：取得部署 DB 的 RLS/policies/grants、`incident_updates` RLS、trigger/functions、close/accept/RCA API 證據；確認 `is_shared_device` 及多指派 migration 實際狀態。建立威脅模型和最小表/RPC/API 設計。未盤清不可開共用寫入。
2. **MVP 設備生命週期**：個人登入無回歸；只有 true admin 可綁定預先建立的專用 technician account、維護 roster、停用/重啟；停用後讀寫皆拒絕；API 不洩露 roster 外使用者。一次性 pairing code 是第二階段，未開發也不屬於本次驗收。
3. **選人與工單讀取**：只顯示經授權 active roster；大按鈕、目前選人和 `Ganti pengguna` 可用；`Tugas saya` 對多指派正確，`Tugas tim` 不越過設備 factory；姓名選擇不改變 auth uid/role/API 權限。
4. **進度寫入與身份分離**：單人/多人 performer 寫入後 verified actor 一律是設備帳號，performer 關聯分別保存；改送他人/非 roster ID 被 server 拒絕；重複 request 冪等；指派與 performer 保持不同；technician 無法 accept、RCA 或 close，supervisor 個人帳號仍可依既有流程正式結案。
5. **目前草稿/故障**：切人草稿在當頁綁原填寫人並可明確保留或丟棄；重新整理後不承諾恢復；斷網不得誤稱已送出；停用/失效時操作拒絕且提供登出。閒置 timeout、離線草稿佇列與衝突同步是未來工作。
6. **正式上線前**：RLS negative tests（跨工廠、非 roster、停用設備/人員、偽造 actor/performer、各 API 直接呼叫）；照片 Storage policy 測試；桌機/平板驗收印尼文與觸控；migration clean replay/staging 套用與回滾計畫；明確記錄 staging/production 是否完成，不能以本地測試代稱正式驗證。
