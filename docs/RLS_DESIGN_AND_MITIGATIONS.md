# RLS 設計說明與已知問題紀錄

本手冊說明 TMS 多租戶場景下的 **Row Level Security（RLS）** 設計取捨、已發生的實際問題、以及採用的修正方式。供開發、維運與 Supabase migration 套用時查閱。

**相關檔案：**

- 遷移：`supabase/migrations/`
- 帳戶儲存：`src/app/[locale]/(app)/account/actions.ts`
- 登入後導向：`src/lib/tenant/post-auth.ts`
- 邀請流程：`src/app/[locale]/actions/members.ts`、`src/lib/invitations/`
- 手動待辦索引：`docs/MANUAL_FOLLOWUPS.md`

---

## 1. RLS 設計有錯嗎？

**結論：租戶資料隔離的大方向沒有錯，但「本人更新 `profiles`」這條政策設計過嚴，且與多租戶 onboarding 流程未完全對齊。**

### 1.1 設計上合理的部分

| 項目 | 說明 |
|------|------|
| 租戶資料隔離 | `projects`、`customer_master`、`project_financials` 等以 `tenant_id` + membership 限制，符合 SaaS 需求 |
| 財務欄位分表 | 金額放在 `project_financials`，可對敏感欄位做更細的 RLS |
| SECURITY DEFINER 輔助函式 | `auth_profile_permission()`、`is_tenant_admin_for()` 等，避免 RLS 政策內無限遞迴（見 migration 035） |
| 邀請預查 RPC | `invitation_token_active`、`invitation_email_matches` 允許 anon 在**不洩漏列資料**前提下驗證 token |

### 1.2 設計上過嚴或易出問題的部分

| 項目 | 問題 |
|------|------|
| **`profiles_update_own` 的 `WITH CHECK`**（migration 006／009） | 要求 `active_tenant_id` 必須對應一筆 **active** 的 `tenant_memberships`。在 onboarding、邀請加入、工作區指標漂移時，**本人更新自己的 profile 也會被擋** |
| **`profiles.permissions` 綁在 profile 列上** | 權限是**全域**的，不是 per-tenant；使用者加入第二個租戶時，切換 workspace 不會切換權限（架構限制，非單次 bug） |
| **邀請 `expires_at` 與重新寄送** | 舊版「重寄信」不刷新 token／期限，導致連結永久無效（見 migration 046） |
| **Owner 與 `permissions` JSON** | 單人租戶 owner 若 `permissions` 全 false，RLS 與前端選單皆可能無法使用功能（見 042、043） |

### 1.3 「繞過 RLS」是否等於設計失敗？

在 Supabase／PostgreSQL 多租戶應用中，**針對「僅能操作自己列、且欄位白名單明確」的 SECURITY DEFINER RPC**，是常見且可接受的補強方式，前提是：

1. 函式內**只**以 `auth.uid()` 限定操作對象  
2. **只更新允許的欄位**（不可順便改 `permissions`、`tenant_id` 等）  
3. 仍保留 RLS 保護**跨使用者、跨租戶**的讀寫  

本專案中的 `mark_password_set`、`save_account_profile` 屬於此類 **self-service 安全通道**，並非關閉 RLS，而是避免 `WITH CHECK` 在過渡狀態誤傷本人操作。

**中長期可選改進（尚未實作）：** 放寬 `profiles_update_own`，使「本人更新非敏感欄位」不需連動 `active_tenant_id` 檢查；敏感欄位（`permissions`、`active_tenant_id`）仍由獨立政策或 trigger 保護。

---

## 2. 已知問題與修正對照表

以下依**使用者可感知症狀**整理。

| # | 症狀 | 根因 | 修正方式 | Migration／程式 |
|---|------|------|----------|-----------------|
| 1 | 設定密碼後提示無法更新狀態；或卡在 set-password | `profiles_update_own` 的 `WITH CHECK` 擋下 `password_set_at` 更新 | SECURITY DEFINER RPC，僅更新自己的 `password_set_at` | `033_mark_password_set_rpc.sql`；`account/actions.ts` → `markPasswordSet()` |
| 2 | **所有人**（含 owner、新成員）在帳戶頁「儲存基本資料」失敗 | 同上 RLS 擋下 `profiles`／`profile_private` 的 UPDATE／upsert | SECURITY DEFINER RPC，白名單更新本人基本資料 | `047_save_account_profile_rpc.sql`；`saveAccountProfile()` |
| 3 | 租戶 owner 無法使用譯者／案件等功能；或 RLS 拒絕操作 | `auth_profile_permission()` 只看 `profiles.permissions` JSON，owner 未開 flag 時為 false | DB：`tenant_memberships.role = 'owner'` 時視為全開；前端：`isWorkspaceAdmin` 全開 | `043_auth_profile_permission_owner_bypass.sql`；`use-permission.ts` |
| 4 | 單人租戶 owner 無法在成員頁替自己開權限 | trigger `profiles_guard_self_permission_mutate` 禁止自改 `permissions` | owner 可自改 `permissions`；042 放寬 trigger | `042_allow_owner_self_permissions_update.sql` |
| 5 | 點邀請連結顯示「邀請無效」 | token 過期仍 pending；重寄不刷新；或連結格式／env 問題 | 重寄刷新 token + 延長 14 天；046 修復過期 pending；連結改 `/login?invite=` | `046_refresh_invitation_on_resend.sql`；`members.ts` |
| 6 | 受邀加入後僅能看儀表板 | 接受邀請未寫入最小 permissions | `accept_invitation` 對非 owner/admin 寫入全 false permissions | `045_invitation_login_flow_and_minimal_permissions.sql` |
| 7 | `tenant_memberships` 查詢觸發 RLS 無限遞迴 | 政策內互相引用 | SECURITY DEFINER helper + 簡化政策 | `035_fix_tenant_memberships_rls_recursion.sql` |

