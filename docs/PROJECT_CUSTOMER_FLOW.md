# 新增客戶 / 新增案件 / 案件維護 流程圖

> 依現行程式碼整理。最後更新：**2026-06-19**。
>
> | 主題 | 主要程式路徑 |
> |------|----------------|
> | 新增客戶 | `customers/new/actions.ts` → `createCustomerAction` |
> | 新增案件 | `projects/new/actions.ts` → `createProjectAction` |
> | 案件明細／修改／刪除 | `projects/[id]/page.tsx`、`project-info-editor.tsx`、`actions.ts` |
> | 客戶 Intake（V1） | `intake/[token]/`、`customers/intake/`、`actions/customer-intake.ts` |
>
> 「客戶自助建檔（Intake）」**全局大門口模式 V1 已實作**；設計細節與待辦見 `docs/CUSTOMER_INTAKE_DESIGN.md`。

## 1. 新增客戶流程（現行）

來源：`src/app/[locale]/(app)/customers/new/actions.ts` → `createCustomerAction`

```mermaid
flowchart TD
    A[開啟 /customers/new] --> B{已登入?}
    B -- 否 --> L[導向 /login]
    B -- 是 --> C[取 profile + 工作區 tenantId]
    C --> D{有 can_edit_projects?}
    D -- 否 --> F[forbidden 錯誤]
    D -- 是 --> E[驗證欄位<br/>類型/名稱/國別/稅號/IM/開票...]
    E --> G{通過?}
    G -- 否 --> V[validation 錯誤]
    G -- 是 --> H[防重檢查<br/>tax_id / im_platform+im_id / 聯絡人 IM]
    H --> I{重複?}
    I -- 是 --> DUP[顯示重複, 連結既有客戶]
    I -- 否 --> J[寫入 customer_master]
    J --> K[同步建立主要聯絡人<br/>customer_contacts]
    K --> M{同步成功?}
    M -- 否 --> RB[復原刪除 customer_master]
    M -- 是 --> N[導向客戶資料頁 /customers/:id]
```

重點：
- 權限門檻為 `can_edit_projects`（或 super_admin）。
- 租戶由後端依登入工作區帶入，前端不傳 `tenant_id`。
- 建立主檔後會同步一筆主要聯絡人到 `customer_contacts`；同步失敗會回滾刪除主檔。

## 2. 新增案件流程（現行）

來源：`src/app/[locale]/(app)/projects/new/actions.ts` → `createProjectAction`

```mermaid
flowchart TD
    A[開啟 /projects/new] --> B{已登入?}
    B -- 否 --> L[導向 /login]
    B -- 是 --> C[取 profile + 工作區 tenantId]
    C --> D{有 can_edit_projects?}
    D -- 否 --> F[forbidden 錯誤]
    D -- 是 --> E[驗證 案件編號/標題/交件日/備註]
    E --> G2[選擇客戶 customer_id]
    G2 --> H{客戶存在且啟用?}
    H -- 否 --> V[validation 錯誤]
    H -- 是 --> I[驗證金額<br/>總額/代墊費]
    I --> J[寫入 projects<br/>status=draft]
    J --> K[更新 project_financials<br/>金額/代墊/已收=0]
    K --> M{財務更新成功?}
    M -- 否 --> RB[復原刪除 projects]
    M -- 是 --> N[導向案件列表 /projects]
```

重點：
- 案件**必須先選一個既有且啟用的客戶**（`projects.customer_id` → `customer_master`）。
- 因此流程順序固定為「**先有客戶 → 才能建案件**」。
- 可選填 **`projects.notes`**（案件備註）；從 Intake 轉正時可帶入預填與唯讀參考區塊。
- 建立案件後更新對應的 `project_financials`（金額、代墊費、已收款=0）；更新失敗會回滾刪除案件。

## 3. 案件明細與修改流程（現行）

