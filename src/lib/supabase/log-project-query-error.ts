import type {PostgrestError} from "@supabase/supabase-js";

/**
 * 專案查詢錯誤記錄。若疑似 RLS／權限問題，以固定字串標示以利搜尋 Log。
 */
export function logProjectQueryError(context: string, error: PostgrestError | null, tenantId: string): void {
  if (!error) return;

  const msg = (error.message ?? "").toLowerCase();
  const code = error.code ?? "";

  const looksLikeRls =
    code === "42501" ||
    code === "PGRST301" ||
    msg.includes("row-level security") ||
    msg.includes("permission denied for") ||
    msg.includes("violates row-level");

  if (looksLikeRls) {
    console.error("RLS Policy Violation: Tenant mismatch", {
      context,
      tenantId,
      code,
      message: error.message,
    });
    return;
  }

  console.error(`[projects] ${context}`, {tenantId, code, message: error.message});
}
