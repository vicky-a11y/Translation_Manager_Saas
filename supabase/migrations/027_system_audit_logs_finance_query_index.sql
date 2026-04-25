-- 財務異動歷程查詢索引（project_financials 專用）

create index if not exists system_audit_logs_finance_record_modified_idx
  on public.system_audit_logs (tenant_id, record_id, modified_at desc)
  where table_name = 'project_financials';

create index if not exists system_audit_logs_finance_field_modified_idx
  on public.system_audit_logs (tenant_id, field_name, modified_at desc)
  where table_name = 'project_financials';
