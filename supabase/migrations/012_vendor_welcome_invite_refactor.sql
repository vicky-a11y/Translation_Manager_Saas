-- Vendor terminology (replaces translator), platform vendor flag, invite email precheck,
-- bootstrap owner/manager choice, projects.vendor_id, permissions key migration.

-- ---------------------------------------------------------------------------
-- RPC: invite flow — verify email matches pending invitation (anon + authenticated)
-- ---------------------------------------------------------------------------
create or replace function public.invitation_email_matches(p_token uuid, p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.invitations i
    where i.token = p_token
      and i.status = 'pending'
      and (i.expires_at is null or i.expires_at > now())
      and lower(trim(i.email)) = lower(trim(coalesce(p_email, '')))
  );
$$;

revoke all on function public.invitation_email_matches(uuid, text) from public;
grant execute on function public.invitation_email_matches(uuid, text) to anon, authenticated;

create or replace function public.invitation_token_active(p_token uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.invitations i
    where i.token = p_token
      and i.status = 'pending'
      and (i.expires_at is null or i.expires_at > now())
  );
$$;

revoke all on function public.invitation_token_active(uuid) from public;
grant execute on function public.invitation_token_active(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- profile_role: translator → vendor
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'profile_role'
      and e.enumlabel = 'translator'
  ) then
    alter type public.profile_role rename value 'translator' to 'vendor';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- tenant_memberships.role + invitations.invited_role: translator → vendor
-- ---------------------------------------------------------------------------
update public.tenant_memberships
set role = 'vendor'
where role = 'translator';

update public.invitations
set invited_role = 'vendor'
where invited_role = 'translator';

alter table public.tenant_memberships drop constraint if exists tenant_memberships_role_check;
alter table public.tenant_memberships
  add constraint tenant_memberships_role_check
  check (role in ('owner', 'manager', 'admin', 'staff', 'vendor'));

alter table public.invitations drop constraint if exists invitations_invited_role_check;
alter table public.invitations
  add constraint invitations_invited_role_check
  check (invited_role in ('owner', 'manager', 'admin', 'staff', 'vendor'));

-- ---------------------------------------------------------------------------
-- profiles: platform vendor + permissions key rename
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists is_platform_vendor boolean not null default false;

-- JSON 權限鍵遷移需先有 profiles.permissions（見 008_profile_permission_flags.sql）
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'permissions'
  ) then
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
  else
    raise notice '012: skipped profiles.permissions JSON migration (column missing; apply 008 then run 013)';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- projects: translator_id → vendor_id
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'projects' and column_name = 'translator_id'
  )
  and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'projects' and column_name = 'vendor_id'
  ) then
    alter table public.projects rename column translator_id to vendor_id;
    if to_regclass('public.projects_translator_id_idx') is not null then
      alter index public.projects_translator_id_idx rename to projects_vendor_id_idx;
    end if;
    if exists (
      select 1 from pg_constraint
      where conname = 'projects_translator_id_fkey'
    ) then
      alter table public.projects rename constraint projects_translator_id_fkey to projects_vendor_id_fkey;
    end if;
  elsif not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'projects' and column_name = 'vendor_id'
  ) then
    alter table public.projects add column vendor_id uuid;
    alter table public.projects
      add constraint projects_vendor_id_fkey
      foreign key (vendor_id)
      references public.profiles (id)
      on delete restrict;
    create index if not exists projects_vendor_id_idx on public.projects (vendor_id);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- bootstrap_domain_onboarding_session: optional primary membership role
-- ---------------------------------------------------------------------------
drop function if exists public.bootstrap_domain_onboarding_session(text, text, text, text);

create or replace function public.bootstrap_domain_onboarding_session(
  p_organization_name text,
  p_full_name text,
  p_work_email text,
  p_domain text,
  p_primary_membership_role text default 'owner'
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
  v_member_role text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  v_member_role := case lower(nullif(trim(p_primary_membership_role), ''))
    when 'manager' then 'manager'
    else 'owner'
  end;

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
  values (v_tenant_id, auth.uid(), v_member_role, true);

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

revoke all on function public.bootstrap_domain_onboarding_session(text, text, text, text, text) from public;
grant execute on function public.bootstrap_domain_onboarding_session(text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- complete_domain_verification: do not downgrade membership role on conflict
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
      set is_active = true;

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
    set is_active = true;

  update public.domain_verifications
  set status = 'verified', verified_at = now()
  where id = r.id;
end;
$$;

revoke all on function public.complete_domain_verification(uuid) from public;
grant execute on function public.complete_domain_verification(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- handle_new_user: vendor role label (membership text)
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
-- Self-service: mark account as platform vendor (supplier)
-- ---------------------------------------------------------------------------
create or replace function public.set_self_platform_vendor()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  update public.profiles p
  set is_platform_vendor = true
  where p.id = auth.uid();
end;
$$;

revoke all on function public.set_self_platform_vendor() from public;
grant execute on function public.set_self_platform_vendor() to authenticated;

-- admin_set_member_permissions / auth_profile_permission：見 013（需 profiles.permissions）
