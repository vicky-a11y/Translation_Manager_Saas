# PINCHIEH TMS 產品手冊（總覽）

> **最後更新：2026-06-19**
>
> 本手冊彙整**已實作功能**、**業務規則與流程**、**權限對照**，以及**待實作項目**。細部規格請交叉參閱各專題文件。

---

## 文件索引

| 文件 | 用途 |
|------|------|
| **`MEMORIES.md`** | 開發脈絡：已完成實作與技術約定 |
| **`ROADMAP.md`** | 待建置功能與擴充方向 |
| **`docs/MANUAL_FOLLOWUPS.md`** | 維運手動待辦、遷移順序、環境變數 |
| **`docs/PROJECT_CUSTOMER_FLOW.md`** | 客戶／案件／Intake 流程圖（Mermaid） |
| **`docs/CUSTOMER_INTAKE_DESIGN.md`** | 客戶自助建檔 Intake V1 設計與待辦 |
| **`docs/TRANSLATOR_MANAGEMENT_V1_STATUS.md`** | 譯者管理資料層與 UI 狀態 |
| **`docs/RLS_DESIGN_AND_MITIGATIONS.md`** | RLS 設計、已知問題與 migration 對照 |
| **`docs/FINANCE_AUDIT_SPEC.md`** | 財務異動稽核規格 |

---

## 1. 已實作功能（依模組）

### 1.1 認證與 onboarding

| 功能 | 路由／入口 | 規則摘要 |
|------|------------|----------|
| Email OTP / 密碼登入 | `/[locale]/login` | 首次或無密碼者走 OTP；已設密碼者信箱＋密碼 |
| 邀請加入租戶 | `/[locale]/login?invite=<token>` | 舊 `/invite/[token]` 自動 redirect；重寄會刷新 token（046） |
| 歡迎／建立公司 | `/[locale]/welcome` | 網域驗證或人工審核申請 |
| 設定密碼 | `/[locale]/set-password` | `mark_password_set()` RPC（033） |
| 帳戶基本資料 | `/[locale]/account` | `save_account_profile` RPC（047）繞過過嚴 RLS |

### 1.2 儀表板與導航

| 功能 | 說明 |
|------|------|
| 營運統計卡 | 進行中／待交稿／已結案（互斥狀態計數） |
| 最近案件表 | 案件編號、名稱、交件截止日期、狀態；逾期標紅；可連結明細 |
| 歡迎語 | 顯示 `full_name` → `nickname` fallback |
| 側欄選單 | 有權限：hover 圓角底色；無權限：淺灰顯示、不可點選（仍顯示於選單） |
| 租戶切換器 | 多租戶使用者切換 `active_tenant_id` |
| 四語系 | `zh-TW`、`zh-CN`、`en`、`ms` |

**側欄權限對照**

| 選單 | 進入條件 |
|------|----------|
| 儀表板、帳戶 | 已登入即可 |
| 成員 | `super_admin`／workspace admin／`can_manage_vendors` |
| 財務 | `super_admin`／`can_view_finance` |
| 案件、客戶 | `super_admin`／`can_edit_projects` |
| 譯者 | `super_admin`／`can_manage_vendors` |
| 設定 | `super_admin`／`can_access_settings` |

### 1.3 成員與權限

| 功能 | 說明 |
|------|------|
| 成員列表 | TanStack Table；邀請、重寄、撤銷 |
| 權限開關 | Dialog + Switch；儲存經 `admin_set_member_permissions` RPC |
| Realtime 同步 | `profiles` 訂閱；多分頁權限較不易不同步（016） |
| 租戶內職務 | `tenant_memberships.role`：owner / manager / admin / staff / translator |
| 平台權限開關 | `profiles.permissions` JSONB；`super_admin` 視為全開 |

### 1.4 案件管理

| 功能 | 路由 | 規則摘要 |
|------|------|----------|
| 列表（年月篩選） | `/projects` | 編號、名稱、交件日、譯者、客戶；逾期標示 |
| 新增 | `/projects/new` | 必填編號（租戶內唯一）、名稱、交件日、客戶、金額；可填備註 |
| 明細／修改 | `/projects/[id]` | 案件資訊、金額收款、譯者指派分區編輯 |
| 刪除 | 明細頁 | 確認對話框（是／否）→ CASCADE 刪除 |
| Intake 預填建案 | `/projects/new?from_intake=` | 預選客戶、金額、唯讀參考區塊 |

