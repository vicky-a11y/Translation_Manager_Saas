-- Multi-tenant: explicit memberships (M:N) + active workspace on profile.
-- PKs remain UUID. RLS uses active_tenant_id validated against tenant_memberships.

create table if not exists public.tenant_memberships (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'staff',
  is_active boolean not null default true,
  unique (tenant_id, user_id),
  constraint tenant_memberships_role_check
    check (role in ('owner', 'admin', 'staff', 'translator'))
);

create index if not exists tenant_memberships_user_id_idx on public.tenant_memberships (user_id);
create index if not exists tenant_memberships_tenant_id_idx on public.tenant_memberships (tenant_id);

alter table public.profiles
  add column if not exists active_tenant_id uuid references public.tenants (id) on delete set null;

-- Backfill memberships from legacy profiles.tenant_id
insert into public.tenant_memberships (tenant_id, user_id, role, is_active)
select p.tenant_id, p.id, p.role, true
from public.profiles p
where p.tenant_id is not null
on conflict (tenant_id, user_id) do nothing;

-- Align active workspace with legacy single-tenant field
update public.profiles p
set active_tenant_id = p.tenant_id
where p.tenant_id is not null
  and p.active_tenant_id is null;

-- ---------------------------------------------------------------------------
-- RLS: tenant_memberships
-- ---------------------------------------------------------------------------
alter table public.tenant_memberships enable row level security;

drop policy if exists tenant_memberships_select on public.tenant_memberships;
create policy tenant_memberships_select
on public.tenant_memberships
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.tenant_memberships me
    where me.user_id = auth.uid()
      and me.tenant_id = tenant_memberships.tenant_id
      and me.is_active = true
  )
);

drop policy if exists tenant_memberships_insert_admin on public.tenant_memberships;
create policy tenant_memberships_insert_admin
on public.tenant_memberships
for insert
to authenticated
with check (
  exists (
    select 1
    from public.tenant_memberships me
    where me.user_id = auth.uid()
      and me.tenant_id = tenant_memberships.tenant_id
      and me.is_active = true
      and me.role in ('owner', 'admin')
  )
);

drop policy if exists tenant_memberships_update_admin on public.tenant_memberships;
create policy tenant_memberships_update_admin
on public.tenant_memberships
for update
to authenticated
using (
  exists (
    select 1
    from public.tenant_memberships me
    where me.user_id = auth.uid()
      and me.tenant_id = tenant_memberships.tenant_id
      and me.is_active = true
      and me.role in ('owner', 'admin')
  )
)
with check (
  exists (
    select 1
    from public.tenant_memberships me
    where me.user_id = auth.uid()
      and me.tenant_id = tenant_memberships.tenant_id
      and me.is_active = true
      and me.role in ('owner', 'admin')
  )
);

-- ---------------------------------------------------------------------------
-- Session tenant: active_tenant_id must be a valid active membership
-- ---------------------------------------------------------------------------
create or replace function public.current_profile_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.active_tenant_id
  from public.profiles p
  where p.id = auth.uid()
    and p.active_tenant_id is not null
    and exists (
      select 1
      from public.tenant_memberships m
      where m.user_id = p.id
        and m.tenant_id = p.active_tenant_id
        and m.is_active = true
    );
$$;

revoke all on function public.current_profile_tenant_id() from public;
grant execute on function public.current_profile_tenant_id() to authenticated;

-- Helper: admin/owner in a given tenant (any membership row, not only active workspace)
create or replace function public.is_tenant_admin_for(_tenant_id uuid)
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
      and m.role in ('owner', 'admin')
  );
$$;

revoke all on function public.is_tenant_admin_for(uuid) from public;
grant execute on function public.is_tenant_admin_for(uuid) to authenticated;

-- After removing access to current workspace, pick another membership if any
create or replace function public.tenant_membership_after_deactivate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next uuid;
  v_role text;
