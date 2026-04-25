-- 系統稽核日誌 System_Audit_Logs（public）
-- 遵循 .cursorrules：PK=UUID；操作者與租戶關聯一律 UUID；業務表含 tenant_id。
-- 規格對照：
--   log_id BIGINT PK → id uuid primary key default gen_random_uuid()
--   user_id VARCHAR FK → user_id uuid references auth.users(id)（非業務字串員編）
--   record_id VARCHAR → record_id uuid（存放被異動列之主鍵 UUID，如 customer_master.id / customer_contacts.id）
--   modified_at DATETIME → modified_at timestamptz
-- 存取：僅租戶 owner/admin 可查閱；具有效成員資格者可寫入且 user_id 必須為本人（防冒名）。

create table if not exists public.system_audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  user_id uuid references auth.users (id) on delete set null,
  table_name varchar(50) not null,
  record_id uuid not null,
  field_name varchar(50) not null,
  old_value text,
  new_value text,
  modified_at timestamptz not null default now()
);

comment on table public.system_audit_logs is
  '欄位級異動稽核；append-only；record_id 為目標表列之 UUID PK';

comment on column public.system_audit_logs.id is '日誌主鍵 UUID（規格之 log_id）';
comment on column public.system_audit_logs.user_id is '操作者 → auth.users.id';
comment on column public.system_audit_logs.record_id is '被異動列的主鍵 UUID（非 cid 字串）';

create index if not exists system_audit_logs_tenant_modified_idx
  on public.system_audit_logs (tenant_id, modified_at desc);

create index if not exists system_audit_logs_tenant_table_record_idx
  on public.system_audit_logs (tenant_id, table_name, record_id);

alter table public.system_audit_logs enable row level security;

drop policy if exists system_audit_logs_select_admin on public.system_audit_logs;
create policy system_audit_logs_select_admin
on public.system_audit_logs
for select
to authenticated
using (
  public.auth_is_super_admin()
  or (
    tenant_id = public.current_profile_tenant_id()
    and public.is_tenant_admin_for(tenant_id)
  )
);

drop policy if exists system_audit_logs_insert_member on public.system_audit_logs;
create policy system_audit_logs_insert_member
on public.system_audit_logs
for insert
to authenticated
with check (
  public.auth_is_super_admin()
  or (
    tenant_id = public.current_profile_tenant_id()
    and user_id = auth.uid()
    and exists (
      select 1
      from public.tenant_memberships m
      where m.user_id = auth.uid()
        and m.tenant_id = tenant_id
        and m.is_active = true
    )
  )
);

-- 不建立 UPDATE/DELETE policy：append-only，一般角色不可改寫歷史
