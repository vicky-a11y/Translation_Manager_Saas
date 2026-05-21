-- 邀請流程：登入頁預覽 RPC + 接受邀請時套用儀表板最小權限

-- ---------------------------------------------------------------------------
-- RPC: 公開邀請預覽（供登入頁顯示租戶名稱，不暴露受邀 email）
-- ---------------------------------------------------------------------------
create or replace function public.invitation_public_preview(p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'valid', true,
    'tenant_name', t.name
  )
  into v_result
  from public.invitations i
  join public.tenants t on t.id = i.tenant_id
  where i.token = p_token
    and i.status = 'pending'
    and (i.expires_at is null or i.expires_at > now())
  limit 1;

  return coalesce(v_result, jsonb_build_object('valid', false));
end;
$$;

revoke all on function public.invitation_public_preview(uuid) from public;
grant execute on function public.invitation_public_preview(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- accept_invitation: 加入租戶後，非 owner/admin 角色套用最小權限（僅儀表板）
-- ---------------------------------------------------------------------------
create or replace function public.accept_invitation(p_token uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.invitations%rowtype;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select u.email into v_email
  from auth.users u
  where u.id = auth.uid();

  if v_email is null then
    raise exception 'no_email';
  end if;

  select *
  into inv
  from public.invitations
  where token = p_token
    and status = 'pending'
    and (expires_at is null or expires_at > now());

  if not found then
    raise exception 'invalid_invitation';
  end if;

  if lower(trim(inv.email)) <> lower(trim(v_email)) then
    raise exception 'email_mismatch';
  end if;

  if exists (
    select 1
    from public.tenant_memberships tm
    where tm.user_id = auth.uid()
      and tm.tenant_id = inv.tenant_id
      and tm.is_active = true
  ) then
    raise exception 'already_in_tenant';
  end if;

  insert into public.tenant_memberships (tenant_id, user_id, role, is_active)
  values (inv.tenant_id, auth.uid(), inv.invited_role, true)
  on conflict (tenant_id, user_id) do update
    set role = excluded.role,
        is_active = true;

  update public.profiles
  set
    active_tenant_id = inv.tenant_id,
    tenant_id = inv.tenant_id
  where id = auth.uid();

  if inv.invited_role not in ('owner', 'admin') then
    update public.profiles
    set permissions = jsonb_build_object(
      'can_view_finance', false,
      'can_edit_projects', false,
      'can_manage_vendors', false,
      'can_assign_tasks', false,
      'can_access_settings', false
    )
    where id = auth.uid();
  end if;

  update public.invitations
  set status = 'accepted', accepted_at = now()
  where id = inv.id;
end;
$$;

revoke all on function public.accept_invitation(uuid) from public;
grant execute on function public.accept_invitation(uuid) to authenticated;
