-- Permission flags on profiles + profile_role enum. super_admin bypasses tenant RLS where noted.
-- UUID PKs unchanged (gen_random_uuid()).

do $$
begin
  if not exists (select 1 from pg_type where typname = 'profile_role' and typnamespace = 'public'::regnamespace) then
    create type public.profile_role as enum ('super_admin', 'tenant_owner', 'staff', 'translator');
  end if;
end $$;

alter table public.profiles
  add column if not exists role public.profile_role not null default 'staff'::public.profile_role;

alter table public.profiles
  add column if not exists permissions jsonb not null default jsonb_build_object(
    'can_view_finance', false,
    'can_edit_projects', true,
    'can_manage_translators', false,
    'can_assign_tasks', false,
    'can_access_settings', false
  );

-- Backfill profile role from membership (single profile row per user).
update public.profiles p
set role = 'tenant_owner'::public.profile_role
where exists (
  select 1
  from public.tenant_memberships m
  where m.user_id = p.id
    and m.is_active = true
    and m.role = 'owner'
);

update public.profiles p
set role = 'translator'::public.profile_role
where p.role = 'staff'::public.profile_role
  and exists (
    select 1
    from public.tenant_memberships m
    where m.user_id = p.id
      and m.is_active = true
      and m.role = 'translator'
  );

-- Backfill sensible defaults for existing admins / finance roles on memberships.
update public.profiles p
set permissions = p.permissions || jsonb_build_object('can_access_settings', true)
where exists (
  select 1
  from public.tenant_memberships m
  where m.user_id = p.id
    and m.is_active = true
    and m.role in ('owner', 'admin')
);

update public.profiles p
set permissions = p.permissions || jsonb_build_object('can_view_finance', true)
where exists (
  select 1
  from public.tenant_memberships m
  where m.user_id = p.id
    and m.is_active = true
    and m.role in ('owner', 'manager')
);

update public.profiles p
set permissions = p.permissions || jsonb_build_object('can_manage_translators', true)
where exists (
  select 1
  from public.tenant_memberships m
  where m.user_id = p.id
    and m.is_active = true
    and m.role in ('owner', 'admin')
);

-- ---------------------------------------------------------------------------
-- Helpers (SECURITY DEFINER for stable auth.uid() reads)
-- ---------------------------------------------------------------------------
create or replace function public.auth_is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'super_admin'::public.profile_role
  );
$$;

revoke all on function public.auth_is_super_admin() from public;
grant execute on function public.auth_is_super_admin() to authenticated;

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
begin
  if auth.uid() is null then
    return false;
  end if;

  select p.role, p.permissions
  into v_role, v_perms
  from public.profiles p
  where p.id = auth.uid();

  if not found then
    return false;
  end if;

  if v_role = 'super_admin'::public.profile_role then
    return true;
  end if;

  v_val := v_perms -> p_key;
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

create or replace function public.auth_is_active_member(_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tenant_memberships m
    where m.user_id = auth.uid()
      and m.tenant_id = _tenant_id
      and m.is_active = true
  );
$$;

revoke all on function public.auth_is_active_member(uuid) from public;
grant execute on function public.auth_is_active_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Prevent self-service escalation of permissions JSON (except super_admin)
-- ---------------------------------------------------------------------------
create or replace function public.profiles_guard_self_permission_mutate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.permissions is distinct from old.permissions and new.id = auth.uid() then
    if old.role is distinct from 'super_admin'::public.profile_role then
      new.permissions := old.permissions;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_self_permission_mutate_trg on public.profiles;
create trigger profiles_guard_self_permission_mutate_trg
before update on public.profiles
for each row
execute procedure public.profiles_guard_self_permission_mutate();

-- ---------------------------------------------------------------------------
-- RPC: tenant membership owner sets coworker permission flags
-- ---------------------------------------------------------------------------
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
    'can_manage_translators',
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
    from public.profiles p
    where p.id = p_target
      and p.role = 'super_admin'::public.profile_role
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

-- ---------------------------------------------------------------------------
-- RLS: super_admin bypass on tenants / projects / profiles visibility
-- ---------------------------------------------------------------------------
drop policy if exists tenants_select_isolated on public.tenants;
create policy tenants_select_isolated
on public.tenants
for select
to authenticated
using (
  public.auth_is_super_admin()
  or id = public.current_profile_tenant_id()
);

