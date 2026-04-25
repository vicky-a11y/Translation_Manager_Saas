# 企業翻譯平台管理系統TMS（多租戶 + 多語系）骨架

## 需求對齊
- **Next.js (App Router)**：路由採 `src/app/[locale]/...`
- **Supabase**：Auth + PostgreSQL + Storage + SSR
- **多租戶隔離**：所有 tenant scope 資料表皆有 `tenant_id`，並以 **RLS** + `app.memberships` 做隔離
- **多語系**：next-intl，支援 `zh-TW`, `zh-CN`, `en`, `ms`

## 目前進度
- **A（DB + RLS）**：已建立 `supabase/migrations/001_init_multitenant_rls.sql`

## 本機開發前置
此專案需要 Node.js（建議 **LTS**）才能安裝依賴並啟動 Next.js。

專案根目錄：`C:\Users\MARKPOWER\Documents\tms_saas\tms`

安裝完成後，在本資料夾執行：

```bash
cd "C:\Users\MARKPOWER\Documents\tms_saas\tms"
npm install
npm run dev
```

## Supabase（資料庫）
把 `supabase/migrations/001_init_multitenant_rls.sql` 內容貼到 Supabase SQL Editor 執行，或用 Supabase CLI migration（若有安裝）。

