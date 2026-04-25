-- 財務平衡校驗（V1.0）
-- Golden Rule: paid_amount + remaining_amount = total_amount
-- 其中 remaining_amount / taxable_total / subtotal / tax 全為系統自動計算（唯讀）。

alter table public.project_financials
  add column if not exists paid_amount numeric(12, 2) not null default 0;

alter table public.project_financials
  add column if not exists disbursement_fee numeric(12, 2) not null default 0;

alter table public.project_financials
  add column if not exists payment_method smallint;

alter table public.project_financials
  add column if not exists last_paid_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'project_financials'
      and column_name = 'total_amount'
  ) then
    execute '
      alter table public.project_financials
      add column total_amount numeric(12, 2)
      generated always as (amount) stored
    ';
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'project_financials'
      and column_name = 'taxable_total'
  ) then
    execute '
      alter table public.project_financials
      add column taxable_total numeric(12, 2)
      generated always as (amount - disbursement_fee) stored
    ';
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'project_financials'
      and column_name = 'subtotal'
  ) then
    execute '
      alter table public.project_financials
      add column subtotal numeric(12, 2)
      generated always as (round((amount - disbursement_fee) / 1.05)) stored
    ';
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'project_financials'
      and column_name = 'tax'
  ) then
    execute '
      alter table public.project_financials
      add column tax numeric(12, 2)
      generated always as ((amount - disbursement_fee) - round((amount - disbursement_fee) / 1.05)) stored
    ';
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'project_financials'
      and column_name = 'remaining_amount'
  ) then
    execute '
      alter table public.project_financials
      add column remaining_amount numeric(12, 2)
      generated always as (amount - paid_amount) stored
    ';
  end if;
end
$$;

alter table public.project_financials
  drop constraint if exists project_financials_total_amount_non_negative_chk;
alter table public.project_financials
  add constraint project_financials_total_amount_non_negative_chk
  check (amount >= 0);

alter table public.project_financials
  drop constraint if exists project_financials_disbursement_non_negative_chk;
alter table public.project_financials
  add constraint project_financials_disbursement_non_negative_chk
  check (disbursement_fee >= 0);

alter table public.project_financials
  drop constraint if exists project_financials_disbursement_not_gt_total_chk;
alter table public.project_financials
  add constraint project_financials_disbursement_not_gt_total_chk
  check (disbursement_fee <= amount);

alter table public.project_financials
  drop constraint if exists project_financials_paid_amount_non_negative_chk;
alter table public.project_financials
  add constraint project_financials_paid_amount_non_negative_chk
  check (paid_amount >= 0);

alter table public.project_financials
  drop constraint if exists project_financials_paid_not_gt_total_chk;
alter table public.project_financials
  add constraint project_financials_paid_not_gt_total_chk
  check (paid_amount <= amount);

alter table public.project_financials
  drop constraint if exists project_financials_payment_method_chk;
alter table public.project_financials
  add constraint project_financials_payment_method_chk
  check (payment_method is null or payment_method between 1 and 4);

alter table public.project_financials
  drop constraint if exists project_financials_payment_method_required_if_paid_chk;
alter table public.project_financials
  add constraint project_financials_payment_method_required_if_paid_chk
  check (paid_amount = 0 or payment_method is not null);

comment on column public.project_financials.amount is
  '總金額（Total）';
comment on column public.project_financials.total_amount is
  '總金額（Total，amount 之唯讀對應欄位）';
comment on column public.project_financials.disbursement_fee is
  '規費（代收轉付，不開票）';
comment on column public.project_financials.taxable_total is
  '應稅總額（系統計算：total_amount - disbursement_fee）';
comment on column public.project_financials.subtotal is
  '未稅金額（系統計算：round(taxable_total / 1.05)）';
comment on column public.project_financials.tax is
  '稅金（系統計算：taxable_total - subtotal）';
comment on column public.project_financials.paid_amount is
  '已支付金額（Paid）';
comment on column public.project_financials.remaining_amount is
  '待支付金額（Remaining，系統自動計算唯讀）';
comment on column public.project_financials.payment_method is
  '付款方式：1現金 2匯款 3線上刷卡 4其他';
comment on column public.project_financials.last_paid_at is
  '最後收款時間';
