-- 034_catch_up_011_and_fix_password_state.sql
--
-- 背景：2026-04-20 診斷後發現雲端資料庫實際上漏跑了 011_onboarding_membership_tenant_profiles.sql
-- 的結構變更（`onboarding_status` / `tenant_membership_status` enum、`profiles.onboarding_status`
-- 欄位、`tenant_user_profiles` 資料表、`projects.vendor_id`），但後續 012~033 migration 內部
-- 仍假設 011 已跑，導致多個流程（尤其 set-password 後的重導）無法完成。
--
-- 本遷移是 **冪等 catch-up**：只補缺失，不重建或覆蓋現有物件。
-- 同時順便：
--   (a) 重建 `profiles_select_own` SELECT policy，確保使用者永遠能讀自己那筆 profile；
--   (b) 批次回填「auth 有密碼但 profiles.password_set_at 為空」的歷史帳號；
--   (c) 正式把 `handle_new_user` 寫入 migration 歷史（以 012 版本為準），讓先前的 hotfix 入版。

-- ---------------------------------------------------------------------------
-- 1) enum types（迴避 `create type` 無 if not exists 的限制）
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'onboarding_status'
      and n.nspname = 'public'
  ) then
    create type public.onboarding_status as enum (
      'pending_profile',
      'pending_choice',
      'completed'
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'tenant_membership_status'
      and n.nspname = 'public'
  ) then
    create type public.tenant_membership_status as enum (
      'active',
      'inactive',
      'suspended'
    );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2) public.profiles.onboarding_status
--    既有使用者一律視為 completed（避免被系統硬塞回 /welcome）；新使用者由 trigger/預設走 pending。
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists onboarding_status public.onboarding_status
    not null default 'completed'::public.onboarding_status;

alter table public.profiles
  alter column onboarding_status set default 'pending_profile'::public.onboarding_status;

-- ---------------------------------------------------------------------------
-- 3) public.tenant_memberships.status（若 011 漏跑亦補上）
-- ---------------------------------------------------------------------------
alter table public.tenant_memberships
  add column if not exists status public.tenant_membership_status
    not null default 'active'::public.tenant_membership_status;

update public.tenant_memberships
set status = 'inactive'::public.tenant_membership_status
where is_active = false
  and status = 'active'::public.tenant_membership_status;

-- ---------------------------------------------------------------------------
-- 4) public.tenant_user_profiles（組織內部對成員的備註／職銜）
-- ---------------------------------------------------------------------------
create table if not exists public.tenant_user_profiles (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  internal_title text,
  internal_note text,
  unique (tenant_id, user_id)
);

create index if not exists tenant_user_profiles_tenant_id_idx on public.tenant_user_profiles (tenant_id);
create index if not exists tenant_user_profiles_user_id_idx on public.tenant_user_profiles (user_id);

alter table public.tenant_user_profiles enable row level security;

drop policy if exists tenant_user_profiles_select on public.tenant_user_profiles;
create policy tenant_user_profiles_select
on public.tenant_user_profiles
for select
to authenticated
using (
  public.auth_is_super_admin()
  or exists (
    select 1
    from public.tenant_memberships m
    where m.user_id = auth.uid()
      and m.tenant_id = tenant_user_profiles.tenant_id
      and m.is_active = true
  )
);

drop policy if exists tenant_user_profiles_insert_admin on public.tenant_user_profiles;
create policy tenant_user_profiles_insert_admin
on public.tenant_user_profiles
for insert
to authenticated
with check (
  public.auth_is_super_admin()
  or public.is_tenant_admin_for(tenant_id)
);

drop policy if exists tenant_user_profiles_update_admin on public.tenant_user_profiles;
create policy tenant_user_profiles_update_admin
on public.tenant_user_profiles
for update
to authenticated
using (
  public.auth_is_super_admin()
  or public.is_tenant_admin_for(tenant_id)
)
with check (
  public.auth_is_super_admin()
  or public.is_tenant_admin_for(tenant_id)
);

drop policy if exists tenant_user_profiles_delete_admin on public.tenant_user_profiles;
create policy tenant_user_profiles_delete_admin
on public.tenant_user_profiles
for delete
to authenticated
using (
  public.auth_is_super_admin()
  or public.is_tenant_admin_for(tenant_id)
);

