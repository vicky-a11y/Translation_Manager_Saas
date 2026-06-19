# 客戶自助建檔與多元管道收件系統 — 開發手冊

> 狀態：**V1（全局大門口模式）已實作**（migration `048`、公開頁 `/intake/[token]`、後台 `/customers/intake`、建案預填）。本手冊仍為設計依據；**§8 待討論項目**尚未實作。
> 關聯文件：流程圖見 `docs/PROJECT_CUSTOMER_FLOW.md`；已完成脈絡見 `MEMORIES.md`；RLS 原則見 `docs/RLS_DESIGN_AND_MITIGATIONS.md`。

## 0. 核心哲學

**事、錢、人徹底解耦，建立安全暫存防線。**

因翻譯與認證業務存在大量「詢價後未委託」的散客，系統以**公開暫存表（Intake Submission）作為大門口**：只有在客戶確實完成「付款」或「回簽契約」並經**人工審核**後，才正式催生客戶與案件資料，避免無效數據污染正式庫。

## 1. 商務情境與收件分流

### 1.1 兩種商務情境

| 情境 | 模式 | 流程 |
|------|------|------|
| 事前已確認委託 | **專屬連結模式** | 業務後台先手動建立正式案件 → 產生該 `project_id` 專屬回報頁 → 客戶只填「付款末五碼與金額」→ **直送財務審核，不經暫存表**。<br/>**（列入待討論，第一版不實作，見第 8 節）** |
| 事前未確認委託 | **全局大門口模式** | 業務提供「全局公開連結」→ 客戶自填完整資料/發票/寄件/上傳/付款 → 進 `customer_intake_submissions` 暫存表 → 人工審核通過後轉正為客戶並另建案件。**（第一版實作範圍）** |

### 1.2 三路收件分流（`intake_channel`）

| 值 | 對象 | 特性 |
|----|------|------|
| `online_paid` | 線上付款客戶 | 客戶自主填寫；含匯款資訊 |
| `walk_in_cash` | 上門／現金客戶 | 業務代填 + 手機/平板拍照上傳手寫收據 |
| `corporate_postpaid` | 企業／政府機關 | 先委託後付款；**強制上傳已回簽報價單／契約** |

### 1.3 兩階段防錯

填寫完成 → **純文字／純文件唯讀預覽頁**（二次人工校對）→ 確認無誤才呼叫 RPC 入庫。

---

## 2. 資料庫結構（Migration 048）

> 現有最新為 `047`，新增 `048_customer_intake_flow.sql`。
> **約定：列舉一律用 `text`/`smallint` + `CHECK`，不使用原生 `enum`（與專案既有慣例一致）。**

### 2.1 `public.customer_intake_links`（公開連結，**原方案缺漏，必補**）

submit RPC 需「依 token 解析 tenant_id」，故必須有 token→租戶 對應表，並支援撤銷／過期。

| 欄位 | 型別 | 說明 |
|------|------|------|
| `id` | uuid PK | |
| `tenant_id` | uuid NOT NULL → `tenants(id)` | **綁定單一租戶** |
| `token` | uuid NOT NULL UNIQUE (`gen_random_uuid()`) | 公開連結 token |
| `label` | text | 連結用途備註 |
| `is_active` | boolean NOT NULL default true | 撤銷 |
| `expires_at` | timestamptz | 可選過期 |
| `created_by` | uuid → `auth.users(id)` | |
| `created_at` | timestamptz NOT NULL default now() | |

### 2.2 `public.customer_intake_submissions`（暫存表）

