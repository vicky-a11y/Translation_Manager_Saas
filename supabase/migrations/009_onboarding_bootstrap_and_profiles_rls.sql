-- Onboarding: provision tenant + owner membership before profile workspace fields,
-- so client RLS (006) is satisfied. Link domain_verifications.tenant_id for verify step.
-- Relax profiles_update_own: allow self updates during onboarding / repair when
-- active_tenant_id is null or user has no active membership.

alter table public.domain_verifications
  add column if not exists tenant_id uuid references public.tenants (id) on delete set null;

create index if not exists domain_verifications_tenant_id_idx
  on public.domain_verifications (tenant_id)
  where tenant_id is not null;

-- ---------------------------------------------------------------------------
-- Bootstrap: tenants -> tenant_memberships (owner) -> profiles -> domain_verifications
-- ---------------------------------------------------------------------------
create or replace function public.bootstrap_domain_onboarding_session(
  p_organization_name text,
  p_full_name text,
  p_work_email text,
  p_domain text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_token uuid;
  v_tenant_id uuid;
  v_token uuid;
  v_org text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select dv.token
  into v_existing_token
  from public.domain_verifications dv
  where dv.user_id = auth.uid()
    and dv.status = 'pending'
    and dv.expires_at > now()
  order by dv.created_at desc
  limit 1;

  if v_existing_token is not null then
    update public.profiles p
    set full_name = coalesce(nullif(trim(p_full_name), ''), p.full_name)
    where p.id = auth.uid();

    update public.domain_verifications dv
    set
      organization_name = nullif(trim(p_organization_name), ''),
      email = lower(trim(p_work_email)),
      domain = lower(trim(p_domain))
    where dv.token = v_existing_token;

    return v_existing_token;
  end if;

  v_org := nullif(trim(p_organization_name), '');
  if v_org is null then
    v_org := initcap(regexp_replace(lower(trim(p_domain)), '^www\.', ''));
  end if;

  insert into public.tenants (name, default_language)
  values (v_org, 'zh-TW')
  returning id into v_tenant_id;

  insert into public.tenant_memberships (tenant_id, user_id, role, is_active)
  values (v_tenant_id, auth.uid(), 'owner', true);

  update public.profiles p
  set
    tenant_id = v_tenant_id,
    active_tenant_id = v_tenant_id,
    full_name = coalesce(nullif(trim(p_full_name), ''), v_org)
  where p.id = auth.uid();

  insert into public.domain_verifications (user_id, email, domain, organization_name, tenant_id)
  values (
    auth.uid(),
    lower(trim(p_work_email)),
    lower(trim(p_domain)),
    v_org,
    v_tenant_id
  )
  returning token into v_token;

  return v_token;
end;
$$;

revoke all on function public.bootstrap_domain_onboarding_session(text, text, text, text) from public;
grant execute on function public.bootstrap_domain_onboarding_session(text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- complete_domain_verification: skip duplicate tenant when bootstrap set tenant_id
-- ---------------------------------------------------------------------------
create or replace function public.complete_domain_verification(p_token uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.domain_verifications%rowtype;
  v_tenant_id uuid;
  v_tenant_name text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select *
  into r
  from public.domain_verifications
  where token = p_token
    and status = 'pending'
    and expires_at > now();

  if not found then
    raise exception 'invalid_or_expired_token';
  end if;

  if r.user_id <> auth.uid() then
    raise exception 'forbidden';
  end if;

  if r.tenant_id is not null then
    update public.profiles p
    set
      tenant_id = r.tenant_id,
      active_tenant_id = r.tenant_id,
      full_name = coalesce(
        nullif(trim(p.full_name), ''),
        nullif(trim(r.organization_name), ''),
        initcap(regexp_replace(r.domain, '^www\.', ''))
      )
    where p.id = r.user_id;

    insert into public.tenant_memberships (tenant_id, user_id, role, is_active)
    values (r.tenant_id, r.user_id, 'owner', true)
    on conflict (tenant_id, user_id) do update
      set role = 'owner',
          is_active = true;

    update public.domain_verifications
    set status = 'verified', verified_at = now()
    where id = r.id;
    return;
  end if;

  v_tenant_name := nullif(trim(r.organization_name), '');
  if v_tenant_name is null then
    v_tenant_name := initcap(regexp_replace(r.domain, '^www\.', ''));
  end if;

  insert into public.tenants (name, default_language)
  values (v_tenant_name, 'zh-TW')
  returning id into v_tenant_id;

  update public.profiles p
  set
    tenant_id = v_tenant_id,
    active_tenant_id = v_tenant_id,
    full_name = coalesce(nullif(trim(p.full_name), ''), r.organization_name)
  where p.id = r.user_id;

  insert into public.tenant_memberships (tenant_id, user_id, role, is_active)
  values (v_tenant_id, r.user_id, 'owner', true)
  on conflict (tenant_id, user_id) do update
    set role = 'owner',
        is_active = true;

  update public.domain_verifications
  set status = 'verified', verified_at = now()
  where id = r.id;
end;
$$;

revoke all on function public.complete_domain_verification(uuid) from public;
grant execute on function public.complete_domain_verification(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- profiles_update_own: grace for onboarding / broken workspace pointers
-- ---------------------------------------------------------------------------
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (
  id = auth.uid()
  and (
    active_tenant_id is null
    or not exists (
      select 1
      from public.tenant_memberships tm
      where tm.user_id = auth.uid()
        and tm.is_active = true
    )
    or exists (
      select 1
      from public.tenant_memberships tm
      where tm.user_id = auth.uid()
        and tm.tenant_id = profiles.active_tenant_id
        and tm.is_active = true
    )
  )
);
