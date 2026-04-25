-- 一案多譯者／多工種：案件譯者作業明細

create table if not exists public.project_translator_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  assignee_id varchar(20) not null,
  service_tag varchar(30) not null,
  translator_fee numeric(12, 2) not null default 0,
  translator_deadline timestamptz,
  translator_status smallint not null default 1,
  tax_deduction_rate numeric(5, 4) not null default 0,
  note text,
  assigned_at timestamptz not null default now(),
  returned_at timestamptz,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_translator_assignments_assignee_fk
    foreign key (tenant_id, assignee_id)
    references public.translator_master (tenant_id, translator_id)
    on delete restrict,
  constraint project_translator_assignments_service_tag_fk
    foreign key (service_tag)
    references public.service_tag_definitions (tag_code)
    on delete restrict,
  constraint project_translator_assignments_fee_non_negative_chk
    check (translator_fee >= 0),
  constraint project_translator_assignments_status_chk
    check (translator_status in (1, 2, 3, 4)),
  constraint project_translator_assignments_tax_rate_chk
    check (tax_deduction_rate >= 0 and tax_deduction_rate <= 1),
  constraint project_translator_assignments_project_assignee_tag_uniq
    unique (tenant_id, project_id, assignee_id, service_tag)
);

comment on table public.project_translator_assignments is
  '案件譯者作業明細：支援一案多譯者、多工種（翻譯/聽打/排版/影音等）。';

create index if not exists project_translator_assignments_tenant_project_idx
  on public.project_translator_assignments (tenant_id, project_id);

create index if not exists project_translator_assignments_tenant_assignee_idx
  on public.project_translator_assignments (tenant_id, assignee_id);

create index if not exists project_translator_assignments_tenant_status_deadline_idx
  on public.project_translator_assignments (tenant_id, translator_status, translator_deadline);

create or replace function public.project_translator_assignments_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists project_translator_assignments_set_updated_at on public.project_translator_assignments;
create trigger project_translator_assignments_set_updated_at
before update on public.project_translator_assignments
for each row
execute procedure public.project_translator_assignments_set_updated_at();

alter table public.project_translator_assignments enable row level security;

drop policy if exists project_translator_assignments_select on public.project_translator_assignments;
create policy project_translator_assignments_select
on public.project_translator_assignments
for select
to authenticated
using (
  public.auth_is_super_admin()
  or tenant_id = public.current_profile_tenant_id()
);

drop policy if exists project_translator_assignments_insert on public.project_translator_assignments;
create policy project_translator_assignments_insert
on public.project_translator_assignments
for insert
to authenticated
with check (
  public.auth_is_super_admin()
  or (
    tenant_id = public.current_profile_tenant_id()
    and (
      public.auth_profile_permission('can_assign_tasks')
      or public.auth_profile_permission('can_edit_projects')
      or public.is_tenant_admin_for(tenant_id)
    )
  )
);

drop policy if exists project_translator_assignments_update on public.project_translator_assignments;
create policy project_translator_assignments_update
on public.project_translator_assignments
for update
to authenticated
using (
  public.auth_is_super_admin()
  or (
    tenant_id = public.current_profile_tenant_id()
    and (
      public.auth_profile_permission('can_assign_tasks')
      or public.auth_profile_permission('can_edit_projects')
      or public.is_tenant_admin_for(tenant_id)
    )
  )
)
with check (
  public.auth_is_super_admin()
  or (
    tenant_id = public.current_profile_tenant_id()
    and (
      public.auth_profile_permission('can_assign_tasks')
      or public.auth_profile_permission('can_edit_projects')
      or public.is_tenant_admin_for(tenant_id)
    )
  )
);

drop policy if exists project_translator_assignments_delete on public.project_translator_assignments;
create policy project_translator_assignments_delete
on public.project_translator_assignments
for delete
to authenticated
using (
  public.auth_is_super_admin()
  or (
    tenant_id = public.current_profile_tenant_id()
    and (
      public.auth_profile_permission('can_assign_tasks')
      or public.auth_profile_permission('can_edit_projects')
      or public.is_tenant_admin_for(tenant_id)
    )
  )
);

alter table public.translator_monthly_payout_queue
  add column if not exists assignment_id uuid;

alter table public.translator_monthly_payout_queue
  drop constraint if exists translator_monthly_payout_queue_assignment_fk;
alter table public.translator_monthly_payout_queue
  add constraint translator_monthly_payout_queue_assignment_fk
  foreign key (assignment_id)
  references public.project_translator_assignments (id)
  on delete cascade;

drop index if exists translator_monthly_payout_queue_tenant_assignee_idx;
create index if not exists translator_monthly_payout_queue_tenant_assignee_idx
  on public.translator_monthly_payout_queue (tenant_id, assignee_id, assignment_id);

alter table public.translator_monthly_payout_queue
  drop constraint if exists translator_monthly_payout_queue_uniq;
alter table public.translator_monthly_payout_queue
  add constraint translator_monthly_payout_queue_uniq
  unique (tenant_id, payout_month, project_id, assignee_id, assignment_id);

-- 改由 assignment 明細驅動待撥款，不再依 projects 單一 assignee 欄位觸發。
drop trigger if exists projects_to_translator_payout_queue_trg on public.projects;

create or replace function public.trg_assignment_to_translator_payout_queue()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.translator_status = 3
     and coalesce(new.translator_fee, 0) > 0
     and (tg_op = 'INSERT' or coalesce(old.translator_status, 0) <> 3) then
    insert into public.translator_monthly_payout_queue (
      tenant_id,
      payout_month,
      project_id,
      assignee_id,
      assignment_id,
      translator_fee,
      translator_status,
      queued_at
    )
    values (
      new.tenant_id,
      date_trunc('month', now())::date,
      new.project_id,
      new.assignee_id,
      new.id,
      new.translator_fee,
      1,
      now()
    )
    on conflict (tenant_id, payout_month, project_id, assignee_id, assignment_id)
    do update set
      translator_fee = excluded.translator_fee;
  end if;

  if new.translator_status = 4 then
    update public.translator_monthly_payout_queue q
    set
      translator_status = 2,
      settled_at = coalesce(q.settled_at, now())
    where q.tenant_id = new.tenant_id
      and q.assignment_id = new.id
      and q.translator_status = 1;
  end if;

  return new;
end;
$$;

drop trigger if exists assignment_to_translator_payout_queue_trg on public.project_translator_assignments;
create trigger assignment_to_translator_payout_queue_trg
after insert or update of translator_fee, translator_status
on public.project_translator_assignments
for each row
execute procedure public.trg_assignment_to_translator_payout_queue();

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
    from public.project_translator_assignments a
    where a.tenant_id = t.tenant_id
      and a.assignee_id = t.translator_id
      and date_trunc('month', a.created_at) = date_trunc('month', now())
  );

comment on view public.v_translator_newcomers_no_assignment_this_month is
  '行政儀表板：本月尚未接案（assignment）的新進譯者清單。';