**案件狀態**：`draft`、`quoted`、`in_progress`、`processing`、`review`、`pending`、`assigned`、`delivered`、`completed`、`cancelled`（儀表板統計依狀態分組）。

### 1.5 客戶管理

| 功能 | 路由 | 規則摘要 |
|------|------|----------|
| 列表 | `/customers` | 最近客戶；需 `can_edit_projects` |
| 新增 | `/customers/new` | 防重：`tax_id`、`im_platform+im_id`；同步主要聯絡人 |
| 明細／編輯 | `/customers/[id]` | 主檔與聯絡人維護 |
| Intake 收件匣 | `/customers/intake` | 連結管理、pending 審核、轉正、刪除暫存 |

### 1.6 客戶自助建檔（Intake V1）

| 功能 | 說明 |
|------|------|
| Migration | **048**（使用者已套用） |
| 公開填表 | `/[locale]/intake/[token]` — 兩階段預覽、RPC 入庫 |
| 後台審核 | 核准 → 建 `customer_master` → 預填跳轉建案 |
| 管道分流 | `online_paid`／`walk_in_cash`／`corporate_postpaid`（欄位層級） |
| 尚未實作 | 檔案上傳、SOP 進度條、專屬連結模式（見 `CUSTOMER_INTAKE_DESIGN.md` §8） |

### 1.7 譯者管理

| 功能 | 路由 | 規則摘要 |
|------|------|----------|
| 列表 | `/translators` | 編號、姓名、Email、服務標籤 |
| 新增／編輯 | `/translators/new`、`/[id]` | 銀行帳戶等；**母語／語言能力 UI 暫緩** |
| 一案多譯者 | 案件明細指派區 | `project_translator_assignments` |
| 待撥款佇列 | DB trigger | 回稿後自動入 `translator_monthly_payout_queue` |

### 1.8 財務

| 功能 | 路由 | 規則摘要 |
|------|------|----------|
| 月度營收總覽 | `/finance` | 依建立月份篩選；已收／未收／規費／稅額合計 |
| 譯者月結對帳 | `/finance/vendor-settlement` | 讀取 `v_finance_translator_monthly_settlement`（**049**） |
| 譯者篩選／CSV 匯出 | 月結頁 toolbar | 依譯者、月份篩選後匯出 |
| 案件財務編輯 | `/projects/[id]` | 收款、支付方式、匯款末五碼等 |
| 異動稽核 API | `GET /api/finance/audit` | 欄位級 audit；後台頁面待建（ROADMAP） |

**財務權限**：需 `can_view_finance`（或 `super_admin`）；RLS 與 membership owner/manager 並用。

---

## 2. 核心業務規則

### 2.1 多租戶隔離

- 所有業務表含 `tenant_id`；查詢經 `createTenantScopedSupabase` 或 Repository 顯式帶入工作區。
- 主鍵一律 **UUID v4**；嚴禁業務表使用自增整數 PK。
- 有效存取範圍 = **有效 membership** + **`active_tenant_id` 工作區**。

### 2.2 事、錢、人解耦

- **案件** `projects`：流程與交件。
- **金額** `project_financials`：營收、收款、規費；不寫在 `projects` 主表。
- **譯者成本** `project_translator_assignments` + 待撥款佇列。
- **客戶** `customer_master`：須先存在（或 Intake 轉正）才能建案。

### 2.3 Intake 轉正規則

1. 客戶公開送出 → `customer_intake_submissions`（`pending`）。
2. 業務核准 → 寫入 `customer_master`（`tax_id` 防重；email 防重尚未實作）。
3. **不自動建案** → 導向 `/projects/new` 預填，由業務手動完成建案與備註。
4. 匯款資訊於建案後由業務於財務區寫入 `project_financials`。

### 2.4 邀請規則

- 連結格式：`/{locale}/login?invite=<token>`。
- 重寄刷新 token 並延長 14 天（046）。
- **不得**向租戶揭露受邀者跨租戶身分（法遵原則，見 `MANUAL_FOLLOWUPS.md` §2.1）。

