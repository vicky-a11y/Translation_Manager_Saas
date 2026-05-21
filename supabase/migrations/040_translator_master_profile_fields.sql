-- 擴充譯者主檔欄位（個人資料 / 銀行 / 語言能力）
-- 注意：既有欄位（name / line_name / email / phone / nationality / id_number / native_lang / address / bank_code / bank_branch / bank_account）
-- 仍保留不動；此遷移僅「新增欄位」以支援 UI 先行落地。

alter table public.translator_master
  add column if not exists phone_office varchar(20),
  add column if not exists phone_mobile varchar(20),
  add column if not exists gender text,
  add column if not exists birth_date date,
  add column if not exists marital_status text,
  add column if not exists emergency_phone varchar(20),
  add column if not exists household_address text,
  add column if not exists mailing_address text,
  add column if not exists education_school_name varchar(150),
  add column if not exists education_major varchar(150),
  add column if not exists education_degree varchar(50),
  add column if not exists language_skills jsonb not null default '[]'::jsonb,
  add column if not exists bank_name varchar(100),
  add column if not exists bank_account_name varchar(100);

-- 基本防呆（以較寬鬆的 text + check 實作；避免影響既有資料匯入）
alter table public.translator_master
  drop constraint if exists translator_master_gender_chk;
alter table public.translator_master
  add constraint translator_master_gender_chk
  check (gender is null or gender in ('male', 'female'));

alter table public.translator_master
  drop constraint if exists translator_master_marital_status_chk;
alter table public.translator_master
  add constraint translator_master_marital_status_chk
  check (marital_status is null or marital_status in ('single', 'married'));

alter table public.translator_master
  drop constraint if exists translator_master_language_skills_type_chk;
alter table public.translator_master
  add constraint translator_master_language_skills_type_chk
  check (jsonb_typeof(language_skills) = 'array');

