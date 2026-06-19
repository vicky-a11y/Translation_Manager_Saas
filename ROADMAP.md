# 擴充計畫（Plan）

本檔案記錄待建置功能與方向，與 `MEMORIES.md` 的「已完成」互補。  
**產品總覽手冊**：`docs/PRODUCT_HANDBOOK.md`（已實作／規則／流程／待辦彙整）。

## 核心業務

- **譯者母語與語言能力 UI**：`translator_master.native_lang`、`language_skills` 欄位已存在；表單 UI 暫緩，見 `docs/TRANSLATOR_MANAGEMENT_V1_STATUS.md` §3.4。
- **各語種費率管理**：依語言/單位計價等規則。
- **專業領域標籤**：案件與譯者之領域分類與篩選。

## 客戶 Intake（V1 後續）

> V1（全局大門口）已實作，見 `docs/CUSTOMER_INTAKE_DESIGN.md` §9。

- **檔案上傳子系統**：Storage bucket、signed URL、10MB 限制、`file_url` 落地。
- **專屬連結模式**：已確認委託案件之付款回報頁（直送財務，不經暫存表）。
- **SOP 分流進度條**：案件類型＋階段定義（翻譯／聽打／認證等）。
- **寄件標籤正式歸宿**：`shipping_*` 對應 `customer_master`／`projects` 或獨立表。
- **Email 防重**：轉正時可選邏輯與索引。
- **業務通知**：客戶送出 Intake 後 email／IM 通知。

## 多租戶流程

- **公司網域驗證**（Domain Verification）產品化。
- **人工審核機制**：審核通過後自動建立租戶／成員（目前僅寫入 `manual_review_requests`）。
- **成員邀請**：核心流程已實作（045–046）；待補強項目見 `MANUAL_FOLLOWUPS.md`。

## 財務報表

- **財務異動歷程後台頁（下一版）**：建立 Table + 篩選器 + 分頁，串接 `GET /api/finance/audit`（規格見 `docs/FINANCE_AUDIT_SPEC.md`）。
- **月度結案總金額**進階統計（跨月、客戶維度）。
- **譯者薪資自動結算**：月結對帳頁（049）已提供彙總檢視；批次撥款／狀態流轉 UI 待建。
- **毛利報表進階**：依語種、服務類型、客戶、月份交叉分析（`v_project_cost_summary` 已就緒）。

## 譯者／物流／成本（VNext）

- **物流追蹤連結**、**寄出通知客戶**、**物流狀態同步**。
- **通用成本分錄** `project_cost_entries`（影印、雜支、差旅）。
- **稅務扣繳自動計算**（V2.0；`tax_deduction_rate` 已預留）。

## 平台

- **平台 vendor 儀表板與接案流程**（目前僅 `is_platform_vendor` 標記與歡迎頁登記）。
