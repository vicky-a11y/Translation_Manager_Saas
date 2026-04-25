-- 登入分流：已設定密碼者用信箱+密碼；其餘（含新註冊）走 OTP。
-- 依賴 profiles.password_set_at（014_account_profile_fields.sql）。

create or replace function public.auth_login_method(p_email text)
returns text
language plpgsql
security definer
set search_path = public, auth
stable
as $$
declare
  v_uid uuid;
  v_ts timestamptz;
begin
  if p_email is null or length(trim(p_email)) = 0 then
    return 'otp_register';
  end if;

  select u.id
  into v_uid
  from auth.users u
  where lower(u.email) = lower(trim(p_email))
  limit 1;

  if v_uid is null then
    return 'otp_register';
  end if;

  select p.password_set_at
  into v_ts
  from public.profiles p
  where p.id = v_uid;

  if v_ts is not null then
    return 'password';
  end if;

  return 'otp_register';
end;
$$;

revoke all on function public.auth_login_method(text) from public;
grant execute on function public.auth_login_method(text) to anon, authenticated;
