-- 對齊 assignee_id 與 translator_master.translator_id（varchar(36)）
-- 044 已將 translator_id 改為 UUID 字串；若 assignee_id 仍為 varchar(20)，
-- 36 碼編號寫入派案／待撥款佇列時會觸發字串截斷錯誤。
--
-- 注意：assignee_id 被 view 參照時無法 ALTER TYPE，需先 drop 再 recreate（同 044 對 translator_id 的做法）。

drop view if exists public.v_translator_newcomers_no_assignment_this_month;
drop view if exists public.v_finance_translator_monthly_settlement;

alter table public.projects
  drop constraint if exists projects_assignee_fk;

alter table public.project_translator_assignments
  drop constraint if exists project_translator_assignments_assignee_fk;

alter table public.translator_monthly_payout_queue
  drop constraint if exists translator_monthly_payout_queue_assignee_fk;

alter table public.projects
  alter column assignee_id type varchar(36);

alter table public.project_translator_assignments
  alter column assignee_id type varchar(36);

alter table public.translator_monthly_payout_queue
  alter column assignee_id type varchar(36);

alter table public.projects
  add constraint projects_assignee_fk
  foreign key (tenant_id, assignee_id)
  references public.translator_master (tenant_id, translator_id)
  on delete restrict;

alter table public.project_translator_assignments
  add constraint project_translator_assignments_assignee_fk
  foreign key (tenant_id, assignee_id)
  references public.translator_master (tenant_id, translator_id)
  on delete restrict;

alter table public.translator_monthly_payout_queue
  add constraint translator_monthly_payout_queue_assignee_fk
  foreign key (tenant_id, assignee_id)
  references public.translator_master (tenant_id, translator_id)
  on delete restrict;

comment on column public.projects.assignee_id is
  '派案譯者編號（FK -> translator_master.translator_id，UUID 字串，租戶內綁定）。';

comment on column public.project_translator_assignments.assignee_id is
  '譯者編號（FK -> translator_master.translator_id，UUID 字串）。';

comment on column public.translator_monthly_payout_queue.assignee_id is
  '譯者編號（FK -> translator_master.translator_id，UUID 字串）。';

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

create or replace view public.v_finance_translator_monthly_settlement
with (security_invoker = true)
as
select
  q.tenant_id,
  q.payout_month,
  q.assignee_id,
  t.name as translator_name,
  t.line_name as translator_line_name,
  count(*)::int as project_count,
  coalesce(sum(q.translator_fee), 0)::numeric(12, 2) as total_fee,
  count(*) filter (where q.translator_status = 1)::int as pending_count,
  coalesce(sum(q.translator_fee) filter (where q.translator_status = 1), 0)::numeric(12, 2) as pending_fee,
  count(*) filter (where q.translator_status = 2)::int as settled_count,
  coalesce(sum(q.translator_fee) filter (where q.translator_status = 2), 0)::numeric(12, 2) as settled_fee
from public.translator_monthly_payout_queue q
left join public.translator_master t
  on t.tenant_id = q.tenant_id
 and t.translator_id = q.assignee_id
group by
  q.tenant_id,
  q.payout_month,
  q.assignee_id,
  t.name,
  t.line_name;

comment on view public.v_finance_translator_monthly_settlement is
  '財務譯者月結：依租戶/月份/譯者彙總待撥款佇列，含件數、待撥款與已撥款金額（Group By 一次出對帳總表）。';

grant select on public.v_finance_translator_monthly_settlement to authenticated;