---

## 3. 各項修正詳述

### 3.1 本人更新 `profiles` 被 RLS 擋下（#1、#2）

**政策原文（概念）：** migration 009 `profiles_update_own`

```sql
-- 本人 UPDATE 時，新列必須滿足：
active_tenant_id IS NULL
OR 使用者沒有任何 active membership
OR active_tenant_id 對應一筆 active membership
```

**為何 owner 也會失敗：** 若 `active_tenant_id` 與 membership 不一致（歷史資料、切換工作區、邀請流程中間狀態），**即使 role = owner** 仍無法通過 `WITH CHECK`。

**修正：**

| RPC | 允許更新的欄位 | 呼叫位置 |
|-----|--------------|----------|
| `mark_password_set()` | 僅 `profiles.password_set_at` | 設定密碼流程 |
| `save_account_profile(...)` | `full_name`、`nickname`、`gender`、`phone`、`address`、`region`、`timezone`、`language_preference`；以及 `profile_private.real_name` | 帳戶頁「儲存基本資料」 |

**套用：** 在 Supabase 執行 `033`、`047`（若尚未套用）。

**驗證：**

1. 以 owner 登入 → 帳戶頁修改顯示名稱 → 應顯示「已儲存基本資料」  
2. 以新邀請成員登入 → 同上  
3. SQL Editor：`select proname from pg_proc where proname in ('mark_password_set','save_account_profile');` 應有兩列  

---

### 3.2 Owner 權限與 `permissions` JSON（#3、#4）

**問題：** 產品規則為「租戶 owner 應擁有最大權限」，但 RLS 與前端原先只認 `profiles.permissions` 的 `can_*` flag。

**修正：**

- **043**：`auth_profile_permission(p_key)` 若目前 workspace 的 membership 為 `owner` → 回傳 `true`  
- **042**：trigger 允許 owner 更新自己的 `permissions`  
- **前端**：`usePermission()` 對 `super_admin` 與 workspace `owner`／`admin` 視為全開  

詳細 changelog：`docs/CHANGELOG_OWNER_PERMISSIONS_2026-05-09.md`

---

### 3.3 邀請連結與重新寄送（#5、#6）

**舊行為問題：**

- 邀請信連結指向 `/invite/[token]`，token 失效時整頁 404  
- `pending` 且 `expires_at` 已過期時，RPC 回傳 invalid，但 DB 仍占住 pending 列，無法新建  
- 「重新寄送」只重寄 email，**不刷新 token／期限**  

**現行修正：**

- 連結格式：`/{locale}/login?invite={token}`（舊 `/invite/` 會 redirect）  
- **046**：`refresh_member_invitation` 重寄時新 token + 延長 14 天；並一次修復已過期的 pending 列  
- **045**：接受邀請後，非 owner/admin 角色寫入最小 permissions（僅儀表板；細部權限由 owner 在成員管理開啟）  

**套用：** `045`、`046`（及前端已部署的 commit 173f1b6 之後版本）。

---

## 4. Migration 套用順序（045–047 區段）

若遠端 DB 已套用至 044，請依序執行：

1. `045_invitation_login_flow_and_minimal_permissions.sql`  
2. `046_refresh_invitation_on_resend.sql`  
3. `047_save_account_profile_rpc.sql`  

套用後建議在成員管理 **重新寄送一次邀請**，並用**新信連結**測試。

---

## 5. 維運檢查清單

- [ ] Supabase 已套用 033、042、043、045、046、047  
- [ ] Vercel `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`、`NEXT_PUBLIC_SITE_URL` 已設定  
- [ ] 邀請信連結為 `https://<site>/{locale}/login?invite=<uuid>`  
- [ ] owner 與新成員皆可儲存帳戶基本資料  
- [ ] 新成員接受邀請後僅見儀表板；owner 可在成員管理開啟權限  

---

## 6. 後續設計建議（未實作）

1. **拆分 `profiles_update_own`**：一般欄位（姓名、電話）與敏感欄位（`permissions`、`active_tenant_id`）分開政策  
2. **Per-tenant 權限**：改存 `tenant_memberships.permissions` 或獨立表，避免跨租戶切換時權限錯亂  
3. **邀請狀態 UI**：成員頁將 `pending · staff` 改為 i18n 中文，並顯示過期時間  
4. **減少 fallback RPC**：migration 全數套用後，可考慮移除 `saveAccountProfile` 內對 direct UPDATE 的 fallback，並將 RPC 錯誤回傳至前端以利診斷  

---

*最後更新：2026-05-21 — 含邀請流程修正（045–046）、帳戶儲存 RPC（047）、owner 權限 bypass（042–043）。*
