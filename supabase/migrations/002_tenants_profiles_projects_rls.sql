create extension if not exists "pgcrypto";

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  default_language text not null default 'zh-TW' check (default_language in ('zh-TW', 'zh-CN', 'en', 'ms')),
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  full_name text,
  role text not null default 'staff' check (role in ('admin', 'staff', 'translator')),
  language_preference text not null default 'zh-TW' check (language_preference in ('zh-TW', 'zh-CN', 'en', 'ms'))
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  title text not null,
  source_lang text not null,
  target_lang text not null,
  status text not null default 'draft',
  amount numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists projects_tenant_id_idx on public.projects (tenant_id);
create index if not exists profiles_tenant_id_idx on public.profiles (tenant_id);

alter table public.tenants enable row level security;
alter table public.profiles enable row level security;
alter table public.projects enable row level security;

drop policy if exists tenants_select_isolated on public.tenants;
create policy tenants_select_isolated
on public.tenants
for select
to authenticated
using (
  id = (
    select tenant_id from public.profiles where id = auth.uid()
  )
);

drop policy if exists tenants_update_isolated on public.tenants;
create policy tenants_update_isolated
on public.tenants
for update
to authenticated
using (
  id = (
    select tenant_id from public.profiles where id = auth.uid()
  )
)
with check (
  id = (
    select tenant_id from public.profiles where id = auth.uid()
  )
);

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  and tenant_id = (
    select tenant_id from public.profiles where id = auth.uid()
  )
);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
on public.profiles
for update
to authenticated
using (
  id = auth.uid()
  and tenant_id = (
    select tenant_id from public.profiles where id = auth.uid()
  )
)
with check (
  id = auth.uid()
  and tenant_id = (
    select tenant_id from public.profiles where id = auth.uid()
  )
);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

drop policy if exists projects_select_isolated on public.projects;
create policy projects_select_isolated
on public.projects
for select
to authenticated
using (
  tenant_id = (
    select tenant_id from public.profiles where id = auth.uid()
  )
);

drop policy if exists projects_insert_isolated on public.projects;
create policy projects_insert_isolated
on public.projects
for insert
to authenticated
with check (
  tenant_id = (
    select tenant_id from public.profiles where id = auth.uid()
  )
);

drop policy if exists projects_update_isolated on public.projects;
create policy projects_update_isolated
on public.projects
for update
to authenticated
using (
  tenant_id = (
    select tenant_id from public.profiles where id = auth.uid()
  )
)
with check (
  tenant_id = (
    select tenant_id from public.profiles where id = auth.uid()
  )
);

drop policy if exists projects_delete_isolated on public.projects;
create policy projects_delete_isolated
on public.projects
for delete
to authenticated
using (
  tenant_id = (
    select tenant_id from public.profiles where id = auth.uid()
  )
);
