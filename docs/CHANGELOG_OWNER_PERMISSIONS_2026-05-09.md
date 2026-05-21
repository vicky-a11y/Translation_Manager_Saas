## 目的

將「租戶 owner 擁有最大權限」明確寫入規則，避免單人租戶或初始 owner 因 `profiles.permissions` 未開啟而無法使用功能（例如：譯者管理選單不可點、RLS 被擋等）。

## 權限規則調整（已完成）

- **前端 / 選單權限（Client）**
  - `src/hooks/use-permission.ts`
    - 規則：`super_admin` 與 `isWorkspaceAdmin（owner/admin）` 視為全開（所有 `can_*` 皆為 true）。

- **資料庫權限（RLS 依賴）**
  - `supabase/migrations/043_auth_profile_permission_owner_bypass.sql`
    - 規則：`public.auth_profile_permission()` 若偵測目前 workspace tenant 的 `tenant_memberships.role = 'owner'`，直接回傳 true。

- **允許 owner 在單人成員狀態調整自身 permissions（已完成）**
  - `supabase/migrations/042_allow_owner_self_permissions_update.sql`
    - 放寬 `profiles_guard_self_permission_mutate()`：owner 可更新自己的 `profiles.permissions`（非 owner 仍禁止自改）。

## 本次新增/修改功能（已完成）

- **案件明細頁：金額資訊**
  - 新增「已收款 / 未收款」顯示與可編輯（修改/儲存/取消）。
  - 支付方式擴充：現金、轉帳/匯款（銀行名稱/帳號末五碼/臨櫃）、海外電匯、信用卡、其他。
  - 檔案：
    - `src/app/[locale]/(app)/projects/[id]/page.tsx`
    - `src/app/[locale]/(app)/projects/[id]/project-finance-editor.tsx`
    - `src/app/[locale]/(app)/projects/[id]/actions.ts`
    - `supabase/migrations/041_project_financials_payment_details_v2.sql`

- **案件明細頁：指派譯者（可多筆）**
  - 支援多位譯者：+新增、模糊搜尋點選、稿費、回稿日期、修改/儲存/刪除。
  - 檔案：
    - `src/app/[locale]/(app)/projects/[id]/project-assignments-editor.tsx`
    - `src/app/[locale]/(app)/projects/[id]/actions.ts`

- **成員管理：允許對自己開啟權限設定（已完成）**
  - `src/components/members/members-data-table.tsx`：自己那列也可點「權限設定」。
  - `src/components/members/member-permissions-dialog.tsx`：儲存失敗會顯示錯誤訊息（避免無感失敗）。

- **i18n**
  - `messages/zh-TW.json`, `messages/zh-CN.json`, `messages/en.json`, `messages/ms.json` 補齊案件明細新增欄位文字。

## 待修正 / 待優化（建議下一步）

- **ProjectFinanceEditor 的 useActionState 呼叫方式**
  - 目前是 `onClick -> formAction(fd)`，瀏覽器 console 會提示建議放在 transition 或改用 `<form action={formAction}>`。
  - 建議改成真正的 `<form>` 提交，讓 `pending`/狀態更穩定，避免 dev server 熱重載時資源飆升。

- **server-side 權限檢查一致性**
  - 目前多數頁面仍是 `isSuper || flags.can_*`；在「owner 視為全開」規則下，建議加一個共用 helper（例如 `requireWorkspacePermission`）統一處理 owner/admin bypass，避免漏改。

