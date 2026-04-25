-- 快速建客：僅 display_name 可建立；cid / customer_type 改為可空；聯絡欄位、備註、is_active、updated_at。

alter table public.customer_master drop constraint if exists customer_master_tenant_cid_uniq;

alter table public.customer_master alter column cid drop not null;
alter table public.customer_master alter column customer_type drop not null;

alter table public.customer_master drop constraint if exists customer_master_customer_type_chk;
alter table public.customer_master
  add constraint customer_master_customer_type_chk
  check (customer_type is null or (customer_type between 1 and 4));

create unique index if not exists customer_master_tenant_cid_lower_uniq
  on public.customer_master (tenant_id, lower(btrim(cid)))
  where cid is not null and btrim(cid) <> '';

alter table public.customer_master add column if not exists contact_person varchar(100);
alter table public.customer_master add column if not exists email varchar(320);
alter table public.customer_master add column if not exists phone_mobile varchar(50);
alter table public.customer_master add column if not exists phone_office varchar(50);
alter table public.customer_master add column if not exists address text;
alter table public.customer_master add column if not exists remark text;
alter table public.customer_master add column if not exists is_active boolean not null default true;
alter table public.customer_master add column if not exists updated_at timestamptz not null default now();

update public.customer_master
set is_active = (status = 1);

update public.customer_master
set updated_at = created_at;

comment on column public.customer_master.is_active is '啟用：false 時可隱藏於列表，不刪主檔';
comment on column public.customer_master.remark is '客戶備註（偏好、注意事項）';

create or replace function public.customer_master_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists customer_master_set_updated_at on public.customer_master;
create trigger customer_master_set_updated_at
before update on public.customer_master
for each row
execute procedure public.customer_master_set_updated_at();
