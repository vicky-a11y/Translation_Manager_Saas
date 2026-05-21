-- 允許租戶 owner 調整自己的 profiles.permissions（避免單人租戶無法開啟功能權限）
-- 既有設計：profiles_guard_self_permission_mutate_trg 會阻止非 super_admin 自行修改 permissions
-- 本遷移放寬：若當前使用者在目前租戶的 tenant_memberships.role = 'owner'，允許修改自己的 permissions

create or replace function public.profiles_guard_self_permission_mutate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tid uuid;
  is_owner boolean;
begin
  if new.permissions is distinct from old.permissions and new.id = auth.uid() then
    -- super_admin 永遠允許自改
    if old.role is distinct from 'super_admin'::public.profile_role then
      tid := public.current_profile_tenant_id();
      if tid is null then
        new.permissions := old.permissions;
        return new;
      end if;

      select exists (
        select 1
        from public.tenant_memberships m
        where m.user_id = auth.uid()
          and m.tenant_id = tid
          and m.is_active = true
          and m.role = 'owner'
      )
      into is_owner;

      if not is_owner then
        new.permissions := old.permissions;
      end if;
    end if;
  end if;
  return new;
end;
$$;