-- ---------------------------------------------------------------------------
-- 5) public.projects.vendor_id → profiles（保留歷史，on delete restrict）
-- ---------------------------------------------------------------------------
alter table public.projects
  add column if not exists vendor_id uuid;

alter table public.projects
  drop constraint if exists projects_vendor_id_fkey;

alter table public.projects
  add constraint projects_vendor_id_fkey
  foreign key (vendor_id)
  references public.profiles (id)
  on delete restrict;

create index if not exists projects_vendor_id_idx on public.projects (vendor_id);

-- ---------------------------------------------------------------------------
-- 6) 保險：確保本人永遠能讀取自己的 profile（避免 set-password 重導循環）
-- ---------------------------------------------------------------------------
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
on public.profiles
for select
to authenticated
using (id = auth.uid());

-- ---------------------------------------------------------------------------
-- 7) 歷史資料回填：auth 已設定密碼但 profiles.password_set_at 仍為 null 的帳號
--    這些使用者過去被 RLS 擋下更新，無法完成 set-password 流程；此處一次性補上。
-- ---------------------------------------------------------------------------
update public.profiles p
set password_set_at = coalesce(p.password_set_at, u.updated_at, now())
from auth.users u
where p.id = u.id
  and u.encrypted_password is not null
  and p.password_set_at is null;

-- ---------------------------------------------------------------------------
-- 8) 把 handle_new_user 正式寫回 migration 歷史（以 012 版本為準）
--    先前 2026-04-20 事件中 003 重跑覆蓋為舊版，已用 hotfix 還原；此處入版以防再被覆蓋。
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meta jsonb;
  v_tenant_id_text text;
  v_tenant_id uuid;
  v_tenant_exists boolean;
  v_full_name text;
  v_lang text;
  v_role text;
begin
  v_meta := coalesce(NEW.raw_user_meta_data, '{}'::jsonb);

  v_full_name := nullif(trim(coalesce(
    v_meta->>'full_name',
    v_meta->>'name',
    v_meta->>'display_name',
    split_part(NEW.email, '@', 1)
  )), '');

  if v_full_name is null then
    v_full_name := 'User ' || left(replace(NEW.id::text, '-', ''), 8);
  end if;

  v_lang := coalesce(nullif(trim(v_meta->>'language_preference'), ''), 'zh-TW');
  if v_lang not in ('zh-TW', 'zh-CN', 'en', 'ms') then
    v_lang := 'zh-TW';
  end if;

  v_tenant_id_text := nullif(trim(v_meta->>'tenant_id'), '');

  if v_tenant_id_text is not null then
    begin
      v_tenant_id := v_tenant_id_text::uuid;
    exception
      when invalid_text_representation then
        v_tenant_id := null;
    end;
  end if;

  if v_tenant_id is not null then
    select exists (select 1 from public.tenants t where t.id = v_tenant_id)
    into v_tenant_exists;
  else
    v_tenant_exists := false;
  end if;

  if v_tenant_exists then
    v_role := coalesce(nullif(trim(v_meta->>'role'), ''), 'staff');
    if v_role not in ('owner', 'manager', 'admin', 'staff', 'vendor') then
      v_role := 'staff';
    end if;

    insert into public.profiles (id, tenant_id, active_tenant_id, full_name, language_preference)
    values (NEW.id, v_tenant_id, v_tenant_id, v_full_name, v_lang)
    on conflict (id) do nothing;

    insert into public.tenant_memberships (tenant_id, user_id, role, is_active)
    values (v_tenant_id, NEW.id, v_role, true)
    on conflict (tenant_id, user_id) do update
      set role = excluded.role,
          is_active = true;

    update public.profiles p
    set
      tenant_id = v_tenant_id,
      active_tenant_id = v_tenant_id
    where p.id = NEW.id;
  else
    insert into public.profiles (id, tenant_id, active_tenant_id, full_name, language_preference)
    values (NEW.id, null, null, v_full_name, v_lang)
    on conflict (id) do nothing;
  end if;

  return NEW;
end;
$$;

revoke all on function public.handle_new_user() from public;
grant execute on function public.handle_new_user() to service_role;
