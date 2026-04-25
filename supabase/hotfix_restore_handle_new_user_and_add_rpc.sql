-- Hotfix：還原 handle_new_user 為 migration 012 版本 + 建立 mark_password_set RPC (033)
-- 背景：2026-04-20 `supabase db push` 嘗試重跑 001~033，其中 004 失敗 rollback，
--       但 001/002/003 已提交，003 把 handle_new_user 覆蓋成舊版（role 硬寫 'admin'），
--       與 008 加入的 profile_role enum 衝突，新註冊使用者會立即失敗。
-- 執行：整段貼到 Supabase Dashboard → SQL Editor 執行一次即可。

-- ---------------------------------------------------------------------------
-- 1) 還原 handle_new_user 為 migration 012 版本
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

-- ---------------------------------------------------------------------------
-- 2) 建立 mark_password_set RPC (migration 033)
-- ---------------------------------------------------------------------------
create or replace function public.mark_password_set()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_existing timestamptz;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select p.password_set_at
  into v_existing
  from public.profiles p
  where p.id = v_uid;

  if not found then
    insert into public.profiles (id, password_set_at)
    values (v_uid, v_now)
    on conflict (id) do update
      set password_set_at = coalesce(public.profiles.password_set_at, excluded.password_set_at);
    return v_now;
  end if;

  if v_existing is not null then
    return v_existing;
  end if;

  update public.profiles
  set password_set_at = v_now
  where id = v_uid;

  return v_now;
end;
$$;

revoke all on function public.mark_password_set() from public;
grant execute on function public.mark_password_set() to authenticated;

-- ---------------------------------------------------------------------------
-- 3) 驗證
-- ---------------------------------------------------------------------------
-- 預期：兩筆，都 prosecdef = true
select proname, prosecdef
from pg_proc
where proname in ('handle_new_user', 'mark_password_set')
order by proname;