| 類別 | 欄位 | 型別 | 備註 |
|------|------|------|------|
| 基礎 | `id` | uuid PK | |
| | `tenant_id` | uuid NOT NULL → tenants | 由 token 解析，函式內鎖定 |
| | `link_id` | uuid → customer_intake_links | 來源連結 |
| | `status` | text NOT NULL default 'pending' | CHECK in (`pending`,`approved`,`rejected`) |
| 客戶基本 | `customer_name` | text | 對應 `display_name`（轉正規則見 5） |
| | `phone` | text | → `phone_mobile` |
| | `email` | text | |
| | `address` | text | → `address` |
| 三聯式發票 | `has_tax_invoice` | boolean default false | |
| | `tax_title` | text | 公司抬頭 → `legal_name` |
| | `tax_id` | text | 統編/註冊號 → `tax_id` |
| 寄件標籤 | `need_shipping` | boolean default false | |
| | `shipping_name` | text | **正式 schema 無對應，暫只存 intake** |
| | `shipping_phone` | text | 同上 |
| | `shipping_zipcode` | text | 同上 |
| | `shipping_address` | text | 同上 |
| 管道/類型 | `intake_channel` | text | CHECK in (`online_paid`,`walk_in_cash`,`corporate_postpaid`) |
| | `project_type_note` | text | **純文字備註**，直接存客戶勾選的案件種類中文（如 `"認證"`）；不做白名單，亦不對應 `projects` 欄位 |
| 付款 | `remittance_amount` | numeric | `>= 0` |
| | `remittance_bank_name` | text | |
| | `remittance_account_last5` | varchar(5) | CHECK 5 碼數字（沿用 041 慣例） |
| 上傳 | `file_url` | text | **欄位保留**；實體上傳功能列入待實作（見第 6、8 節），v1 不寫入 |
| 流程 | `created_at` | timestamptz default now() | |
| | `reviewed_by` | uuid | |
| | `reviewed_at` | timestamptz | |
| | `review_note` | text | |
| | `created_customer_id` | uuid | 轉正後寫回，避免重複建立 |

- 暫存表**不**做 tax_id／email 唯一索引（避免客戶填重複就無法送出）；防重在轉正時於 `customer_master` 層檢查。

### 2.3 RLS

- 兩表皆 **不開放 anon 直接 INSERT/SELECT**。
- `authenticated` 且同租戶（`tenant_id = current_profile_tenant_id()`）且 `auth_profile_permission('can_edit_projects')`（或 admin / super_admin）→ 可 SELECT / UPDATE（審核）/ DELETE。
- 匿名提交一律透過 `SECURITY DEFINER` RPC 寫入。

---

## 3. 後端安全提交函數（RPC）

### 3.1 `customer_intake_preview(p_token uuid)` — grant `anon, authenticated`

- 比照 `invitation_public_preview`：依 token 查 `customer_intake_links` join `tenants`，回 `{ valid, tenant_name }`；條件 `is_active = true` 且未過期。不洩漏 `tenant_id`。

### 3.2 `submit_customer_intake(p_token uuid, payload jsonb)` — grant `anon, authenticated`

- `SECURITY DEFINER`；依 `p_token` 解析 `tenant_id`、`link_id`（無效則 raise）。
- 函式內**鎖定 tenant_id**，對 payload 做基本驗證：email 格式、末五碼 5 碼數字、欄位長度截斷、`intake_channel` 白名單、發票防呆（`has_tax_invoice=false` 時清空 `tax_title`/`tax_id`）。`project_type_note` 為純文字，僅做長度截斷。
- 寫入 `customer_intake_submissions`，`status='pending'`。回 `{ ok: true }`（不回 id，避免枚舉）。
- 防濫用：rate limit（見第 7 節）。

### 3.3 審核／轉正（擇一實作，原則：不繞過權限）

- 可用後台 server action（已登入、走正常 RLS、本就有權限）直接寫 `customer_master`；或另開 `approve_customer_intake` / `reject_customer_intake` RPC。
- 轉正**不可重用** `createCustomerAction`（它強制 `im_platform+im_id`、`invoice_type`、`country_code`），改走 `customer-master-repository.insert`（允許這些為空），再依需要寫回 `status`、`created_customer_id`。

---

## 4. 前端：動態表單 + 兩階段確認頁

公開路由：`src/app/[locale]/intake/[token]/`（置於 `(app)` 之外，匿名可開）。

### 4.1 第一階段：動態表單

- **發票聯動防呆**：勾「是否開立三聯式發票」。是 → 解鎖公司抬頭+統編；否 → 兩欄 `disabled` 且不可輸入（送出前清空）。
- **寄件標籤聯動**：提示「如有紙本需寄回請填」。提供「同客戶資料」快捷鈕（自動帶入姓名/電話/地址），亦可手動填四欄（姓名、電話、郵遞區號、地址）。
- **上傳約束（v1 不實作，列入待實作項目，見第 8 節）**：未來規格為——現金客戶（業務代填）支援調用裝置相機拍照上傳手寫收據；企業月結客戶**強制**上傳已回簽報價單/契約；限圖片或 PDF、前後端皆 ≤ 10MB。v1 先以 `file_url` 欄位佔位，UI 可保留欄位但不啟用上傳。

