-- Core schema for multi-tenant translation agency SaaS.
-- Assumptions:
-- - Every row in app.* tables that is tenant-scoped includes tenant_id UUID.
-- - Tenant isolation is enforced via RLS using app.memberships (user_id <-> tenant_id).
-- - UUID PKs use gen_random_uuid().

create extension if not exists "pgcrypto";

create schema if not exists app;

-- Roles inside a tenant.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'tenant_role' and typnamespace = 'app'::regnamespace) then
    create type app.tenant_role as enum ('owner', 'admin', 'staff');
  end if;
end $$;

-- Tenants (organizations).
create table if not exists app.tenants (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  slug text not null unique,
  is_active boolean not null default true
);

-- Profiles map to auth.users (1:1).
create table if not exists app.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  full_name text,
  language_preference text not null default 'zh-TW' check (language_preference in ('zh-TW','zh-CN','en','ms'))
);

create or replace function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on app.profiles;
create trigger profiles_set_updated_at
before update on app.profiles
for each row execute function app.set_updated_at();

-- Memberships define which tenants a user belongs to and their role.
create table if not exists app.memberships (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role app.tenant_role not null default 'staff',
  is_active boolean not null default true,
  unique (tenant_id, user_id)
);

-- Helper predicate for RLS.
create or replace function app.is_member(_tenant_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from app.memberships m
    where m.tenant_id = _tenant_id
      and m.user_id = auth.uid()
      and m.is_active = true
  );
$$;

create or replace function app.is_tenant_admin(_tenant_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from app.memberships m
    where m.tenant_id = _tenant_id
      and m.user_id = auth.uid()
      and m.is_active = true
      and m.role in ('owner','admin')
  );
$$;

-- Example domain table for module D: customers.
create table if not exists app.customers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  name text not null,
  email text,
  phone text,
  notes text
);

create index if not exists customers_tenant_id_idx on app.customers (tenant_id);

-- RLS setup.
alter table app.tenants enable row level security;
alter table app.profiles enable row level security;
alter table app.memberships enable row level security;
alter table app.customers enable row level security;

-- Tenants:
-- - Users can see tenants they are a member of.
-- - Only tenant admins can update tenant metadata.
drop policy if exists tenants_select on app.tenants;
create policy tenants_select
on app.tenants
for select
to authenticated
using (app.is_member(id));

drop policy if exists tenants_update on app.tenants;
create policy tenants_update
on app.tenants
for update
to authenticated
using (app.is_tenant_admin(id))
with check (app.is_tenant_admin(id));

-- Profiles:
-- - Users can read/update only their own profile.
drop policy if exists profiles_select_own on app.profiles;
create policy profiles_select_own
on app.profiles
for select
to authenticated
using (id = auth.uid());

drop policy if exists profiles_update_own on app.profiles;
create policy profiles_update_own
on app.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists profiles_insert_own on app.profiles;
create policy profiles_insert_own
on app.profiles
for insert
to authenticated
with check (id = auth.uid());

-- Memberships:
-- - Users can see their own memberships.
-- - Tenant admins can manage memberships for their tenant.
drop policy if exists memberships_select on app.memberships;
create policy memberships_select
on app.memberships
for select
to authenticated
using (user_id = auth.uid() or app.is_tenant_admin(tenant_id));

drop policy if exists memberships_insert_admin on app.memberships;
create policy memberships_insert_admin
on app.memberships
for insert
to authenticated
with check (app.is_tenant_admin(tenant_id));

drop policy if exists memberships_update_admin on app.memberships;
create policy memberships_update_admin
on app.memberships
for update
to authenticated
using (app.is_tenant_admin(tenant_id))
with check (app.is_tenant_admin(tenant_id));

drop policy if exists memberships_delete_admin on app.memberships;
create policy memberships_delete_admin
on app.memberships
for delete
to authenticated
using (app.is_tenant_admin(tenant_id));

-- Customers:
-- - Any member can CRUD within their tenant.
drop policy if exists customers_select on app.customers;
create policy customers_select
on app.customers
for select
to authenticated
using (app.is_member(tenant_id));

drop policy if exists customers_insert on app.customers;
create policy customers_insert
on app.customers
for insert
to authenticated
with check (app.is_member(tenant_id));

drop policy if exists customers_update on app.customers;
create policy customers_update
on app.customers
for update
to authenticated
using (app.is_member(tenant_id))
with check (app.is_member(tenant_id));

drop policy if exists customers_delete on app.customers;
create policy customers_delete
on app.customers
for delete
to authenticated
using (app.is_member(tenant_id));

-- Optional: convenience view for "my tenants".
create or replace view app.my_tenants as
select
  t.*,
  m.role as my_role
from app.tenants t
join app.memberships m on m.tenant_id = t.id
where m.user_id = auth.uid()
  and m.is_active = true;

-- Note: app.my_tenants relies on tenants RLS, so no extra RLS needed for the view.

