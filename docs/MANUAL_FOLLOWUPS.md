# 手動待辦／後續查閱事項

本檔記錄與「註冊流程、歡迎頁、vendor 遷移」相關、**無法僅靠程式庫自動完成**或**建議後續補強**的項目，方便之後查閱。

**檔案位置（本 repo）：**  
`docs/MANUAL_FOLLOWUPS.md`  
（完整路徑：`tms_saas/tms/docs/MANUAL_FOLLOWUPS.md`）

---

## 1. 資料庫遷移

- 請在 Supabase（或你的 Postgres）依序套用遷移（**順序很重要**）：
  1. **`008_profile_permission_flags.sql`**（建立 `profiles.permissions` 等；若已套用可略過）
  2. **`011_onboarding_membership_tenant_profiles.sql`**（若尚未套用）
  3. **`012_vendor_welcome_invite_refactor.sql`**（vendor／歡迎流程相關 schema；**無 `permissions` 欄位時會略過 JSON 鍵更新並留 NOTICE**）
  4. **`013_vendor_permissions_after_profiles_flags.sql`**（**必須在 008 之後**；更新 `can_manage_vendors` RPC／`auth_profile_permission`；若缺 `permissions` 欄位會 **直接報錯** 並中止）
- 新 clone 建議依 `migrations/` 目錄**檔名數字順序**跑完整遷移。
- **`016_enable_realtime_profiles.sql`**：將 **`public.profiles`** 納入 **`supabase_realtime`** publication，並設 **`REPLICA IDENTITY FULL`**，讓前端 **`AppPermissionProvider`** 對 `profiles` 的 **filtered `postgres_changes`**（例如 `id=eq.<user>`）能收到 **UPDATE** 事件，多分頁權限較不易舊資料。

### 1.1 若執行 012 出現 `column p.permissions does not exist`（42703）

- **原因**：`public.profiles` 尚無 **`permissions`** 欄位（通常表示 **008 尚未套用**）。PostgreSQL 在 `UPDATE ... p SET permissions = ...` 時會解析 `p.permissions`，欄位不存在即報錯。
- **處理**：
  1. 先套用 **`008_profile_permission_flags.sql`**（或確認該欄已存在）。
  2. 使用**已修正**的 `012`（會偵測欄位；缺欄時略過 JSON 更新並 `RAISE NOTICE`），再執行 **`013`** 完成 RPC／權限鍵遷移。
  3. 若先前 012 **執行到一半失敗**，請在 Supabase 檢查已成功的片段（例如 enum 已改名），必要時以**手動 SQL**補齊剩餘段落或洽 DBA／還原備份後重跑。

---

## 2. 邀請連結與寄信

- 受邀者需開啟的網址格式：**`/{locale}/invite/<邀請 token>`**（例如 `/zh-TW/invite/xxxxxxxx-xxxx-...`）。
- Token 需自 **邀請紀錄 UI** 或 **`public.invitations`** 查詢。
- 目前 **建立邀請後不會自動寄信**；若要產品化，需另行串接寄信（例如 Resend）並在 `createMemberInvitation` 成功後寄出含連結的信件。

### 2.1 跨租戶身分：租戶端不得探知（產品／法遵原則）

- 基於**資安、競業、個資**等考量：**不允許租戶在邀請使用者時**，得知該受邀者**是否同時**或**曾經**為**其他租戶**的用戶（亦不向租戶揭露是否／曾為平台供應商等跨租戶脈絡）。
- **現況**：邀請僅寫入 `invitations.email` 等；**未**對租戶管理員提供「以 email 反查 `auth.users`／他租戶 `tenant_memberships`／`is_platform_vendor`」之 API 或 UI。
- **後續開發注意**：若新增「邀請前查詢」「預覽受邀者背景」等能力，**不得**對租戶回傳上述跨租戶資訊；若業務確有必要，應限**平台管理者（內部）**於獨立合規流程中處理，並另做法律／資安評估。

---

## 3. 人工審核開通租戶