來源：`src/app/[locale]/(app)/projects/[id]/` → `updateProjectInfoAction`、`updateProjectFinanceAction`、`upsertProjectTranslatorAssignmentAction`

```mermaid
flowchart TD
    A[開啟 /projects/:id] --> B{已登入且有 can_edit_projects?}
    B -- 否 --> X[導向 dashboard 或 login]
    B -- 是 --> C[載入案件/財務/客戶/指派]
    C --> D[案件資訊區：按「修改」]
    D --> E[編輯 編號/名稱/交件時間/客戶/備註]
    E --> F[按「儲存」→ updateProjectInfoAction]
    F --> G{驗證通過?}
    G -- 否 --> V[顯示 validation/duplicate 錯誤]
    G -- 是 --> H[revalidate 明細頁]
    C --> I[金額區：修改已收/支付方式等]
    I --> J[updateProjectFinanceAction]
    C --> K[指派譯者區：新增/修改/刪除指派]
    K --> L[upsert / delete assignment actions]
```

重點：
- 建立時間（`created_at`）**不可修改**。
- 案件編號在同一工作區內不可重複（違反時 `duplicate` 錯誤）。
- 客戶變更後，下方「客戶聯絡資訊」卡片會隨 `router.refresh()` 更新。
- 金額總額／規費等建立時寫入的欄位，明細頁目前**唯讀**；可編輯收款與支付相關欄位。

## 4. 案件刪除流程（現行）

來源：`project-info-editor.tsx` → `ProjectDeleteButton` → `deleteProjectAction`

```mermaid
flowchart TD
    A[案件明細頁 按「刪除」] --> B[跳出確認對話框<br/>確認刪除此筆案件？]
    B --> C{使用者選擇}
    C -- 否 --> D[關閉對話框，不刪除]
    C -- 是 --> E[deleteProjectAction]
    E --> F[DELETE projects<br/>cascade 財務/指派/郵寄成本等]
    F --> G[導向 /projects 列表]
```

重點：
- 刪除前**必須**經確認對話框，按鈕為 **是／否**（繁中）。
- 刪除進行中時對話框不可關閉，避免誤觸。
- 需 **`can_edit_projects`**（或 `super_admin`）；RLS policy `projects_delete_isolated`。

## 5. 客戶自助建檔（Intake）流程（V1 已實作）

對應 `docs/CUSTOMER_INTAKE_DESIGN.md` §9。Migration **`048_customer_intake_flow.sql`**。

```mermaid
flowchart TD
    A[客戶開啟 /intake/:token] --> B[customer_intake_preview token]
    B --> C{token 有效且未過期?}
    C -- 否 --> X[顯示連結無效/過期]
    C -- 是 --> D[顯示租戶名 + 自助表單<br/>客戶基本資料 + 匯款資訊]
    D --> E[送出 submit_customer_intake]
    E --> F[寫入 customer_intake_submissions<br/>status=pending]
    F --> G[感謝畫面: 已收到, 待審核]

    H[業務/財務開啟 /customers/intake] --> I[檢視 pending 暫存列]
    I --> J{核准?}
    J -- 退回 --> R[reject_customer_intake<br/>記錄原因]
    J -- 核准 --> K[建立 customer_master<br/>防重 tax_id / im]
    K --> L[導向 /projects/new?from_intake=<br/>預填客戶/金額/參考區塊]
    L --> O[業務確認後建立案件<br/>沿用新增案件流程]
```

重點：
- 公開寫入一律經 `SECURITY DEFINER` RPC，於函式內鎖 `tenant_id`，不放寬 `customer_master` 的 anon RLS。
- token 綁定單一租戶，可撤銷（`is_active`）與過期（`expires_at`）。
- 核准後先轉為正式客戶，再以**預填跳轉**進入新增案件頁（非自動建案）。
- **尚未實作**：專屬連結模式、檔案上傳落地、SOP 分流進度條（見設計手冊 §8）。
