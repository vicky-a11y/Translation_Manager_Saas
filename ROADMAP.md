# 擴充計畫（Plan）

本檔案記錄待建置功能與方向，與 `MEMORIES.md` 的「已完成」互補。

## 核心業務

- **譯者人才庫**：`Translators` 資料表與管理介面。
- **譯者母語與語言能力 UI**：`translator_master.native_lang`、`language_skills` 欄位已存在；表單 UI 暫緩，見 `docs/TRANSLATOR_MANAGEMENT_V1_STATUS.md` §3.4。
- **各語種費率管理**：依語言/單位計價等規則。
- **專業領域標籤**：案件與譯者之領域分類與篩選。

## 多租戶流程

- **公司網域驗證**（Domain Verification）。
- **人工審核機制**（註冊或租戶啟用審核）。
- **成員邀請連結**（Invitations）。

## 財務報表

- **月度結案總金額**統計。
- **譯者薪資自動結算**系統。
- **財務異動歷程後台頁（下一版）**：建立 Table + 篩選器 + 分頁，串接 `GET /api/finance/audit`，支援依案件、欄位、時間區間查詢與操作人顯示。
