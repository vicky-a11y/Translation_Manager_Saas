-- 譯者標籤定義、service_tags 驗證與派案過濾

create table if not exists public.service_tag_definitions (
  id uuid primary key default gen_random_uuid(),
  tag_code varchar(30) not null,
  category varchar(10) not null,
  source_lang varchar(10),
  target_lang varchar(10),
  description varchar(200),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_tag_definitions_category_chk
    check (category in ('TR', 'TS', 'DTP', 'VE')),
  constraint service_tag_definitions_tag_code_fmt_chk
    check (
      upper(btrim(tag_code)) ~ '^(TR-[A-Z]{2,10}-[A-Z]{2,10}|TS-[A-Z]{2,10}|DTP|VE)$'
    ),
  constraint service_tag_definitions_category_langs_chk
    check (
      (category = 'TR' and source_lang is not null and target_lang is not null)
      or (category = 'TS' and source_lang is not null and target_lang is null)
      or (category in ('DTP', 'VE') and source_lang is null and target_lang is null)
    )
);

comment on table public.service_tag_definitions is
  '全系統統一服務標籤定義（類別 + 語系）；供 translator_master.service_tags 參照。';

create unique index if not exists service_tag_definitions_tag_code_lower_uniq
  on public.service_tag_definitions (lower(btrim(tag_code)));

create unique index if not exists service_tag_definitions_tag_code_uniq
  on public.service_tag_definitions (tag_code);

create index if not exists service_tag_definitions_category_active_idx
  on public.service_tag_definitions (category, is_active);

create or replace function public.service_tag_definitions_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists service_tag_definitions_set_updated_at on public.service_tag_definitions;
create trigger service_tag_definitions_set_updated_at
before update on public.service_tag_definitions
for each row
execute procedure public.service_tag_definitions_set_updated_at();

alter table public.service_tag_definitions enable row level security;

drop policy if exists service_tag_definitions_select_all on public.service_tag_definitions;
create policy service_tag_definitions_select_all
on public.service_tag_definitions
for select
to authenticated
using (true);

drop policy if exists service_tag_definitions_insert_super_admin on public.service_tag_definitions;
create policy service_tag_definitions_insert_super_admin
on public.service_tag_definitions
for insert
to authenticated
with check (public.auth_is_super_admin());

drop policy if exists service_tag_definitions_update_super_admin on public.service_tag_definitions;
create policy service_tag_definitions_update_super_admin
on public.service_tag_definitions
for update
to authenticated
using (public.auth_is_super_admin())
with check (public.auth_is_super_admin());

drop policy if exists service_tag_definitions_delete_super_admin on public.service_tag_definitions;
create policy service_tag_definitions_delete_super_admin
on public.service_tag_definitions
for delete
to authenticated
using (public.auth_is_super_admin());

insert into public.service_tag_definitions (tag_code, category, source_lang, target_lang, description)
values
  ('TR-EN-ZH', 'TR', 'EN', 'ZH', '英翻中'),
  ('TR-ZH-EN', 'TR', 'ZH', 'EN', '中翻英'),
  ('TS-ZH', 'TS', 'ZH', null, '中文聽打'),
  ('DTP', 'DTP', null, null, '打字/排版'),
  ('VE', 'VE', null, null, '影音剪輯')
on conflict do nothing;

create or replace function public.is_valid_service_tag_array(p_tags jsonb)
returns boolean
language sql
immutable
as $$
  select
    jsonb_typeof(p_tags) = 'array'
    and jsonb_array_length(p_tags) > 0
    and not exists (
      select 1
      from jsonb_array_elements(p_tags) e(tag_val)
      where jsonb_typeof(e.tag_val) <> 'string'
         or upper(btrim(e.tag_val #>> '{}')) !~ '^(TR-[A-Z]{2,10}-[A-Z]{2,10}|TS-[A-Z]{2,10}|DTP|VE)$'
    );
$$;

create index if not exists translator_master_service_tags_gin_idx
  on public.translator_master
  using gin (service_tags jsonb_path_ops);

alter table public.translator_master
  drop constraint if exists translator_master_bank_account_chk;
alter table public.translator_master
  add constraint translator_master_bank_account_chk
  check (
    btrim(bank_account) ~ '^[0-9]+$'
    and char_length(btrim(bank_account)) > 8
  );

alter table public.translator_master
  drop constraint if exists translator_master_service_tags_type_chk;
alter table public.translator_master
  add constraint translator_master_service_tags_type_chk
  check (public.is_valid_service_tag_array(service_tags));

comment on constraint translator_master_bank_account_chk on public.translator_master is
  '銀行帳號僅允許數字，且長度需大於 8 碼。';

comment on constraint translator_master_service_tags_type_chk on public.translator_master is
  'service_tags 必須為非空字串陣列，且每筆符合 TR/TS/DTP/VE 格式。';

create or replace function public.get_dispatch_translators(
  p_required_tag text,
  p_limit integer default 100
)
returns table (
  id uuid,
  translator_id varchar,
  name varchar,
  email varchar,
  phone varchar,
  status smallint,
  service_tags jsonb
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    t.id,
    t.translator_id,
    t.name,
    t.email,
    t.phone,
    t.status,
    t.service_tags
  from public.translator_master t
  where t.tenant_id = public.current_profile_tenant_id()
    and t.status in (1, 2)
    and (
      t.service_tags ? upper(btrim(coalesce(p_required_tag, '')))
      or upper(t.service_tags::text) like ('%' || upper(btrim(coalesce(p_required_tag, ''))) || '%')
    )
  order by
    case t.status when 1 then 0 when 2 then 1 else 2 end,
    case when t.status = 2 then random() else 0 end,
    t.updated_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
$$;

revoke all on function public.get_dispatch_translators(text, integer) from public;
grant execute on function public.get_dispatch_translators(text, integer) to authenticated;

comment on function public.get_dispatch_translators(text, integer) is
  '派案過濾：依 tag（例如 TR-ZH-EN）篩選，先常用(status=1)再新進(status=2，隨機)。';
