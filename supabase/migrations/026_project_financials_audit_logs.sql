-- project_financials 欄位級稽核（重要金額異動追蹤）
-- 原則：沿用既有 public.system_audit_logs，不新增平行主表。

create or replace function public.audit_project_financials_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_tenant_id uuid;
  v_record_id uuid;
begin
  v_user_id := auth.uid();

  if tg_op = 'INSERT' then
    v_tenant_id := new.tenant_id;
    v_record_id := new.project_id;
    insert into public.system_audit_logs
      (tenant_id, user_id, table_name, record_id, field_name, old_value, new_value, modified_at)
    values
      (v_tenant_id, v_user_id, 'project_financials', v_record_id, '__insert__', null, 'created', now());
    return new;
  end if;

  if tg_op = 'DELETE' then
    v_tenant_id := old.tenant_id;
    v_record_id := old.project_id;
    insert into public.system_audit_logs
      (tenant_id, user_id, table_name, record_id, field_name, old_value, new_value, modified_at)
    values
      (v_tenant_id, v_user_id, 'project_financials', v_record_id, '__delete__', 'deleted', null, now());
    return old;
  end if;

  v_tenant_id := new.tenant_id;
  v_record_id := new.project_id;

  -- UPDATE：只記錄有變更的欄位，避免噪音。
  if new.amount is distinct from old.amount then
    insert into public.system_audit_logs
      (tenant_id, user_id, table_name, record_id, field_name, old_value, new_value, modified_at)
    values
      (v_tenant_id, v_user_id, 'project_financials', v_record_id, 'total_amount', old.amount::text, new.amount::text, now());
  end if;

  if new.disbursement_fee is distinct from old.disbursement_fee then
    insert into public.system_audit_logs
      (tenant_id, user_id, table_name, record_id, field_name, old_value, new_value, modified_at)
    values
      (v_tenant_id, v_user_id, 'project_financials', v_record_id, 'disbursement_fee', old.disbursement_fee::text, new.disbursement_fee::text, now());
  end if;

  if new.paid_amount is distinct from old.paid_amount then
    insert into public.system_audit_logs
      (tenant_id, user_id, table_name, record_id, field_name, old_value, new_value, modified_at)
    values
      (v_tenant_id, v_user_id, 'project_financials', v_record_id, 'paid_amount', old.paid_amount::text, new.paid_amount::text, now());
  end if;

  if new.payment_method is distinct from old.payment_method then
    insert into public.system_audit_logs
      (tenant_id, user_id, table_name, record_id, field_name, old_value, new_value, modified_at)
    values
      (v_tenant_id, v_user_id, 'project_financials', v_record_id, 'payment_method', old.payment_method::text, new.payment_method::text, now());
  end if;

  if new.last_paid_at is distinct from old.last_paid_at then
    insert into public.system_audit_logs
      (tenant_id, user_id, table_name, record_id, field_name, old_value, new_value, modified_at)
    values
      (v_tenant_id, v_user_id, 'project_financials', v_record_id, 'last_paid_at', old.last_paid_at::text, new.last_paid_at::text, now());
  end if;

  -- 自動計算欄位也納入追蹤，便於稽核對帳。
  if new.taxable_total is distinct from old.taxable_total then
    insert into public.system_audit_logs
      (tenant_id, user_id, table_name, record_id, field_name, old_value, new_value, modified_at)
    values
      (v_tenant_id, v_user_id, 'project_financials', v_record_id, 'taxable_total', old.taxable_total::text, new.taxable_total::text, now());
  end if;

  if new.subtotal is distinct from old.subtotal then
    insert into public.system_audit_logs
      (tenant_id, user_id, table_name, record_id, field_name, old_value, new_value, modified_at)
    values
      (v_tenant_id, v_user_id, 'project_financials', v_record_id, 'subtotal', old.subtotal::text, new.subtotal::text, now());
  end if;

  if new.tax is distinct from old.tax then
    insert into public.system_audit_logs
      (tenant_id, user_id, table_name, record_id, field_name, old_value, new_value, modified_at)
    values
      (v_tenant_id, v_user_id, 'project_financials', v_record_id, 'tax', old.tax::text, new.tax::text, now());
  end if;

  if new.remaining_amount is distinct from old.remaining_amount then
    insert into public.system_audit_logs
      (tenant_id, user_id, table_name, record_id, field_name, old_value, new_value, modified_at)
    values
      (v_tenant_id, v_user_id, 'project_financials', v_record_id, 'remaining_amount', old.remaining_amount::text, new.remaining_amount::text, now());
  end if;

  return new;
end;
$$;

revoke all on function public.audit_project_financials_changes() from public;
grant execute on function public.audit_project_financials_changes() to authenticated;

drop trigger if exists project_financials_audit_changes_trg on public.project_financials;
create trigger project_financials_audit_changes_trg
after insert or update or delete on public.project_financials
for each row
execute procedure public.audit_project_financials_changes();

comment on function public.audit_project_financials_changes() is
  'project_financials 異動欄位級稽核：寫入 system_audit_logs（含操作者、舊值、新值、時間）';
