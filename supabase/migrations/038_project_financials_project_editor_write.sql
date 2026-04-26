-- 建立／編輯案件時可同步寫入案件金額；讀取仍維持財務權限控管。

drop policy if exists project_financials_insert on public.project_financials;
create policy project_financials_insert
on public.project_financials
for insert
to authenticated
with check (
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

drop policy if exists project_financials_update on public.project_financials;
create policy project_financials_update
on public.project_financials
for update
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
)
with check (
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
