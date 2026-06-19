-- 客戶自助建檔與多元管道收件系統（v1）
-- 詳見 docs/CUSTOMER_INTAKE_DESIGN.md
-- 內容：
--   1. customer_intake_links（公開連結 token → 租戶）
--   2. customer_intake_submissions（暫存表）
--   3. RLS（不開放 anon 直接讀寫；authenticated + can_edit_projects/admin 可審核）
--   4. RPC：customer_intake_preview（anon 預覽租戶名）、submit_customer_intake（anon 安全寫入）
--   5. projects 新增 notes 備註欄（供轉正後業務手動填寫）
-- 慣例：列舉一律以 text + CHECK 表達，不使用原生 enum。

-- ---------------------------------------------------------------------------
-- 1. 公開連結表
-- ---------------------------------------------------------------------------
create table if not exists public.customer_intake_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  label text,
  is_active boolean not null default true,
  expires_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists customer_intake_links_tenant_id_idx
  on public.customer_intake_links (tenant_id);
create index if not exists customer_intake_links_token_idx
  on public.customer_intake_links (token);

comment on table public.customer_intake_links is
  '客戶自助建檔公開連結；token 綁定單一租戶，可撤銷(is_active)與過期(expires_at)';

-- ---------------------------------------------------------------------------
-- 2. 暫存表
-- ---------------------------------------------------------------------------
create table if not exists public.customer_intake_submissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  link_id uuid references public.customer_intake_links (id) on delete set null,
  status text not null default 'pending',
  -- 客戶基本資料
  customer_name text,
  phone text,
  email text,
  address text,
  -- 三聯式發票
  has_tax_invoice boolean not null default false,
  tax_title text,
  tax_id text,
  -- 寄件標籤
  need_shipping boolean not null default false,
  shipping_name text,
  shipping_phone text,
  shipping_zipcode text,
  shipping_address text,
  -- 收件管道與案件種類（純文字備註）
  intake_channel text,
  project_type_note text,
  -- 付款資訊
  remittance_amount numeric(12, 2),
  remittance_bank_name text,
  remittance_account_last5 varchar(5),
  -- 上傳（v1 僅佔位，不啟用）
  file_url text,
  -- 流程
  created_at timestamptz not null default now(),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_customer_id uuid,
  constraint customer_intake_submissions_status_chk
    check (status in ('pending', 'approved', 'rejected')),
  constraint customer_intake_submissions_channel_chk
    check (
      intake_channel is null
      or intake_channel in ('online_paid', 'walk_in_cash', 'corporate_postpaid')
    ),
  constraint customer_intake_submissions_last5_chk
    check (
      remittance_account_last5 is null
      or btrim(remittance_account_last5) = ''
      or btrim(remittance_account_last5) ~ '^[0-9]{5}$'
    ),
  constraint customer_intake_submissions_amount_chk
    check (remittance_amount is null or remittance_amount >= 0)
);

create index if not exists customer_intake_submissions_tenant_id_idx
  on public.customer_intake_submissions (tenant_id);
create index if not exists customer_intake_submissions_status_idx
  on public.customer_intake_submissions (tenant_id, status);
create index if not exists customer_intake_submissions_link_id_idx
  on public.customer_intake_submissions (link_id);

comment on table public.customer_intake_submissions is
  '客戶自助建檔暫存表；status pending/approved/rejected；轉正後 created_customer_id 寫回';
comment on column public.customer_intake_submissions.project_type_note is
  '客戶勾選的案件種類純文字（如「認證」）；不對應 projects 欄位，僅供業務參考';
comment on column public.customer_intake_submissions.file_url is
  'v1 佔位欄；實體上傳功能列入待實作';

-- ---------------------------------------------------------------------------
-- 3. RLS：兩表皆不開放 anon；authenticated + can_edit_projects/admin 同租戶
-- ---------------------------------------------------------------------------
alter table public.customer_intake_links enable row level security;
alter table public.customer_intake_submissions enable row level security;

drop policy if exists customer_intake_links_rw on public.customer_intake_links;
create policy customer_intake_links_rw
on public.customer_intake_links
for all
to authenticated
using (
  public.auth_is_super_admin()
  or (
    tenant_id = public.current_profile_tenant_id()
    and (
      public.auth_profile_permission('can_edit_projects')
      or public.is_tenant_admin_for(tenant_id)
    )
  )
)
with check (
  public.auth_is_super_admin()
  or (
    tenant_id = public.current_profile_tenant_id()
    and (
      public.auth_profile_permission('can_edit_projects')
      or public.is_tenant_admin_for(tenant_id)
    )
  )
);

drop policy if exists customer_intake_submissions_rw on public.customer_intake_submissions;
create policy customer_intake_submissions_rw
on public.customer_intake_submissions
for all
to authenticated
using (
  public.auth_is_super_admin()
  or (
    tenant_id = public.current_profile_tenant_id()
    and (
      public.auth_profile_permission('can_edit_projects')
      or public.is_tenant_admin_for(tenant_id)
    )
  )
)
with check (
  public.auth_is_super_admin()
  or (
    tenant_id = public.current_profile_tenant_id()
    and (
      public.auth_profile_permission('can_edit_projects')
      or public.is_tenant_admin_for(tenant_id)
    )
  )
);