### 4.2 第二階段：純文件確認預覽頁

- 點「送出」**不可直接入庫**，先跳唯讀預覽。
- 「返回修改」：回表單，**所有已填欄位完整保留**。
- 「確認無誤送出」：正式呼叫 RPC 入庫。
- 成功頁文案：「我們會儘快確認以及安排您的案件。如有任何問題歡迎來電或是來信聯繫。」

---

## 5. 後台審核與「資料轉正」控制台

頁面：`src/app/[locale]/(app)/customers/intake/page.tsx`。

- **守門權限**：`can_edit_projects = true`（或 admin/super_admin）。
- **暫存列表**：清楚列出所有 `pending` 待處理資料。
- **操作**：
  1. **刪除**：呼叫 action 抹除或標記該暫存列。
  2. **建立新案件**：觸發轉正 →
     - 先將基本資料 + 發票資訊寫入 `customer_master`，套用既有防重（`tax_id`；email 防重為新需求見第 8 節），取得 `customer_id`。
     - **「預填」跳轉（取代自動進度條）**：不指望系統自動生成 SOP 進度條。改為把客戶自填資料當參數帶入**現有**的手動新增案件頁 `/projects/new`，由業務維持現行手動操作流程。詳見 5.2。

### 5.2 「預填」跳轉到 /projects/new 的實際機制

設計原則：**最大化沿用現有手動建案流程，降低重複登打成本；系統不自動變出進度條。**

- 轉正後跳轉 `/projects/new`，並帶入下列**預填**值（透過 query string 或暫存草稿）：

| 來源（intake） | /projects/new 目標 | 說明 |
|----------------|--------------------|------|
| 新建立的 `customer_id` | 客戶（預選） | 需擴充表單支援「預選客戶」，免再搜尋 |
| `remittance_amount` | `amount`（金額） | 可直接帶入 |

- 下列資料**不是** `/projects/new` 的欄位，屬客戶層級或財務/參考性質，**不寫入 projects**，改以「**唯讀參考區塊**」顯示在案件頁，方便業務核對/抄寫：
  - 發票（`has_tax_invoice`/`tax_title`/`tax_id`）、`address` → 轉正時已寫入 `customer_master`。
  - 匯款末五碼／銀行、寄件標籤、`project_type_note`、`file_url` → 參考用；匯款明細日後由業務於案件財務頁填入 `project_financials`。
- **業務手動收尾**：業務在案件頁或新增案件頁的**備註欄**手動輸入（例如「這是認證案、要送外交部」）後存檔，即完成建案。
  - ✅ **已落地**：`projects.notes`（migration `048`）、`/projects/new` 備註 textarea、`createProjectAction` 寫入；案件明細頁可於建立後**修改**備註（`updateProjectInfoAction`）。

### 5.1 欄位對應規則（intake → 正式）

| intake | customer_master / 其他 |
|--------|------------------------|
| `tax_title` | `legal_name`（發票抬頭即法定全稱） |
| `customer_name` | `display_name`（**NOT NULL**，留空時以 tax_title 代入） |
| `phone` | `phone_mobile` |
| `email` | `email` |
| `address` | `address` |
| `tax_id` | `tax_id`（轉正時防重） |
| `has_tax_invoice` | 對應 `invoice_type`（true→三聯=2，否則由業務於建案時決定） |
| `remittance_*` | 建案時由業務於財務頁寫入 `project_financials`（轉正不自動落地） |
| `project_type_note` | **不落地**；純文字參考，業務據此手動填寫案件備註 |
| `shipping_*` / `file_url` | **正式 schema 暫無對應欄位，僅留 intake 參考，見第 8 節** |

- `customer_contacts.im_platform` 為 NOT NULL：intake 未收 IM，**轉正時略過主要聯絡人同步**（或日後補欄位後再同步）。

---

## 6. 檔案上傳（Storage）— 待實作（v1 不做）

> **依指示，本次不實作檔案上傳，列入待實作項目（見第 8 節第 1 點）。** 專案目前完全未使用 Supabase Storage。
> v1 僅保留 `file_url` 欄位佔位，不啟用上傳 UI、不接 Storage。

