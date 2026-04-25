-- 雙向一致：當「主要聯絡人」(is_primary) 的 im_platform / im_id 被寫入（含 SQL／後台）時，回寫 customer_master。
-- 主檔 → 聯絡人仍由應用程式 syncPrimaryContactFromMaster 負責；本觸發器補齊聯絡人 → 主檔方向。

create or replace function public.trg_customer_contacts_primary_im_to_master()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if coalesce(new.is_primary, false) is not true then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if coalesce(old.im_id, '') = coalesce(new.im_id, '')
       and coalesce(old.im_platform::text, '') = coalesce(new.im_platform::text, '') then
      return new;
    end if;
  end if;

  update public.customer_master m
  set
    im_platform = new.im_platform,
    im_id = case
      when new.im_id is not null and btrim(new.im_id::text) <> '' then btrim(new.im_id::text)
      else null
    end
  where m.tenant_id = new.tenant_id
    and m.id = new.customer_id;

  return new;
end;
$$;

drop trigger if exists customer_contacts_primary_im_to_master on public.customer_contacts;

create trigger customer_contacts_primary_im_to_master
after insert or update of im_platform, im_id, is_primary
on public.customer_contacts
for each row
when (new.is_primary = true)
execute procedure public.trg_customer_contacts_primary_im_to_master();

comment on function public.trg_customer_contacts_primary_im_to_master() is
  '主要聯絡人 IM 變更時同步至 customer_master.im_platform / im_id';