drop policy if exists tenants_update_isolated on public.tenants;
create policy tenants_update_isolated
on public.tenants
for update
to authenticated
using (
  public.auth_is_super_admin()
  or (
    id = public.current_profile_tenant_id()
    and (
      public.auth_profile_permission('can_access_settings')
      or public.is_tenant_admin_for(id)
    )
  )
)
with check (
  public.auth_is_super_admin()
  or (
    id = public.current_profile_tenant_id()
    and (
      public.auth_profile_permission('can_access_settings')
      or public.is_tenant_admin_for(id)
    )
  )
);

drop policy if exists projects_select_isolated on public.projects;
create policy projects_select_isolated
on public.projects
for select
to authenticated
using (
  public.auth_is_super_admin()
  or tenant_id = public.current_profile_tenant_id()
);

drop policy if exists projects_insert_isolated on public.projects;
create policy projects_insert_isolated
on public.projects
for insert
to authenticated
with check (
  public.auth_is_super_admin()
  or (
    tenant_id = public.current_profile_tenant_id()
    and (
      public.auth_profile_permission('can_edit_projects')
      or public.is_tenant_admin_for(tenant_id)
    )
  )
);

drop policy if exists projects_update_isolated on public.projects;
create policy projects_update_isolated
on public.projects
for update
to authenticated
using (
  public.auth_is_super_admin()
  or (
    tenant_id = public.current_profile_tenant_id()
    and (
      public.auth_profile_permission('can_edit_projects')
      or public.is_tenant_admin_for(tenant_id)
    )
  )
)
with check (
  public.auth_is_super_admin()
  or (
    tenant_id = public.current_profile_tenant_id()
    and (
      public.auth_profile_permission('can_edit_projects')
      or public.is_tenant_admin_for(tenant_id)
    )
  )
);

drop policy if exists projects_delete_isolated on public.projects;
create policy projects_delete_isolated
on public.projects
for delete
to authenticated
using (
  public.auth_is_super_admin()
  or (
    tenant_id = public.current_profile_tenant_id()
    and (
      public.auth_profile_permission('can_edit_projects')
      or public.is_tenant_admin_for(tenant_id)
    )
  )
);

drop policy if exists profiles_select_same_tenant on public.profiles;
create policy profiles_select_same_tenant
on public.profiles
for select
to authenticated
using (
  public.auth_is_super_admin()
  or (
    public.current_profile_tenant_id() is not null
    and exists (
      select 1
      from public.tenant_memberships m
      where m.user_id = profiles.id
        and m.tenant_id = public.current_profile_tenant_id()
        and m.is_active = true
    )
  )
);

-- ---------------------------------------------------------------------------
-- project_financials: super_admin OR (member AND (flag OR legacy owner/manager))
-- ---------------------------------------------------------------------------
drop policy if exists project_financials_select on public.project_financials;
create policy project_financials_select
on public.project_financials
for select
to authenticated
using (
  public.auth_is_super_admin()
  or (
    public.auth_is_active_member(tenant_id)
    and (
      public.auth_profile_permission('can_view_finance')
      or public.can_read_project_amounts(tenant_id)
    )
  )
);

drop policy if exists project_financials_insert on public.project_financials;
create policy project_financials_insert
on public.project_financials
for insert
to authenticated
with check (
  public.auth_is_super_admin()
  or (
    public.auth_is_active_member(tenant_id)
    and (
      public.auth_profile_permission('can_view_finance')
      or public.can_read_project_amounts(tenant_id)
    )
  )
);

drop policy if exists project_financials_update on public.project_financials;
create policy project_financials_update
on public.project_financials
for update
to authenticated
using (
  public.auth_is_super_admin()
  or (
    public.auth_is_active_member(tenant_id)
    and (
      public.auth_profile_permission('can_view_finance')
      or public.can_read_project_amounts(tenant_id)
    )
  )
)
with check (
  public.auth_is_super_admin()
  or (
    public.auth_is_active_member(tenant_id)
    and (
      public.auth_profile_permission('can_view_finance')
      or public.can_read_project_amounts(tenant_id)
    )
  )
);

drop policy if exists project_financials_delete on public.project_financials;
create policy project_financials_delete
on public.project_financials
for delete
to authenticated
using (
  public.auth_is_super_admin()
  or (
    public.auth_is_active_member(tenant_id)
    and (
      public.auth_profile_permission('can_view_finance')
      or public.can_read_project_amounts(tenant_id)
    )
  )
);
