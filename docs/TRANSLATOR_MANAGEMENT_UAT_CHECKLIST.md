# 譯者管理模組 V1.0 UAT / 測試清單（PM / QA）

本清單用於驗收 `028~032` migration 所對應功能。  
建議測試環境先完成 migration `001~032`，再依本清單執行。

---

## 0. 測試前準備

- [ ] 已依序執行 migration：`025 -> 032`
- [ ] 測試租戶已建立至少 3 位譯者（常用/新進/暫不合作各 1）
- [ ] 測試案件已建立至少 2 筆（其中 1 筆做多譯者、多工種）
- [ ] 測試帳號準備：
  - [ ] 行政/專案（`can_edit_projects` 或 `can_assign_tasks`）
  - [ ] 財務（`can_view_finance`）
  - [ ] 一般成員（無上述權限，用於驗證防呆與權限）

---

## 1. 譯者主檔（`translator_master`）

### 1.1 基本 CRUD

- [ ] 可新增譯者資料（必填欄位完整）
- [ ] 可編輯譯者狀態、標籤、備註
- [ ] 可查詢同租戶譯者清單
- [ ] 暫不合作（`status=3`）不影響既有資料保留

### 1.2 欄位防呆驗證

- [ ] `translator_id`：同租戶不得重複
- [ ] `email`：同租戶不得重複（大小寫不敏感）
- [ ] `id_number`：同租戶不得重複（大小寫不敏感）
- [ ] `bank_code`：必須為 3 碼數字
- [ ] `bank_account`：只允許數字，且長度必須大於 8
- [ ] `status`：僅允許 `1/2/3`
- [ ] `service_tags`：不得為空陣列，且每筆需符合標籤格式

---

## 2. 標籤系統與派案篩選

### 2.1 標籤定義（`service_tag_definitions`）

- [ ] 可查詢標籤清單（TR/TS/DTP/VE）
- [ ] `tag_code` 不可重複
- [ ] `TR` 類別必須有來源語系與目標語系
- [ ] `TS` 類別必須有來源語系、不可有目標語系
- [ ] `DTP` / `VE` 類別不可填來源/目標語系

### 2.2 派案篩選函式（`get_dispatch_translators`）

- [ ] 指定標籤可正確篩出符合譯者（例：`TR-ZH-EN`）
- [ ] 清單排序：`status=1` 在前，`status=2` 在後
- [ ] `status=2` 的排序為隨機（多次查詢順序會變化）
- [ ] `status=3` 不應出現在可派案名單

---

## 3. 一案多譯者 / 多工種（`project_translator_assignments`）

### 3.1 功能驗證

- [ ] 同一案件可新增多筆 assignment
- [ ] 同一案件可同時有翻譯、聽打、排版等不同 `service_tag`
- [ ] 同一譯者可在同案承接不同 `service_tag`
- [ ] 每筆 assignment 可獨立設定 `translator_fee` / `translator_deadline` / `translator_status`

### 3.2 欄位防呆驗證

- [ ] `translator_fee >= 0`
- [ ] `translator_status` 僅允許 `1/2/3/4`
- [ ] `tax_deduction_rate` 僅允許 `0~1`
- [ ] `(tenant_id, project_id, assignee_id, service_tag)` 不可重複
- [ ] `assignee_id` 必須存在於同租戶 `translator_master.translator_id`
- [ ] `service_tag` 必須存在於 `service_tag_definitions.tag_code`

---

## 4. 待撥款同步（`translator_monthly_payout_queue`）

### 4.1 自動同步流程

- [ ] assignment 狀態由非 3 -> 3，應自動新增待撥款
- [ ] assignment 狀態為 3 時更新費用，待撥款金額應同步更新
- [ ] assignment 狀態改為 4，待撥款狀態應轉為已撥款（2）
- [ ] 同一 assignment 不可重複新增多筆待撥款（唯一鍵驗證）

### 4.2 欄位防呆驗證

- [ ] `translator_fee >= 0`
- [ ] `translator_status`（待撥款表）僅允許 `1/2`

---

## 5. 郵寄成本（`project_shipping_costs`）

### 5.1 功能驗證

- [ ] 同一案件可新增多筆郵寄紀錄（補寄/重寄）
- [ ] 可查詢每案全部郵寄紀錄
- [ ] 可編輯既有郵寄紀錄金額與備註

### 5.2 欄位防呆驗證

- [ ] `shipping_date` 必填
- [ ] `carrier_name` 必填且不可空白
- [ ] `tracking_number` 必填且不可空白
- [ ] `amount >= 0`
- [ ] 同租戶 `tracking_number` 不可重複（避免重複登錄）

---

## 6. 成本與毛利報表（View 驗證）

### 6.1 `v_project_cost_summary`

- [ ] `shipping_count` = 該案郵寄筆數
- [ ] `shipping_total_cost` = 該案郵寄金額合計
- [ ] `translator_total_cost` = assignment 稿費合計
- [ ] `total_cost` = 譯者成本 + 規費 + 郵寄成本
- [ ] `gross_profit` = 營收 - `total_cost`
- [ ] `gross_margin_rate` 計算正確（營收為 0 時應為 `null`）

### 6.2 `v_finance_translator_monthly_overview`

- [ ] 當月 `pending_total_fee` 正確
- [ ] 當月 `returned_unsettled_project_count` 正確

### 6.3 `v_translator_newcomers_no_assignment_this_month`

- [ ] 新進譯者本月無 assignment 時可出現
- [ ] 一旦本月新增 assignment，應從清單消失

---

## 7. 權限 / RLS 驗證

- [ ] 無權限帳號不可新增/編輯譯者主檔
- [ ] 無權限帳號不可新增/編輯 assignment
- [ ] 無權限帳號不可新增/編輯郵寄成本
- [ ] 財務權限可讀取成本/待撥款相關資料
- [ ] 不同租戶帳號不可讀取他租戶資料（跨租戶隔離）

---

## 8. 回歸測試建議（避免改壞既有）

- [ ] 既有 `project_financials` 功能正常（025~027）
- [ ] `system_audit_logs` 財務稽核仍正常寫入
- [ ] 原本 `projects` CRUD 不受新增欄位影響
- [ ] migration 重跑不應造成失敗（`if not exists` / `drop if exists` 路徑）

---

## 9. 測試結果記錄欄（QA 填寫）

| 測試區塊 | 結果（Pass/Fail） | 缺陷編號 | 備註 |
|---|---|---|---|
| 1. 譯者主檔 |  |  |  |
| 2. 標籤與派案篩選 |  |  |  |
| 3. 多譯者 assignment |  |  |  |
| 4. 待撥款同步 |  |  |  |
| 5. 郵寄成本 |  |  |  |
| 6. 報表 view |  |  |  |
| 7. 權限/RLS |  |  |  |
| 8. 回歸測試 |  |  |  |
