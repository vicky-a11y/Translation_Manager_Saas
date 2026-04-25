-- Invitations + stricter tenant isolation + admin can remove members (tenant_id NULL).

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'expired', 'cancelled')),
  invited_role text not null default 'staff' check (invited_role in ('admin', 'staff', 'translator')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz
);

create index if not exists invitations_tenant_id_idx on public.invitations (tenant_id);
create index if not exists invitations_email_lower_idx on public.invitations (lower(trim(email)));
create index if not exists invitations_status_idx on public.invitations (status);

create unique index if not exists invitations_tenant_email_pending_uniq
on public.invitations (tenant_id, lower(trim(email)))
where status = 'pending';

alter table public.invitations enable row level security;

-- Invitee: see pending invites addressed to their JWT email.
drop policy if exists invitations_select_invitee on public.invitations;
create policy invitations_select_invitee
on public.invitations
for select
to authenticated
using (
  status = 'pending'
  and (expires_at is null or expires_at > now())
  and lower(trim(email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
);

-- Tenant admins/owners: manage invites for their tenant.
drop policy if exists invitations_select_admin on public.invitations;
create policy invitations_select_admin
on public.invitations
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.tenant_id is not null
      and p.tenant_id = invitations.tenant_id
      and p.role in ('owner', 'admin')
  )
);

drop policy if exists invitations_insert_admin on public.invitations;
create policy invitations_insert_admin
on public.invitations
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.tenant_id is not null
      and p.tenant_id = invitations.tenant_id
      and p.role in ('owner', 'admin')
  )
);

drop policy if exists invitations_update_admin on public.invitations;
create policy invitations_update_admin
on public.invitations
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.tenant_id is not null
      and p.tenant_id = invitations.tenant_id
      and p.role in ('owner', 'admin')
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.tenant_id is not null
      and p.tenant_id = invitations.tenant_id
      and p.role in ('owner', 'admin')
  )
);

-- Current user's tenant_id for RLS (must be non-null to match any tenant-scoped row).
create or replace function public.current_profile_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.tenant_id
  from public.profiles p
  where p.id = auth.uid()
    and p.tenant_id is not null;
$$;

revoke all on function public.current_profile_tenant_id() from public;
grant execute on function public.current_profile_tenant_id() to authenticated;

-- Tenants: SELECT/UPDATE only when profile.tenant_id matches and is set.
drop policy if exists tenants_select_isolated on public.tenants;
create policy tenants_select_isolated
on public.tenants
for select
to authenticated
using (id = public.current_profile_tenant_id());

-- Invitee (no tenant yet): allow reading tenant name for pending invitations to this JWT email.
drop policy if exists tenants_select_pending_invite on public.tenants;
create policy tenants_select_pending_invite
on public.tenants
for select
to authenticated
using (
  exists (
    select 1
    from public.invitations i
    where i.tenant_id = tenants.id
      and i.status = 'pending'
      and (i.expires_at is null or i.expires_at > now())
      and lower(trim(i.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
  )
);

drop policy if exists tenants_update_isolated on public.tenants;
create policy tenants_update_isolated
on public.tenants
for update
to authenticated
using (id = public.current_profile_tenant_id())
with check (id = public.current_profile_tenant_id());

-- Projects: all operations require matching non-null profile.tenant_id.
drop policy if exists projects_select_isolated on public.projects;
create policy projects_select_isolated
on public.projects
for select
to authenticated
using (tenant_id = public.current_profile_tenant_id());

drop policy if exists projects_insert_isolated on public.projects;
create policy projects_insert_isolated
on public.projects
for insert
to authenticated
with check (tenant_id = public.current_profile_tenant_id());

drop policy if exists projects_update_isolated on public.projects;
create policy projects_update_isolated
on public.projects
for update
to authenticated
using (tenant_id = public.current_profile_tenant_id())
with check (tenant_id = public.current_profile_tenant_id());

drop policy if exists projects_delete_isolated on public.projects;
create policy projects_delete_isolated
on public.projects
for delete
to authenticated
using (tenant_id = public.current_profile_tenant_id());

-- Profiles: list coworkers in same tenant (tenant_id must be non-null on both sides).
drop policy if exists profiles_select_same_tenant on public.profiles;
create policy profiles_select_same_tenant
on public.profiles
for select
to authenticated
using (
  tenant_id is not null
  and tenant_id = public.current_profile_tenant_id()
);

-- Admins/owners: update other members in same tenant (e.g. set tenant_id NULL to remove access).
drop policy if exists profiles_update_tenant_admin on public.profiles;
create policy profiles_update_tenant_admin
on public.profiles
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles me
    where me.id = auth.uid()
      and me.tenant_id is not null
      and me.role in ('owner', 'admin')
      and me.tenant_id = profiles.tenant_id
      and profiles.id <> me.id
  )
)
with check (
  tenant_id is null
  or tenant_id = (
    select me.tenant_id
    from public.profiles me
    where me.id = auth.uid()
    limit 1
  )
);

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
    from public.profiles p
    where p.id = auth.uid()
      and p.tenant_id is not null
  ) then
    raise exception 'already_in_tenant';
  end if;

  update public.profiles
  set
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

create or replace function public.decline_invitation(p_token uuid)
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

  update public.invitations
  set status = 'declined'
  where id = inv.id;
end;
$$;

revoke all on function public.decline_invitation(uuid) from public;
grant execute on function public.decline_invitation(uuid) to authenticated;