未來規格（待設計）：
- 新增 Storage bucket（例如 `intake-uploads`），路徑以 `tenant_id/token/...` 隔離。
- 匿名上傳建議流程：token 驗證後由後端發 **signed upload URL**，前端直傳；不開放 bucket 對 anon 的廣泛寫入。
- 型別限圖片/PDF、大小 ≤ 10MB，前後端雙重驗證。

---

## 7. 安全性

- 公開寫入一律經 `SECURITY DEFINER` RPC，函式內鎖 `tenant_id`；不放寬 `customer_master`/`projects` 的 anon RLS。
- token 為 UUID 不可枚舉；支援 `is_active=false` 撤銷與 `expires_at` 過期；URL 不含 `tenant_id` 明文。
- 匿名送出與上傳需 rate limit（建議 API route / Edge 依 IP + token 限流），可加 honeypot / Turnstile。

---

## 8. 待討論 / 後續設計（不納入第一版）

> 以下項目經審查與現有架構有重大相依或缺口，需獨立設計確認後再實作。

1. **【本次明確不做，列入待實作】檔案上傳子系統**：專案無 Storage 基礎。需決定 bucket、匿名上傳機制（signed URL）、保存策略、轉正後檔案歸屬（projects 附件表？）。v1 僅以 `file_url` 欄位佔位。**建議獨立 migration 與獨立工作項。**
2. **【本次明確不做，列入待實作】SOP 分流進度條**：`projects` 無案件類型/階段系統，`status` 僅自由文字。「翻譯／聽打／認證」分流是全新子系統，需先設計資料模型（案件類型欄位 + 階段定義 + 進度查詢）。v1 改以暫存表 `project_type_note` 純文字記錄 + 業務手動填案件備註替代。
3. **專屬連結模式（online_paid 直送財務）**：事前已確認委託的 `project_id` 專屬回報頁，客戶只填付款末五碼+金額直送財務。需設計 project 層級 token、財務審核流程。與全局大門口分開。
4. **寄件標籤的正式歸宿**：`shipping_*` 在 `customer_master`/`projects` 無欄位。需決定：只留 intake、或於 `projects` 新增寄件欄位、或建獨立寄件表。
5. **Email 防重**：現有防重僅 `tax_id` 與 `(im_platform+im_id)`，**無 email 防重**。若要求 email 防重需新增邏輯與索引；否則沿用 tax_id 防重。
6. **轉正轉換的精確對應**：發票 has_tax_invoice→invoice_type 的對應、display_name 缺值規則、是否同步建立 `customer_contacts`，需逐欄定案。
7. **通知**：是否在客戶送出後 email/IM 通知業務（可重用 `RESEND_*` 設定）。

---

## 9. 第一版實作範圍（**已完成**）

- `048_customer_intake_flow.sql`：
  - `customer_intake_links` + `customer_intake_submissions`（含 `project_type_note` 純文字、`file_url` 佔位）+ RLS + RPC（`customer_intake_preview`、`submit_customer_intake`）。
  - **新增 `projects.notes text`**（案件備註欄）— 供業務轉正後手動填寫；**案件明細可事後修改**。
- 公開頁 `/[locale]/intake/[token]`：動態表單（發票/寄件聯動防呆）+ 兩階段純文字預覽 + 成功頁。**上傳 UI 不啟用**。
- 後台 `/[locale]/(app)/customers/intake`：pending 列表、刪除、轉正（建客戶 + 預填跳轉建案）。
- **擴充 `/projects/new`**：
  - 支援「預選客戶」與「金額」預填（透過 query string `from_intake`）。
  - 新增**備註 textarea**（對應 `projects.notes`），`createProjectAction` 寫入。
  - 顯示一個**唯讀參考區塊**（匯款末五碼、寄件標籤、`project_type_note`、發票/地址）供業務核對。
- **案件明細** `/projects/[id]`：修改案件基本資料、財務收款、譯者指派；刪除前確認對話框（是／否）。
- 連結管理 UI（產生/撤銷/複製公開網址），server actions 比照 `actions/members.ts`。
- i18n：`messages/{zh-TW,zh-CN,en,ms}.json` 新增命名空間。
- **明確不含（列入待實作，見第 8 節）**：實體檔案上傳落地（僅保留 `file_url` 佔位）、SOP 分流進度條、專屬連結模式。
