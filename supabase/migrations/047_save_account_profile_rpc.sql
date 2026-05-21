-- 個人基本資料儲存：繞過 profiles_update_own RLS（與 mark_password_set 同類問題）
-- 新加入租戶的使用者可能因 active_tenant_id / tenant_memberships 連動檢查而無法直接 UPDATE profiles。

create or replace function public.save_account_profile(
  p_full_name text default null,
  p_nickname text default null,
  p_gender text default null,
  p_phone text default null,
  p_address text default null,
  p_region text default null,
  p_timezone text default null,
  p_language_preference text default 'zh-TW',
  p_real_name text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_gender text;
  v_lang text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  v_gender := nullif(trim(coalesce(p_gender, '')), '');
  if v_gender is not null and v_gender not in ('male', 'female', 'undisclosed') then
    raise exception 'invalid_gender';
  end if;

  v_lang := coalesce(nullif(trim(coalesce(p_language_preference, '')), ''), 'zh-TW');
  if v_lang not in ('zh-TW', 'zh-CN', 'en', 'ms') then
    raise exception 'invalid_language_preference';
  end if;

  update public.profiles
  set
    full_name = nullif(trim(coalesce(p_full_name, '')), ''),
    nickname = nullif(trim(coalesce(p_nickname, '')), ''),
    gender = v_gender,
    phone = nullif(trim(coalesce(p_phone, '')), ''),
    address = nullif(trim(coalesce(p_address, '')), ''),
    region = nullif(trim(coalesce(p_region, '')), ''),
    timezone = nullif(trim(coalesce(p_timezone, '')), ''),
    language_preference = v_lang
  where id = v_uid;

  if not found then
    raise exception 'profile_not_found';
  end if;

  insert into public.profile_private (user_id, real_name, updated_at)
  values (v_uid, nullif(trim(coalesce(p_real_name, '')), ''), now())
  on conflict (user_id) do update
    set
      real_name = excluded.real_name,
      updated_at = now();
end;
$$;

revoke all on function public.save_account_profile(text, text, text, text, text, text, text, text, text) from public;
grant execute on function public.save_account_profile(text, text, text, text, text, text, text, text, text) to authenticated;
