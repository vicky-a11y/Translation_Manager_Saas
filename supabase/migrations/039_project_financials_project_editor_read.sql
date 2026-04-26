-- 案件詳情需顯示案件金額；允許案件編輯者讀取案件財務摘要。

drop policy if exists project_financials_select on public.project_financials;
create policy project_financials_select
on public.project_financials
for select
to authenticated
using (
  public.auth_is_super_admin()
  or (
    public.auth_is_active_member(tenant_id)
    and (
      public.auth_profile_permission('can_view_finance')
      or public.auth_profile_permission('can_edit_projects')
      or public.can_read_project_amounts(tenant_id)
    )
  )
);
