-- 033_mark_password_set_rpc.sql
-- 目的：以 SECURITY DEFINER RPC 讓「剛設定密碼」的使用者可靠地把
--       public.profiles.password_set_at 標記起來，避免被 profiles_update_own
--       的 with check（active_tenant_id vs tenant_memberships 連動）擋下。
--
-- 背景：set-password 流程會先呼叫 supabase.auth.updateUser({password})，
--       成功後再呼叫 server action 去 update profiles.password_set_at。
--       新註冊使用者尚未完成 onboarding，active_tenant_id / tenant_memberships
--       任一不一致都會造成 RLS with check 失敗，導致前端出現
--       「密碼已寫入驗證服務，但無法更新狀態紀錄」的訊息。
--
-- 設計：此函式只改自己 (auth.uid()) 的 profiles.password_set_at 一欄，
--       並且幂等（已有時間戳就直接回傳既有值），不會影響其他敏感欄位。

create or replace function public.mark_password_set()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_existing timestamptz;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select p.password_set_at
  into v_existing
  from public.profiles p
  where p.id = v_uid;

  if not found then
    -- profiles row 尚未由 handle_new_user trigger 建立（極少見），
    -- 直接補一筆最小資料，tenant_id / active_tenant_id 留 null，之後 onboarding 會補齊。
    insert into public.profiles (id, password_set_at)
    values (v_uid, v_now)
    on conflict (id) do update
      set password_set_at = coalesce(public.profiles.password_set_at, excluded.password_set_at);
    return v_now;
  end if;

  if v_existing is not null then
    return v_existing;
  end if;

  update public.profiles
  set password_set_at = v_now
  where id = v_uid;

  return v_now;
end;
$$;

revoke all on function public.mark_password_set() from public;
grant execute on function public.mark_password_set() to authenticated;
