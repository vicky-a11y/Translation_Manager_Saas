-- Step 1 refactor: profiles onboarding state, membership status, per-tenant user notes,
-- projects.vendor_id with ON DELETE RESTRICT (preserve project history).

-- ---------------------------------------------------------------------------
-- ENUM types
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
-- public.profiles.onboarding_status
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists onboarding_status public.onboarding_status
    not null default 'completed'::public.onboarding_status;

alter table public.profiles
  alter column onboarding_status set default 'pending_profile'::public.onboarding_status;

-- ---------------------------------------------------------------------------
-- public.tenant_memberships.status
-- ---------------------------------------------------------------------------
alter table public.tenant_memberships
  add column if not exists status public.tenant_membership_status
    not null default 'active'::public.tenant_membership_status;

update public.tenant_memberships
set status = 'inactive'::public.tenant_membership_status
where is_active = false
  and status = 'active'::public.tenant_membership_status;

-- ---------------------------------------------------------------------------
-- public.tenant_user_profiles
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

create index if not exists tenant_user_profiles_tenant_id_idx
  on public.tenant_user_profiles (tenant_id);

create index if not exists tenant_user_profiles_user_id_idx
  on public.tenant_user_profiles (user_id);

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
-- public.projects.vendor_id → public.profiles (ON DELETE RESTRICT)
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

create index if not exists projects_vendor_id_idx
  on public.projects (vendor_id);
