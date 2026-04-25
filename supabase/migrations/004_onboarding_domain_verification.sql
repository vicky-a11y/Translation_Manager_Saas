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
