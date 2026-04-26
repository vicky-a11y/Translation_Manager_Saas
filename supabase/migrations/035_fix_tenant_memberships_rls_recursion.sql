-- Fix tenant_memberships RLS recursion.
--
-- The original tenant_memberships policies queried public.tenant_memberships
-- from inside policies on the same table. PostgreSQL evaluates those nested
-- reads through RLS again, which can raise:
--   infinite recursion detected in policy for relation "tenant_memberships"
--
-- Use SECURITY DEFINER helpers for membership checks, then make policies call
-- those helpers instead of recursively selecting from the protected relation.

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

create or replace function public.auth_is_tenant_admin(_tenant_id uuid)
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

revoke all on function public.auth_is_tenant_admin(uuid) from public;
grant execute on function public.auth_is_tenant_admin(uuid) to authenticated;

drop policy if exists tenant_memberships_select on public.tenant_memberships;
create policy tenant_memberships_select
on public.tenant_memberships
for select
to authenticated
using (
  user_id = auth.uid()
  or public.auth_is_active_member(tenant_id)
);

drop policy if exists tenant_memberships_insert_admin on public.tenant_memberships;
create policy tenant_memberships_insert_admin
on public.tenant_memberships
for insert
to authenticated
with check (
  public.auth_is_tenant_admin(tenant_id)
);

drop policy if exists tenant_memberships_update_admin on public.tenant_memberships;
create policy tenant_memberships_update_admin
on public.tenant_memberships
for update
to authenticated
using (
  public.auth_is_tenant_admin(tenant_id)
)
with check (
  public.auth_is_tenant_admin(tenant_id)
);
