-- ============================================================================
-- FAMMS 資料體檢 — 掃「照理不應該存在」的資料狀態（唯讀，隨時可重跑）
-- ============================================================================
--
-- WHY: SJA 的重複區域（GDG 1/GDG 2 vs GUDANG-ATAS/GUDANG-BAWAH）在資料庫裡
-- 躺了數週，直到 FQMS 的點檢畫面把兩組同名區域並排顯示才被發現。這類「不該
-- 存在的狀態」不會報錯、不會擋流程——只會默默讓畫面出現重複、統計失真、
-- 整合端顯示垃圾。這支腳本把已知的這類狀態一次列出來。
--
-- HOW TO READ: 結果表每一列 = 一個發現的問題。**查無資料（0 rows）= 全部乾淨**。
-- 「等級」欄：ERROR = 資料壞了要修；WARN = 不算壞但會造成噪音/誤導，值得看一眼。
--
-- 什麼時候跑：seed / cleanup / 大量搬動資料之後；或整合端（FQMS/Gudang）畫面
-- 出現怪東西的時候，先跑這支再猜。

WITH
-- ① 同一工廠內同名區域（今天 GDG 1 vs GUDANG-ATAS 這型）
dup_area AS (
  SELECT f.code AS factory, LOWER(TRIM(a.name)) AS norm_name,
         STRING_AGG(a.code || '「' || a.name || '」', ' / ' ORDER BY a.code) AS detail,
         COUNT(*) AS n
  FROM areas a JOIN factories f ON f.id = a.factory_id
  GROUP BY f.code, LOWER(TRIM(a.name))
  HAVING COUNT(*) > 1
),
-- ② 同一工廠內重複的 machine_code
dup_machine AS (
  SELECT f.code AS factory, m.machine_code,
         COUNT(*) AS n
  FROM machines m JOIN factories f ON f.id = m.factory_id
  WHERE m.machine_code IS NOT NULL AND m.machine_code <> ''
  GROUP BY f.code, m.machine_code
  HAVING COUNT(*) > 1
),
-- ③ 機器掛在別的工廠的區域（factory_id 與 area 的 factory_id 不一致）
cross_factory_machine AS (
  SELECT m.machine_code, m.machine_name, fm.code AS machine_factory, fa.code AS area_factory
  FROM machines m
  JOIN areas a ON a.id = m.area_id
  JOIN factories fm ON fm.id = m.factory_id
  JOIN factories fa ON fa.id = a.factory_id
  WHERE m.factory_id <> a.factory_id
),
-- ④ 工單掛的機器屬於別的工廠
cross_factory_incident AS (
  SELECT i.incident_no, fi.code AS incident_factory, fm.code AS machine_factory
  FROM incidents i
  JOIN machines m ON m.id = i.machine_id
  JOIN factories fi ON fi.id = i.factory_id
  JOIN factories fm ON fm.id = m.factory_id
  WHERE i.factory_id <> m.factory_id
),
-- ⑤ 重複的 incident_no（有唯一約束理應為 0——非 0 代表約束沒建）
dup_incident_no AS (
  SELECT incident_no, COUNT(*) AS n
  FROM incidents
  GROUP BY incident_no HAVING COUNT(*) > 1
),
-- ⑥ 狀態與時間戳互相矛盾的工單
closed_inconsistent AS (
  SELECT incident_no,
         CASE WHEN status = 'closed' AND closed_at IS NULL THEN 'closed 但沒有 closed_at'
              ELSE '未結案但有 closed_at' END AS why
  FROM incidents
  WHERE (status = 'closed' AND closed_at IS NULL)
     OR (status <> 'closed' AND closed_at IS NOT NULL)
),
-- ⑦ 機器卡在「維修中」但沒有任何未結案工單（沒人在管的維修狀態）
repairing_orphan AS (
  SELECT m.machine_code, m.machine_name, f.code AS factory
  FROM machines m JOIN factories f ON f.id = m.factory_id
  WHERE m.status = 'repairing'
    AND NOT EXISTS (
      SELECT 1 FROM incidents i
      WHERE i.machine_id = m.id AND i.status <> 'closed'
    )
),
-- ⑧ 報廢機器身上還開著 active 的 PM 排程（月曆會一直排任務給死機器）
pm_on_scrapped AS (
  SELECT m.machine_code, m.machine_name
  FROM pm_schedules s JOIN machines m ON m.id = s.machine_id
  WHERE s.is_active = TRUE AND m.status = 'scrapped'
),
-- ⑨ 叫料卡在 requested 超過 7 天（Gudang 沒回寫——可能是整合欄位對不上）
parts_stuck AS (
  SELECT pr.id, i.incident_no, pr.requested_at::date AS since
  FROM parts_requests pr
  LEFT JOIN incidents i ON i.id = pr.incident_id
  WHERE pr.status = 'requested'
    AND pr.requested_at < NOW() - INTERVAL '7 days'
),
-- ⑩ 未結案工單指派給停用/不存在的帳號（他永遠不會看到也不會動）
assigned_inactive AS (
  SELECT DISTINCT i.incident_no, u.uid
  FROM incidents i, UNNEST(i.assigned_user_ids) AS u(uid)
  LEFT JOIN profiles p ON p.id = u.uid
  WHERE i.status <> 'closed'
    AND (p.id IS NULL OR p.is_active = FALSE)
),
-- ⑪ 未完成任務指派給停用帳號
task_assigned_inactive AS (
  SELECT t.title
  FROM tasks t JOIN profiles p ON p.id = t.assigned_to_id
  WHERE t.status <> 'done' AND p.is_active = FALSE
),
-- ⑫ 空區域（0 台機器）——不是壞資料，但會變成 FQMS 點檢清單上的噪音
empty_area AS (
  SELECT f.code AS factory, a.code, a.name
  FROM areas a JOIN factories f ON f.id = a.factory_id
  WHERE NOT EXISTS (SELECT 1 FROM machines m WHERE m.area_id = a.id)
)

