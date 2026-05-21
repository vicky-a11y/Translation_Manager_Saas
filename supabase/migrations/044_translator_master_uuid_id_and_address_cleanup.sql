-- 譯者主檔：譯者編號改用 UUID 顯示 + 地址欄位精簡
-- - translator_id：改允許 UUID（36 chars）並提供預設值（避免手動輸入）
-- - address：不再必填（改用 household_address / mailing_address）

-- 注意：translator_id 會被 view `v_translator_newcomers_no_assignment_this_month` 依賴，
-- 因此需先 drop view 再 alter 欄位型別，最後 recreate。

drop view if exists public.v_translator_newcomers_no_assignment_this_month;

alter table public.translator_master
  alter column translator_id type varchar(36);

alter table public.translator_master
  alter column translator_id set default gen_random_uuid()::text;

alter table public.translator_master
  alter column address drop not null;

comment on column public.translator_master.translator_id is
  '譯者編號（UUID 字串）；系統自動產生，租戶內唯一。';

comment on column public.translator_master.address is
  '（已不建議使用）主要地址；V2 起改以 household_address / mailing_address 為主。';

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

