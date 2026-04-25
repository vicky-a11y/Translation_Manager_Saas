-- 客戶新增表單擴充：主要 IM、內部標籤、開票含「捐贈」、備註長度、email 長度、租戶內 IM 防重。

alter table public.customer_master alter column email type varchar(255);

alter table public.customer_master add column if not exists im_platform text;
alter table public.customer_master add column if not exists im_id varchar(100);
alter table public.customer_master add column if not exists internal_tags text;

alter table public.customer_master drop constraint if exists customer_master_im_platform_chk;
alter table public.customer_master
  add constraint customer_master_im_platform_chk
  check (im_platform is null or im_platform in ('LINE', 'WhatsApp', 'WeChat', 'Email'));

alter table public.customer_master drop constraint if exists customer_master_remark_len_chk;
alter table public.customer_master
  add constraint customer_master_remark_len_chk
  check (remark is null or char_length(remark) <= 2000);

alter table public.customer_master drop constraint if exists customer_master_internal_tags_len_chk;
alter table public.customer_master
  add constraint customer_master_internal_tags_len_chk
  check (internal_tags is null or char_length(internal_tags) <= 2000);

alter table public.customer_master drop constraint if exists customer_master_invoice_type_chk;
alter table public.customer_master
  add constraint customer_master_invoice_type_chk
  check (invoice_type is null or invoice_type between 1 and 5);

create unique index if not exists customer_master_tenant_platform_im_uniq
  on public.customer_master (tenant_id, im_platform, lower(btrim(im_id)))
  where im_platform is not null
    and im_id is not null
    and btrim(im_id) <> '';

comment on column public.customer_master.im_platform is '主要通訊平台（與 im_id 成對）';
comment on column public.customer_master.im_id is '主要通訊帳號／門號；租戶內與 im_platform 組合防重';
comment on column public.customer_master.internal_tags is '內部標籤（建議逗號分隔）';
comment on column public.customer_master.invoice_type is '1二聯 2三聯 3電子發票 4國外Invoice 5捐贈';