SELECT * FROM (
  SELECT 'ERROR' AS 等級, '① 同廠重複區域名' AS 檢查,
         factory || ': ' || detail AS 明細 FROM dup_area
  UNION ALL
  SELECT 'ERROR', '② 同廠重複 machine_code',
         factory || ': ' || machine_code || ' ×' || n FROM dup_machine
  UNION ALL
  SELECT 'ERROR', '③ 機器掛在別廠的區域',
         COALESCE(machine_code, machine_name) || '（機器屬 ' || machine_factory || '，區域屬 ' || area_factory || '）'
  FROM cross_factory_machine
  UNION ALL
  SELECT 'ERROR', '④ 工單機器跨廠',
         incident_no || '（工單 ' || incident_factory || '，機器 ' || machine_factory || '）'
  FROM cross_factory_incident
  UNION ALL
  SELECT 'ERROR', '⑤ 重複 incident_no', incident_no || ' ×' || n FROM dup_incident_no
  UNION ALL
  SELECT 'ERROR', '⑥ 結案狀態矛盾', incident_no || '：' || why FROM closed_inconsistent
  UNION ALL
  SELECT 'WARN', '⑦ 維修中但無未結案工單',
         factory || ': ' || COALESCE(machine_code, machine_name) FROM repairing_orphan
  UNION ALL
  SELECT 'WARN', '⑧ 報廢機器仍有 active PM',
         COALESCE(machine_code, machine_name) FROM pm_on_scrapped
  UNION ALL
  SELECT 'WARN', '⑨ 叫料卡 requested >7天',
         COALESCE(incident_no, id::text) || '（自 ' || since || '）' FROM parts_stuck
  UNION ALL
  SELECT 'WARN', '⑩ 工單指派給停用/不存在帳號', incident_no FROM assigned_inactive
  UNION ALL
  SELECT 'WARN', '⑪ 任務指派給停用帳號', LEFT(title, 40) FROM task_assigned_inactive
  UNION ALL
  SELECT 'WARN', '⑫ 空區域（FQMS 清單噪音）',
         factory || ': ' || code || '「' || name || '」' FROM empty_area
) checks
ORDER BY 等級, 檢查, 明細;

-- 查無資料（0 rows）= 十二項全部乾淨。
