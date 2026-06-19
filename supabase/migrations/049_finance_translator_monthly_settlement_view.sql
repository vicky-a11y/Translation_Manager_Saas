-- 財務「譯者月結對帳」：依 (租戶, 月份, 譯者) 彙總待撥款佇列，供 /finance/vendor-settlement 一次出對帳總表。
-- 以 security_invoker = true 讓底層 RLS（can_view_finance + 租戶隔離）確實生效，避免跨租戶外洩。

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
