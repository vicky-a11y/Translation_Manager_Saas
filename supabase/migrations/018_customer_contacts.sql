-- 客戶聯絡人 Customer_Contacts（public）
-- 遵循 .cursorrules：PK=UUID、tenant_id=UUID、關聯客戶以 UUID 指向 customer_master.id（不以 cid 字串當 FK）。
-- 規格對照：
--   contact_id BIGINT PK → id uuid primary key default gen_random_uuid()
--   cid FK → tenant_id + customer_id 複合 FK → customer_master(tenant_id, id)
--   TINYINT → smallint；ENUM im_platform → text + check

create table if not exists public.customer_contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  customer_id uuid not null,
  contact_name varchar(100) not null,
  im_id varchar(100),
  im_platform text not null,
  is_primary boolean not null default false,
  job_title varchar(100),
  employment_status smallint not null default 1,
  constraint customer_contacts_customer_fk
    foreign key (tenant_id, customer_id)
    references public.customer_master (tenant_id, id)
    on delete cascade,
  constraint customer_contacts_im_platform_chk
    check (im_platform in ('LINE', 'WhatsApp', 'WeChat', 'Email')),
  constraint customer_contacts_employment_chk
    check (employment_status in (0, 1))
);

comment on table public.customer_contacts is
  '客戶聯絡人：一人多筆；im_platform=LINE|WhatsApp|WeChat|Email；employment_status 1在職 0已離職';

comment on column public.customer_contacts.id is '聯絡人主鍵 UUID（規格之 contact_id）';
comment on column public.customer_contacts.customer_id is '所屬客戶 → customer_master.id（與 tenant_id 一併複合 FK）';

create index if not exists customer_contacts_tenant_id_idx
  on public.customer_contacts (tenant_id);

create index if not exists customer_contacts_customer_id_idx
  on public.customer_contacts (customer_id);

create index if not exists customer_contacts_im_id_idx
  on public.customer_contacts (im_id)
  where im_id is not null and btrim(im_id) <> '';

create unique index if not exists customer_contacts_one_primary_per_customer_uniq
  on public.customer_contacts (customer_id)
  where is_primary = true;

alter table public.customer_contacts enable row level security;

drop policy if exists customer_contacts_select_isolated on public.customer_contacts;
create policy customer_contacts_select_isolated
on public.customer_contacts
for select
to authenticated
using (
  public.auth_is_super_admin()
  or tenant_id = public.current_profile_tenant_id()
);

drop policy if exists customer_contacts_insert_isolated on public.customer_contacts;
create policy customer_contacts_insert_isolated
on public.customer_contacts
for insert
to authenticated
with check (
  public.auth_is_super_admin()
  or (
    tenant_id = public.current_profile_tenant_id()
    and (
      public.auth_profile_permission('can_edit_projects')
      or public.is_tenant_admin_for(tenant_id)
    )
  )
);

drop policy if exists customer_contacts_update_isolated on public.customer_contacts;
create policy customer_contacts_update_isolated
on public.customer_contacts
for update
to authenticated
using (
  public.auth_is_super_admin()
  or (
    tenant_id = public.current_profile_tenant_id()
    and (
      public.auth_profile_permission('can_edit_projects')
      or public.is_tenant_admin_for(tenant_id)
    )
  )
)
with check (
  public.auth_is_super_admin()
  or (
    tenant_id = public.current_profile_tenant_id()
    and (
      public.auth_profile_permission('can_edit_projects')
      or public.is_tenant_admin_for(tenant_id)
    )
  )
);

drop policy if exists customer_contacts_delete_isolated on public.customer_contacts;
create policy customer_contacts_delete_isolated
on public.customer_contacts
for delete
to authenticated
using (
  public.auth_is_super_admin()
  or (
    tenant_id = public.current_profile_tenant_id()
    and (
      public.auth_profile_permission('can_edit_projects')
      or public.is_tenant_admin_for(tenant_id)
    )
  )
);
