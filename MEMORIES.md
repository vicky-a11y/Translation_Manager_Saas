# 專案脈絡（Context）

本檔案記錄目前已完成的實作，供後續開發對齊既有行為與約定。

## 路由與導航

- 根路徑自動 **redirect** 至 `/[locale]/dashboard`。
- 側欄支援 `/[locale]` 前綴路由，並正確反映 **選中狀態**。
- 頂欄 **Tenant Switcher**：多租戶使用者可切換 `active_tenant_id` 工作區。

## 多語系 (i18n)

- 儀表板標題已完成 **四語系對齊**：`zh-TW`、`zh-CN`、`en`、`ms`（`next-intl`，路徑 `/[locale]/`）。

## 統計模組

- 使用 **Shadcn Card** 呈現三類 **互斥** 統計：**進行中**、**待交稿**、**已結案**。
- 已定義對應的 **狀態過濾邏輯**（與案件狀態欄位一致）。
- 儀表板 **projects** 統計查詢已收斂至 **`createProjectsRepository()`**（`scoped()` 自動帶入目前工作區 `tenant_id`）。

## 資料安全 (Security)

- 實作 `log-project-query-error.ts`，用於捕捉 **RLS** 相關查詢錯誤。
- 租戶範圍查詢請優先使用 **`createTenantScopedSupabase`**（`TENANT_SCOPED_TABLES` 內之表預設附加 `tenant_id`），並與 **RLS** 並行防護。
- **租戶內職務**：`public.tenant_memberships.role`（owner / manager / admin / staff / translator）仍用於邀請、成員表「工作區角色」與部分 RLS 後援條件。
- **平台／權限開關**：`public.profiles.role` 為 **`profile_role` ENUM**（`super_admin` | `tenant_owner` | `staff` | `translator`），並有 **`permissions` JSONB**（`can_view_finance`、`can_edit_projects`、`can_manage_translators`、`can_assign_tasks`、`can_access_settings`）。**`super_admin`** 在 **`auth_profile_permission`** 中視為全部允許；**`auth_is_super_admin()`** 於 **`tenants` / `projects` / `profiles` 同租戶列表** 等 RLS 可繞過租戶列限制。
- **財務與設定 RLS**：**`project_financials`** 與 **`projects` 寫入**、**`tenants` 更新** 等會檢查 **`auth_profile_permission(...)`**（含 `can_view_finance` / `can_edit_projects` / `can_access_settings`），並可與 **membership 的 owner/manager** 條件並用（遷移 **`008_profile_permission_flags.sql`**）。
- **`admin_set_member_permissions` RPC**：僅 **租戶 membership 為 `owner`** 可更新同租戶成員之 **`permissions`**；**`profiles_guard_self_permission_mutate`** 防止非 `super_admin` 自行竄改 JSON 開關。
- **`projects.amount`** 仍位於 **`project_financials`**；新案件由 **`after_project_insert_financials`** 建立對應列。
- **資料表維護原則**：財務需求優先擴充既有 **`project_financials`**（欄位/約束/函式/View），避免另建平行主表，確保既有關聯與 RLS 不被破壞。
- **財務異動稽核**：`project_financials` 已加上欄位級 audit trigger（寫入 `system_audit_logs`）；並提供 `GET /api/finance/audit` 查詢端點與 repository。規格見 `docs/FINANCE_AUDIT_SPEC.md`。
- **密碼狀態標記（`password_set_at`）用白名單 RPC，而非放寬 RLS**：`profiles.password_set_at` 的更新由 **`mark_password_set()`**（遷移 **`033_mark_password_set_rpc.sql`**）處理。函式為 **SECURITY DEFINER**、只改 `auth.uid()` 自己那一列、且只動 `password_set_at` 單一欄位，並以 `grant execute ... to authenticated` 限制呼叫者。這可讓**新註冊尚未完成 onboarding**（`active_tenant_id` 尚未與 `tenant_memberships` 對齊）的使用者在 `set-password` 頁面順利完成密碼設定，同時保留 **`profiles_update_own`**（`009_onboarding_bootstrap_and_profiles_rls.sql`）原有的嚴格 `with check`。Server action `markPasswordSet`（`src/app/[locale]/(app)/account/actions.ts`）優先走 RPC，並保留直接 UPDATE 的 fallback 與詳細錯誤訊息以便排查。原則：**RLS 保持嚴格；需繞 RLS 的小面向動作以白名單 RPC 封裝**，勿整片放寬 policy。

## 資料庫維運（Migrations）

- **單一來源於 `supabase/migrations/*.sql`**：所有 schema / RLS / function / trigger 變更一律以帶序號的遷移檔提交（如 `033_mark_password_set_rpc.sql`），避免僅在 Dashboard SQL Editor 手動貼 SQL 而漏紀錄，造成 CLI 的 `schema_migrations` 歷史與實際 schema 不一致。
- **部署流程**：以 `supabase link --project-ref <ref>` 連結專案後，用 `supabase db push` 推送新增遷移；遇到 CLI 歷史缺漏時，先 `supabase migration list` 對齊 Local/Remote，再以 `supabase migration repair --status applied <versions...>` 把已在雲端跑過的檔案標記為 applied，避免重跑舊檔覆蓋新版物件（例如 `003_auth_user_profile_trigger.sql` 會把後續 `012_vendor_welcome_invite_refactor.sql` 內的 `handle_new_user` 再度覆寫回舊版）。
- **熱修補檔**：僅用於應急回寫被舊遷移覆蓋的函式或補失聯狀態，例如 `supabase/hotfix_restore_handle_new_user_and_add_rpc.sql`（2026-04-20 事件）。完成後仍應把對應內容以新遷移檔正式進版，避免環境漂移。
- **`handle_new_user` 正式版本**：以 `012_vendor_welcome_invite_refactor.sql` 內的定義為準（建立 `profiles` 與 `tenant_memberships` 並寫入 `role text`），不可回退為 `003` 內寫死 `role = 'admin'` 的舊版（與 `008_profile_permission_flags.sql` 的 `profile_role` enum 衝突，會讓新註冊整體失敗）。

## 權限 UI 與前端

- **`usePermission()`**（`src/hooks/use-permission.ts`）讀取 **`AppPermissionProvider`**（`(app)/layout` 注入）：側欄依開關隱藏 **財務**、停用或啟用 **案件／設定** 連結；**成員** 選單在 **`can_manage_translators` 或 workspace admin** 時顯示。
- **成員頁**：**TanStack Table** 資料表 + **Dialog + Switch** 調整 **`permissions`**（儲存呼叫 RPC）；**`profiles` Realtime** 由遷移 **`016_enable_realtime_profiles.sql`** 加入 **`supabase_realtime`** publication 並設 **`REPLICA IDENTITY FULL`**，搭配 **`AppPermissionProvider`** 訂閱與 **`router.refresh()`**，多分頁權限較不易不同步。

## UI 最佳化

- 案件識別在介面上以 **# 開頭的 8 碼案號** 呈現（由 UUID 簡化），提升可讀性。