-- ---------------------------------------------------------------------------
-- 4a. RPC：公開預覽（僅回租戶名稱，不洩漏 tenant_id）
-- ---------------------------------------------------------------------------
create or replace function public.customer_intake_preview(p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object('valid', true, 'tenant_name', t.name)
  into v_result
  from public.customer_intake_links l
  join public.tenants t on t.id = l.tenant_id
  where l.token = p_token
    and l.is_active = true
    and (l.expires_at is null or l.expires_at > now())
  limit 1;

  return coalesce(v_result, jsonb_build_object('valid', false));
end;
$$;

revoke all on function public.customer_intake_preview(uuid) from public;
grant execute on function public.customer_intake_preview(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4b. RPC：安全提交（匿名一律經此寫入；函式內鎖定 tenant_id）
-- ---------------------------------------------------------------------------
create or replace function public.submit_customer_intake(p_token uuid, payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.customer_intake_links%rowtype;
  v_email text;
  v_last5 text;
  v_channel text;
  v_has_invoice boolean;
  v_tax_title text;
  v_tax_id text;
  v_need_shipping boolean;
  v_name text;
  v_amount numeric(12, 2);
begin
  select * into v_link
  from public.customer_intake_links
  where token = p_token
    and is_active = true
    and (expires_at is null or expires_at > now())
  limit 1;

  if not found then
    raise exception 'invalid_or_expired_link';
  end if;

  v_name := nullif(btrim(coalesce(payload->>'customer_name', '')), '');
  v_tax_title := nullif(btrim(coalesce(payload->>'tax_title', '')), '');
  if v_name is null and v_tax_title is null then
    raise exception 'missing_name';
  end if;

  v_email := nullif(btrim(coalesce(payload->>'email', '')), '');
  if v_email is not null and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'invalid_email';
  end if;

  v_last5 := nullif(btrim(coalesce(payload->>'remittance_account_last5', '')), '');
  if v_last5 is not null and v_last5 !~ '^[0-9]{5}$' then
    raise exception 'invalid_last5';
  end if;

  v_channel := nullif(btrim(coalesce(payload->>'intake_channel', '')), '');
  if v_channel is not null
     and v_channel not in ('online_paid', 'walk_in_cash', 'corporate_postpaid') then
    raise exception 'invalid_channel';
  end if;

  v_has_invoice := coalesce((payload->>'has_tax_invoice') in ('true', 't', '1'), false);
  v_tax_id := nullif(btrim(coalesce(payload->>'tax_id', '')), '');
  if not v_has_invoice then
    v_tax_title := null;
    v_tax_id := null;
  end if;

  v_need_shipping := coalesce((payload->>'need_shipping') in ('true', 't', '1'), false);

  begin
    v_amount := nullif(btrim(coalesce(payload->>'remittance_amount', '')), '')::numeric;
  exception when others then
    v_amount := null;
  end;
  if v_amount is not null and v_amount < 0 then
    v_amount := null;
  end if;

  insert into public.customer_intake_submissions (
    tenant_id, link_id, status,
    customer_name, phone, email, address,
    has_tax_invoice, tax_title, tax_id,
    need_shipping, shipping_name, shipping_phone, shipping_zipcode, shipping_address,
    intake_channel, project_type_note,
    remittance_amount, remittance_bank_name, remittance_account_last5,
    file_url
  ) values (
    v_link.tenant_id, v_link.id, 'pending',
    left(v_name, 200),
    left(nullif(btrim(coalesce(payload->>'phone', '')), ''), 50),
    v_email,
    left(nullif(btrim(coalesce(payload->>'address', '')), ''), 500),
    v_has_invoice,
    left(v_tax_title, 200),
    left(v_tax_id, 50),
    v_need_shipping,
    case when v_need_shipping then left(nullif(btrim(coalesce(payload->>'shipping_name', '')), ''), 100) end,
    case when v_need_shipping then left(nullif(btrim(coalesce(payload->>'shipping_phone', '')), ''), 50) end,
    case when v_need_shipping then left(nullif(btrim(coalesce(payload->>'shipping_zipcode', '')), ''), 10) end,
    case when v_need_shipping then left(nullif(btrim(coalesce(payload->>'shipping_address', '')), ''), 500) end,
    v_channel,
    left(nullif(btrim(coalesce(payload->>'project_type_note', '')), ''), 100),
    v_amount,
    left(nullif(btrim(coalesce(payload->>'remittance_bank_name', '')), ''), 100),
    v_last5,
    left(nullif(btrim(coalesce(payload->>'file_url', '')), ''), 1000)
  );

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.submit_customer_intake(uuid, jsonb) from public;
grant execute on function public.submit_customer_intake(uuid, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. projects 新增備註欄
-- ---------------------------------------------------------------------------
alter table public.projects
  add column if not exists notes text;

comment on column public.projects.notes is
  '案件備註（自由文字）；客戶自助建檔轉正後由業務手動填寫，如「這是認證案、要送外交部」';