begin
  if tg_op = 'update' and new.is_active = false and old.is_active = true then
    if exists (
      select 1
      from public.profiles p
      where p.id = new.user_id
        and p.active_tenant_id = new.tenant_id
    ) then
      select m.tenant_id, m.role
      into v_next, v_role
      from public.tenant_memberships m
      where m.user_id = new.user_id
        and m.is_active = true
        and m.tenant_id <> new.tenant_id
      order by m.created_at asc
      limit 1;

      update public.profiles p
      set
        active_tenant_id = v_next,
        tenant_id = v_next,
        role = coalesce(v_role, 'staff')
      where p.id = new.user_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists tenant_membership_after_deactivate_trg on public.tenant_memberships;
create trigger tenant_membership_after_deactivate_trg
after update on public.tenant_memberships
for each row
execute procedure public.tenant_membership_after_deactivate();

-- ---------------------------------------------------------------------------
-- Invitations policies: use memberships instead of profiles.tenant_id
-- ---------------------------------------------------------------------------
drop policy if exists invitations_select_admin on public.invitations;
create policy invitations_select_admin
on public.invitations
for select
to authenticated
using (public.is_tenant_admin_for(invitations.tenant_id));

drop policy if exists invitations_insert_admin on public.invitations;
create policy invitations_insert_admin
on public.invitations
for insert
to authenticated
with check (public.is_tenant_admin_for(invitations.tenant_id));

drop policy if exists invitations_update_admin on public.invitations;
create policy invitations_update_admin
on public.invitations
for update
to authenticated
using (public.is_tenant_admin_for(invitations.tenant_id))
with check (public.is_tenant_admin_for(invitations.tenant_id));

-- ---------------------------------------------------------------------------
-- Profiles: coworkers by shared membership in current workspace
-- ---------------------------------------------------------------------------
drop policy if exists profiles_select_same_tenant on public.profiles;
create policy profiles_select_same_tenant
on public.profiles
for select
to authenticated
using (
  public.current_profile_tenant_id() is not null
  and exists (
    select 1
    from public.tenant_memberships m
    where m.user_id = profiles.id
      and m.tenant_id = public.current_profile_tenant_id()
      and m.is_active = true
  )
);

-- Member removal is done via tenant_memberships (admin update), not profiles.tenant_id NULL.
drop policy if exists profiles_update_tenant_admin on public.profiles;

-- Own profile: restrict active_tenant_id to valid memberships
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
    or exists (
      select 1
      from public.tenant_memberships tm
      where tm.user_id = auth.uid()
        and tm.tenant_id = profiles.active_tenant_id
        and tm.is_active = true
    )
  )
);

-- ---------------------------------------------------------------------------
-- accept_invitation: add membership; allow multiple tenants per user
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
    tenant_id = inv.tenant_id,
    role = inv.invited_role
  where id = auth.uid();

  update public.invitations
  set status = 'accepted', accepted_at = now()
  where id = inv.id;
end;
$$;

revoke all on function public.accept_invitation(uuid) from public;
grant execute on function public.accept_invitation(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Domain verification: create membership row
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
    role = 'owner',
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

-- ---------------------------------------------------------------------------
-- New auth users: invited path creates membership + active workspace
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
    if v_role not in ('owner', 'admin', 'staff', 'translator') then
      v_role := 'staff';
    end if;

    insert into public.profiles (id, tenant_id, active_tenant_id, full_name, role, language_preference)
    values (NEW.id, v_tenant_id, v_tenant_id, v_full_name, v_role, v_lang)
    on conflict (id) do nothing;

    insert into public.tenant_memberships (tenant_id, user_id, role, is_active)
    values (v_tenant_id, NEW.id, v_role, true)
    on conflict (tenant_id, user_id) do update
      set role = excluded.role,
          is_active = true;

    update public.profiles p
    set
      tenant_id = v_tenant_id,
      active_tenant_id = v_tenant_id,
      role = v_role
    where p.id = NEW.id;
  else
    insert into public.profiles (id, tenant_id, active_tenant_id, full_name, role, language_preference)
    values (NEW.id, null, null, v_full_name, 'staff', v_lang)
    on conflict (id) do nothing;
  end if;

  return NEW;
end;
$$;

revoke all on function public.handle_new_user() from public;
grant execute on function public.handle_new_user() to service_role;
