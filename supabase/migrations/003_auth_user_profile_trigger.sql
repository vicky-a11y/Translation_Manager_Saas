-- On new auth user: create public.profiles row.
-- If raw_user_meta_data.tenant_id is a valid UUID and exists in public.tenants, link to it.
-- Otherwise create a new tenant named after the user, then link profile.
-- Runs as SECURITY DEFINER so inserts succeed despite RLS on public.tenants / public.profiles.

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
  v_company_name text;
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

  v_company_name := v_full_name;

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
    if v_role not in ('admin', 'staff', 'translator') then
      v_role := 'staff';
    end if;

    insert into public.profiles (id, tenant_id, full_name, role, language_preference)
    values (NEW.id, v_tenant_id, v_full_name, v_role, v_lang)
    on conflict (id) do nothing;
  else
    insert into public.tenants (name, default_language)
    values (v_company_name, v_lang)
    returning id into v_tenant_id;

    insert into public.profiles (id, tenant_id, full_name, role, language_preference)
    values (NEW.id, v_tenant_id, v_full_name, 'admin', v_lang)
    on conflict (id) do nothing;
  end if;

  return NEW;
end;
$$;

revoke all on function public.handle_new_user() from public;
grant execute on function public.handle_new_user() to service_role;

drop trigger if exists on_auth_user_created_profile on auth.users;

create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row
  execute procedure public.handle_new_user();
