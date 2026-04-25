-- =============================================================================
-- PINCHIEH TMS — public schema（多租戶 + RLS + 網域驗證 + 邀請 + Auth Trigger）
-- 在 Supabase SQL Editor 建議「全新專案」或備份後執行。
-- 執行順序已內建：等同 migrations 002 → 004 → 005 + 註冊 Trigger。
-- 若曾執行過 supabase/migrations/001_init_multitenant_rls.sql（app schema）請勿重複混用，二擇一。
-- =============================================================================

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

-- --- Migration 004 (onboarding / domain / handle_new_user) ---

-- Onboarding: allow profiles without tenant until domain verification or manual review.
-- Domain verification + manual review requests + RPC to finalize tenant as owner.

alter table public.profiles alter column tenant_id drop not null;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('owner', 'admin', 'staff', 'translator'));

create table if not exists public.domain_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  email text not null,
  domain text not null,
  organization_name text not null,
  token uuid not null unique default gen_random_uuid(),
  status text not null default 'pending' check (status in ('pending', 'verified', 'expired', 'cancelled')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  verified_at timestamptz
);

create index if not exists domain_verifications_user_id_idx on public.domain_verifications (user_id);
create index if not exists domain_verifications_token_idx on public.domain_verifications (token);

create table if not exists public.manual_review_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  full_name text,
  contact_email text,
  notes text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create index if not exists manual_review_requests_user_id_idx on public.manual_review_requests (user_id);

-- Profiles: own row always readable/updatable (supports tenant_id IS NULL during onboarding).
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
on public.profiles
for select
to authenticated
using (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

alter table public.domain_verifications enable row level security;
alter table public.manual_review_requests enable row level security;

drop policy if exists domain_verifications_select_own on public.domain_verifications;
create policy domain_verifications_select_own
on public.domain_verifications
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists domain_verifications_insert_own on public.domain_verifications;
create policy domain_verifications_insert_own
on public.domain_verifications
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists domain_verifications_update_own on public.domain_verifications;
create policy domain_verifications_update_own
on public.domain_verifications
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists manual_review_requests_select_own on public.manual_review_requests;
create policy manual_review_requests_select_own
on public.manual_review_requests
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists manual_review_requests_insert_own on public.manual_review_requests;
create policy manual_review_requests_insert_own
on public.manual_review_requests
for insert
to authenticated
with check (user_id = auth.uid());

-- After email link is opened (same logged-in user), create tenant and attach profile as owner.
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
    role = 'owner',
    full_name = coalesce(nullif(trim(full_name), ''), r.organization_name)
  where id = r.user_id;

  update public.domain_verifications
  set status = 'verified', verified_at = now()
  where id = r.id;
end;
$$;

revoke all on function public.complete_domain_verification(uuid) from public;
grant execute on function public.complete_domain_verification(uuid) to authenticated;

-- New signups: no auto-tenant unless invited with valid tenant_id in user metadata.
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

    insert into public.profiles (id, tenant_id, full_name, role, language_preference)
    values (NEW.id, v_tenant_id, v_full_name, v_role, v_lang)
    on conflict (id) do nothing;
  else
    insert into public.profiles (id, tenant_id, full_name, role, language_preference)
    values (NEW.id, null, v_full_name, 'staff', v_lang)
    on conflict (id) do nothing;
  end if;

  return NEW;
end;
$$;

revoke all on function public.handle_new_user() from public;
grant execute on function public.handle_new_user() to service_role;

-- --- Migration 005 (invitations / stricter RLS) ---

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

-- --- Auth: attach trigger (function 定義於 004) ---
drop trigger if exists on_auth_user_created_profile on auth.users;

create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row
  execute procedure public.handle_new_user();
