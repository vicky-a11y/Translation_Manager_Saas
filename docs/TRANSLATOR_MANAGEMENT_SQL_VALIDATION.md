# 譯者管理模組 V1.0 SQL 驗證腳本（Supabase）

本文件提供可在 SQL Editor 執行的驗證腳本。  
用途：快速確認 `025~032` migration 是否正確落地與可用。

> 建議在測試環境執行，避免影響正式資料。

---

## 0) 前置：核心物件存在檢查

```sql
-- Tables
select to_regclass('public.translator_master') as translator_master;
select to_regclass('public.service_tag_definitions') as service_tag_definitions;
select to_regclass('public.project_translator_assignments') as project_translator_assignments;
select to_regclass('public.translator_monthly_payout_queue') as translator_monthly_payout_queue;
select to_regclass('public.project_shipping_costs') as project_shipping_costs;

-- Views
select to_regclass('public.v_translator_newcomers_no_assignment_this_month') as v_newcomers;
select to_regclass('public.v_finance_translator_monthly_overview') as v_finance_overview;
select to_regclass('public.v_project_cost_summary') as v_project_cost_summary;
```

預期：全部回傳非 `null`。

---

## 1) 測試資料建立（可重複執行）

```sql
do $$
declare
  v_tenant_id uuid;
  v_project_id uuid;
begin
  -- 取一個租戶（測試環境請確保至少有 1 筆）
  select id into v_tenant_id
  from public.tenants
  order by created_at asc
  limit 1;

  if v_tenant_id is null then
    raise exception 'No tenant found. Please create tenant first.';
  end if;

  -- 建立測試案件（若不存在）
  insert into public.projects (tenant_id, title, source_lang, target_lang, status)
  values (v_tenant_id, 'UAT-Translator-Project', 'ZH', 'EN', 'draft')
  on conflict do nothing;

  select p.id into v_project_id
  from public.projects p
  where p.tenant_id = v_tenant_id
    and p.title = 'UAT-Translator-Project'
  order by p.created_at desc
  limit 1;

  -- translator_master（2 位譯者）
  insert into public.translator_master (
    tenant_id, translator_id, name, email, id_number, nationality, native_lang, address,
    bank_code, bank_account, service_tags, status
  ) values
    (
      v_tenant_id, 'TR-UAT-001', 'UAT常用譯者', 'uat.translator1@example.com', 'A123456789', '台灣', 'zh-TW',
      'Taipei', '007', '123456789', '["TR-ZH-EN","TS-ZH"]'::jsonb, 1
    ),
    (
      v_tenant_id, 'TR-UAT-002', 'UAT新進譯者', 'uat.translator2@example.com', 'B223456789', '台灣', 'zh-TW',
      'Taipei', '700', '987654321', '["TR-EN-ZH","DTP"]'::jsonb, 2
    )
  on conflict (tenant_id, translator_id) do nothing;

  -- project_financials 測試金額
  insert into public.project_financials (project_id, tenant_id, amount, disbursement_fee, paid_amount)
  values (v_project_id, v_tenant_id, 10000, 500, 0)
  on conflict (project_id) do update
    set amount = excluded.amount,
        disbursement_fee = excluded.disbursement_fee;

end $$;
```

---

## 2) 欄位防呆驗證（預期要報錯）

### 2.1 `translator_master.bank_account` 只能數字且長度 > 8

```sql
do $$
declare
  v_tenant_id uuid;
begin
  select id into v_tenant_id from public.tenants order by created_at asc limit 1;

  begin
    insert into public.translator_master (
      tenant_id, translator_id, name, email, id_number, nationality, native_lang, address,
      bank_code, bank_account, service_tags, status
    ) values (
      v_tenant_id, 'TR-UAT-ERR-01', 'Err User', 'err01@example.com', 'Z123456789', '台灣', 'zh-TW',
      'Taipei', '007', '12AB', '["TR-ZH-EN"]'::jsonb, 1
    );
    raise exception 'Expected failure but insert succeeded.';
  exception when others then
    raise notice 'PASS (expected error): %', sqlerrm;
  end;
end $$;
```

### 2.2 `service_tags` 不可空陣列

```sql
do $$
declare
  v_tenant_id uuid;
begin
  select id into v_tenant_id from public.tenants order by created_at asc limit 1;

  begin
    insert into public.translator_master (
      tenant_id, translator_id, name, email, id_number, nationality, native_lang, address,
      bank_code, bank_account, service_tags, status
    ) values (
      v_tenant_id, 'TR-UAT-ERR-02', 'Err User2', 'err02@example.com', 'Z223456789', '台灣', 'zh-TW',
      'Taipei', '007', '123456789', '[]'::jsonb, 1
    );
    raise exception 'Expected failure but insert succeeded.';
  exception when others then
    raise notice 'PASS (expected error): %', sqlerrm;
  end;
end $$;
```

### 2.3 `project_translator_assignments.translator_fee >= 0`

