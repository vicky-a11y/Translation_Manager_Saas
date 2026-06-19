-- 052：弱化 profiles 全域角色／租戶綁定，允許「純平台用戶」（尚未加入任何租戶）。
-- 004 已將 tenant_id 改為可空；008 已將 profile_role 預設為 staff。此遷移以 idempotent 方式再次明確化。

begin;

-- 平台級 profile_role 預設為普通使用者（非 tenant_owner / vendor 等）
alter table public.profiles
  alter column role set default 'staff'::public.profile_role;

-- 允許 onboarding 前 tenant_id 為 NULL（與 active_tenant_id 一致，待 bootstrap / 邀請後再填入）
alter table public.profiles
  alter column tenant_id drop not null;

comment on column public.profiles.role is
  '平台級角色（profile_role ENUM）；預設 staff。租戶內職務以 tenant_memberships.role 為準。';

comment on column public.profiles.tenant_id is
  '（legacy 輔助）最後已知租戶；可為 NULL。有效工作區以 active_tenant_id + tenant_memberships 為準。';

commit;
