-- 051：清理 projects 舊譯者／外包殭屍欄位；translator_master 建立與 auth.users 的橋接。
-- 031 後派案與財務皆以 project_translator_assignments 為準；applications 層已不再讀寫 projects 譯者欄位。

begin;

-- ---------------------------------------------------------------------------
-- 1) public.projects：移除外鍵、CHECK、索引與殭屍欄位
-- ---------------------------------------------------------------------------
alter table public.projects
  drop constraint if exists projects_assignee_fk;

alter table public.projects
  drop constraint if exists projects_vendor_id_fkey;

alter table public.projects
  drop constraint if exists projects_translator_status_chk;

alter table public.projects
  drop constraint if exists projects_translator_fee_non_negative_chk;

alter table public.projects
  drop constraint if exists projects_tax_deduction_rate_chk;

drop index if exists public.projects_assignee_id_idx;
drop index if exists public.projects_vendor_id_idx;
drop index if exists public.projects_tenant_translator_status_idx;
drop index if exists public.projects_tenant_translator_deadline_idx;

alter table public.projects
  drop column if exists assignee_id,
  drop column if exists vendor_id,
  drop column if exists translator_fee,
  drop column if exists translator_deadline,
  drop column if exists translator_status,
  drop column if exists tax_deduction_rate;

-- ---------------------------------------------------------------------------
-- 2) public.translator_master：平台登入帳號橋接（可空 user_id）
-- ---------------------------------------------------------------------------
alter table public.translator_master
  add column if not exists user_id uuid references auth.users (id) on delete set null;

comment on column public.translator_master.user_id is
  '對應 Supabase Auth 使用者；純代發案譯者為 NULL。開通平台帳號後填入，供譯者自助查案／對帳。';

create unique index if not exists translator_master_tenant_user_id_uniq
  on public.translator_master (tenant_id, user_id)
  where user_id is not null;

commit;