### 2.5 RLS 與 RPC 原則

- RLS 保持嚴格；本人更新 `profiles` 若被 `profiles_update_own` 擋下，以 **SECURITY DEFINER 白名單 RPC** 補強（033、047）。
- 公開寫入（Intake、邀請預覽）一律經 RPC，函式內鎖定 `tenant_id`。

---

## 3. 主要流程（快速導覽）

```
註冊/登入 → 歡迎/onboarding → 儀表板
                ↓
         邀請成員（login?invite=）
                ↓
    ┌───────────┴───────────┐
    │                       │
手動新增客戶          客戶 Intake 公開填表
    │                       │
    └───────────┬───────────┘
                ↓
           新增案件（draft）
                ↓
      指派譯者 → 回稿 → 待撥款佇列
                ↓
    財務收款／月結對帳／結案
```

**詳細流程圖**：`docs/PROJECT_CUSTOMER_FLOW.md`

---

## 4. 資料庫遷移（近期重點）

| 編號 | 主題 | 狀態 |
|------|------|------|
| 042–043 | owner 自行調整權限、bypass | 已進版 |
| 045 | 邀請登入、最小權限 | 已進版 |
| 046 | 重寄刷新邀請 token | 已進版 |
| 047 | `save_account_profile` RPC | 已進版 |
| **048** | 客戶 Intake 流程 | **已套用（Supabase）** |
| **049** | `v_finance_translator_monthly_settlement` | 需確認已套用（月結頁依賴） |

完整順序與故障排除：`docs/MANUAL_FOLLOWUPS.md`、`docs/RLS_DESIGN_AND_MITIGATIONS.md`

---

## 5. 待實作項目（彙總）

### 5.1 高優先（業務可見缺口）

| 項目 | 說明 | 參考 |
|------|------|------|
| Intake 檔案上傳 | Storage、signed URL、10MB 限制 | `CUSTOMER_INTAKE_DESIGN.md` §6、§8.1 |
| Intake 業務通知 | 客戶送出後 email 通知業務 | §8.7 |
| 財務異動歷程後台頁 | Table + 篩選 + 分頁 | `ROADMAP.md`、`FINANCE_AUDIT_SPEC.md` |
| 人工審核開通租戶 | 審核通過後自動建租戶 | `MANUAL_FOLLOWUPS.md` §3 |

### 5.2 譯者／成本（VNext）

| 項目 | 說明 |
|------|------|
| 譯者母語／語言能力 UI | DB 已有欄位，表單暫緩 |
| 語種費率管理 | 依語言／單位計價 |
| 物流追蹤連結、寄出通知、狀態同步 | `TRANSLATOR_MANAGEMENT_V1_STATUS.md` §3.1 |
| 通用成本分錄 `project_cost_entries` | 影印、雜支、差旅 |
| 稅務扣繳自動計算 | V2.0 |

### 5.3 Intake／案件進階

| 項目 | 說明 |
|------|------|
| 專屬連結模式 | 已確認委託、直送財務審核 |
| SOP 分流進度條 | 案件類型＋階段子系統 |
| 寄件標籤正式歸宿 | `shipping_*` 欄位對應 |
| Email 防重 | 轉正時可選邏輯 |

### 5.4 平台／多租戶

| 項目 | 說明 |
|------|------|
| 公司網域驗證完整流程 | 部分已有，待產品化 |
| 平台 vendor 儀表板與接案 | 僅 `is_platform_vendor` 標記 |
| 專業領域標籤 | 案件與譯者篩選 |

---

## 6. 環境與部署

| 變數 | 用途 |
|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 專案 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 前端金鑰 |
| `NEXT_PUBLIC_SITE_URL` | 邀請／Intake 連結基底 |
| `RESEND_API_KEY`、`RESEND_FROM_EMAIL` | 邀請信、網域驗證信 |

- **正式站**：https://translation-manager-saas.vercel.app
- **GitHub**：`vicky-a11y/Translation_Manager_Saas`
- 推送 `main` 後 Vercel 自動部署；schema 變更需另於 Supabase 套用 migration。

---

*維護慣例：新功能完成後，請同步更新本手冊、`MEMORIES.md`（已完成）、`ROADMAP.md`（待辦），並在專題文件補細節。*
