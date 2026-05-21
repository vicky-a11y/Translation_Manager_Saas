-- 權限規則：租戶 owner 視為全開（DB 端）
-- 說明：多個 RLS policy 依賴 auth_profile_permission；若 owner 沒有對應 permissions flag 會被擋下。
-- 本遷移將 owner 視為 true，避免「租戶 owner 仍無法操作」的情況。

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
  tid uuid;
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

  -- super_admin 永遠視為全開
  if v_role = 'super_admin'::public.profile_role then
    return true;
  end if;

  -- 租戶 owner 視為全開（以目前 workspace tenant 為準）
  tid := public.current_profile_tenant_id();
  if tid is not null and exists (
    select 1
    from public.tenant_memberships m
    where m.user_id = auth.uid()
      and m.tenant_id = tid
      and m.is_active = true
      and m.role = 'owner'
  ) then
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

