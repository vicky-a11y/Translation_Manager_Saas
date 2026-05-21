-- 收款資訊欄位擴充（V2）：支付方式細項 + 海外電匯
-- - paid_amount / remaining_amount 既有：對應「已收款 / 未收款」
-- - payment_method：延伸選項（新增 5：海外電匯）
-- - remittance_*：匯款/轉帳細節
-- - payment_note：其他付款方式備註

alter table public.project_financials
  add column if not exists remittance_bank_name text;

alter table public.project_financials
  add column if not exists remittance_account_last5 varchar(5);

alter table public.project_financials
  add column if not exists remittance_is_counter boolean;

alter table public.project_financials
  add column if not exists payment_note text;

-- payment_method：1現金 2轉帳/匯款 3信用卡刷卡付款 4其他 5海外電匯
alter table public.project_financials
  drop constraint if exists project_financials_payment_method_chk;
alter table public.project_financials
  add constraint project_financials_payment_method_chk
  check (payment_method is null or payment_method between 1 and 5);

-- 基本格式限制：帳號末五碼僅允許數字（若有填）
alter table public.project_financials
  drop constraint if exists project_financials_remittance_last5_fmt_chk;
alter table public.project_financials
  add constraint project_financials_remittance_last5_fmt_chk
  check (
    remittance_account_last5 is null
    or btrim(remittance_account_last5) = ''
    or btrim(remittance_account_last5) ~ '^[0-9]{5}$'
  );

comment on column public.project_financials.paid_amount is
  '已收款金額（Paid / Received）';
comment on column public.project_financials.remaining_amount is
  '未收款金額（Remaining / Unreceived，系統自動計算唯讀）';
comment on column public.project_financials.payment_method is
  '付款方式：1現金 2轉帳/匯款 3信用卡刷卡付款 4其他 5海外電匯';
comment on column public.project_financials.remittance_bank_name is
  '匯款/轉帳銀行名稱（payment_method=2 時使用）。';
comment on column public.project_financials.remittance_account_last5 is
  '匯款/轉帳帳號末五碼（payment_method=2 時使用）。';
comment on column public.project_financials.remittance_is_counter is
  '匯款/轉帳是否臨櫃（payment_method=2 時使用）。';
comment on column public.project_financials.payment_note is
  '付款方式補充說明（payment_method=4 其他時使用）。';

