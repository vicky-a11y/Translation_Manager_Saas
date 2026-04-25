-- Project_Master（對應 public.projects）譯者派案欄位與月底待撥款暫存

alter table public.projects
  add column if not exists assignee_id varchar(20);

alter table public.projects
  add column if not exists translator_fee numeric(12, 2);

alter table public.projects
  add column if not exists translator_deadline timestamptz;

alter table public.projects
  add column if not exists translator_status smallint;

alter table public.projects
  add column if not exists tax_deduction_rate numeric(5, 4) not null default 0;

alter table public.projects
  drop constraint if exists projects_translator_status_chk;
alter table public.projects
  add constraint projects_translator_status_chk
  check (translator_status is null or translator_status in (1, 2, 3, 4));

alter table public.projects
  drop constraint if exists projects_translator_fee_non_negative_chk;
alter table public.projects
  add constraint projects_translator_fee_non_negative_chk
  check (translator_fee is null or translator_fee >= 0);

alter table public.projects
  drop constraint if exists projects_tax_deduction_rate_chk;
alter table public.projects
  add constraint projects_tax_deduction_rate_chk
  check (tax_deduction_rate >= 0 and tax_deduction_rate <= 1);

alter table public.projects
  drop constraint if exists projects_assignee_fk;
alter table public.projects
  add constraint projects_assignee_fk
  foreign key (tenant_id, assignee_id)
  references public.translator_master (tenant_id, translator_id)
  on delete restrict;

create index if not exists projects_assignee_id_idx
  on public.projects (assignee_id);

create index if not exists projects_tenant_translator_status_idx
  on public.projects (tenant_id, translator_status);

create index if not exists projects_tenant_translator_deadline_idx
  on public.projects (tenant_id, translator_deadline);

comment on column public.projects.assignee_id is
  '派案譯者編號（FK -> translator_master.translator_id，租戶內綁定）。';
comment on column public.projects.translator_fee is
  '此案給予譯者稿費。';
comment on column public.projects.translator_deadline is
  '譯者回稿截止時間（獨立於客戶交期）。';
comment on column public.projects.translator_status is
  '派案狀態：1已發案 2已接案 3已回稿 4已結薪。';
comment on column public.projects.tax_deduction_rate is
  '預留 V2.0 扣繳率（0~1），V1.0 不參與自動計算。';

create table if not exists public.translator_monthly_payout_queue (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  payout_month date not null,
  project_id uuid not null references public.projects (id) on delete cascade,
  assignee_id varchar(20) not null,
  translator_fee numeric(12, 2) not null default 0,
  translator_status smallint not null default 1,
  queued_at timestamptz not null default now(),
  settled_at timestamptz,
  note text,
  constraint translator_monthly_payout_queue_assignee_fk
    foreign key (tenant_id, assignee_id)
    references public.translator_master (tenant_id, translator_id)
    on delete restrict,
  constraint translator_monthly_payout_queue_status_chk
    check (translator_status in (1, 2)),
  constraint translator_monthly_payout_queue_fee_non_negative_chk
    check (translator_fee >= 0),
  constraint translator_monthly_payout_queue_uniq
    unique (tenant_id, payout_month, project_id, assignee_id)
);

comment on table public.translator_monthly_payout_queue is
  '譯者待撥款暫存：案件狀態轉為已回稿時入列，供月底財務結算。';
comment on column public.translator_monthly_payout_queue.translator_status is
  '待撥款狀態：1待撥款 2已撥款。';

create index if not exists translator_monthly_payout_queue_tenant_month_status_idx
  on public.translator_monthly_payout_queue (tenant_id, payout_month, translator_status);

create index if not exists translator_monthly_payout_queue_tenant_assignee_idx
  on public.translator_monthly_payout_queue (tenant_id, assignee_id);

alter table public.translator_monthly_payout_queue enable row level security;

drop policy if exists translator_monthly_payout_queue_select on public.translator_monthly_payout_queue;
create policy translator_monthly_payout_queue_select
on public.translator_monthly_payout_queue
for select
to authenticated
using (
  public.auth_is_super_admin()
  or (
    tenant_id = public.current_profile_tenant_id()
    and (
      public.auth_profile_permission('can_view_finance')
      or public.is_tenant_admin_for(tenant_id)
    )
  )
);

