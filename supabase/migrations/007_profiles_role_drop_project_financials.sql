-- Role source of truth: tenant_memberships only (profiles.role removed).
-- Financial: amounts live in project_financials; RLS restricts to owner/manager.

-- ---------------------------------------------------------------------------
-- project_financials (amount isolated from projects for column-level RLS)
-- ---------------------------------------------------------------------------
create table if not exists public.project_financials (
  project_id uuid primary key references public.projects (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  amount numeric(12, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_financials_tenant_id_idx on public.project_financials (tenant_id);

insert into public.project_financials (project_id, tenant_id, amount)
select p.id, p.tenant_id, p.amount
from public.projects p
on conflict (project_id) do nothing;

create or replace function public.project_financials_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists project_financials_set_updated_at on public.project_financials;
create trigger project_financials_set_updated_at
before update on public.project_financials
for each row
execute procedure public.project_financials_set_updated_at();

-- New projects always get a financial row (bypasses RLS via SECURITY DEFINER).
create or replace function public.after_project_insert_financials()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.project_financials (project_id, tenant_id, amount)
  values (new.id, new.tenant_id, 0)
  on conflict (project_id) do nothing;
  return new;
end;
$$;

drop trigger if exists after_project_insert_financials_trg on public.projects;
create trigger after_project_insert_financials_trg
after insert on public.projects
for each row
execute procedure public.after_project_insert_financials();

alter table public.projects drop column if exists amount;

-- ---------------------------------------------------------------------------
-- Membership roles: add manager (finance visibility)
-- ---------------------------------------------------------------------------
alter table public.tenant_memberships drop constraint if exists tenant_memberships_role_check;
alter table public.tenant_memberships
  add constraint tenant_memberships_role_check
  check (role in ('owner', 'manager', 'admin', 'staff', 'translator'));

alter table public.invitations drop constraint if exists invitations_invited_role_check;
alter table public.invitations
  add constraint invitations_invited_role_check
  check (invited_role in ('owner', 'manager', 'admin', 'staff', 'translator'));

-- ---------------------------------------------------------------------------
-- Finance visibility (read/write project_financials)
-- ---------------------------------------------------------------------------
create or replace function public.can_read_project_amounts(_tenant_id uuid)
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
      and m.role in ('owner', 'manager')
  );
$$;

revoke all on function public.can_read_project_amounts(uuid) from public;
grant execute on function public.can_read_project_amounts(uuid) to authenticated;

alter table public.project_financials enable row level security;

drop policy if exists project_financials_select on public.project_financials;
create policy project_financials_select
on public.project_financials
for select
to authenticated
using (public.can_read_project_amounts(tenant_id));

drop policy if exists project_financials_insert on public.project_financials;
create policy project_financials_insert
on public.project_financials
for insert
to authenticated
with check (public.can_read_project_amounts(tenant_id));

drop policy if exists project_financials_update on public.project_financials;
create policy project_financials_update
on public.project_financials
for update
to authenticated
using (public.can_read_project_amounts(tenant_id))
with check (public.can_read_project_amounts(tenant_id));

drop policy if exists project_financials_delete on public.project_financials;
create policy project_financials_delete
on public.project_financials
for delete
to authenticated
using (public.can_read_project_amounts(tenant_id));

-- ---------------------------------------------------------------------------
-- Trigger: stop writing profiles.role when switching workspace
-- ---------------------------------------------------------------------------
create or replace function public.tenant_membership_after_deactivate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next uuid;
begin
  if tg_op = 'update' and new.is_active = false and old.is_active = true then
    if exists (
      select 1
      from public.profiles p
      where p.id = new.user_id
        and p.active_tenant_id = new.tenant_id
    ) then
      select m.tenant_id
      into v_next
      from public.tenant_memberships m
      where m.user_id = new.user_id
        and m.is_active = true
        and m.tenant_id <> new.tenant_id
      order by m.created_at asc
      limit 1;

      update public.profiles p
      set
        active_tenant_id = v_next,
        tenant_id = v_next
      where p.id = new.user_id;
    end if;
  end if;
  return new;
end;
$$;

-- Allow new profile rows without role before column is dropped (handle_new_user).
do $$
begin
  if exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'profiles'
      and c.column_name = 'role'
  ) then
    execute 'alter table public.profiles alter column role drop not null';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- accept_invitation / domain / new user: no profiles.role
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

  update public.invitations
  set status = 'accepted', accepted_at = now()
  where id = inv.id;
end;
$$;

revoke all on function public.accept_invitation(uuid) from public;
grant execute on function public.accept_invitation(uuid) to authenticated;

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

  v_tenant_name := nullif(trim(r.organization_name), '');
  if v_tenant_name is null then
    v_tenant_name := initcap(regexp_replace(r.domain, '^www\.', ''));
  end if;

  insert into public.tenants (name, default_language)
  values (v_tenant_name, 'zh-TW')
  returning id into v_tenant_id;

  update public.profiles
  set
    tenant_id = v_tenant_id,
    active_tenant_id = v_tenant_id,
    full_name = coalesce(nullif(trim(full_name), ''), r.organization_name)
  where id = r.user_id;

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
    if v_role not in ('owner', 'manager', 'admin', 'staff', 'translator') then
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
-- Drop profiles.role (no longer authoritative)
-- ---------------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles drop column if exists role;
