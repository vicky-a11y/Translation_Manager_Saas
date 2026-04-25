# 譯者管理模組 V1.0 實作狀態

本文件彙整目前已完成的資料層實作、可直接使用的功能，以及下一版待開發項目。

---

## 1. 已實作項目（Database / Supabase）

### 1.1 Migration 清單（本次範圍）

- `028_translator_master.sql`
- `029_translator_tags_and_dispatch.sql`
- `030_project_translator_assignment_and_settlement.sql`
- `031_project_multi_translator_assignments.sql`
- `032_project_shipping_costs_and_margin_views.sql`

### 1.2 已建立資料表

- `public.translator_master`
  - 譯者主檔（租戶自有）
  - 含銀行資訊、身分資訊、`service_tags`、狀態欄位
- `public.service_tag_definitions`
  - 服務標籤定義（TR / TS / DTP / VE）
- `public.translator_monthly_payout_queue`
  - 已回稿待撥款暫存
- `public.project_translator_assignments`
  - 一案多譯者、多工種作業明細（核心）
- `public.project_shipping_costs`
  - 郵寄成本明細（可一案多筆）

### 1.3 已建立 Function / Trigger

- `public.get_dispatch_translators(text, integer)`
  - 派案時依標籤過濾譯者
  - 排序：常用譯者優先，新進譯者隨機
- `public.trg_assignment_to_translator_payout_queue()`
  - assignment 狀態變更時，自動同步待撥款資料
- `public.project_translator_assignments_set_updated_at()`
- `public.project_shipping_costs_set_updated_at()`
- `public.translator_master_set_updated_at()`

### 1.4 已建立 View（報表/儀表板可直接使用）

- `public.v_translator_newcomers_no_assignment_this_month`
  - 本月尚未接案的新進譯者清單
- `public.v_finance_translator_monthly_overview`
  - 待結算總稿費、已回稿未結清案件數
- `public.v_project_cost_summary`
  - 每案成本摘要，含：
    - `project_revenue`
    - `translator_total_cost`
    - `disbursement_fee`
    - `shipping_count`（寄件次數）
    - `shipping_total_cost`
    - `total_cost`
    - `gross_profit`
    - `gross_margin_rate`

---

## 2. 功能對照（需求 -> 現況）

### 2.1 譯者主檔管理

- 已支援新增/編輯/查詢資料欄位與基本驗證
- 已支援租戶隔離（RLS）
- 已支援銀行帳號格式檢核（純數字且 > 8 碼）

### 2.2 一案多譯者與多工種

- 已支援（`project_translator_assignments`）
- 可同案指派不同譯者與不同服務標籤
- 可記錄每筆 assignment 的費用、狀態、截止時間

### 2.3 財務待撥款

- 已支援 assignment 狀態進入「已回稿」後自動入待撥款
- 已支援狀態進入「已結薪」後更新待撥款狀態

### 2.4 郵寄成本記錄

- 已支援一案多筆郵寄成本
- 已支援寄件日期、物流單號、金額
- 已支援每案寄件次數與郵寄總成本彙總

---

## 3. 待實作項目（下一版）

### 3.1 物流與通知（VNext）

- 物流追蹤連結自動產生（依 carrier + tracking number）
- 寄出後自動通知客戶（Email / Push / IM）
- 物流狀態同步（運送中 / 已簽收）

### 3.2 成本管理擴充（VNext）

- 通用成本分錄（影印費、雜支、差旅等）`project_cost_entries`
- 成本類型維度分析（依類型/月/客戶/語種）

### 3.3 稅務與扣繳（V2.0）

- `tax_deduction_rate` 已預留欄位，尚未實作自動計算
- 二代健保、勞健保代扣邏輯尚未實作

---

## 4. 上線前檢查建議

- 確認 migration 已依序執行到 `032`
- 以測試資料驗證：
  - 同案多譯者 assignment 成本彙總
  - assignment 狀態 3/4 對待撥款同步
  - 同案多筆郵寄成本與 `shipping_count`
  - `v_project_cost_summary` 毛利率計算正確性
