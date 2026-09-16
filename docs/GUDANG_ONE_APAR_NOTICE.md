# 給 Gudang One 的通知：滅火器（APAR）到期會自動送叫料單

> 這份是 FAMMS（工廠維修系統）這側寫的**通知**，不是新的串接要求。
> **你們不用改任何程式碼、不用加新密鑰、不用開新 endpoint。**
> 只是 FAMMS 這側多了一個「會自動送叫料單」的來源，怕倉管看到會一頭霧水，
> 先講清楚。文末有兩題想確認，其他都只是說明。

---

## 一、多了什麼

FAMMS 新增了滅火器（APAR）的到期追蹤：每支滅火器登記在哪個廠、哪個區域、
到期日是哪天。**到期前 30 天**，FAMMS 會自動送一張叫料單過來，請倉庫準備
更換/填充，不等人手動按按鈕。

走的是**原本那支 webhook**（`famms-request` Edge Function），跟技師在工單上按
「向倉庫叫料」完全同一條路、同一個密鑰（`x-famms-secret`）、同一個 payload 格式
（欄位定義見 `GUDANG_ONE_CONFIRM.md` 第二節，一個欄位都沒加、沒改、沒拿掉）。

---

## 二、倉管會看到什麼不一樣

欄位結構不變，只是**內容**跟技師手動叫料時長得不一樣：

| 欄位 | 技師手動叫料（原本就有的） | APAR 自動叫料（新的） |
|---|---|---|
| `requester` | 技師本人姓名，例如 `Rudi` | 固定是 `FAMMS (Auto - APAR)` |
| `work_order` | 真的工單號 `FIT-20260723-004` | 那支滅火器的代號（例如 `APAR-003`），**不是真工單號** |
| `machine_id` / `machine_name` | 該工單的機台 | 那支滅火器的代號 / 名稱 |
| `items` | 技師自己填的零件清單 | 固定一筆：`Ganti/Isi Ulang <滅火器名稱>`，qty 1、unit `unit` |
| `note` | `[Pabrik: 廠名]` ＋ 技師自己寫的備註 | `[Pabrik: 廠名] Auto: APAR kadaluarsa dalam N hari - ganti/isi ulang.` |
| `urgency` | 技師自己選 | 還沒過期 = `normal`；已經過期 = `urgent` |

Payload 範例：

```json
{
  "famms_request_id": "9f8c1e40-...-a12b",
  "machine_id": "APAR-003",
  "machine_name": "Alat Pemadam Api Ringan",
  "work_order": "APAR-003",
  "items": [
    { "name": "Ganti/Isi Ulang Alat Pemadam Api Ringan [APAR-003]", "part_no": "", "qty": 1, "unit": "unit" }
  ],
  "urgency": "normal",
  "requester": "FAMMS (Auto - APAR)",
  "warehouse": "HARDWARE",
  "note": "[Pabrik: SJA] Auto: APAR kadaluarsa dalam 28 hari - ganti/isi ulang."
}
```

---

## 三、頻率：不會洗版

同一支滅火器的**同一個到期日只會送一次單**。FAMMS 這側記著「已經為哪個到期日
送過單」，之後每天的到期提醒只會發 Telegram 給 FAMMS 這邊的採購/admin，**不會**
再重複送單給你們。

等滅火器真的換新、FAMMS 這側把到期日更新成新的日期之後，下一個週期才會再送
一張新的單。

---

## 四、狀態回寫：完全照舊

線路③（你們 → FAMMS）不用改。倉管把這筆改成已叫貨 / 已到貨 / 拒絕時，
照原本那支 `POST /api/external/parts-requests` 帶著 `famms_request_id` 回來就好，
規則跟原本一模一樣（狀態只能往前、重複推送安全、`received`/`rejected` 是終點）。

唯一差別：這種單沒有對應的維修工單，所以 FAMMS 收到回寫後不會去私訊「申請的
技師」（本來就沒有技師），只會更新狀態。

---

## 五、確認兩題 — Gudang One 已回覆（2026-09-16）

1. **`work_order` 格式**：你們系統有沒有對這欄做解析或驗證（例如假設一定是
   `FIT-` 開頭）？如果有，`APAR-003` 這種會不會出錯？需要的話我們可以改格式。

   > **回覆：沒有任何解析或 `FIT-` 開頭的假設，`APAR-003` 直接可用。**
   > 欄位確認存在，倉管畫面會正常顯示成 `🔧 APAR-003`。

2. **`requester` 字串**：`FAMMS (Auto - APAR)` 這樣寫，倉管看得懂「這是系統自動
   送的，不是某個人」嗎？如果你們有偏好的寫法（例如 `SISTEM FAMMS`、`AUTO`），
   跟我說，改字串很快。

   > **回覆：看得懂，不用改**——APAR 是印尼文的標準縮寫，倉管本來就認得，
   > 比 `SISTEM FAMMS` 更清楚（同時說明了「系統送的」和「為了什麼」）。
   > 唯一建議：裡面那個破折號原本是 em-dash（`—`），建議換成普通連字號（`-`）
   > 比較保險，避免某些字型或匯出情境變亂碼。**已照建議改掉**，`requester` 與
   > `note` 兩處的 em-dash 都換成 `-` 了（FAMMS 送出的字串裡不再有非 ASCII 標點）。

**結論：Gudang One 那側不用改任何東西**，照現在的格式送就行。這份文件留著當紀錄，
以後若要改 `work_order` / `requester` 格式，記得這兩題是已經對過的。
