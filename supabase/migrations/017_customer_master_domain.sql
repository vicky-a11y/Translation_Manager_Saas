-- 客戶主表 Customer_Master（public，與 tenants / projects 同一套 RLS 慣例）
-- 遵循 .cursorrules：PK 必須為 UUID (gen_random_uuid)；tenant_id 與日後關聯一律 UUID。
-- 規格對照：
--   - id：系統主鍵（UUID）；案件／聯絡人／稽核等關聯應指向本欄。
--   - cid：語義化業務編號（人類可讀）；租戶內唯一，非主鍵。
--   - tenant_id：public.tenants.id (uuid) FK。
--   - TINYINT / DATETIME：以 smallint + timestamptz 表達。

create table if not exists public.customer_master (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  cid varchar(20) not null,
  customer_type smallint not null,
  legal_name varchar(200),
  display_name varchar(100) not null,
  tax_id varchar(50),
  invoice_type smallint,
  country_code varchar(2),
  status smallint not null default 1,
  created_at timestamptz not null default now(),
  constraint customer_master_customer_type_chk
    check (customer_type between 1 and 4),
  constraint customer_master_invoice_type_chk
    check (invoice_type is null or invoice_type between 1 and 4),
  constraint customer_master_status_chk
    check (status between 0 and 2),
  constraint customer_master_country_code_chk
    check (
      country_code is null
      or (char_length(btrim(country_code)) = 2 and btrim(country_code) ~ '^[A-Za-z]{2}$')
    ),
  constraint customer_master_tenant_cid_uniq unique (tenant_id, cid)
);

-- 子表以 (tenant_id, customer_id) 複合 FK 指向主檔時需要（id 已全域唯一，此索引語意為「租戶＋主鍵」對應列）
create unique index if not exists customer_master_tenant_id_id_uniq
  on public.customer_master (tenant_id, id);

comment on table public.customer_master is
  '客戶主表：實體（公司/個人）；PK=id(uuid)；customer_type 1國內個人 2國內企業 3外國個人 4外國企業；invoice_type 1二聯 2三聯 3電子發票 4國外Invoice；status 0停用 1啟用 2黑名單';

comment on column public.customer_master.id is '系統主鍵 UUID；關聯表請 FK 至此欄';
comment on column public.customer_master.cid is '語義化客戶編號，如 TW-C-2603-001；(tenant_id, cid) 租戶內唯一';
comment on column public.customer_master.tenant_id is '租戶 FK → public.tenants.id';
comment on column public.customer_master.tax_id is '統一編號／稅號；租戶內防重（見 partial unique index）';

create index if not exists customer_master_tenant_id_idx
  on public.customer_master (tenant_id);

create unique index if not exists customer_master_tenant_tax_id_lower_uniq
  on public.customer_master (tenant_id, lower(btrim(tax_id)))
  where tax_id is not null and btrim(tax_id) <> '';

alter table public.customer_master enable row level security;

drop policy if exists customer_master_select_isolated on public.customer_master;
create policy customer_master_select_isolated
on public.customer_master
for select
to authenticated
using (
  public.auth_is_super_admin()
  or tenant_id = public.current_profile_tenant_id()
);

drop policy if exists customer_master_insert_isolated on public.customer_master;
create policy customer_master_insert_isolated
on public.customer_master
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

drop policy if exists customer_master_update_isolated on public.customer_master;
create policy customer_master_update_isolated
on public.customer_master
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

drop policy if exists customer_master_delete_isolated on public.customer_master;
create policy customer_master_delete_isolated
on public.customer_master
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