drop policy if exists translator_monthly_payout_queue_insert on public.translator_monthly_payout_queue;
create policy translator_monthly_payout_queue_insert
on public.translator_monthly_payout_queue
for insert
to authenticated
with check (
  public.auth_is_super_admin()
  or (
    tenant_id = public.current_profile_tenant_id()
    and (
      public.auth_profile_permission('can_edit_projects')
      or public.auth_profile_permission('can_view_finance')
      or public.is_tenant_admin_for(tenant_id)
    )
  )
);

drop policy if exists translator_monthly_payout_queue_update on public.translator_monthly_payout_queue;
create policy translator_monthly_payout_queue_update
on public.translator_monthly_payout_queue
for update
to authenticated
using (
  public.auth_is_super_admin()
  or (
    tenant_id = public.current_profile_tenant_id()
    and (
      public.auth_profile_permission('can_view_finance')
      or public.is_tenant_admin_for(tenant_id)
    )
  )
)
with check (
  public.auth_is_super_admin()
  or (
    tenant_id = public.current_profile_tenant_id()
    and (
      public.auth_profile_permission('can_view_finance')
      or public.is_tenant_admin_for(tenant_id)
    )
  )
);

drop policy if exists translator_monthly_payout_queue_delete on public.translator_monthly_payout_queue;
create policy translator_monthly_payout_queue_delete
on public.translator_monthly_payout_queue
for delete
to authenticated
using (
  public.auth_is_super_admin()
  or (
    tenant_id = public.current_profile_tenant_id()
    and (
      public.auth_profile_permission('can_view_finance')
      or public.is_tenant_admin_for(tenant_id)
    )
  )
);

create or replace function public.trg_projects_to_translator_payout_queue()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- 狀態進入已回稿(3)時，自動入「當月待撥款」。
  if new.translator_status = 3
     and new.assignee_id is not null
     and coalesce(new.translator_fee, 0) > 0
     and (tg_op = 'INSERT' or coalesce(old.translator_status, 0) <> 3) then
    insert into public.translator_monthly_payout_queue (
      tenant_id,
      payout_month,
      project_id,
      assignee_id,
      translator_fee,
      translator_status,
      queued_at
    )
    values (
      new.tenant_id,
      date_trunc('month', now())::date,
      new.id,
      new.assignee_id,
      new.translator_fee,
      1,
      now()
    )
    on conflict (tenant_id, payout_month, project_id, assignee_id)
    do update set
      translator_fee = excluded.translator_fee;
  end if;

  -- 狀態變為已結薪(4)時，標記暫存資料為已撥款。
  if new.translator_status = 4 and new.assignee_id is not null then
    update public.translator_monthly_payout_queue q
    set
      translator_status = 2,
      settled_at = coalesce(q.settled_at, now())
    where q.tenant_id = new.tenant_id
      and q.project_id = new.id
      and q.assignee_id = new.assignee_id
      and q.translator_status = 1;
  end if;

  return new;
end;
$$;

drop trigger if exists projects_to_translator_payout_queue_trg on public.projects;
create trigger projects_to_translator_payout_queue_trg
after insert or update of assignee_id, translator_fee, translator_status
on public.projects
for each row
when (new.assignee_id is not null)
execute procedure public.trg_projects_to_translator_payout_queue();

create or replace view public.v_translator_newcomers_no_assignment_this_month as
select
  t.tenant_id,
  t.translator_id,
  t.name,
  t.email,
  t.phone,
  t.service_tags,
  t.remark
from public.translator_master t
where t.status = 2
  and not exists (
    select 1
    from public.projects p
    where p.tenant_id = t.tenant_id
      and p.assignee_id = t.translator_id
      and date_trunc('month', p.created_at) = date_trunc('month', now())
  );

comment on view public.v_translator_newcomers_no_assignment_this_month is
  '行政儀表板：本月尚未接案的新進譯者清單。';

create or replace view public.v_finance_translator_monthly_overview as
select
  q.tenant_id,
  q.payout_month,
  coalesce(sum(q.translator_fee) filter (where q.translator_status = 1), 0)::numeric(12,2) as pending_total_fee,
  coalesce(count(*) filter (where q.translator_status = 1), 0)::int as returned_unsettled_project_count
from public.translator_monthly_payout_queue q
group by q.tenant_id, q.payout_month;

comment on view public.v_finance_translator_monthly_overview is
  '財務儀表板：當月待結算總稿費與已回稿未結清案件數。';
