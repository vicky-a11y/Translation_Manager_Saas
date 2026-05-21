-- 修復邀請重新寄送：刷新 token / 延長期限，並立即復原已過期但仍為 pending 的邀請

-- 立即修復既有卡住的 pending 邀請（expires_at 已過期）
update public.invitations
set expires_at = now() + interval '14 days'
where status = 'pending'
  and expires_at <= now();

-- ---------------------------------------------------------------------------
-- RPC: 管理員重新整理邀請（新 token + 延長 14 天）
-- ---------------------------------------------------------------------------
create or replace function public.refresh_member_invitation(p_invitation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid;
  v_tenant_id uuid;
begin
  select i.tenant_id
  into v_tenant_id
  from public.invitations i
  where i.id = p_invitation_id
    and i.status = 'pending';

  if not found then
    raise exception 'invitation_not_found';
  end if;

  if not public.is_tenant_admin_for(v_tenant_id) then
    raise exception 'forbidden';
  end if;

  update public.invitations
  set
    token = gen_random_uuid(),
    expires_at = now() + interval '14 days',
    status = 'pending'
  where id = p_invitation_id
  returning token into v_token;

  return v_token;
end;
$$;

revoke all on function public.refresh_member_invitation(uuid) from public;
grant execute on function public.refresh_member_invitation(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: 公開邀請預覽（加入 expired / not_found 原因）
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
  if exists (
    select 1
    from public.invitations i
    where i.token = p_token
      and i.status = 'pending'
      and i.expires_at <= now()
  ) then
    return jsonb_build_object('valid', false, 'reason', 'expired');
  end if;

  select jsonb_build_object(
    'valid', true,
    'tenant_name', t.name
  )
  into v_result
  from public.invitations i
  join public.tenants t on t.id = i.tenant_id
  where i.token = p_token
    and i.status = 'pending'
    and i.expires_at > now()
  limit 1;

  return coalesce(v_result, jsonb_build_object('valid', false, 'reason', 'not_found'));
end;
$$;

revoke all on function public.invitation_public_preview(uuid) from public;
grant execute on function public.invitation_public_preview(uuid) to anon, authenticated;
