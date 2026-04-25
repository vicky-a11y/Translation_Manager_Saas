-- 主要聯絡人與 customer_master 的 im_platform / im_id 雙向一致：
-- 允許 im_platform、im_id 皆為空（與主檔可同時清空），避免 contacts.im_platform NOT NULL 與主檔 null 無法對齊。

alter table public.customer_contacts alter column im_platform drop not null;

alter table public.customer_contacts drop constraint if exists customer_contacts_im_platform_chk;
alter table public.customer_contacts
  add constraint customer_contacts_im_platform_chk
  check (
    im_platform is null
    or im_platform in ('LINE', 'WhatsApp', 'WeChat', 'Email')
  );

comment on column public.customer_contacts.im_platform is
  '通訊平台；與 im_id 成對，可與 customer_master 主要 IM 同步';
