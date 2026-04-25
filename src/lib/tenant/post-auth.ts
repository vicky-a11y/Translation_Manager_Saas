import type {SupabaseClient} from "@supabase/supabase-js";

import {getWorkspaceTenantId} from "@/lib/tenant/workspace";

export async function userHasPasswordConfigured(
  supabase: SupabaseClient,
  userId: string,
  userEmail?: string | null,
): Promise<boolean> {
  const {data, error} = await supabase.from("profiles").select("password_set_at").eq("id", userId).maybeSingle();
  if (data?.password_set_at) return true;

  if (!error && data) return false;

  // profiles 讀取若被 RLS 或 schema 漂移誤擋，改用 SECURITY DEFINER RPC 判斷登入方式。
  if (userEmail?.trim()) {
    const {data: mode} = await supabase.rpc("auth_login_method", {p_email: userEmail.trim()});
    return mode === "password";
  }

  return false;
}

/**
 * 是否可進入租戶主應用 `(app)`：已設定登入密碼、有目前工作區、在該租戶為有效成員、且無未完成的網域驗證。
 */
export async function canAccessTenantAppShell(
  supabase: SupabaseClient,
  userId: string,
  userEmail?: string | null,
): Promise<boolean> {
  if (!(await userHasPasswordConfigured(supabase, userId, userEmail))) return false;

  const {data: profile, error: profileError} = await supabase
    .from("profiles")
    .select("tenant_id, active_tenant_id")
    .eq("id", userId)
    .maybeSingle();

  if (profileError || !profile) return false;

  const workspaceId = getWorkspaceTenantId(profile);
  if (!workspaceId) return false;

  const {data: membership} = await supabase
    .from("tenant_memberships")
    .select("is_active")
    .eq("user_id", userId)
    .eq("tenant_id", workspaceId)
    .maybeSingle();

  if (!membership?.is_active) return false;

  const {data: pendingDomain} = await supabase
    .from("domain_verifications")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .limit(1)
    .maybeSingle();

  if (pendingDomain) return false;

  return true;
}

export async function getPostLoginHref(
  supabase: SupabaseClient,
  locale: string,
  userId: string,
  userEmail?: string | null,
): Promise<string> {
  if (!(await userHasPasswordConfigured(supabase, userId, userEmail))) {
    return `/${locale}/set-password`;
  }
  const ok = await canAccessTenantAppShell(supabase, userId, userEmail);
  if (ok) return `/${locale}`;
  return `/${locale}/welcome`;
}
