-- 新增案件初始化欄位：自訂案件編號與客戶交件日期。

alter table public.projects
  add column if not exists project_code varchar(50);

alter table public.projects
  add column if not exists delivery_deadline timestamptz;

alter table public.projects
  drop constraint if exists projects_project_code_non_empty_chk;
alter table public.projects
  add constraint projects_project_code_non_empty_chk
  check (project_code is null or btrim(project_code) <> '');

create unique index if not exists projects_tenant_project_code_lower_uniq
  on public.projects (tenant_id, lower(btrim(project_code)))
  where project_code is not null and btrim(project_code) <> '';

create index if not exists projects_tenant_delivery_deadline_idx
  on public.projects (tenant_id, delivery_deadline);

comment on column public.projects.project_code is
  '租戶內自訂案件編號；非 UUID，系統 UUID 仍由 id 自動產生。';
comment on column public.projects.delivery_deadline is
  '客戶交件日期時間；不同於 translator_deadline（譯者回稿期限）。';