- 使用者在歡迎頁選「人工審核」時，僅寫入 **`manual_review_requests`**（與既有邏輯相同）。
- **審核通過後自動建立租戶／成員資格** 的流程，程式庫內尚未實作；若需要，需後台或 RPC／管理介面另行開發。

---

## 4. 平台供應商（vendor）功能範圍

- 目前僅 **`profiles.is_platform_vendor`** 與 RPC **`set_self_platform_vendor`**，以及歡迎頁上的登記按鈕。
- **供應商專用儀表板、接案流程、與租戶的商業關係** 等尚未建置；若產品需要，請另立規格實作。

---

## 5. 環境變數與第三方

- **網域驗證信**：仍依賴 **`RESEND_API_KEY`**、**`RESEND_FROM_EMAIL`**（見 `onboarding/actions.ts`）；未設定時開發模式會顯示 **dev 驗證連結**。
- **Supabase**：Email OTP 範本若仍含「點連結登入」，與前端「僅輸入 6 碼」文案可能不一致，建議在 Supabase 後台改為 **OTP 為主**（見 `messages` 內 `Auth.otpOnlyHint` 說明）。

---

## 6. 變更摘要對照（方便搜尋）

| 主題           | 相關路徑或檔案 |
|----------------|----------------|
| 歡迎頁         | `src/app/[locale]/welcome/` |
| 邀請頁         | `src/app/[locale]/invite/[token]/` |
| 遷移 012／013  | `supabase/migrations/012_vendor_welcome_invite_refactor.sql`、`013_vendor_permissions_after_profiles_flags.sql` |
| 登入後導向邏輯 | `src/lib/tenant/post-auth.ts` |

---

*最後更新：對應「註冊／歡迎／vendor／邀請」改版完成後之手動項目清單。*

---

## 7. 譯者財務模組下一版（郵寄與成本管理）

### 已在 V1.0 落地（資料層）

- 新增 `project_shipping_costs`：可記錄郵寄成本，最小必要欄位含：
  - `shipping_date`（寄件日期）
  - `tracking_number`（物流單號）
  - `amount`（金額）
  - `carrier_name`、`shipping_method`、`note`
- 新增 `v_project_cost_summary`：可彙總每案：
  - `project_revenue`
  - `translator_total_cost`
  - `disbursement_fee`
  - `shipping_total_cost`
  - `gross_profit`、`gross_margin_rate`

### 下一版可升級項目（尚未實作）

- 物流追蹤連結產生器（依物流商與單號產出追蹤 URL）
  - 例如中華郵政、DHL、FEDEX、順豐、黑貓、店到店。
- 寄件後自動通知客戶（Email / App Push / IM）
  - 事件來源可掛在新增 `project_shipping_costs` 後觸發。
- 物流狀態同步（已寄出 / 運送中 / 已簽收）
  - 需串第三方 API 或批次匯入。
- 擴充通用成本分錄（影印、雜支、差旅、外包等）
  - 建議新增通用 `project_cost_entries`，並與郵寄成本統合查詢。
- 毛利報表進階分析
  - 依語種、服務類型（TR/TS/DTP/VE）、客戶類型、月份進行交叉統計。

---

## 8. 譯者管理模組文件索引

- 請搭配以下文件查閱目前狀態：
  - `docs/TRANSLATOR_MANAGEMENT_V1_STATUS.md`
    - 已實作資料表、功能、報表 view
    - 待實作項目（物流追蹤、自動通知、通用雜支成本、稅務自動計算）
    - 上線前檢查清單
  - `docs/TRANSLATOR_MANAGEMENT_UAT_CHECKLIST.md`
    - PM/QA 驗收清單
    - 欄位防呆機制驗證項目
    - 權限/RLS 與報表計算驗證
  - `docs/TRANSLATOR_MANAGEMENT_SQL_VALIDATION.md`
    - 可直接貼到 Supabase SQL Editor 的驗證腳本
    - 含防呆錯誤測試（預期失敗）與正向流程測試
