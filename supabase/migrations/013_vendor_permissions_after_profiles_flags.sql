-- 必須先有：`public.profiles.permissions`（`008_profile_permission_flags.sql`）。
-- 若執行失敗，請先套用 008，再重新執行本遷移。

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'permissions'
  ) then
    raise exception
      '013_vendor_permissions_after_profiles_flags: missing public.profiles.permissions — apply 008_profile_permission_flags.sql first';
  end if;
end $$;

update public.profiles pr
set permissions =
  (coalesce(pr.permissions, '{}'::jsonb)
    || jsonb_build_object(
      'can_manage_vendors',
      coalesce(
        (pr.permissions -> 'can_manage_vendors') #>> '{}',
        (pr.permissions -> 'can_manage_translators') #>> '{}',
        'false'
      )::boolean
    ))
  - 'can_manage_translators';

create or replace function public.admin_set_member_permissions(p_target uuid, p_permissions jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  tid uuid;
  k text;
  required_keys text[] := array[
    'can_view_finance',
    'can_edit_projects',
    'can_manage_vendors',
    'can_assign_tasks',
    'can_access_settings'
  ];
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  tid := public.current_profile_tenant_id();
  if tid is null then
    raise exception 'no_workspace';
  end if;

  if not exists (
    select 1
    from public.tenant_memberships me
    where me.user_id = auth.uid()
      and me.tenant_id = tid
      and me.is_active = true
      and me.role = 'owner'
  ) then
    raise exception 'forbidden';
  end if;

  if exists (
    select 1
    from public.profiles pf
    where pf.id = p_target
      and pf.role = 'super_admin'::public.profile_role
  ) then
    raise exception 'forbidden';
  end if;

  if not exists (
    select 1
    from public.tenant_memberships tm
    where tm.user_id = p_target
      and tm.tenant_id = tid
      and tm.is_active = true
  ) then
    raise exception 'not_member';
  end if;

  if jsonb_typeof(p_permissions) <> 'object' then
    raise exception 'invalid_permissions_shape';
  end if;

  if (select count(*) from jsonb_object_keys(p_permissions)) <> array_length(required_keys, 1) then
    raise exception 'invalid_permissions_payload';
  end if;

  foreach k in array required_keys
  loop
    if not (p_permissions ? k) or jsonb_typeof(p_permissions -> k) <> 'boolean' then
      raise exception 'invalid_permissions_payload';
    end if;
  end loop;

  if exists (
    select 1
    from jsonb_object_keys(p_permissions) as kk(key)
    where not (kk.key = any (required_keys))
  ) then
    raise exception 'invalid_permission_key';
  end if;

  update public.profiles tgt
  set permissions = p_permissions
  where tgt.id = p_target;
end;
$$;

revoke all on function public.admin_set_member_permissions(uuid, jsonb) from public;
grant execute on function public.admin_set_member_permissions(uuid, jsonb) to authenticated;

create or replace function public.auth_profile_permission(p_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role public.profile_role;
  v_perms jsonb;
  v_val jsonb;
  v_lookup text;
begin
  if auth.uid() is null then
    return false;
  end if;

  select pr.role, pr.permissions
  into v_role, v_perms
  from public.profiles pr
  where pr.id = auth.uid();

  if not found then
    return false;
  end if;

  if v_role = 'super_admin'::public.profile_role then
    return true;
  end if;

  v_lookup := case
    when p_key = 'can_manage_translators' then 'can_manage_vendors'
    else p_key
  end;

  v_val := v_perms -> v_lookup;
  if v_val is null and v_lookup = 'can_manage_vendors' then
    v_val := v_perms -> 'can_manage_translators';
  end if;

  if v_val is null then
    return false;
  end if;

  if jsonb_typeof(v_val) = 'boolean' then
    return (v_val)::text::boolean;
  end if;

  return lower(trim(v_val #>> '{}')) in ('true', 't', '1', 'yes');
end;
$$;

revoke all on function public.auth_profile_permission(text) from public;
grant execute on function public.auth_profile_permission(text) to authenticated;
