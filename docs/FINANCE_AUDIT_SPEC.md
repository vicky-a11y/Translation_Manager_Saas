# 財務異動稽核規格（V1.0）

## 目標

- 財務表單屬於重要資訊，任何使用者修改 `project_financials` 時，系統必須留下可追溯紀錄。
- 稽核紀錄需支援後台查詢（依案件、欄位、時間區間、分頁）。
- 延續既有資料架構，**沿用 `project_financials` + `system_audit_logs`**，不新增平行主表。

## 資料寫入規格

### 1) 來源表

- `public.project_financials`

### 2) 稽核寫入表

- `public.system_audit_logs`
- 寫入欄位：
  - `tenant_id`
  - `user_id`（`auth.uid()`）
  - `table_name`（固定 `project_financials`）
  - `record_id`（`project_id`）
  - `field_name`
  - `old_value`
  - `new_value`
  - `modified_at`

### 3) 觸發機制

- Trigger：`project_financials_audit_changes_trg`
- Function：`public.audit_project_financials_changes()`
- 觸發時機：`AFTER INSERT OR UPDATE OR DELETE`
- 行為：
  - `INSERT`：寫入一筆 `field_name='__insert__'`
  - `DELETE`：寫入一筆 `field_name='__delete__'`
  - `UPDATE`：僅針對有變更欄位逐欄寫 log（`is distinct from`）

### 4) 目前追蹤欄位（UPDATE）

- `total_amount`（對應實體欄位 `amount`）
- `disbursement_fee`
- `paid_amount`
- `payment_method`
- `last_paid_at`
- `taxable_total`（自動計算欄位）
- `subtotal`（自動計算欄位）
- `tax`（自動計算欄位）
- `remaining_amount`（自動計算欄位）

## 查詢介面規格

### API

- 路徑：`GET /api/finance/audit`
- 權限：
  - 已登入
  - 有工作區 `active_tenant_id`
  - `super_admin` 或 `can_view_finance = true`

### Query Params

- `project_id`：指定案件 UUID（可選）
- `field`：可重複帶入，多欄位篩選（可選）
- `from`：起始時間（ISO string，可選）
- `to`：結束時間（ISO string，可選）
- `page`：頁碼，預設 `1`
- `page_size`：每頁筆數，預設 `20`，上限 `100`

### Response

- `data`: 稽核列陣列
  - `id`
  - `record_id`
  - `field_name`
  - `old_value`
  - `new_value`
  - `user_id`
  - `actor_name`（由 `profiles.full_name` 回補）
  - `modified_at`
- `paging`
  - `page`
  - `pageSize`
  - `total`

## 查詢效能

- 索引：
  - `system_audit_logs_finance_record_modified_idx`
  - `system_audit_logs_finance_field_modified_idx`
- 兩者皆為 partial index，條件 `table_name = 'project_financials'`。

## 相關實作檔案

- `supabase/migrations/026_project_financials_audit_logs.sql`
- `supabase/migrations/027_system_audit_logs_finance_query_index.sql`
- `src/lib/repositories/project-finance-audit-repository.ts`
- `src/app/api/finance/audit/route.ts`
