-- 案件必須對應客戶主檔。

alter table public.projects
  add column if not exists customer_id uuid;

alter table public.projects
  drop constraint if exists projects_customer_fk;
alter table public.projects
  add constraint projects_customer_fk
  foreign key (tenant_id, customer_id)
  references public.customer_master (tenant_id, id)
  on delete restrict;

alter table public.projects
  drop constraint if exists projects_customer_required_chk;
alter table public.projects
  add constraint projects_customer_required_chk
  check (customer_id is not null)
  not valid;

create index if not exists projects_tenant_customer_idx
  on public.projects (tenant_id, customer_id);

comment on column public.projects.customer_id is
  '案件對應客戶主檔 UUID；每個新案件皆必填。';
