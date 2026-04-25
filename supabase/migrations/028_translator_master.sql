-- 譯者主表 Translator_Master（public）
-- 說明：
-- 1) 沿用既有專案慣例：主鍵使用 UUID。
-- 2) 規格中的 translator_id 為業務編號（非技術主鍵），於租戶內唯一。
-- 3) translator 屬於租戶自有資源，非平台 vendor。

create table if not exists public.translator_master (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  translator_id varchar(20) not null,
  name varchar(100) not null,
  line_name varchar(100),
  email varchar(100) not null,
  phone varchar(20),
  id_number varchar(20) not null,
  nationality varchar(50) not null,
  native_lang varchar(10) not null,
  address text not null,
  bank_code char(3) not null,
  bank_branch varchar(50),
  bank_account varchar(30) not null,
  service_tags jsonb not null default '[]'::jsonb,
  status smallint not null default 2,
  remark text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint translator_master_status_chk
    check (status in (1, 2, 3)),
  constraint translator_master_bank_code_chk
    check (bank_code ~ '^[0-9]{3}$'),
  constraint translator_master_bank_account_chk
    check (btrim(bank_account) ~ '^[0-9]+$'),
  constraint translator_master_service_tags_type_chk
    check (jsonb_typeof(service_tags) = 'array'),
  constraint translator_master_native_lang_len_chk
    check (char_length(btrim(native_lang)) between 2 and 10),
  constraint translator_master_tenant_translator_id_uniq
    unique (tenant_id, translator_id)
);

comment on table public.translator_master is
  '譯者主表（租戶自有資源）；translator_id 為業務編號，PK 為 id(uuid)。';

comment on column public.translator_master.translator_id is
  '譯者業務編號（例：TR-001），租戶內唯一。';
comment on column public.translator_master.service_tags is
  '服務標籤 JSON 陣列，儲存職能與語系對。';
comment on column public.translator_master.status is
  '譯者狀態：1常用 2新進 3暫不合作。';

create index if not exists translator_master_tenant_id_idx
  on public.translator_master (tenant_id);

create index if not exists translator_master_tenant_status_idx
  on public.translator_master (tenant_id, status);

create unique index if not exists translator_master_tenant_email_lower_uniq
  on public.translator_master (tenant_id, lower(btrim(email)));

create unique index if not exists translator_master_tenant_id_number_lower_uniq
  on public.translator_master (tenant_id, lower(btrim(id_number)));

create or replace function public.translator_master_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists translator_master_set_updated_at on public.translator_master;
create trigger translator_master_set_updated_at
before update on public.translator_master
for each row
execute procedure public.translator_master_set_updated_at();

alter table public.translator_master enable row level security;

drop policy if exists translator_master_select_isolated on public.translator_master;
create policy translator_master_select_isolated
on public.translator_master
for select
to authenticated
using (
  public.auth_is_super_admin()
  or tenant_id = public.current_profile_tenant_id()
);

drop policy if exists translator_master_insert_isolated on public.translator_master;
create policy translator_master_insert_isolated
on public.translator_master
for insert
to authenticated
with check (
  public.auth_is_super_admin()
  or (
    tenant_id = public.current_profile_tenant_id()
    and (
      public.auth_profile_permission('can_manage_translators')
      or public.is_tenant_admin_for(tenant_id)
    )
  )
);

drop policy if exists translator_master_update_isolated on public.translator_master;
create policy translator_master_update_isolated
on public.translator_master
for update
to authenticated
using (
  public.auth_is_super_admin()
  or (
    tenant_id = public.current_profile_tenant_id()
    and (
      public.auth_profile_permission('can_manage_translators')
      or public.is_tenant_admin_for(tenant_id)
    )
  )
)
with check (
  public.auth_is_super_admin()
  or (
    tenant_id = public.current_profile_tenant_id()
    and (
      public.auth_profile_permission('can_manage_translators')
      or public.is_tenant_admin_for(tenant_id)
    )
  )
);

drop policy if exists translator_master_delete_isolated on public.translator_master;
create policy translator_master_delete_isolated
on public.translator_master
for delete
to authenticated
using (
  public.auth_is_super_admin()
  or (
    tenant_id = public.current_profile_tenant_id()
    and (
      public.auth_profile_permission('can_manage_translators')
      or public.is_tenant_admin_for(tenant_id)
    )
  )
);