```sql
do $$
declare
  v_tenant_id uuid;
  v_project_id uuid;
begin
  select id into v_tenant_id from public.tenants order by created_at asc limit 1;
  select id into v_project_id
  from public.projects
  where tenant_id = v_tenant_id and title = 'UAT-Translator-Project'
  order by created_at desc limit 1;

  begin
    insert into public.project_translator_assignments (
      tenant_id, project_id, assignee_id, service_tag, translator_fee, translator_status
    ) values (
      v_tenant_id, v_project_id, 'TR-UAT-001', 'TR-ZH-EN', -100, 1
    );
    raise exception 'Expected failure but insert succeeded.';
  exception when others then
    raise notice 'PASS (expected error): %', sqlerrm;
  end;
end $$;
```

### 2.4 `project_shipping_costs.amount >= 0`

```sql
do $$
declare
  v_tenant_id uuid;
  v_project_id uuid;
begin
  select id into v_tenant_id from public.tenants order by created_at asc limit 1;
  select id into v_project_id
  from public.projects
  where tenant_id = v_tenant_id and title = 'UAT-Translator-Project'
  order by created_at desc limit 1;

  begin
    insert into public.project_shipping_costs (
      tenant_id, project_id, shipping_date, carrier_name, tracking_number, amount
    ) values (
      v_tenant_id, v_project_id, current_date, 'DHL', 'DHL-UAT-NEG', -1
    );
    raise exception 'Expected failure but insert succeeded.';
  exception when others then
    raise notice 'PASS (expected error): %', sqlerrm;
  end;
end $$;
```

---

## 3) 正向流程驗證（多譯者 + 待撥款 + 郵寄）

```sql
do $$
declare
  v_tenant_id uuid;
  v_project_id uuid;
begin
  select id into v_tenant_id from public.tenants order by created_at asc limit 1;
  select id into v_project_id
  from public.projects
  where tenant_id = v_tenant_id and title = 'UAT-Translator-Project'
  order by created_at desc limit 1;

  -- assignment A：翻譯
  insert into public.project_translator_assignments (
    tenant_id, project_id, assignee_id, service_tag, translator_fee, translator_status
  ) values (
    v_tenant_id, v_project_id, 'TR-UAT-001', 'TR-ZH-EN', 3000, 1
  )
  on conflict (tenant_id, project_id, assignee_id, service_tag) do update
    set translator_fee = excluded.translator_fee;

  -- assignment B：排版
  insert into public.project_translator_assignments (
    tenant_id, project_id, assignee_id, service_tag, translator_fee, translator_status
  ) values (
    v_tenant_id, v_project_id, 'TR-UAT-002', 'DTP', 1200, 1
  )
  on conflict (tenant_id, project_id, assignee_id, service_tag) do update
    set translator_fee = excluded.translator_fee;

  -- 狀態改已回稿（3）=> 應自動入待撥款
  update public.project_translator_assignments
  set translator_status = 3
  where tenant_id = v_tenant_id
    and project_id = v_project_id
    and assignee_id in ('TR-UAT-001', 'TR-UAT-002');

  -- 郵寄 2 筆
  insert into public.project_shipping_costs (
    tenant_id, project_id, shipping_date, carrier_name, shipping_method, tracking_number, amount
  ) values
    (v_tenant_id, v_project_id, current_date, '中華郵政', '限時掛號', 'POST-UAT-001', 80),
    (v_tenant_id, v_project_id, current_date, 'DHL', 'Express', 'DHL-UAT-001', 650)
  on conflict do nothing;
end $$;
```

驗證查詢：

```sql
-- 待撥款應至少 2 筆（對應 2 個 assignment）
select tenant_id, project_id, assignee_id, assignment_id, translator_fee, translator_status
from public.translator_monthly_payout_queue
where project_id = (
  select id from public.projects where title = 'UAT-Translator-Project' order by created_at desc limit 1
)
order by assignee_id;

-- 成本彙總：應看到 shipping_count = 2、shipping_total_cost = 730、translator_total_cost = 4200
select *
from public.v_project_cost_summary
where project_id = (
  select id from public.projects where title = 'UAT-Translator-Project' order by created_at desc limit 1
);
```

---

## 4) 報表 / Dashboard 驗證

```sql
-- 新進譯者且本月未接案
select * from public.v_translator_newcomers_no_assignment_this_month
order by tenant_id, translator_id;

-- 財務月結摘要
select * from public.v_finance_translator_monthly_overview
order by payout_month desc, tenant_id;
```

---

## 5) 清理測試資料（可選）

```sql
do $$
declare
  v_tenant_id uuid;
  v_project_id uuid;
begin
  select id into v_tenant_id from public.tenants order by created_at asc limit 1;
  select id into v_project_id
  from public.projects
  where tenant_id = v_tenant_id and title = 'UAT-Translator-Project'
  order by created_at desc limit 1;

  delete from public.project_shipping_costs where project_id = v_project_id;
  delete from public.project_translator_assignments where project_id = v_project_id;
  delete from public.translator_monthly_payout_queue where project_id = v_project_id;
  delete from public.project_financials where project_id = v_project_id;
  delete from public.projects where id = v_project_id;
  delete from public.translator_master
  where tenant_id = v_tenant_id
    and translator_id in ('TR-UAT-001', 'TR-UAT-002', 'TR-UAT-ERR-01', 'TR-UAT-ERR-02');
end $$;
```
