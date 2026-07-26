# 給 Gudang One 的對接確認單（FAMMS → Gudang One 叫料）

> 這份是 FAMMS（工廠維修系統）這一側寫的。目的：**請 Gudang One 那側確認以下四件事**，
> 確保工廠技師在維修工單上按「叫料」之後，料件申請確實會進到 Gudang One 系統。
> 文件末尾有「請回覆我這四題」，只要回答那四題即可。

---

## 一、背景：這次改了什麼

FAMMS 這側原本把每個工廠**對應到不同的倉庫代碼**再送出：

```
DIN → DENIKIN
SJA → SJA
OLT → OLENTIA
```

問題：新工廠（例如 **LAB**）不在這張對應表裡，技師按「叫料」會被直接擋掉，
畫面顯示 `Pabrik LAB belum dipetakan ke gudang`（LAB 廠尚未對應到倉庫），料就叫不出來。

**已改為**：不再按工廠分倉庫。**所有工廠**（現有的 DIN／SJA／OLT／LAB，以及以後新增的任何廠）
的叫料一律送到 **同一個倉庫代碼**，由環境變數 `GUDANG_WAREHOUSE` 設定，目前預設值為 `HARDWARE`。

因為倉庫代碼不再能分辨是哪個廠申請的，**申請工廠的名稱改放在 `note` 欄位開頭**，
格式為 `[Pabrik: 廠名] 使用者自己寫的備註`。

---

## 二、FAMMS 送出的封包（線路 ①：FAMMS → Gudang One）

- **方法／目標**：`POST` 到 FAMMS 環境變數 `GUDANG_WEBHOOK_URL` 指定的網址
  （目前設定指向 Gudang One 的 Edge Function `famms-request`）
- **認證 header**：`x-famms-secret: <雙方共用的密鑰>`
- **Content-Type**：`application/json`

Body 範例：

```json
{
  "famms_request_id": "9f8c1e40-...-a12b",
  "machine_id": "DIN-HMG-001",
  "machine_name": "Homogenizer Line 1",
  "work_order": "FIT-20260723-004",
  "items": [
    { "name": "Baut", "part_no": "", "qty": 50, "unit": "pcs" }
  ],
  "urgency": "normal",
  "requester": "Rudi",
  "warehouse": "HARDWARE",
  "note": "[Pabrik: LAB] spek M8, merek bebas"
}
```

欄位說明：

| 欄位 | 型別 | 說明 |
|---|---|---|
| `famms_request_id` | string (UUID) | **最重要**。FAMMS 這側的申請單 id。請 Gudang One 存下來，之後回報狀態時要原樣帶回（見第三節） |
| `machine_id` | string | 機台代碼（沒有代碼時會退為機台名稱，都沒有則為 `-`）。**注意：這是文字代碼，不是 UUID** |
| `machine_name` | string | 機台名稱，可能為空字串 |
| `work_order` | string | FAMMS 工單號，格式 `FIT-YYYYMMDD-NNN` |
| `items` | array | 最多 20 筆。`name` 與 `qty` 必有值，`part_no` 可能為空字串，`unit` 預設 `pcs` |
| `urgency` | string | 只會是 `low` / `normal` / `urgent` 三者之一 |
| `requester` | string | 申請人姓名 |
| `warehouse` | string | **本次改動重點：現在固定都是同一個值（預設 `HARDWARE`），不再隨工廠變動** |
| `note` | string | 最長 500 字。**開頭固定是 `[Pabrik: 廠名]`**，後面才是使用者自己填的備註 |

FAMMS 這側對回應的處理方式（供參考，方便你們判斷要回什麼）：

- **HTTP 2xx** → 視為送達成功。若 body 是 JSON 且含 `request_id`，FAMMS 會把它存成 `external_ref`（Gudang One 那側的單號）供日後對帳
- **HTTP 非 2xx** → 視為 Gudang One 明確拒絕，FAMMS 會**刪掉**自己這側的暫存紀錄，並把 body 裡的 `error` 字串顯示給技師看
- **完全沒回應／連線中斷** → FAMMS **保留**自己這側的紀錄（因為無法判斷你們到底收到沒有），並提示技師「可能已送出，請先查詢狀態再重送」

---

## 三、狀態回寫（線路 ③：Gudang One → FAMMS）

當倉庫實際處理這筆申請（叫貨／到貨／退件）時，請 Gudang One 主動打回來通知 FAMMS。
**FAMMS 不會輪詢（polling）**，完全靠你們推送。

- **方法／目標**：`POST https://<FAMMS 網址>/api/external/parts-requests`
- **認證 header**：`Authorization: Bearer <GUDANG_SYNC_SECRET>`（與線路①的密鑰**不同支**，請確認你們用對）
- Body：

```json
{
  "famms_request_id": "9f8c1e40-...-a12b",
  "status": "received",
  "external_ref": "GD-2026-0123"
}
```

| 欄位 | 必填 | 說明 |
|---|---|---|
| `famms_request_id` | ✅ | 線路①收到的那個 id 原樣帶回。（相容性：欄位名叫 `request_id` 也接受，兩個名字擇一即可） |
| `status` | ✅ | **只接受 `ordered` / `received` / `rejected` 三者之一**。不接受 `requested`（那是 FAMMS 建立時的初始狀態） |
| `external_ref` | 選填 | Gudang One 那側的單號，會顯示在 FAMMS 的申請追蹤區塊 |

FAMMS 這側的規則（請務必知道，避免你們以為推送失敗而重試到爆）：

1. **狀態只能往前，不能倒退**。順序為 `requested`(0) → `ordered`(1) → `received`/`rejected`(2)。
   往回推會拿到 **HTTP 409**，這是**正常行為不是錯誤**，不需要重試
2. **`received` 與 `rejected` 都是終點**。一旦到了其中之一，之後任何狀態變更都會被拒絕（同樣回 409）
3. **重複推送同一個狀態是安全的**。FAMMS 會回 `{"ok": true, "unchanged": true}`，
   而且**不會**重複發 Telegram 通知給技師
4. 找不到該 id → **HTTP 404**；密鑰錯誤 → **HTTP 401**；狀態值不在三者內 → **HTTP 400**

狀態成功變更時，FAMMS 會自動發 Telegram 通知給當初申請的那位技師。

---

## 四、請回覆我這四題

1. **倉庫代碼**：Gudang One 系統裡那個「hardware」倉庫，**實際的代碼字串**是什麼？
   是 `HARDWARE` 嗎？還是 `Hardware`／`HW`／其他？（FAMMS 會照你們給的字串設定，
   大小寫需完全一致）

2. **固定倉庫可行嗎**：`famms-request` 收到 `warehouse` 永遠都是同一個值，
   會不會有問題？（例如你們那側原本就靠這欄位分流到不同倉庫）

3. **id 回傳**：你們有把 `famms_request_id` 存下來嗎？回寫狀態時會用**哪一個欄位名稱**帶回來
   （`famms_request_id` 還是 `request_id`）？

4. **回寫有在運作嗎**：目前 Gudang One 實際上**有沒有**在叫貨／到貨時打第三節那支 API？
   如果沒有，FAMMS 這側的申請單會一直停在「已申請」，技師看不到後續進度。

---

## 附註：目前尚未驗證的部分

老實說明，避免誤會：線路①（FAMMS 送出）在 FAMMS 這側程式碼是完整的，
但**線路③（你們回寫）從未用真實封包對測過**——欄位名 `famms_request_id` 對 `request_id`
這個不一致，就是因為當初沒對過才兩個都接受。第 3、4 題就是為了確認這件事。
