-- 個人資料頁：真實姓名（僅本人可讀寫，與同事可見的 profiles 分離）、聯絡欄位、密碼設定時間戳。

create table if not exists public.profile_private (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  real_name text,
  updated_at timestamptz not null default now()
);

create index if not exists profile_private_user_id_idx on public.profile_private (user_id);

alter table public.profile_private enable row level security;

drop policy if exists profile_private_select_own on public.profile_private;
create policy profile_private_select_own
on public.profile_private
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists profile_private_insert_own on public.profile_private;
create policy profile_private_insert_own
on public.profile_private
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists profile_private_update_own on public.profile_private;
create policy profile_private_update_own
on public.profile_private
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

alter table public.profiles
  add column if not exists nickname text,
  add column if not exists gender text,
  add column if not exists phone text,
  add column if not exists address text,
  add column if not exists region text,
  add column if not exists timezone text,
  add column if not exists password_set_at timestamptz;

alter table public.profiles drop constraint if exists profiles_gender_check;
alter table public.profiles
  add constraint profiles_gender_check
  check (gender is null or gender in ('male', 'female', 'undisclosed'));
