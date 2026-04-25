-- 郵寄成本（V1.0）：先支援寄件日期、物流單號、金額，供財務計算。

create table if not exists public.project_shipping_costs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  shipping_date date not null,
  carrier_name varchar(50) not null,
  shipping_method varchar(50),
  tracking_number varchar(100) not null,
  amount numeric(12, 2) not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_shipping_costs_amount_non_negative_chk
    check (amount >= 0),
  constraint project_shipping_costs_tracking_non_empty_chk
    check (btrim(tracking_number) <> ''),
  constraint project_shipping_costs_carrier_non_empty_chk
    check (btrim(carrier_name) <> '')
);

comment on table public.project_shipping_costs is
  '案件郵寄成本明細（中華郵政 / DHL / FEDEX / 順豐 / 黑貓 / 店到店等），V1.0 用於財務成本計算。';

create index if not exists project_shipping_costs_tenant_project_idx
  on public.project_shipping_costs (tenant_id, project_id);

create index if not exists project_shipping_costs_tenant_shipping_date_idx
  on public.project_shipping_costs (tenant_id, shipping_date desc);

create unique index if not exists project_shipping_costs_tenant_tracking_uniq
  on public.project_shipping_costs (tenant_id, lower(btrim(tracking_number)));

create or replace function public.project_shipping_costs_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists project_shipping_costs_set_updated_at_trg on public.project_shipping_costs;
create trigger project_shipping_costs_set_updated_at_trg
before update on public.project_shipping_costs
for each row
execute procedure public.project_shipping_costs_set_updated_at();

alter table public.project_shipping_costs enable row level security;

drop policy if exists project_shipping_costs_select_isolated on public.project_shipping_costs;
create policy project_shipping_costs_select_isolated
on public.project_shipping_costs
for select
to authenticated
using (
  public.auth_is_super_admin()
  or (
    tenant_id = public.current_profile_tenant_id()
    and (
      public.auth_profile_permission('can_view_finance')
      or public.auth_profile_permission('can_edit_projects')
      or public.is_tenant_admin_for(tenant_id)
    )
  )
);

drop policy if exists project_shipping_costs_insert_isolated on public.project_shipping_costs;
create policy project_shipping_costs_insert_isolated
on public.project_shipping_costs
for insert
to authenticated
with check (
  public.auth_is_super_admin()
  or (
    tenant_id = public.current_profile_tenant_id()
    and (
      public.auth_profile_permission('can_view_finance')
      or public.auth_profile_permission('can_edit_projects')
      or public.is_tenant_admin_for(tenant_id)
    )
  )
);

drop policy if exists project_shipping_costs_update_isolated on public.project_shipping_costs;
create policy project_shipping_costs_update_isolated
on public.project_shipping_costs
for update
to authenticated
using (
  public.auth_is_super_admin()
  or (
    tenant_id = public.current_profile_tenant_id()
    and (
      public.auth_profile_permission('can_view_finance')
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
      public.auth_profile_permission('can_view_finance')
      or public.auth_profile_permission('can_edit_projects')
      or public.is_tenant_admin_for(tenant_id)
    )
  )
);

drop policy if exists project_shipping_costs_delete_isolated on public.project_shipping_costs;
create policy project_shipping_costs_delete_isolated
on public.project_shipping_costs
for delete
to authenticated
using (
  public.auth_is_super_admin()
  or (
    tenant_id = public.current_profile_tenant_id()
    and (
      public.auth_profile_permission('can_view_finance')
      or public.auth_profile_permission('can_edit_projects')
      or public.is_tenant_admin_for(tenant_id)
    )
  )
);

create or replace view public.v_project_cost_summary as
with translator_cost as (
  select
    a.tenant_id,
    a.project_id,
    coalesce(sum(a.translator_fee), 0)::numeric(12,2) as translator_total_cost
  from public.project_translator_assignments a
  group by a.tenant_id, a.project_id
),
shipping_cost as (
  select
    s.tenant_id,
    s.project_id,
    count(*)::int as shipping_count,
    coalesce(sum(s.amount), 0)::numeric(12,2) as shipping_total_cost
  from public.project_shipping_costs s
  group by s.tenant_id, s.project_id
)
select
  p.tenant_id,
  p.id as project_id,
  coalesce(pf.amount, 0)::numeric(12,2) as project_revenue,
  coalesce(tc.translator_total_cost, 0)::numeric(12,2) as translator_total_cost,
  coalesce(pf.disbursement_fee, 0)::numeric(12,2) as disbursement_fee,
  coalesce(sc.shipping_count, 0)::int as shipping_count,
  coalesce(sc.shipping_total_cost, 0)::numeric(12,2) as shipping_total_cost,
  (coalesce(tc.translator_total_cost, 0) + coalesce(pf.disbursement_fee, 0) + coalesce(sc.shipping_total_cost, 0))::numeric(12,2) as total_cost,
  (coalesce(pf.amount, 0) - (coalesce(tc.translator_total_cost, 0) + coalesce(pf.disbursement_fee, 0) + coalesce(sc.shipping_total_cost, 0)))::numeric(12,2) as gross_profit,
  case
    when coalesce(pf.amount, 0) = 0 then null
    else round(
      (
        (coalesce(pf.amount, 0) - (coalesce(tc.translator_total_cost, 0) + coalesce(pf.disbursement_fee, 0) + coalesce(sc.shipping_total_cost, 0)))
        / nullif(pf.amount, 0)
      )::numeric,
      4
    )
  end as gross_margin_rate
from public.projects p
left join public.project_financials pf
  on pf.project_id = p.id
 and pf.tenant_id = p.tenant_id
left join translator_cost tc
  on tc.project_id = p.id
 and tc.tenant_id = p.tenant_id
left join shipping_cost sc
  on sc.project_id = p.id
 and sc.tenant_id = p.tenant_id;

comment on view public.v_project_cost_summary is
  '每案成本摘要：營收、譯者成本、規費、寄件次數、郵寄成本、毛利、毛利率。';
